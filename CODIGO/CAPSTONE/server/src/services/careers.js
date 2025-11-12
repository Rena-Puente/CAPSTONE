const { executeQuery, oracledb } = require('../db/oracle');

const MAX_CATEGORY_LENGTH = 100;
const MAX_CAREER_LENGTH = 150;

class CareerCatalogError extends Error {
  constructor(message, statusCode = 400, code = 'CAREER_CATALOG_ERROR') {
    super(message);
    this.name = 'CareerCatalogError';
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

function normalizeCategory(value, { required = true } = {}) {
  const category = sanitizeString(value);

  if (!category) {
    if (required) {
      throw new CareerCatalogError('La categoría es obligatoria.', 400, 'CATEGORY_REQUIRED');
    }

    return null;
  }

  if (category.length > MAX_CATEGORY_LENGTH) {
    throw new CareerCatalogError('La categoría es demasiado larga.', 400, 'CATEGORY_TOO_LONG');
  }

  return category;
}

function normalizeCareerName(value, { required = true } = {}) {
  const name = sanitizeString(value);

  if (!name) {
    if (required) {
      throw new CareerCatalogError('La carrera es obligatoria.', 400, 'CAREER_NAME_REQUIRED');
    }

    return null;
  }

  if (name.length > MAX_CAREER_LENGTH) {
    throw new CareerCatalogError('El nombre de la carrera es demasiado largo.', 400, 'CAREER_NAME_TOO_LONG');
  }

  return name;
}

function normalizeCareerId(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CareerCatalogError('El identificador de la carrera no es válido.', 400, 'INVALID_CAREER_ID');
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

function mapCareerOracleError(error) {
  const code = extractOracleErrorCode(error);

  switch (code) {
    case 20001:
      return new CareerCatalogError('La categoría es obligatoria.', 400, 'CATEGORY_REQUIRED');
    case 20002:
      return new CareerCatalogError('La carrera es obligatoria.', 400, 'CAREER_NAME_REQUIRED');
    case 20003:
      return new CareerCatalogError('Ya existe una carrera con ese nombre en la categoría indicada.', 409, 'CAREER_ALREADY_EXISTS');
    case 20010:
      return new CareerCatalogError('Debes indicar la carrera a eliminar.', 400, 'CAREER_DELETE_INPUT_REQUIRED');
    case 20011:
      return new CareerCatalogError('No se encontró la carrera solicitada.', 404, 'CAREER_NOT_FOUND');
    default:
      return null;
  }
}

function parseCareerItems(rawItems) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  const unique = new Map();

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }

      const rawName =
      typeof item.carrera === 'string'
        ? item.carrera
        : typeof item.name === 'string'
        ? item.name
        : typeof item.CARRERA === 'string'
        ? item.CARRERA
        : typeof item.NAME === 'string'
        ? item.NAME
        : null;
    const name = rawName ? rawName.trim() : '';

    if (!name) {
      continue;
    }

    const rawId = item.id ?? item.ID ?? item.id_carrera ?? item.ID_CARRERA ?? null;
    let id = null;

    if (rawId !== null && rawId !== undefined && rawId !== '') {
      const parsedId = Number.parseInt(String(rawId), 10);
      id = Number.isNaN(parsedId) ? null : parsedId;
    }

    const key = name.toLocaleLowerCase('es');

    if (!unique.has(key)) {
      unique.set(key, { id, name });
    }
  }

  return Array.from(unique.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  );
}

function parseCareerCatalogJson(rawJson) {
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
    console.error('[CareersService] Failed to parse career catalog JSON', {
      error: error?.message || error
    });
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const categories = [];

  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

      const rawCategory =
      typeof entry.categoria === 'string'
        ? entry.categoria
        : typeof entry.category === 'string'
        ? entry.category
        : typeof entry.CATEGORIA === 'string'
        ? entry.CATEGORIA
        : null;
    const category = rawCategory ? String(rawCategory).trim() : '';

    if (!category) {
      continue;
    }

    const rawItems = entry.items ?? entry.carreras ?? entry.CARRERAS ?? null;
    const items = parseCareerItems(rawItems);

    categories.push({
      category,
      items
    });
  }

  categories.sort((a, b) => a.category.localeCompare(b.category, 'es', { sensitivity: 'base' }));

  return categories;
}

async function listCareerCatalog(category = null) {
  const normalizedCategory = normalizeCategory(category, { required: false });
    const categoryBind = {
    dir: oracledb.BIND_IN,
    type: oracledb.STRING,
    val: normalizedCategory
  };

  const result = await executeQuery(
    `SELECT carreras_pkg.fn_carreras_por_categoria_json(:category) AS json_data FROM dual`,
    { category: categoryBind }
  );

  const row = result.rows?.[0] ?? {};
  const jsonData =
    row.JSON_DATA ??
    row.json_data ??
    row.FN_CARRERAS_POR_CATEGORIA_JSON ??
    row.fn_carreras_por_categoria_json ??
    null;

  return parseCareerCatalogJson(jsonData);
}

async function createCareer({ category, career }) {
  const normalizedCategory = normalizeCategory(category, { required: true });
  const normalizedCareer = normalizeCareerName(career, { required: true });

  try {
    const result = await executeQuery(
      `BEGIN
         carreras_pkg.sp_carrera_crear(
           p_categoria  => :category,
           p_carrera    => :career,
           o_id_carrera => :careerId
         );
       END;`,
      {
        category: normalizedCategory,
        career: normalizedCareer,
        careerId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: true }
    );

    const newId = Number(result.outBinds?.careerId ?? 0);

    if (!Number.isInteger(newId) || newId <= 0) {
      throw new CareerCatalogError('No se pudo determinar el identificador de la carrera creada.', 500, 'CAREER_ID_MISSING');
    }

    return {
      id: newId,
      category: normalizedCategory,
      name: normalizedCareer
    };
  } catch (error) {
    const mapped = mapCareerOracleError(error);

    if (mapped) {
      throw mapped;
    }

    throw error;
  }
}

async function deleteCareer({ id, category, career } = {}) {
  let normalizedId = null;

  if (id !== undefined && id !== null && id !== '') {
    normalizedId = normalizeCareerId(id);
  }

  const normalizedCategory = normalizeCategory(category, { required: !normalizedId });
  const normalizedCareer = normalizeCareerName(career, { required: !normalizedId });

  if (!normalizedId && (!normalizedCategory || !normalizedCareer)) {
    throw new CareerCatalogError(
      'Debes indicar el identificador de la carrera o la combinación de categoría y nombre.',
      400,
      'CAREER_DELETE_INPUT_REQUIRED'
    );
  }

  try {
    await executeQuery(
      `BEGIN
         carreras_pkg.sp_carrera_eliminar(
           p_id_carrera => :careerId,
           p_categoria  => :category,
           p_carrera    => :careerName
         );
       END;`,
      {
        careerId: normalizedId,
        category: normalizedCategory,
        careerName: normalizedCareer
      },
      { autoCommit: true }
    );
  } catch (error) {
    const mapped = mapCareerOracleError(error);

    if (mapped) {
      throw mapped;
    }

    throw error;
  }
}

module.exports = {
  CareerCatalogError,
  listCareerCatalog,
  createCareer,
  deleteCareer
};
