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

function parseEducationDate(value, fieldLabel) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`La fecha de ${fieldLabel} no es válida.`);
    }

    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const normalized = /^\d{4}-\d{2}$/.test(trimmed) ? `${trimmed}-01` : trimmed;
    const parsed = new Date(normalized);

    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`La fecha de ${fieldLabel} no es válida.`);
    }

    return parsed;
  }

  throw new Error(`La fecha de ${fieldLabel} no es válida.`);
}

function normalizeEducationPayload(payload = {}) {
  const institution = typeof payload.institution === 'string' ? payload.institution.trim() : '';

  if (!institution) {
    throw new Error('La institución es obligatoria.');
  }

  const degree = typeof payload.degree === 'string' ? payload.degree.trim() : '';
  const fieldOfStudy = typeof payload.fieldOfStudy === 'string' ? payload.fieldOfStudy.trim() : '';
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';

  const startDate = parseEducationDate(payload.startDate, 'inicio');
  const endDate = parseEducationDate(payload.endDate, 'fin');

  if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
    throw new Error('La fecha de fin no puede ser anterior a la fecha de inicio.');
  }

  return {
    institution,
    degree: degree || null,
    fieldOfStudy: fieldOfStudy || null,
    startDate,
    endDate,
    description: description || null
  };
}

async function fetchCursorRows(cursor) {
  const rows = [];

  if (!cursor) {
    return rows;
  }

  try {
    let batch;

    do {
      batch = await cursor.getRows(100);

      if (!batch || batch.length === 0) {
        break;
      }

      rows.push(...batch);
    } while (batch.length === 100);
  } finally {
    try {
      await cursor.close();
    } catch (error) {
      console.error('[DB] Failed to close cursor:', error);
    }
  }

  return rows;
}

function toNullableTrimmedString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    
    if (!trimmed || trimmed === '[object Object]') {
      return null;
    }

    return trimmed;
  }

  const stringValue = String(value).trim();
    if (!stringValue || stringValue === '[object Object]') {
    return null;
  }

  return stringValue;
}

function mapEducationRow(row) {
  if (!row) {
    return null;
  }

  const idValue = Number(row.ID_EDUCACION ?? row.id_educacion ?? null);
  const id = Number.isNaN(idValue) ? null : idValue;

  return {
    id,
    institution: toNullableTrimmedString(row.INSTITUCION ?? row.institucion),
    degree: toNullableTrimmedString(row.GRADO ?? row.grado),
    fieldOfStudy: toNullableTrimmedString(row.AREA_ESTUDIO ?? row.area_estudio),
    startDate: toIsoString(row.FECHA_INICIO ?? row.fecha_inicio),
    endDate: toIsoString(row.FECHA_FIN ?? row.fecha_fin),
    description: toNullableTrimmedString(row.DESCRIPCION ?? row.descripcion)
  };
}

async function listEducation(userId) {
  let connection;
  try {
    connection = await oracledb.getConnection();
    const result = await connection.execute(
      'BEGIN sp_educacion_pkg.sp_listar_educacion(:userId, :items); END;',
      {
        userId,
        items: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
      }
    );

    const cursor = result.outBinds?.items || null;
    const rows = await fetchCursorRows(cursor);
    const previewRows = rows.slice(0, 3).map((row, index) => ({
      index,
      keys: Object.keys(row || {}),
      values: row
    }));

    console.info('[Education] listEducation rows fetched', {
      userId,
      rowCount: rows.length,
      preview: previewRows
    });

    const mappedEntries = rows
      .map((row) => mapEducationRow(row))
      .filter((entry) => entry && typeof entry.id === 'number');

    console.info('[Education] listEducation mapped entries', {
      userId,
      mappedCount: mappedEntries.length,
      preview: mappedEntries.slice(0, 3)
    });

    return mappedEntries;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.error('[DB] Error releasing connection after listing education:', error);
      }
    }
  }
}

async function getEducationEntry(userId, educationId) {
  const result = await executeQuery(
    `BEGIN sp_educacion_pkg.sp_obtener_educacion(
       p_id_educacion => :educationId,
       p_id_usuario => :userId,
       o_institucion => :institution,
       o_grado => :degree,
       o_area_estudio => :fieldOfStudy,
       o_fecha_inicio => :startDate,
       o_fecha_fin => :endDate,
       o_descripcion => :description,
       o_existe => :exists
     ); END;`,
    {
      educationId,
      userId,
      institution: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
      degree: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
      fieldOfStudy: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
      startDate: { dir: oracledb.BIND_OUT, type: oracledb.DATE },
      endDate: { dir: oracledb.BIND_OUT, type: oracledb.DATE },
      description: { dir: oracledb.BIND_OUT, type: oracledb.CLOB },
      exists: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    }
  );

  const outBinds = result.outBinds || {};
  const exists = Number(outBinds.exists ?? 0) === 1;

  if (!exists) {
    console.info('[Education] getEducationEntry: entry not found', {
      userId,
      educationId
    });
    return null;
  }

  const entry = {
    id: educationId,
    institution: toNullableTrimmedString(outBinds.institution),
    degree: toNullableTrimmedString(outBinds.degree),
    fieldOfStudy: toNullableTrimmedString(outBinds.fieldOfStudy),
    startDate: toIsoString(outBinds.startDate),
    endDate: toIsoString(outBinds.endDate),
    description: toNullableTrimmedString(outBinds.description)
  };

  console.info('[Education] getEducationEntry: entry retrieved', {
    userId,
    educationId,
    entry
  });

  return entry;
}

async function getEducationStatus(userId) {
  const result = await executeQuery(
    `BEGIN sp_educacion_pkg.sp_educacion_chk(
       p_id_usuario => :userId,
       o_tiene_educacion => :hasEducation,
       o_total_registros => :totalRecords,
       o_con_fechas_validas => :validDates
     ); END;`,
    {
      userId,
      hasEducation: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      totalRecords: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      validDates: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    }
  );

  const outBinds = result.outBinds || {};
  const totalRecords = Number(outBinds.totalRecords ?? 0);
  const validDates = Number(outBinds.validDates ?? 0);
  const invalidDateCount = Math.max(totalRecords - validDates, 0);

  const summary = {
    hasEducation: Number(outBinds.hasEducation ?? 0) === 1,
    totalRecords,
    validDateCount: validDates,
    invalidDateCount
  };

  console.info('[Education] getEducationStatus result', {
    userId,
    summary
  });

  return summary;
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

const EDUCATION_SECTION_LABEL = 'Historial educativo';
const EDUCATION_DATES_NOTE = 'Historial educativo (revisa las fechas)';

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
  const educationSummary = options.educationSummary ?? null;

  const data = {
    ...baseValues,
    ...flags,
    ...errors,
    isComplete,
    missingFields,
    message,
    educationSummary,
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
    message,
    educationSummary
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

function hasMeaningfulValue(value) {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return String(value).trim().length > 0;
}

function validateProfilePayload(payload = {}, currentProfile = null) {
  const values = createEmptyProfileValues();

  for (const field of PROFILE_FIELD_KEYS) {
        if (Object.prototype.hasOwnProperty.call(payload, field)) {
      values[field] = sanitizeProfileInput(payload[field]);
    } else if (currentProfile && hasMeaningfulValue(currentProfile[field])) {
      const existingValue = currentProfile[field];
      values[field] = typeof existingValue === 'string' ? existingValue : sanitizeProfileInput(existingValue);
    } else {
      values[field] = sanitizeProfileInput(payload[field]);
    }
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

function computeProfileMissingFields(row, educationStatus = null) {
  if (!row) {
    const defaults = Object.values(PROFILE_FIELD_LABELS);
    const missingEducation =
      !educationStatus || !educationStatus.hasEducation
        ? [EDUCATION_SECTION_LABEL]
        : educationStatus.invalidDateCount > 0
          ? [EDUCATION_DATES_NOTE]
          : [];

    return [...defaults, ...missingEducation];
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

  if (!educationStatus || !educationStatus.hasEducation) {
    missing.push(EDUCATION_SECTION_LABEL);
  } else if (educationStatus.invalidDateCount > 0) {
    missing.push(EDUCATION_DATES_NOTE);
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
      const educationStatus = await getEducationStatus(userId);
      const missingFields = computeProfileMissingFields(profileRow, educationStatus);

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
    const educationSummary = await getEducationStatus(userId);
    const missingFields = computeProfileMissingFields(row, educationSummary);

    if (!row) {
      return res.json({
        ok: true,
        profile: null,
        isComplete: false,
        missingFields,
        educationSummary
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
      missingFields,
      educationSummary
    });

    console.info('[Profile] Status response sent', {
      userId,
      hasProfile: Boolean(row),
      isComplete,
      missingFieldsCount: missingFields.length,
      educationRecords: educationSummary?.totalRecords ?? 0,
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
    const educationSummary = await getEducationStatus(userId);
    const missingFields = computeProfileMissingFields(row, educationSummary);
    const isCompleteFlag = row ? String(row.PERFIL_COMPLETO ?? '').toUpperCase() === 'S' : false;
    const isComplete = isCompleteFlag && missingFields.length === 0;
    const message = row ? null : 'Aún no has configurado tu perfil.';

    const response = buildProfileEnvelope(profileValues, createDefaultFieldStatuses(true), {
      isComplete,
      missingFields,
      message,
      educationSummary
    });

    console.info('[Profile] Detail response sent', {
      userId,
      hasProfile: Boolean(row),
      isComplete,
      missingFieldsCount: missingFields.length,
      educationRecords: educationSummary?.totalRecords ?? 0,
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

app.options('/profile/:userId/education', cors());
app.options('/profile/:userId/education/:educationId', cors());

app.get('/profile/:userId/education', async (req, res) => {
  const startedAt = Date.now();
  const accessToken = extractBearerToken(req);
  const userId = Number.parseInt(req.params.userId, 10);

  console.info('[Education] List request received', {
    method: req.method,
    path: req.originalUrl,
    userId: Number.isNaN(userId) ? req.params.userId : userId,
    hasAuthorization: Boolean(accessToken),
    ip: getClientIp(req)
  });

  if (!Number.isInteger(userId) || userId <= 0) {
    console.warn('[Education] List request rejected: invalid user id', {
      path: req.originalUrl,
      userId: req.params.userId
    });
    return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
  }

  if (!accessToken) {
    console.warn('[Education] List request rejected: missing access token', {
      path: req.originalUrl,
      userId
    });
    return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
  }

  try {
    const isValid = await isAccessTokenValid(accessToken);

    if (!isValid) {
      console.warn('[Education] List request rejected: invalid access token', {
        path: req.originalUrl,
        userId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
    }

    const [education, educationSummary] = await Promise.all([
      listEducation(userId),
      getEducationStatus(userId)
    ]);

    console.info('[Education] List response sent', {
      userId,
      count: education.length,
      educationRecords: educationSummary.totalRecords,
      elapsedMs: Date.now() - startedAt
    });

    res.json({ ok: true, education, educationSummary });
  } catch (error) {
    console.error('[Education] List request failed', {
      userId,
      path: req.originalUrl,
      elapsedMs: Date.now() - startedAt,
      error: error?.message || error
    });
    handleOracleError(error, res, 'No se pudo obtener la información educativa.');
  }
});

app.post('/profile/:userId/education', async (req, res) => {
  const startedAt = Date.now();
  const accessToken = extractBearerToken(req);
  const userId = Number.parseInt(req.params.userId, 10);

  console.info('[Education] Create request received', {
    method: req.method,
    path: req.originalUrl,
    userId: Number.isNaN(userId) ? req.params.userId : userId,
    hasAuthorization: Boolean(accessToken),
    ip: getClientIp(req)
  });

  if (!Number.isInteger(userId) || userId <= 0) {
    console.warn('[Education] Create request rejected: invalid user id', {
      path: req.originalUrl,
      userId: req.params.userId
    });
    return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
  }

  if (!accessToken) {
    console.warn('[Education] Create request rejected: missing access token', {
      path: req.originalUrl,
      userId
    });
    return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
  }

  let normalizedPayload;

  try {
    normalizedPayload = normalizeEducationPayload(req.body || {});
  } catch (validationError) {
    const message = validationError instanceof Error ? validationError.message : 'Los datos enviados no son válidos.';
    return res.status(400).json({ ok: false, error: message });
  }

  try {
    const isValid = await isAccessTokenValid(accessToken);

    if (!isValid) {
      console.warn('[Education] Create request rejected: invalid access token', {
        path: req.originalUrl,
        userId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
    }

    const result = await executeQuery(
      `BEGIN sp_educacion_pkg.sp_crear_educacion(
         p_id_usuario   => :userId,
         p_institucion  => :institution,
         p_grado        => :degree,
         p_area_estudio => :fieldOfStudy,
         p_fecha_inicio => :startDate,
         p_fecha_fin    => :endDate,
         p_descripcion  => :description,
         o_id_educacion => :educationId
       ); END;`,
      {
        userId,
        institution: normalizedPayload.institution,
        degree: normalizedPayload.degree,
        fieldOfStudy: normalizedPayload.fieldOfStudy,
        startDate: normalizedPayload.startDate,
        endDate: normalizedPayload.endDate,
        description: normalizedPayload.description,
        educationId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: true }
    );

    const newId = Number(result.outBinds?.educationId ?? 0);

    if (!Number.isInteger(newId) || newId <= 0) {
      throw new Error('No se pudo determinar el identificador de la educación creada.');
    }

    const [education, educationSummary] = await Promise.all([
      getEducationEntry(userId, newId),
      getEducationStatus(userId)
    ]);

    if (!education) {
      throw new Error('La educación recién creada no pudo ser recuperada.');
    }

    console.info('[Education] Create successful', {
      userId,
      educationId: newId,
      elapsedMs: Date.now() - startedAt
    });

    res.status(201).json({ ok: true, education, educationSummary });
  } catch (error) {
    console.error('[Education] Create request failed', {
      userId,
      path: req.originalUrl,
      elapsedMs: Date.now() - startedAt,
      error: error?.message || error
    });
    handleOracleError(error, res, 'No se pudo crear el registro educativo.');
  }
});

app.put('/profile/:userId/education/:educationId', async (req, res) => {
  const startedAt = Date.now();
  const accessToken = extractBearerToken(req);
  const userId = Number.parseInt(req.params.userId, 10);
  const educationId = Number.parseInt(req.params.educationId, 10);

  console.info('[Education] Update request received', {
    method: req.method,
    path: req.originalUrl,
    userId: Number.isNaN(userId) ? req.params.userId : userId,
    educationId: Number.isNaN(educationId) ? req.params.educationId : educationId,
    hasAuthorization: Boolean(accessToken),
    ip: getClientIp(req)
  });

  if (!Number.isInteger(userId) || userId <= 0) {
    console.warn('[Education] Update request rejected: invalid user id', {
      path: req.originalUrl,
      userId: req.params.userId
    });
    return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
  }

  if (!Number.isInteger(educationId) || educationId <= 0) {
    console.warn('[Education] Update request rejected: invalid education id', {
      path: req.originalUrl,
      educationId: req.params.educationId
    });
    return res.status(400).json({ ok: false, error: 'El identificador de educación no es válido.' });
  }

  if (!accessToken) {
    console.warn('[Education] Update request rejected: missing access token', {
      path: req.originalUrl,
      userId,
      educationId
    });
    return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
  }

  let normalizedPayload;

  try {
    normalizedPayload = normalizeEducationPayload(req.body || {});
  } catch (validationError) {
    const message = validationError instanceof Error ? validationError.message : 'Los datos enviados no son válidos.';
    return res.status(400).json({ ok: false, error: message });
  }

  try {
    const isValid = await isAccessTokenValid(accessToken);

    if (!isValid) {
      console.warn('[Education] Update request rejected: invalid access token', {
        path: req.originalUrl,
        userId,
        educationId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
    }

    await executeQuery(
      `BEGIN sp_educacion_pkg.sp_actualizar_educacion(
         p_id_educacion => :educationId,
         p_id_usuario   => :userId,
         p_institucion  => :institution,
         p_grado        => :degree,
         p_area_estudio => :fieldOfStudy,
         p_fecha_inicio => :startDate,
         p_fecha_fin    => :endDate,
         p_descripcion  => :description
       ); END;`,
      {
        educationId,
        userId,
        institution: normalizedPayload.institution,
        degree: normalizedPayload.degree,
        fieldOfStudy: normalizedPayload.fieldOfStudy,
        startDate: normalizedPayload.startDate,
        endDate: normalizedPayload.endDate,
        description: normalizedPayload.description
      },
      { autoCommit: true }
    );

    const [education, educationSummary] = await Promise.all([
      getEducationEntry(userId, educationId),
      getEducationStatus(userId)
    ]);

    if (!education) {
      throw new Error('No se encontró el registro educativo actualizado.');
    }

    console.info('[Education] Update successful', {
      userId,
      educationId,
      elapsedMs: Date.now() - startedAt
    });

    res.json({ ok: true, education, educationSummary });
  } catch (error) {
    console.error('[Education] Update request failed', {
      userId,
      educationId,
      path: req.originalUrl,
      elapsedMs: Date.now() - startedAt,
      error: error?.message || error
    });
    handleOracleError(error, res, 'No se pudo actualizar el registro educativo.');
  }
});

app.delete('/profile/:userId/education/:educationId', async (req, res) => {
  const startedAt = Date.now();
  const accessToken = extractBearerToken(req);
  const userId = Number.parseInt(req.params.userId, 10);
  const educationId = Number.parseInt(req.params.educationId, 10);

  console.info('[Education] Delete request received', {
    method: req.method,
    path: req.originalUrl,
    userId: Number.isNaN(userId) ? req.params.userId : userId,
    educationId: Number.isNaN(educationId) ? req.params.educationId : educationId,
    hasAuthorization: Boolean(accessToken),
    ip: getClientIp(req)
  });

  if (!Number.isInteger(userId) || userId <= 0) {
    console.warn('[Education] Delete request rejected: invalid user id', {
      path: req.originalUrl,
      userId: req.params.userId
    });
    return res.status(400).json({ ok: false, error: 'El identificador de usuario no es válido.' });
  }

  if (!Number.isInteger(educationId) || educationId <= 0) {
    console.warn('[Education] Delete request rejected: invalid education id', {
      path: req.originalUrl,
      educationId: req.params.educationId
    });
    return res.status(400).json({ ok: false, error: 'El identificador de educación no es válido.' });
  }

  if (!accessToken) {
    console.warn('[Education] Delete request rejected: missing access token', {
      path: req.originalUrl,
      userId,
      educationId
    });
    return res.status(401).json({ ok: false, error: 'El token de acceso es obligatorio.' });
  }

  try {
    const isValid = await isAccessTokenValid(accessToken);

    if (!isValid) {
      console.warn('[Education] Delete request rejected: invalid access token', {
        path: req.originalUrl,
        userId,
        educationId
      });
      return res.status(401).json({ ok: false, error: 'El token de acceso no es válido.' });
    }

    await executeQuery(
      `BEGIN sp_educacion_pkg.sp_eliminar_educacion(
         p_id_educacion => :educationId,
         p_id_usuario   => :userId
       ); END;`,
      {
        educationId,
        userId
      },
      { autoCommit: true }
    );

    const educationSummary = await getEducationStatus(userId);

    console.info('[Education] Delete successful', {
      userId,
      educationId,
      remainingRecords: educationSummary.totalRecords,
      elapsedMs: Date.now() - startedAt
    });

    res.json({ ok: true, educationSummary });
  } catch (error) {
    console.error('[Education] Delete request failed', {
      userId,
      educationId,
      path: req.originalUrl,
      elapsedMs: Date.now() - startedAt,
      error: error?.message || error
    });
    handleOracleError(error, res, 'No se pudo eliminar el registro educativo.');
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

    const existingProfileResult = await executeQuery(
      `SELECT nombre_mostrar,
              titular,
              biografia,
              pais,
              ciudad,
              url_avatar
         FROM perfiles
        WHERE id_usuario = :userId`,
      { userId }
    );

    const existingRow = existingProfileResult.rows?.[0] ?? null;
    const existingProfileValues = existingRow ? mapRowToProfile(existingRow) : null;

    const validation = validateProfilePayload(req.body || {}, existingProfileValues);

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
    const educationSummary = await getEducationStatus(userId);
    const missingFields = computeProfileMissingFields(row, educationSummary);
    const isCompleteFlag = row ? String(row.PERFIL_COMPLETO ?? '').toUpperCase() === 'S' : false;
    const isComplete = isCompleteFlag && missingFields.length === 0;

    const response = buildProfileEnvelope(profileValues, createDefaultFieldStatuses(true), {
      isComplete,
      missingFields,
      message: 'Perfil actualizado correctamente.',
      educationSummary
    });

    console.info('[Profile] Update successful', {
      userId,
      isComplete,
      missingFieldsCount: missingFields.length,
      educationRecords: educationSummary?.totalRecords ?? 0,
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
