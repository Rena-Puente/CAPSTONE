const { executeQuery, oracledb } = require('../db/oracle');

const MAX_NAME_LENGTH = 150;

class StudyHouseError extends Error {
  constructor(message, statusCode = 400, code = 'STUDY_HOUSE_ERROR') {
    super(message);
    this.name = 'StudyHouseError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function sanitizeString(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return String(value).trim();
}

function normalizeStudyHouseName(value, { required = true } = {}) {
  const name = sanitizeString(value);

  if (!name) {
    if (required) {
      throw new StudyHouseError('El nombre de la casa de estudios es obligatorio.', 400, 'STUDY_HOUSE_NAME_REQUIRED');
    }

    return null;
  }

  if (name.length > MAX_NAME_LENGTH) {
    throw new StudyHouseError('El nombre de la casa de estudios es demasiado largo.', 400, 'STUDY_HOUSE_NAME_TOO_LONG');
  }

  return name;
}

function normalizeStudyHouseId(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new StudyHouseError('El identificador de la casa de estudios no es válido.', 400, 'INVALID_STUDY_HOUSE_ID');
  }

  return parsed;
}

function extractOracleErrorCode(error) {
  if (!error) {
    return null;
  }

  if (typeof error.errorNum === 'number' && Number.isFinite(error.errorNum)) {
    return error.errorNum;
  }

  const message = typeof error.message === 'string' ? error.message : '';
  const match = message.match(/ORA-(\d{5})/);

  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function mapStudyHouseOracleError(error) {
  const code = extractOracleErrorCode(error);

  switch (code) {
    case 20101:
      return new StudyHouseError('El nombre de la casa de estudios es obligatorio.', 400, 'STUDY_HOUSE_NAME_REQUIRED');
    case 20102:
      return new StudyHouseError('La casa de estudios ya existe.', 409, 'STUDY_HOUSE_ALREADY_EXISTS');
    case 20110:
      return new StudyHouseError('Debes indicar el identificador o el nombre de la casa de estudios.', 400, 'STUDY_HOUSE_DELETE_INPUT_REQUIRED');
    case 20111:
      return new StudyHouseError('No se encontró la casa de estudios solicitada.', 404, 'STUDY_HOUSE_NOT_FOUND');
    default:
      return null;
  }
}

function parseStudyHouseCatalogJson(rawJson) {
  if (!rawJson || typeof rawJson !== 'string') {
    return [];
  }

  const trimmed = rawJson.trim();

  if (!trimmed) {
    return [];
  }

  let parsed;

  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    console.error('[StudyHousesService] Failed to parse study house catalog JSON', {
      error: error?.message || error
    });
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const houses = [];

  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const rawName =
      typeof entry.casa_estudios === 'string'
        ? entry.casa_estudios
        : typeof entry.name === 'string'
        ? entry.name
        : typeof entry.CASA_ESTUDIOS === 'string'
        ? entry.CASA_ESTUDIOS
        : typeof entry.NAME === 'string'
        ? entry.NAME
        : null;
    const name = sanitizeString(rawName);

    if (!name) {
      continue;
    }

    const rawId = entry.id ?? entry.ID ?? entry.id_casa_estudios ?? entry.ID_CASA_ESTUDIOS ?? null;
    let id = null;

    if (rawId !== null && rawId !== undefined && rawId !== '') {
      const parsedId = Number.parseInt(String(rawId), 10);
      id = Number.isNaN(parsedId) || parsedId <= 0 ? null : parsedId;
    }

    houses.push({ id, name });
  }

  houses.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  return houses;
}

async function listStudyHouses(name) {
  const normalizedName = normalizeStudyHouseName(name, { required: false });

  const result = await executeQuery(
    `SELECT casa_estudios_pkg.fn_casa_listar_json(:houseName) AS json_data FROM dual`,
    {
      houseName: {
        dir: oracledb.BIND_IN,
        type: oracledb.STRING,
        val: normalizedName
      }
    }
  );

  const row = result.rows?.[0] ?? {};
  const jsonData =
    row.JSON_DATA ??
    row.json_data ??
    row.FN_CASA_LISTAR_JSON ??
    row.fn_casa_listar_json ??
    null;

  const houses = parseStudyHouseCatalogJson(jsonData);

  return houses;
}

async function createStudyHouse(name) {
  const normalizedName = normalizeStudyHouseName(name, { required: true });

  try {
    const result = await executeQuery(
      `BEGIN
         casa_estudios_pkg.sp_casa_crear(
           p_casa_estudios => :houseName,
           o_id            => :houseId
         );
       END;`,
      {
        houseName: normalizedName,
        houseId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: true }
    );

    const newId = Number(result.outBinds?.houseId ?? 0);

    if (!Number.isInteger(newId) || newId <= 0) {
      throw new StudyHouseError('No se pudo determinar el identificador de la casa de estudios creada.', 500, 'STUDY_HOUSE_ID_MISSING');
    }

    return {
      id: newId,
      name: normalizedName
    };
  } catch (error) {
    const mapped = mapStudyHouseOracleError(error);

    if (mapped) {
      throw mapped;
    }

    throw error;
  }
}

async function deleteStudyHouse({ id, name } = {}) {
  let normalizedId = null;

  if (id !== undefined && id !== null && id !== '') {
    normalizedId = normalizeStudyHouseId(id);
  }

  const normalizedName = normalizeStudyHouseName(name, { required: !normalizedId });

  if (!normalizedId && !normalizedName) {
    throw new StudyHouseError(
      'Debes indicar el identificador o el nombre de la casa de estudios a eliminar.',
      400,
      'STUDY_HOUSE_DELETE_INPUT_REQUIRED'
    );
  }

  try {
    await executeQuery(
      `BEGIN
         casa_estudios_pkg.sp_casa_eliminar(
           p_id            => :houseId,
           p_casa_estudios => :houseName
         );
       END;`,
      {
        houseId: normalizedId,
        houseName: normalizedName
      },
      { autoCommit: true }
    );
  } catch (error) {
    const mapped = mapStudyHouseOracleError(error);

    if (mapped) {
      throw mapped;
    }

    throw error;
  }
}

module.exports = {
  StudyHouseError,
  listStudyHouses,
  createStudyHouse,
  deleteStudyHouse
};
