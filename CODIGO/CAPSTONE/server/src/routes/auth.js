const { config } = require('../config');
const { executeQuery, oracledb } = require('../db/oracle');
const { getClientIp } = require('../utils/request');
const { handleOracleError } = require('../utils/errors');
const { toIsoString } = require('../utils/format');
const { logAuthEvent, summarizeToken, isAccessTokenValid } = require('../services/auth');
const { getEducationStatus } = require('../services/education');
const { getExperienceStatus } = require('../services/experience');
const { getSkillStatus } = require('../services/skills');
const { computeProfileMissingFields } = require('../services/profile');

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
      let isProfileComplete = null;

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

        if (!profileRow) {
          isProfileComplete = false;
        } else {
          const flag = String(profileRow.PERFIL_COMPLETO ?? '').toUpperCase() === 'S';
          isProfileComplete = flag && missingFields.length === 0;
        }

        console.info('[Auth] Profile status calculated during login', {
          userId,
          isProfileComplete,
          missingFieldsCount: missingFields.length,
          educationRecords: educationStatus?.totalRecords ?? 0,
          experienceRecords: experienceStatus?.totalRecords ?? 0,
          skillsRecords: skillsStatus?.totalSkills ?? 0
        });
      } catch (profileError) {
        console.error('[Auth] Failed to determine profile status during login', {
          userId,
          error: profileError?.message || profileError
        });
        isProfileComplete = null;
      }

      logAuthEvent('Login successful', {
        userId,
        accessToken: summarizeToken(outBinds.accessToken ?? null),
        refreshToken: summarizeToken(outBinds.refreshToken ?? null),
        accessExpiresAt: toIsoString(outBinds.accessExpires),
        refreshExpiresAt: toIsoString(outBinds.refreshExpires),
        isProfileComplete
      });

      res.json({
        ok: true,
        userId,
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
