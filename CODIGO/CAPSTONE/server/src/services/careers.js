const { executeQuery, oracledb } = require('../db/oracle');
const defaultCareerCatalogDataset = require('../data/default-career-catalog.json');

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

function normalizeDefaultCareerSeedDataset(rawDataset) {
  if (!rawDataset) {
    return [];
  }

  const sourceArray = Array.isArray(rawDataset)
    ? rawDataset
    : Array.isArray(rawDataset.categories)
    ? rawDataset.categories
    : [];

  const categories = [];

  for (const entry of sourceArray) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const rawCategory =
      typeof entry.category === 'string'
        ? entry.category
        : typeof entry.categoria === 'string'
        ? entry.categoria
        : typeof entry.CATEGORY === 'string'
        ? entry.CATEGORY
        : typeof entry.CATEGORIA === 'string'
        ? entry.CATEGORIA
        : null;
    const category = sanitizeString(rawCategory);

    if (!category) {
      continue;
    }

    const rawItems = entry.items ?? entry.careers ?? entry.CARRERAS ?? null;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      continue;
    }

    const uniqueCareers = new Map();

    for (const rawItem of rawItems) {
      let name = '';

      if (typeof rawItem === 'string') {
        name = sanitizeString(rawItem);
      } else if (rawItem && typeof rawItem === 'object') {
        const candidate =
          typeof rawItem.career === 'string'
            ? rawItem.career
            : typeof rawItem.carrera === 'string'
            ? rawItem.carrera
            : typeof rawItem.name === 'string'
            ? rawItem.name
            : typeof rawItem.CAREER === 'string'
            ? rawItem.CAREER
            : typeof rawItem.CARRERA === 'string'
            ? rawItem.CARRERA
            : typeof rawItem.NAME === 'string'
            ? rawItem.NAME
            : null;
        name = sanitizeString(candidate);
      }

      if (!name) {
        continue;
      }

      const key = name.toLocaleLowerCase('es');
      if (!uniqueCareers.has(key)) {
        uniqueCareers.set(key, name);
      }
    }

    if (uniqueCareers.size === 0) {
      continue;
    }

    categories.push({
      category,
      careers: Array.from(uniqueCareers.values())
    });
  }

  return categories;
}

const defaultCareerCatalogSeed = normalizeDefaultCareerSeedDataset(defaultCareerCatalogDataset);
let defaultCareerCatalogSeedPromise = null;
let defaultCareerCatalogSeedCompleted = false;
let defaultCareerCatalogSeedInserted = false;
let defaultCareerCatalogSeedEnsured = false;

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
  let items = [];

  if (Array.isArray(rawItems)) {
    items = rawItems;
  } else if (typeof rawItems === 'string') {
    const trimmed = rawItems.trim();

    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);

        if (Array.isArray(parsed)) {
          items = parsed;
        }
      } catch (error) {
        console.error('[CareersService] Failed to parse career items JSON string', {
          error: error?.message || error
        });
      }
    }
  }
  const unique = new Map();

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const rawName =
      typeof item.carrera === 'string'
        ? item.carrera
        : typeof item.career === 'string'
        ? item.career
        : typeof item.name === 'string'
        ? item.name
        : typeof item.CARRERA === 'string'
        ? item.CARRERA
        : typeof item.CAREER === 'string'
        ? item.CAREER
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
        : typeof entry.CATEGORY === 'string'
        ? entry.CATEGORY
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

function summarizeCategoriesForLog(categories) {
  return categories.map((entry) => ({
    category: entry.category,
    items: entry.items.map((item) => ({
      id: item.id,
      name: item.name
    }))
  }));
}

async function executeCareerCatalogQuery(normalizedCategory) {
  const categoryBind = {
    dir: oracledb.BIND_IN,
    type: oracledb.STRING,
    val: normalizedCategory
  };

  console.info('[CareersService] listCareerCatalog -> executing query', {
    normalizedCategory
  });

  const result = await executeQuery(
    `SELECT carreras_pkg.fn_carreras_por_categoria_json(:category) AS json_data FROM dual`,
    { category: categoryBind }
  );

  console.info('[CareersService] listCareerCatalog -> raw query result', {
    metaData: result?.metaData,
    rows: result?.rows
  });

  const row = result.rows?.[0] ?? {};
  const jsonData =
    row.JSON_DATA ??
    row.json_data ??
    row.FN_CARRERAS_POR_CATEGORIA_JSON ??
    row.fn_carreras_por_categoria_json ??
    null;

  console.info('[CareersService] listCareerCatalog -> jsonData received', {
    type: typeof jsonData,
    preview:
      typeof jsonData === 'string' && jsonData.length > 200
        ? `${jsonData.slice(0, 200)}...`
        : jsonData
  });

  const categories = parseCareerCatalogJson(jsonData);

  console.info('[CareersService] listCareerCatalog -> parsed categories', {
    categoryCount: categories.length,
    categories: summarizeCategoriesForLog(categories)
  });

  return categories;
}

async function fetchCareerCatalogFromTable(normalizedCategory) {
  const binds = {};
  let sql = `
    SELECT id_carrera, categoria, carrera
      FROM carreras
     WHERE categoria IS NOT NULL
       AND carrera IS NOT NULL
       AND TRIM(categoria) <> ''
       AND TRIM(carrera) <> ''
  `;

  if (normalizedCategory) {
    sql += `
       AND UPPER(TRIM(categoria)) = UPPER(:category)
    `;
    binds.category = {
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      val: normalizedCategory
    };
  }

  sql += `
     ORDER BY LOWER(categoria), LOWER(carrera)
  `;

  console.info('[CareersService] listCareerCatalog -> executing fallback SELECT', {
    normalizedCategory,
    sql
  });

  let result;
  try {
    result = await executeQuery(sql, binds);
  } catch (error) {
    console.error('[CareersService] listCareerCatalog -> fallback SELECT failed', {
      error: error?.message || error
    });
    return [];
  }

  const categoriesMap = new Map();

  for (const row of result.rows ?? []) {
    if (!row || typeof row !== 'object') {
      continue;
    }

    const rawCategory =
      row.categoria ??
      row.CATEGORIA ??
      row.category ??
      row.CATEGORY ??
      null;
    const category = sanitizeString(rawCategory);

    if (!category) {
      continue;
    }

    const rawCareer =
      row.carrera ??
      row.CARRERA ??
      row.career ??
      row.CAREER ??
      row.name ??
      row.NAME ??
      null;
    const careerName = sanitizeString(rawCareer);

    if (!careerName) {
      continue;
    }

    const rawId =
      row.id_carrera ??
      row.ID_CARRERA ??
      row.id ??
      row.ID ??
      null;
    const parsedId =
      rawId === null || rawId === undefined || rawId === ''
        ? null
        : Number.parseInt(String(rawId), 10);
    const id = Number.isNaN(parsedId) ? null : parsedId;

    const key = category.toLocaleLowerCase('es');
    const existing = categoriesMap.get(key) ?? {
      category,
      items: new Map()
    };

    if (!categoriesMap.has(key)) {
      categoriesMap.set(key, existing);
    }

    const careerKey = careerName.toLocaleLowerCase('es');

    if (!existing.items.has(careerKey)) {
      existing.items.set(careerKey, { id, name: careerName });
    }
  }

  const categories = Array.from(categoriesMap.values())
    .map((entry) => ({
      category: entry.category,
      items: Array.from(entry.items.values()).sort((a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      )
    }))
    .sort((a, b) => a.category.localeCompare(b.category, 'es', { sensitivity: 'base' }));

  if (categories.length > 0) {
    console.info('[CareersService] listCareerCatalog -> fallback SELECT categories', {
      categoryCount: categories.length,
      categories: summarizeCategoriesForLog(categories)
    });
  }

  return categories;
}

function buildCareerCatalogFromSeed(normalizedCategory) {
  if (!Array.isArray(defaultCareerCatalogSeed) || defaultCareerCatalogSeed.length === 0) {
    return [];
  }

  const filteredSeed = normalizedCategory
    ? defaultCareerCatalogSeed.filter(
        (entry) => entry.category.localeCompare(normalizedCategory, 'es', { sensitivity: 'base' }) === 0
      )
    : defaultCareerCatalogSeed;

  const categories = filteredSeed
    .map((entry) => ({
      category: entry.category,
      items: entry.careers
        .map((name) => sanitizeString(name))
        .filter((name) => name.length > 0)
        .map((name) => ({ id: null, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
    }))
    .sort((a, b) => a.category.localeCompare(b.category, 'es', { sensitivity: 'base' }));

  if (categories.length > 0) {
    console.info('[CareersService] listCareerCatalog -> using in-memory seed fallback', {
      categoryCount: categories.length,
      categories: summarizeCategoriesForLog(categories)
    });
  }

  return categories;
}

async function listCareerCatalog(category = null, { allowSeed = true } = {}) {
  const normalizedCategory = normalizeCategory(category, { required: false });

  let categories = await executeCareerCatalogQuery(normalizedCategory);

  if (categories.length === 0 && allowSeed) {
    await ensureDefaultCareerCatalogSeeded({
      force: defaultCareerCatalogSeedInserted
    });

    return listCareerCatalog(category, { allowSeed: false });
  }

  if (categories.length === 0) {
    categories = await fetchCareerCatalogFromTable(normalizedCategory);
  }

  if (categories.length === 0) {
    categories = buildCareerCatalogFromSeed(normalizedCategory);
  }

  console.info('[CareersService] listCareerCatalog -> returning categories', {
    categoryCount: categories.length,
    categories: summarizeCategoriesForLog(categories)
  });

  return categories;
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

async function seedDefaultCareerCatalog() {
  if (defaultCareerCatalogSeed.length === 0) {
    return { inserted: 0, ensured: false };
  }

  let insertedCount = 0;
  let existingCount = 0;

  for (const entry of defaultCareerCatalogSeed) {
    for (const careerName of entry.careers) {
      try {
        await createCareer({ category: entry.category, career: careerName });
        insertedCount += 1;
      } catch (error) {
        if (error instanceof CareerCatalogError && error.code === 'CAREER_ALREADY_EXISTS') {
          existingCount += 1;
          continue;
        }

        console.error('[CareersService] Failed to seed default career entry', {
          category: entry.category,
          career: careerName,
          error: error?.message || error
        });
      }
    }
  }

  const ensured = insertedCount > 0 || existingCount > 0;

  console.info('[CareersService] Default career catalog seed summary', {
    insertedCount,
    existingCount,
    ensured
  });

  return { inserted: insertedCount, ensured };
}

async function ensureDefaultCareerCatalogSeeded({ force = false } = {}) {
  if (force) {
    if (defaultCareerCatalogSeedPromise) {
      try {
        await defaultCareerCatalogSeedPromise;
      } catch (error) {
        console.error('[CareersService] Default career catalog seed promise failed before force reload', {
          error: error?.message || error
        });
      }
    }

    defaultCareerCatalogSeedPromise = null;
    defaultCareerCatalogSeedCompleted = false;
    defaultCareerCatalogSeedInserted = false;
    defaultCareerCatalogSeedEnsured = false;
  }

  if (defaultCareerCatalogSeedCompleted) {
    return defaultCareerCatalogSeedEnsured;
  }

  if (!defaultCareerCatalogSeedPromise) {
    defaultCareerCatalogSeedPromise = seedDefaultCareerCatalog()
      .then(({ inserted, ensured }) => {
        defaultCareerCatalogSeedCompleted = true;
        defaultCareerCatalogSeedInserted = inserted > 0;
        defaultCareerCatalogSeedEnsured = ensured;
        return defaultCareerCatalogSeedEnsured;
      })
      .catch((error) => {
        console.error('[CareersService] Failed to seed default career catalog', {
          error: error?.message || error
        });
        defaultCareerCatalogSeedPromise = null;
        defaultCareerCatalogSeedEnsured = false;
        return false;
      });
  }

  return defaultCareerCatalogSeedPromise;
}

function __resetDefaultCareerCatalogSeedForTests() {
  defaultCareerCatalogSeedPromise = null;
  defaultCareerCatalogSeedCompleted = false;
  defaultCareerCatalogSeedInserted = false;
  defaultCareerCatalogSeedEnsured = false;
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
  deleteCareer,
  __resetDefaultCareerCatalogSeedForTests
};
