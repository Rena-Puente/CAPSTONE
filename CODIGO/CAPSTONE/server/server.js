require('dotenv').config();

const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
const path = require('path');

const {
  PORT = 3000,
  DB_USER,
  DB_PASSWORD,
  DB_CONNECT_ALIAS,
  DB_WALLET_DIR,
  DB_WALLET_PASSWORD,
  ACCESS_TOKEN_MINUTES = '15',
  REFRESH_TOKEN_DAYS = '30'
} = process.env;

const accessTokenMinutes = Number.parseInt(ACCESS_TOKEN_MINUTES, 10);
const refreshTokenDays = Number.parseInt(REFRESH_TOKEN_DAYS, 10);

if (Number.isNaN(accessTokenMinutes) || accessTokenMinutes <= 0) {
  throw new Error('ACCESS_TOKEN_MINUTES must be a positive integer');
}

if (Number.isNaN(refreshTokenDays) || refreshTokenDays <= 0) {
  throw new Error('REFRESH_TOKEN_DAYS must be a positive integer');
}

function ensureEnv(value, name) {
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

const resolvedWalletDir = path.resolve(__dirname, ensureEnv(DB_WALLET_DIR, 'DB_WALLET_DIR'));
process.env.TNS_ADMIN = resolvedWalletDir;
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];
async function initPool() {
  try {
    await oracledb.createPool({
      user: ensureEnv(DB_USER, 'DB_USER'),
      password: ensureEnv(DB_PASSWORD, 'DB_PASSWORD'),
      connectString: ensureEnv(DB_CONNECT_ALIAS, 'DB_CONNECT_ALIAS'),
      walletLocation: resolvedWalletDir,
      walletPassword: DB_WALLET_PASSWORD || undefined
    });
    console.log('[DB] Connection pool created successfully');
  } catch (error) {
    console.error('[DB] Failed to initialize connection pool:', error);
    throw error;
  }
}

async function closePool() {
  try {
    await oracledb.getPool().close(10);
    console.log('[DB] Connection pool closed');
  } catch (error) {
    if (error && error.message && error.message.includes('NJS-047')) {
      return;
    }
    console.error('[DB] Error closing connection pool:', error);
  }
}

async function executeQuery(sql, binds = {}, options = {}) {
  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(sql, binds, options);
    return result;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        console.error('[DB] Error releasing connection:', closeError);
      }
    }
  }
}

const app = express();
app.use(cors());
app.use(express.json());

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || (req.socket ? req.socket.remoteAddress : undefined);
}

function toIsoString(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  try {
    return new Date(value).toISOString();
  } catch (error) {
    console.warn('[Util] Failed to convert value to ISO string:', value, error);
    return null;
  }
}

function summarizeToken(token) {
  if (!token || typeof token !== 'string') {
    return token ?? null;
  }

  if (token.length <= 8) {
    return token;
  }

  return `${token.slice(0, 4)}...${token.slice(-4)} (len=${token.length})`;
}

function logAuthEvent(event, details = {}) {
  try {
    console.log(`[Auth] ${event}`, JSON.stringify(details));
  } catch (error) {
    console.log(`[Auth] ${event}`, details);
  }
}

function handleOracleError(error, res, defaultMessage = 'Error de base de datos') {
  console.error('[DB] Operation failed:', error);
  const message = error?.message || defaultMessage;
  res.status(500).json({ ok: false, error: message });
}

function extractBearerToken(req) {
  const authorization = req.headers?.authorization;

  if (!authorization || typeof authorization !== 'string') {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function isAccessTokenValid(accessToken) {
  const result = await executeQuery(
    'BEGIN :es_valido := fn_validar_access(:token); END;',
    {
      token: accessToken,
      es_valido: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    }
  );

  return (result.outBinds?.es_valido ?? 0) === 1;
}

const PROFILE_FIELD_LABELS = {
  NOMBRE_MOSTRAR: 'Nombre para mostrar',
  TITULAR: 'Titular profesional',
  BIOGRAFIA: 'Biografía (mínimo 80 caracteres)',
  PAIS: 'País',
  CIUDAD: 'Ciudad',
  URL_AVATAR: 'Foto de perfil'
};

const PROFILE_FIELD_KEYS = ['displayName', 'headline', 'biography', 'country', 'city', 'avatarUrl'];

const PROFILE_FIELD_METADATA = {
  displayName: { column: 'NOMBRE_MOSTRAR', label: PROFILE_FIELD_LABELS.NOMBRE_MOSTRAR },
  headline: { column: 'TITULAR', label: PROFILE_FIELD_LABELS.TITULAR },
  biography: { column: 'BIOGRAFIA', label: PROFILE_FIELD_LABELS.BIOGRAFIA },
  country: { column: 'PAIS', label: PROFILE_FIELD_LABELS.PAIS },
  city: { column: 'CIUDAD', label: PROFILE_FIELD_LABELS.CIUDAD },
  avatarUrl: { column: 'URL_AVATAR', label: PROFILE_FIELD_LABELS.URL_AVATAR }
};

function createEmptyProfileValues() {
  return PROFILE_FIELD_KEYS.reduce((acc, field) => {
    acc[field] = null;
    return acc;
  }, {});
}

function createDefaultFieldStatuses(defaultOk = true) {
  return PROFILE_FIELD_KEYS.reduce((acc, field) => {
    acc[field] = { ok: defaultOk, error: null };
    return acc;
  }, {});
}

function mapRowToProfile(row) {
  if (!row) {
    return createEmptyProfileValues();
  }

  const profile = createEmptyProfileValues();

  for (const field of PROFILE_FIELD_KEYS) {
    const metadata = PROFILE_FIELD_METADATA[field];
    const value = row[metadata.column];
    if (typeof value === 'string') {
      profile[field] = value.trim();
    } else if (value === undefined || value === null) {
      profile[field] = null;
    } else {
      profile[field] = value;
    }
  }

  return profile;
}

function buildProfileEnvelope(values, statuses, options = {}) {
  const baseValues = {
    ...createEmptyProfileValues(),
    ...(values || {})
  };

  const fieldStatuses = {
    ...createDefaultFieldStatuses(true),
    ...(statuses || {})
  };

  const flags = {};
  const errors = {};

  for (const field of PROFILE_FIELD_KEYS) {
    const status = fieldStatuses[field] || { ok: true, error: null };
    flags[`ok_${field}`] = Boolean(status.ok);
    errors[`error_${field}`] = status.error ?? null;
  }

  const missingFields = Array.isArray(options.missingFields) ? options.missingFields : [];
  const message = options.message ?? null;
  const isComplete = Boolean(options.isComplete);

  const data = {
    ...baseValues,
    ...flags,
    ...errors,
    isComplete,
    missingFields,
    message,
    profile: baseValues
  };

  return {
    ok: true,
    data,
    profile: baseValues,
    validations: {
      ...flags,
      isComplete,
      missingFields
    },
    errors: {
      ...errors,
      message
    },
    isComplete,
    missingFields,
    message
  };
}

function sanitizeProfileInput(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return String(value).trim();
}

function isValidUrl(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(value);
    return Boolean(parsed.protocol) && Boolean(parsed.hostname);
  } catch (error) {
    return false;
  }
}

function validateProfilePayload(payload = {}) {
  const values = createEmptyProfileValues();

  for (const field of PROFILE_FIELD_KEYS) {
    values[field] = sanitizeProfileInput(payload[field]);
  }

  const statuses = createDefaultFieldStatuses(true);

  if (!values.displayName) {
    statuses.displayName = { ok: false, error: 'Ingresa tu nombre para mostrar.' };
  }

  if (!values.headline) {
    statuses.headline = { ok: false, error: 'Ingresa tu titular profesional.' };
  }

  if (!values.biography || values.biography.length < 80) {
    statuses.biography = {
      ok: false,
      error: 'La biografía debe tener al menos 80 caracteres.'
    };
  }

  if (!values.country) {
    statuses.country = { ok: false, error: 'Selecciona tu país.' };
  }

  if (!values.city) {
    statuses.city = { ok: false, error: 'Ingresa tu ciudad.' };
  }

  if (!values.avatarUrl) {
    statuses.avatarUrl = {
      ok: false,
      error: 'Proporciona un enlace para tu foto de perfil.'
    };
  } else if (!isValidUrl(values.avatarUrl)) {
    statuses.avatarUrl = {
      ok: false,
      error: 'Ingresa un enlace válido (incluye https://) para tu foto de perfil.'
    };
  }

  const missingFields = PROFILE_FIELD_KEYS.filter((field) => !statuses[field].ok).map((field) => {
    const metadata = PROFILE_FIELD_METADATA[field];
    return metadata ? metadata.label : field;
  });

  const isValid = missingFields.length === 0;

  return { values, statuses, missingFields, isValid };
}

function computeProfileMissingFields(row) {
  if (!row) {
    return Object.values(PROFILE_FIELD_LABELS);
  }

  const missing = [];

  if (!row.NOMBRE_MOSTRAR) {
    missing.push(PROFILE_FIELD_LABELS.NOMBRE_MOSTRAR);
  }

  if (!row.TITULAR) {
    missing.push(PROFILE_FIELD_LABELS.TITULAR);
  }

  const biography = typeof row.BIOGRAFIA === 'string' ? row.BIOGRAFIA : null;
  if (!biography || biography.trim().length < 80) {
    missing.push(PROFILE_FIELD_LABELS.BIOGRAFIA);
  }

  if (!row.PAIS) {
    missing.push(PROFILE_FIELD_LABELS.PAIS);
  }

  if (!row.CIUDAD) {
    missing.push(PROFILE_FIELD_LABELS.CIUDAD);
  }

  if (!row.URL_AVATAR) {
    missing.push(PROFILE_FIELD_LABELS.URL_AVATAR);
  }

  return missing;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/test-db', async (req, res) => {
  try {
    const result = await executeQuery('SELECT 1 AS RESULT FROM dual');
    res.json({
      ok: true,
      data: result.rows
    });
  } catch (error) {
    console.error('[DB] Test query failed:', error);
    res.status(500).json({ ok: false, error: 'Database connection failed', details: error.message });
  }
});

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
      const missingFields = computeProfileMissingFields(profileRow);

      if (!profileRow) {
        isProfileComplete = false;
      } else {
        const flag = String(profileRow.PERFIL_COMPLETO ?? '').toUpperCase() === 'S';
        isProfileComplete = flag && missingFields.length === 0;
      }

      console.info('[Auth] Profile status calculated during login', {
        userId,
        isProfileComplete,
        missingFieldsCount: missingFields.length
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
         sp_refrescar_access(
           p_refresh_token => :refreshToken,
           o_access_token  => :accessToken,
           o_expira_access => :accessExpires
         );
       END;`,
      {
        refreshToken,
        accessToken: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 512 },
        accessExpires: { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_TIMESTAMP }
      },
      { autoCommit: true }
    );

    const outBinds = result.outBinds ?? {};

    if (!outBinds.accessToken) {
      logAuthEvent('Refresh rejected', {
        refreshToken: summarizeToken(refreshToken),
        reason: 'Stored procedure did not return a token'
      });
      return res.status(401).json({ ok: false, error: 'No fue posible refrescar la sesión.' });
    }

    logAuthEvent('Refresh successful', {
      refreshToken: summarizeToken(refreshToken),
      newAccessToken: summarizeToken(outBinds.accessToken),
      accessExpiresAt: toIsoString(outBinds.accessExpires)
    });

    res.json({
      ok: true,
      accessToken: outBinds.accessToken,
      accessExpiresAt: toIsoString(outBinds.accessExpires)
    });
  } catch (error) {
    if (error && typeof error.message === 'string' && error.message.includes('ORA-01403')) {
      logAuthEvent('Refresh rejected', {
        refreshToken: summarizeToken(refreshToken),
        reason: 'ORA-01403: no data found'
      });
      return res.status(401).json({ ok: false, error: 'El token de actualización no es válido.' });
    }

    handleOracleError(error, res, 'No se pudo refrescar el token de acceso.');
  }
});

app.post('/auth/logout', async (req, res) => {
  const { accessToken, refreshToken } = req.body ?? {};

  if (!accessToken && !refreshToken) {
    return res.status(400).json({ ok: false, error: 'Debe proporcionar un token para cerrar sesión.' });
  }

  try {
    logAuthEvent('Logout requested', {
      accessToken: summarizeToken(accessToken ?? null),
      refreshToken: summarizeToken(refreshToken ?? null)
    });

    if (accessToken) {
      try {
        await executeQuery(
          'BEGIN sp_revocar_access(:token); END;',
          { token: accessToken },
          { autoCommit: true }
        );
      } catch (error) {
        if (!error?.message || !error.message.includes('ORA-01403')) {
          throw error;
        }
      }
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
    return res.status(400).json({ ok: false, error: 'El correo y ambas contraseñas son obligatorios.' });
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

    const result = await executeQuery(
      'BEGIN :es_valido := fn_validar_access(:token); END;',
      {
        token: accessToken,
        es_valido: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      }
    );

    const isValid = (result.outBinds?.es_valido ?? 0) === 1;

    logAuthEvent('Validate result', {
      accessToken: summarizeToken(accessToken),
      isValid
    });

    res.json({ ok: isValid });
  } catch (error) {
    handleOracleError(error, res, 'No se pudo validar el token.');
  }
});

app.options('/profile/status/:userId', cors());

app.get('/profile/status/:userId', async (req, res) => {
  const startedAt = Date.now();
  const accessToken = extractBearerToken(req);
  const userId = Number.parseInt(req.params.userId, 10);

  console.info('[Profile] Status request received', {
    method: req.method,
    path: req.originalUrl,
    userId: Number.isNaN(userId) ? req.params.userId : userId,
    hasAuthorization: Boolean(accessToken),
    ip: getClientIp(req)
  });

  if (!Number.isInteger(userId) || userId <= 0) {
    console.warn('[Profile] Status request rejected: invalid user id', {
      path: req.originalUrl,
      userId: req.params.userId
    });
    return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
  }

  if (!accessToken) {
    console.warn('[Profile] Status request rejected: missing access token', {
      path: req.originalUrl,
      userId
    });
    return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
  }

  try {
    const isValid = await isAccessTokenValid(accessToken);

    if (!isValid) {
      console.warn('[Profile] Status request rejected: invalid access token', {
        path: req.originalUrl,
        userId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
    }

    console.info('[Profile] Status request authorized', {
      userId,
      elapsedMs: Date.now() - startedAt
    });

    await executeQuery(
      'BEGIN sp_recalcular_perfil_completo(p_id_usuario => :userId); END;',
      { userId },
      { autoCommit: true }
    );

    const result = await executeQuery(
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

    const row = result.rows?.[0] ?? null;
    const missingFields = computeProfileMissingFields(row);

    if (!row) {
      return res.json({
        ok: true,
        profile: null,
        isComplete: false,
        missingFields
      });
    }

    const isComplete = String(row.PERFIL_COMPLETO ?? '').toUpperCase() === 'S';

    res.json({
      ok: true,
      profile: {
        displayName: row.NOMBRE_MOSTRAR ?? null,
        headline: row.TITULAR ?? null,
        biography: row.BIOGRAFIA ?? null,
        country: row.PAIS ?? null,
        city: row.CIUDAD ?? null,
        avatarUrl: row.URL_AVATAR ?? null
      },
      isComplete,
      missingFields
    });

    console.info('[Profile] Status response sent', {
      userId,
      hasProfile: Boolean(row),
      isComplete,
      missingFieldsCount: missingFields.length,
      elapsedMs: Date.now() - startedAt
    });
  } catch (error) {
    console.error('[Profile] Status request failed', {
      userId,
      path: req.originalUrl,
      elapsedMs: Date.now() - startedAt,
      error: error?.message || error
    });
    handleOracleError(error, res, 'No se pudo obtener el estado del perfil.');
  }
});

app.options('/profile/:userId', cors());

app.get('/profile/:userId', async (req, res) => {
  const startedAt = Date.now();
  const accessToken = extractBearerToken(req);
  const userId = Number.parseInt(req.params.userId, 10);

  console.info('[Profile] Detail request received', {
    method: req.method,
    path: req.originalUrl,
    userId: Number.isNaN(userId) ? req.params.userId : userId,
    hasAuthorization: Boolean(accessToken),
    ip: getClientIp(req)
  });

  if (!Number.isInteger(userId) || userId <= 0) {
    console.warn('[Profile] Detail request rejected: invalid user id', {
      path: req.originalUrl,
      userId: req.params.userId
    });
    return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
  }

  if (!accessToken) {
    console.warn('[Profile] Detail request rejected: missing access token', {
      path: req.originalUrl,
      userId
    });
    return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
  }

  try {
    const isValid = await isAccessTokenValid(accessToken);

    if (!isValid) {
      console.warn('[Profile] Detail request rejected: invalid access token', {
        path: req.originalUrl,
        userId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
    }

    const result = await executeQuery(
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

    const row = result.rows?.[0] ?? null;
    const profileValues = mapRowToProfile(row);
    const missingFields = computeProfileMissingFields(row);
    const isCompleteFlag = row ? String(row.PERFIL_COMPLETO ?? '').toUpperCase() === 'S' : false;
    const isComplete = isCompleteFlag && missingFields.length === 0;
    const message = row ? null : 'Aún no has configurado tu perfil.';

    const response = buildProfileEnvelope(profileValues, createDefaultFieldStatuses(true), {
      isComplete,
      missingFields,
      message
    });

    console.info('[Profile] Detail response sent', {
      userId,
      hasProfile: Boolean(row),
      isComplete,
      missingFieldsCount: missingFields.length,
      elapsedMs: Date.now() - startedAt
    });

    res.json(response);
  } catch (error) {
    console.error('[Profile] Detail request failed', {
      userId,
      path: req.originalUrl,
      elapsedMs: Date.now() - startedAt,
      error: error?.message || error
    });
    handleOracleError(error, res, 'No se pudo obtener el perfil.');
  }
});

app.put('/profile/:userId', async (req, res) => {
  const startedAt = Date.now();
  const accessToken = extractBearerToken(req);
  const userId = Number.parseInt(req.params.userId, 10);

  console.info('[Profile] Update request received', {
    method: req.method,
    path: req.originalUrl,
    userId: Number.isNaN(userId) ? req.params.userId : userId,
    hasAuthorization: Boolean(accessToken),
    ip: getClientIp(req)
  });

  if (!Number.isInteger(userId) || userId <= 0) {
    console.warn('[Profile] Update request rejected: invalid user id', {
      path: req.originalUrl,
      userId: req.params.userId
    });
    return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
  }

  if (!accessToken) {
    console.warn('[Profile] Update request rejected: missing access token', {
      path: req.originalUrl,
      userId
    });
    return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
  }

  try {
    const isValidToken = await isAccessTokenValid(accessToken);

    if (!isValidToken) {
      console.warn('[Profile] Update request rejected: invalid access token', {
        path: req.originalUrl,
        userId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
    }

    const validation = validateProfilePayload(req.body || {});

    if (!validation.isValid) {
      console.warn('[Profile] Update request validation failed', {
        userId,
        missingFields: validation.missingFields,
        elapsedMs: Date.now() - startedAt
      });

      const response = buildProfileEnvelope(validation.values, validation.statuses, {
        isComplete: false,
        missingFields: validation.missingFields,
        message: 'Corrige la información resaltada e inténtalo nuevamente.'
      });

      return res.json(response);
    }

    const dbPayload = {
      displayName: validation.values.displayName || null,
      headline: validation.values.headline || null,
      biography: validation.values.biography || null,
      country: validation.values.country || null,
      city: validation.values.city || null,
      avatarUrl: validation.values.avatarUrl || null
    };

    await executeQuery(
      `MERGE INTO perfiles dest
        USING (
          SELECT :userId AS id_usuario,
                 :displayName AS nombre_mostrar,
                 :headline AS titular,
                 :biography AS biografia,
                 :country AS pais,
                 :city AS ciudad,
                 :avatarUrl AS url_avatar
            FROM dual
        ) src
        ON (dest.id_usuario = src.id_usuario)
      WHEN MATCHED THEN
        UPDATE SET
          dest.nombre_mostrar = src.nombre_mostrar,
          dest.titular = src.titular,
          dest.biografia = src.biografia,
          dest.pais = src.pais,
          dest.ciudad = src.ciudad,
          dest.url_avatar = src.url_avatar
      WHEN NOT MATCHED THEN
        INSERT (
          id_usuario,
          nombre_mostrar,
          titular,
          biografia,
          pais,
          ciudad,
          url_avatar
        ) VALUES (
          src.id_usuario,
          src.nombre_mostrar,
          src.titular,
          src.biografia,
          src.pais,
          src.ciudad,
          src.url_avatar
        )`,
      {
        userId,
        ...dbPayload
      },
      { autoCommit: true }
    );

    await executeQuery(
      'BEGIN sp_recalcular_perfil_completo(p_id_usuario => :userId); END;',
      { userId },
      { autoCommit: true }
    );

    const result = await executeQuery(
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

    const row = result.rows?.[0] ?? null;
    const profileValues = mapRowToProfile(row);
    const missingFields = computeProfileMissingFields(row);
    const isCompleteFlag = row ? String(row.PERFIL_COMPLETO ?? '').toUpperCase() === 'S' : false;
    const isComplete = isCompleteFlag && missingFields.length === 0;

    const response = buildProfileEnvelope(profileValues, createDefaultFieldStatuses(true), {
      isComplete,
      missingFields,
      message: 'Perfil actualizado correctamente.'
    });

    console.info('[Profile] Update successful', {
      userId,
      isComplete,
      missingFieldsCount: missingFields.length,
      elapsedMs: Date.now() - startedAt
    });

    res.json(response);
  } catch (error) {
    console.error('[Profile] Update failed', {
      userId,
      path: req.originalUrl,
      elapsedMs: Date.now() - startedAt,
      error: error?.message || error
    });
    handleOracleError(error, res, 'No se pudo actualizar el perfil.');
  }
});

async function start() {
  await initPool();

  const server = app.listen(PORT, () => {
    console.log(`[Server] Listening on port ${PORT}`);
  });

  const shutdown = async () => {
    console.log('\n[Server] Shutting down...');
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start().catch((error) => {
  console.error('[Server] Failed to start:', error);
  process.exit(1);
});

module.exports = {
  executeQuery
};
