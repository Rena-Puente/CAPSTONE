const { config } = require('../config');
const { executeQuery, oracledb } = require('../db/oracle');
const { getClientIp } = require('../utils/request');
const { handleOracleError } = require('../utils/errors');
const { toIsoString } = require('../utils/format');
const {
  logAuthEvent,
  summarizeToken,
  isAccessTokenValid,
  findUserByOAuth,
  createUserFromGithub,
  saveGithubTokens
} = require('../services/auth');
const { getEducationStatus } = require('../services/education');
const { getExperienceStatus } = require('../services/experience');
const { getSkillStatus } = require('../services/skills');
const { computeProfileMissingFields } = require('../services/profile');
const {
  GithubOAuthError,
  buildGithubAuthorizeUrl,
  exchangeCodeForToken,
  fetchGithubUserProfile
} = require('../services/github');

const GITHUB_STATE_TTL_MS = 10 * 60 * 1000;
const pendingGithubStates = new Map();

function cleanupExpiredGithubStates() {
  const now = Date.now();

  for (const [state, storedAt] of pendingGithubStates.entries()) {
    if (now - storedAt > GITHUB_STATE_TTL_MS) {
      pendingGithubStates.delete(state);
    }
  }
}

function rememberGithubState(state) {
  cleanupExpiredGithubStates();
  pendingGithubStates.set(state, Date.now());
}

function consumeGithubState(state) {
  cleanupExpiredGithubStates();

  if (!pendingGithubStates.has(state)) {
    return false;
  }

  const storedAt = pendingGithubStates.get(state);
  pendingGithubStates.delete(state);

  return Date.now() - storedAt <= GITHUB_STATE_TTL_MS;
}

function normalizeUserType(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed;
}

async function fetchUserType(userId) {
  try {
    const result = await executeQuery(
      `SELECT id_tipo_usuario AS user_type
         FROM usuarios
        WHERE id_usuario = :userId
        FETCH FIRST 1 ROWS ONLY`,
      { userId }
    );

    const row = result.rows?.[0];

    if (!row) {
      return null;
    }

    return normalizeUserType(row.USER_TYPE ?? row.user_type ?? null);
  } catch (error) {
    console.error('[Auth] Failed to fetch user type', {
      userId,
      error: error?.message || error
    });

    return null;
  }
}

async function calculateProfileStatus(userId) {
  try {
    await executeQuery(
      'BEGIN sp_recalcular_perfil_completo(p_id_usuario => :userId); END;',
      { userId },
      { autoCommit: true }
    );

    const profileResult = await executeQuery(
      `SELECT nombre_mostrar,
              titular,
              biografia,
              pais,
              ciudad,
              url_avatar,
              perfil_completo
         FROM perfiles
        WHERE id_usuario = :userId`,
      { userId }
    );

    const profileRow = profileResult.rows?.[0] ?? null;
    const [educationStatus, experienceStatus, skillsStatus] = await Promise.all([
      getEducationStatus(userId),
      getExperienceStatus(userId),
      getSkillStatus(userId)
    ]);
    const missingFields = computeProfileMissingFields(
      profileRow,
      educationStatus,
      experienceStatus,
      skillsStatus
    );

    let isProfileComplete;

    if (!profileRow) {
      isProfileComplete = false;
    } else {
      const flag = String(profileRow.PERFIL_COMPLETO ?? '').toUpperCase() === 'S';
      isProfileComplete = flag && missingFields.length === 0;
    }

    console.info('[Auth] Profile status calculated', {
      userId,
      isProfileComplete,
      missingFieldsCount: missingFields.length,
      educationRecords: educationStatus?.totalRecords ?? 0,
      experienceRecords: experienceStatus?.totalRecords ?? 0,
      skillsRecords: skillsStatus?.totalSkills ?? 0
    });

    return {
      isProfileComplete
    };
  } catch (error) {
    console.error('[Auth] Failed to determine profile status', {
      userId,
      error: error?.message || error
    });

    return null;
  }
}

function registerAuthRoutes(app) {
  const { accessTokenMinutes, refreshTokenDays } = config.tokens;

  app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'El correo y la contraseña son obligatorios.' });
    }

    try {
      logAuthEvent('Login attempt received', {
        email,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'] || null
      });

      const result = await executeQuery(
        'BEGIN :result := fn_login(:correo, :contrasena); END;',
        {
          correo: email,
          contrasena: password,
          result: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );

      const userId = result.outBinds?.result ?? null;

      if (!userId) {
        logAuthEvent('Login rejected', { email, reason: 'Invalid credentials' });
        return res.status(401).json({ ok: false, error: 'Credenciales inválidas.' });
      }

      const sessionResult = await executeQuery(
        `BEGIN
           sp_emitir_sesion(
             p_id_usuario     => :userId,
             p_minutos_access => :accessMinutes,
             p_dias_refresh   => :refreshDays,
             p_ip             => :ip,
             p_ua             => :userAgent,
             o_access_token   => :accessToken,
             o_refresh_token  => :refreshToken,
             o_expira_access  => :accessExpires,
             o_expira_refresh => :refreshExpires
           );
         END;`,
        {
          userId,
          accessMinutes: accessTokenMinutes,
          refreshDays: refreshTokenDays,
          ip: getClientIp(req),
          userAgent: req.headers['user-agent'] || null,
          accessToken: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 512 },
          refreshToken: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 512 },
          accessExpires: { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_TIMESTAMP },
          refreshExpires: { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_TIMESTAMP }
        },
        { autoCommit: true }
      );

      const outBinds = sessionResult.outBinds ?? {};
      const [userType, profileStatus] = await Promise.all([
        fetchUserType(userId),
        calculateProfileStatus(userId)
      ]);
      const isProfileComplete = profileStatus?.isProfileComplete ?? null;

      logAuthEvent('Login successful', {
        userId,
        userType,
        accessToken: summarizeToken(outBinds.accessToken ?? null),
        refreshToken: summarizeToken(outBinds.refreshToken ?? null),
        accessExpiresAt: toIsoString(outBinds.accessExpires),
        refreshExpiresAt: toIsoString(outBinds.refreshExpires),
        isProfileComplete
      });

      res.json({
        ok: true,
        userId,
        userType,
        accessToken: outBinds.accessToken ?? null,
        refreshToken: outBinds.refreshToken ?? null,
        accessExpiresAt: toIsoString(outBinds.accessExpires),
        refreshExpiresAt: toIsoString(outBinds.refreshExpires),
        isProfileComplete
      });
    } catch (error) {
      console.error('[Auth] Login failed:', error);
      res.status(500).json({ ok: false, error: 'No se pudo completar el inicio de sesión.' });
    }
  });

  app.get('/auth/github/authorize', (req, res) => {
    const { state } = req.query ?? {};

    if (!state || typeof state !== 'string' || state.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'El parámetro state es obligatorio.' });
    }

    const normalizedState = state.trim();

    if (normalizedState.length > 512) {
      return res.status(400).json({ ok: false, error: 'El parámetro state es demasiado largo.' });
    }

    try {
      rememberGithubState(normalizedState);
      const authorizationUrl = buildGithubAuthorizeUrl(normalizedState);

      logAuthEvent('GitHub authorization URL generated', {
        state: normalizedState,
        authorizationUrl
      });

      res.json({ ok: true, url: authorizationUrl });
    } catch (error) {
      console.error('[Auth] Failed to build GitHub authorization URL:', error);

      if (error instanceof GithubOAuthError && error.status >= 400 && error.status < 500) {
        return res.status(error.status).json({ ok: false, error: error.message });
      }

      res.status(500).json({ ok: false, error: 'No se pudo generar la URL de autorización.' });
    }
  });

  app.post('/auth/github/callback', async (req, res) => {
    const { code, state } = req.body ?? {};

    if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
      return res
        .status(400)
        .json({ ok: false, error: 'El código de autorización y el estado son obligatorios.' });
    }

    const normalizedState = state.trim();

    if (!consumeGithubState(normalizedState)) {
      logAuthEvent('GitHub callback rejected (invalid state)', { state: normalizedState });
      return res.status(400).json({ ok: false, error: 'El estado recibido no es válido o expiró.' });
    }

    try {
      logAuthEvent('GitHub callback received', {
        state: normalizedState,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'] || null
      });

      const tokenResponse = await exchangeCodeForToken({ code, state: normalizedState });

      logAuthEvent('GitHub token exchange successful', {
        state: normalizedState,
        scope: tokenResponse.scope,
        expiresIn: tokenResponse.expiresIn || null
      });

      const { profile, primaryEmail } = await fetchGithubUserProfile(tokenResponse.accessToken);
      const providerId = profile?.id ?? profile?.node_id ?? null;

      if (!providerId) {
        throw new GithubOAuthError('GitHub no devolvió un identificador de usuario.', 500, profile);
      }

      const email =
        (typeof primaryEmail === 'string' ? primaryEmail : primaryEmail?.email) || profile?.email || null;

      if (!email) {
        throw new GithubOAuthError('No se pudo determinar el correo electrónico del usuario.', 500, {
          profile,
          primaryEmail
        });
      }

      const displayName = profile?.name || profile?.login || email;
      const avatarUrl = profile?.avatar_url || null;
      const providerIdString = String(providerId);

      let userId = await findUserByOAuth('GITHUB', providerIdString);

      if (!userId) {
        userId = await createUserFromGithub({
          providerId: providerIdString,
          email,
          name: displayName,
          avatar: avatarUrl
        });
      }

      if (!userId) {
        throw new Error('No se pudo crear o recuperar al usuario asociado a GitHub.');
      }

      const expiresAt = tokenResponse.expiresIn
        ? new Date(Date.now() + Number(tokenResponse.expiresIn) * 1000)
        : null;

      await saveGithubTokens({
        userId,
        providerId: providerIdString,
        accessToken: tokenResponse.accessToken,
        refreshToken: tokenResponse.refreshToken,
        scope: tokenResponse.scope,
        expiresAt
      });

      const sessionResult = await executeQuery(
        `BEGIN
           sp_emitir_sesion(
             p_id_usuario     => :userId,
             p_minutos_access => :accessMinutes,
             p_dias_refresh   => :refreshDays,
             p_ip             => :ip,
             p_ua             => :userAgent,
             o_access_token   => :accessToken,
             o_refresh_token  => :refreshToken,
             o_expira_access  => :accessExpires,
             o_expira_refresh => :refreshExpires
           );
         END;`,
        {
          userId,
          accessMinutes: accessTokenMinutes,
          refreshDays: refreshTokenDays,
          ip: getClientIp(req),
          userAgent: req.headers['user-agent'] || null,
          accessToken: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 512 },
          refreshToken: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 512 },
          accessExpires: { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_TIMESTAMP },
          refreshExpires: { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_TIMESTAMP }
        },
        { autoCommit: true }
      );

      const outBinds = sessionResult.outBinds ?? {};
      const [userType, profileStatus] = await Promise.all([
        fetchUserType(userId),
        calculateProfileStatus(userId)
      ]);
      const isProfileComplete = profileStatus?.isProfileComplete ?? null;

      logAuthEvent('GitHub login successful', {
        userId,
        providerId: providerIdString,
        userType,
        accessToken: summarizeToken(outBinds.accessToken ?? null),
        refreshToken: summarizeToken(outBinds.refreshToken ?? null),
        accessExpiresAt: toIsoString(outBinds.accessExpires),
        refreshExpiresAt: toIsoString(outBinds.refreshExpires),
        isProfileComplete
      });

      res.json({
        ok: true,
        userId,
        userType,
        accessToken: outBinds.accessToken ?? null,
        refreshToken: outBinds.refreshToken ?? null,
        accessExpiresAt: toIsoString(outBinds.accessExpires),
        refreshExpiresAt: toIsoString(outBinds.refreshExpires),
        isProfileComplete
      });
    } catch (error) {
      console.error('[Auth] GitHub callback failed:', error);

      if (error instanceof GithubOAuthError) {
        const statusCode = error.status === 401 ? 401 : error.status;

        if (statusCode >= 400 && statusCode < 500) {
          return res.status(401).json({ ok: false, error: error.message });
        }
      }

      res
        .status(500)
        .json({ ok: false, error: 'No se pudo completar el inicio de sesión con GitHub.' });
    }
  });

  app.post('/auth/refresh', async (req, res) => {
    const { refreshToken } = req.body ?? {};

    if (!refreshToken) {
      return res.status(400).json({ ok: false, error: 'El token de actualización es obligatorio.' });
    }

    try {
      logAuthEvent('Refresh attempt received', {
        refreshToken: summarizeToken(refreshToken),
        ip: getClientIp(req)
      });

      const result = await executeQuery(
        `BEGIN
           sp_refrescar_sesion(
             p_refresh_token => :refreshToken,
             o_access_token  => :accessToken,
             o_refresh_token => :newRefreshToken,
             o_expira_access => :accessExpires,
             o_expira_refresh => :refreshExpires,
             o_id_usuario    => :userId
           );
         END;`,
        {
          refreshToken,
          accessToken: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 512 },
          newRefreshToken: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 512 },
          accessExpires: { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_TIMESTAMP },
          refreshExpires: { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_TIMESTAMP },
          userId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        },
        { autoCommit: true }
      );

      const outBinds = result.outBinds ?? {};
      const userId = outBinds.userId ?? null;

      if (!userId || !outBinds.accessToken || !outBinds.newRefreshToken) {
        logAuthEvent('Refresh rejected', {
          refreshToken: summarizeToken(refreshToken),
          reason: 'Invalid refresh token'
        });
        return res.status(401).json({ ok: false, error: 'El token de actualización no es válido.' });
      }

      logAuthEvent('Refresh successful', {
        userId,
        accessToken: summarizeToken(outBinds.accessToken),
        refreshToken: summarizeToken(outBinds.newRefreshToken),
        accessExpiresAt: toIsoString(outBinds.accessExpires),
        refreshExpiresAt: toIsoString(outBinds.refreshExpires)
      });

      res.json({
        ok: true,
        userId,
        accessToken: outBinds.accessToken,
        refreshToken: outBinds.newRefreshToken,
        accessExpiresAt: toIsoString(outBinds.accessExpires),
        refreshExpiresAt: toIsoString(outBinds.refreshExpires)
      });
    } catch (error) {
      console.error('[Auth] Refresh failed:', error);
      res.status(500).json({ ok: false, error: 'No se pudo refrescar la sesión.' });
    }
  });

  app.post('/auth/logout', async (req, res) => {
    const { accessToken, refreshToken } = req.body ?? {};

    if (!accessToken && !refreshToken) {
      return res.status(400).json({
        ok: false,
        error: 'Debes proporcionar al menos el token de acceso o el token de actualización.'
      });
    }

    try {
      logAuthEvent('Logout attempt received', {
        accessToken: summarizeToken(accessToken ?? null),
        refreshToken: summarizeToken(refreshToken ?? null)
      });

      if (accessToken) {
        await executeQuery(
          'BEGIN sp_revocar_access(:token); END;',
          { token: accessToken },
          { autoCommit: true }
        );
      }

      if (refreshToken) {
        try {
          await executeQuery(
            'BEGIN sp_revocar_refresh(:token); END;',
            { token: refreshToken },
            { autoCommit: true }
          );
        } catch (error) {
          if (!error?.message || !error.message.includes('ORA-01403')) {
            throw error;
          }
        }
      }

      logAuthEvent('Logout completed', {
        accessToken: summarizeToken(accessToken ?? null),
        refreshToken: summarizeToken(refreshToken ?? null)
      });

      res.json({ ok: true });
    } catch (error) {
      handleOracleError(error, res, 'No se pudo cerrar la sesión.');
    }
  });

  app.post('/auth/register', async (req, res) => {
    const { email, password, passwordConfirmation } = req.body ?? {};

    if (!email || !password || !passwordConfirmation) {
      return res
        .status(400)
        .json({ ok: false, error: 'El correo y ambas contraseñas son obligatorios.' });
    }

    try {
      const result = await executeQuery(
        `BEGIN
           sp_registrar_usuario(
             p_correo    => :correo,
             p_password  => :password,
             p_password2 => :password2,
             p_resultado => :resultado
           );
         END;`,
        {
          correo: email,
          password,
          password2: passwordConfirmation,
          resultado: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 512 }
        },
        { autoCommit: true }
      );

      const outcome = result.outBinds?.resultado;

      if (outcome !== 'OK') {
        return res.status(400).json({ ok: false, error: outcome || 'No se pudo registrar al usuario.' });
      }

      res.json({ ok: true });
    } catch (error) {
      handleOracleError(error, res, 'No se pudo registrar al usuario.');
    }
  });

  app.post('/auth/validate', async (req, res) => {
    const { accessToken } = req.body ?? {};

    if (!accessToken) {
      return res.status(400).json({ ok: false, error: 'El token de acceso es obligatorio.' });
    }

    try {
      logAuthEvent('Validate attempt received', {
        accessToken: summarizeToken(accessToken),
        ip: getClientIp(req)
      });

      const isValid = await isAccessTokenValid(accessToken);

      logAuthEvent('Validate result', {
        accessToken: summarizeToken(accessToken),
        isValid
      });

      res.json({ ok: isValid });
    } catch (error) {
      handleOracleError(error, res, 'No se pudo validar el token.');
    }
  });
}

module.exports = {
  registerAuthRoutes
};
