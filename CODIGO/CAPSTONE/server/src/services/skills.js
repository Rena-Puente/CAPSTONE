const {
  executeQuery,
  withConnection,
  fetchCursorRows,
  normalizeCursorRow,
  oracledb
} = require('../db/oracle');
const { toNullableTrimmedString } = require('../utils/format');

const MAX_SKILL_CATEGORY_LENGTH = 100;
const MAX_SKILL_NAME_LENGTH = 150;

class SkillCatalogError extends Error {
  constructor(message, statusCode = 400, code = 'SKILL_CATALOG_ERROR') {
    super(message);
    this.name = 'SkillCatalogError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function sanitizeCatalogText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return String(value).trim();
}

function normalizeCatalogCategory(value, { required = false } = {}) {
  const category = sanitizeCatalogText(value);

  if (!category) {
    if (required) {
      throw new SkillCatalogError('La categoría es obligatoria.', 400, 'CATEGORY_REQUIRED');
    }

    return '';
  }

  if (category.length > MAX_SKILL_CATEGORY_LENGTH) {
    throw new SkillCatalogError(
      'La categoría es demasiado larga.',
      400,
      'CATEGORY_TOO_LONG'
    );
  }

  return category;
}

function normalizeCatalogSkillName(value, { required = false } = {}) {
  const name = sanitizeCatalogText(value);

  if (!name) {
    if (required) {
      throw new SkillCatalogError('El nombre de la habilidad es obligatorio.', 400, 'SKILL_REQUIRED');
    }

    return '';
  }

  if (name.length > MAX_SKILL_NAME_LENGTH) {
    throw new SkillCatalogError(
      'El nombre de la habilidad es demasiado largo.',
      400,
      'SKILL_NAME_TOO_LONG'
    );
  }

  return name;
}

function normalizeCatalogSkillId(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new SkillCatalogError('El identificador de la habilidad no es válido.', 400, 'INVALID_SKILL_ID');
  }

  return parsed;
}

async function readOracleClob(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && typeof value.getData === 'function') {
    return new Promise((resolve, reject) => {
      value.setEncoding('utf8');

      let data = '';

      value.on('data', (chunk) => {
        data += chunk;
      });

      value.on('end', () => resolve(data));
      value.on('close', () => resolve(data));
      value.on('error', (error) => reject(error));
    });
  }

  return String(value);
}

function extractSkillOracleErrorCode(error) {
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

function mapSkillOracleError(error) {
  const code = extractSkillOracleErrorCode(error);

  switch (code) {
    case 21001:
      return new SkillCatalogError('El nombre de la habilidad es obligatorio.', 400, 'SKILL_REQUIRED');
    case 21002:
      return new SkillCatalogError('La habilidad ya existe.', 409, 'SKILL_ALREADY_EXISTS');
    case 21010:
      return new SkillCatalogError(
        'Debes indicar el identificador o el nombre de la habilidad.',
        400,
        'SKILL_DELETE_INPUT_REQUIRED'
      );
    case 21011:
      return new SkillCatalogError('No se encontró la habilidad solicitada.', 404, 'SKILL_NOT_FOUND');
    default:
      return null;
  }
}

function mapCatalogSkillEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const idValue = raw.id ?? raw.ID ?? raw.id_habilidad ?? raw.ID_HABILIDAD ?? null;
  const parsedId = Number.parseInt(String(idValue), 10);
  const id = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;

  if (!id) {
    return null;
  }

  const name = normalizeCatalogSkillName(raw.nombre ?? raw.name ?? raw.NOMBRE ?? raw.NAME, {
    required: true
  });
  const category = normalizeCatalogCategory(raw.categoria ?? raw.category ?? raw.CATEGORIA ?? raw.CATEGORY, {
    required: false
  });

  const normalizedCategory = category || 'Sin categoría';

  return {
    id,
    name,
    category: normalizedCategory
  };
}

async function listAdminSkillCatalog(category) {
  const normalizedCategory = normalizeCatalogCategory(category, { required: false });

  try {
    const result = await executeQuery(
      `BEGIN
         :items := habilidades_pkg.fn_habilidad_listar_json(
           p_categoria => :category
         );
       END;`,
      {
        category: normalizedCategory || null,
        items: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
      }
    );

    const rawJson = await readOracleClob(result.outBinds?.items ?? null);
    const parsed = rawJson ? JSON.parse(rawJson) : [];
    const entries = Array.isArray(parsed) ? parsed : [];

    return entries
      .map((entry) => {
        try {
          return mapCatalogSkillEntry(entry);
        } catch (error) {
          console.warn('[SkillsService] Ignoring invalid skill catalog entry', {
            error: error?.message || error,
            entry
          });
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('[SkillsService] Failed to parse skill catalog JSON', {
        error: error?.message || error
      });
      throw new SkillCatalogError('No se pudo interpretar el catálogo de habilidades.', 500, 'SKILL_CATALOG_PARSE_ERROR');
    }

    const mapped = mapSkillOracleError(error);

    if (mapped) {
      throw mapped;
    }

    throw error;
  }
}

async function createSkillCatalogEntry({ category, name }) {
  const normalizedCategory = normalizeCatalogCategory(category, { required: true });
  const normalizedName = normalizeCatalogSkillName(name, { required: true });

  try {
    const result = await executeQuery(
      `BEGIN
         habilidades_pkg.sp_habilidad_crear(
           p_nombre    => :name,
           p_categoria => :category,
           o_id        => :skillId
         );
       END;`,
      {
        name: normalizedName,
        category: normalizedCategory,
        skillId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: true }
    );

    const newId = Number(result.outBinds?.skillId ?? 0);

    if (!Number.isInteger(newId) || newId <= 0) {
      throw new SkillCatalogError(
        'No se pudo determinar el identificador de la habilidad creada.',
        500,
        'SKILL_ID_MISSING'
      );
    }

    return {
      id: newId,
      name: normalizedName,
      category: normalizedCategory || 'Sin categoría'
    };
  } catch (error) {
    const mapped = mapSkillOracleError(error);

    if (mapped) {
      throw mapped;
    }

    throw error;
  }
}

async function deleteSkillCatalogEntry({ id, name } = {}) {
  let normalizedId = null;

  if (id !== null && id !== undefined && id !== '') {
    normalizedId = normalizeCatalogSkillId(id);
  }

  const normalizedName = normalizeCatalogSkillName(name, { required: !normalizedId });

  if (!normalizedId && !normalizedName) {
    throw new SkillCatalogError(
      'Debes indicar el identificador o el nombre de la habilidad.',
      400,
      'SKILL_DELETE_INPUT_REQUIRED'
    );
  }

  try {
    await executeQuery(
      `BEGIN
         habilidades_pkg.sp_habilidad_eliminar(
           p_id     => :skillId,
           p_nombre => :skillName
         );
       END;`,
      {
        skillId: normalizedId,
        skillName: normalizedName || null
      },
      { autoCommit: true }
    );
  } catch (error) {
    const mapped = mapSkillOracleError(error);

    if (mapped) {
      throw mapped;
    }

    throw error;
  }
}

function normalizeSkillPayload(payload = {}, options = {}) {
  const { requireId = false, allowName = true, overrideSkillId = null } = options;

  const rawSkillId = overrideSkillId ?? payload.skillId ?? payload.id ?? null;
  const numericSkillId = Number(rawSkillId);
  const skillId = Number.isInteger(numericSkillId) && numericSkillId > 0 ? numericSkillId : null;

  const skillNameRaw = typeof payload.skillName === 'string' ? payload.skillName : payload.name;
  const skillName = typeof skillNameRaw === 'string' ? skillNameRaw.trim() : '';

  if ((requireId || !allowName) && !skillId) {
    throw new Error('El identificador de la habilidad es obligatorio.');
  }

  if (!skillId && !skillName) {
    throw new Error('Debes indicar una habilidad.');
  }

  const levelRaw = payload.level ?? payload.nivel;
  const level =
    levelRaw === undefined || levelRaw === null || levelRaw === ''
      ? null
      : Number(levelRaw);

  if (level !== null && (!Number.isFinite(level) || level < 1 || level > 5)) {
    throw new Error('El nivel debe estar entre 1 y 5.');
  }

  const yearsRaw = payload.yearsExperience ?? payload.aniosExperiencia ?? payload.anios_experiencia;
  const years = yearsRaw === undefined || yearsRaw === null || yearsRaw === '' ? null : Number(yearsRaw);

  if (years !== null && (!Number.isFinite(years) || years < 0)) {
    throw new Error('Los años de experiencia deben ser un número mayor o igual a 0.');
  }

  const endorsementsRaw =
    payload.endorsementCount ?? payload.cantidadRespaldo ?? payload.cantidad_respaldo;
  const endorsements =
    endorsementsRaw === undefined || endorsementsRaw === null || endorsementsRaw === ''
      ? null
      : Number(endorsementsRaw);

  if (endorsements !== null && (!Number.isFinite(endorsements) || endorsements < 0)) {
    throw new Error('La cantidad de respaldos debe ser un número mayor o igual a 0.');
  }

  return {
    skillId,
    skillName: allowName ? skillName : '',
    level: level === null ? null : Number(level.toFixed(2)),
    yearsExperience: years === null ? null : Number(years.toFixed(2)),
    endorsementCount:
      endorsements === null ? null : Math.max(Math.floor(Number(endorsements.toFixed(0))), 0)
  };
}

function mapSkillRow(row) {
  if (!row) {
    return null;
  }

  const idValue = Number(row.ID_HABILIDAD ?? row.id_habilidad ?? row.SKILL_ID ?? row.id ?? null);
  const skillId = Number.isNaN(idValue) || idValue <= 0 ? null : idValue;

  if (!skillId) {
    return null;
  }

  const levelValue = Number(row.NIVEL ?? row.nivel ?? row.LEVEL);
  const normalizedLevel = Number.isFinite(levelValue) ? levelValue : null;

  const yearsValue = Number(
    row.ANIOS_EXPERIENCIA ?? row.anios_experiencia ?? row.YEARS_EXPERIENCE ?? row.yearsExperience
  );
  const normalizedYears = Number.isFinite(yearsValue) ? yearsValue : null;

  const endorsementsValue = Number(
    row.CANTIDAD_RESPALDO ?? row.cantidad_respaldo ?? row.ENDORSEMENT_COUNT ?? row.endorsementCount
  );
  const endorsementCount = Number.isFinite(endorsementsValue) ? Math.max(endorsementsValue, 0) : 0;

  return {
    id: skillId,
    skillId,
    name: toNullableTrimmedString(row.NOMBRE ?? row.nombre ?? row.SKILL_NAME),
    category: toNullableTrimmedString(row.CATEGORIA ?? row.categoria ?? row.CATEGORY),
    level: normalizedLevel,
    yearsExperience: normalizedYears,
    endorsementCount
  };
}

async function listSkills(userId) {
  return withConnection(async (connection) => {
    const result = await connection.execute(
      'BEGIN sp_usuario_habilidades_pkg.sp_listar_habilidades_usuario(:userId, :items); END;',
      {
        userId,
        items: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
      }
    );

    const cursor = result.outBinds?.items || null;
    const rows = await fetchCursorRows(cursor);

    const mappedEntries = rows
      .map((row) => mapSkillRow(row))
      .filter((entry) => entry && typeof entry.skillId === 'number');

    return mappedEntries;
  });
}

async function listSkillCatalog(category) {
  return withConnection(async (connection) => {
    const normalizedCategory = typeof category === 'string' ? category.trim() : '';
    const hasCategoryFilter = normalizedCategory.length > 0;

    const binds = {};
    let sql =
      'SELECT\n' +
      '  id_habilidad AS "ID_HABILIDAD",\n' +
      '  nombre AS "NOMBRE",\n' +
      '  categoria AS "CATEGORIA"\n' +
      'FROM habilidades';

    if (hasCategoryFilter) {
      sql += '\nWHERE UPPER(categoria) = UPPER(:category)';
      binds.category = normalizedCategory;
    }

    sql += '\nORDER BY categoria ASC, nombre ASC';

    const result = await connection.execute(sql, binds);
    const rows = result.rows || [];
    const normalizedRows = await Promise.all(rows.map((row) => normalizeCursorRow(row)));

    const mappedEntries = normalizedRows
      .map((row) => mapSkillRow(row))
      .filter((entry) => entry && typeof entry.skillId === 'number')
      .map((entry) => ({
        skillId: entry.skillId,
        name: entry.name,
        category: entry.category
      }));

    return mappedEntries;
  });
}

async function getSkillEntry(userId, skillId) {
  const result = await executeQuery(
    `BEGIN sp_usuario_habilidades_pkg.sp_obtener_habilidad_usuario(
         p_id_usuario        => :userId,
         p_id_habilidad      => :skillId,
         o_nivel             => :level,
         o_anios_experiencia => :yearsExperience,
         o_cantidad_respaldo => :endorsementCount,
         o_existe            => :exists
       ); END;`,
    {
      userId,
      skillId,
      level: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      yearsExperience: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      endorsementCount: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      exists: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    }
  );

  const outBinds = result.outBinds || {};
  const exists = Number(outBinds.exists ?? 0) === 1;

  if (!exists) {
    return null;
  }

  const details = await executeQuery(
    `SELECT h.nombre, h.categoria
       FROM habilidades h
      WHERE h.id_habilidad = :skillId`,
    { skillId }
  );

  const row = details.rows?.[0] ?? {};

  const entry = mapSkillRow({
    ID_HABILIDAD: skillId,
    NOMBRE: row.NOMBRE ?? row.nombre,
    CATEGORIA: row.CATEGORIA ?? row.categoria,
    NIVEL: outBinds.level,
    ANIOS_EXPERIENCIA: outBinds.yearsExperience,
    CANTIDAD_RESPALDO: outBinds.endorsementCount
  });

  return entry;
}

async function getSkillStatus(userId) {
  const result = await executeQuery(
    `BEGIN sp_usuario_habilidades_pkg.sp_usuario_habilidades_chk(
         p_id_usuario        => :userId,
         o_total_habilidades => :totalSkills,
         o_promedio_nivel    => :averageLevel,
         o_max_nivel         => :maxLevel,
         o_min_nivel         => :minLevel
       ); END;`,
    {
      userId,
      totalSkills: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      averageLevel: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      maxLevel: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      minLevel: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    }
  );

  const outBinds = result.outBinds || {};

  const averageRaw = Number(outBinds.averageLevel ?? outBinds.AVERAGELEVEL);
  const maxRaw = Number(outBinds.maxLevel ?? outBinds.MAXLEVEL);
  const minRaw = Number(outBinds.minLevel ?? outBinds.MINLEVEL);

  return {
    totalSkills: Math.max(Number(outBinds.totalSkills ?? outBinds.TOTALSKILLS ?? 0), 0),
    averageLevel: Number.isFinite(averageRaw) ? averageRaw : null,
    maxLevel: Number.isFinite(maxRaw) ? maxRaw : null,
    minLevel: Number.isFinite(minRaw) ? minRaw : null
  };
}

exports.SkillCatalogError = SkillCatalogError;
exports.normalizeSkillPayload = normalizeSkillPayload;
exports.listSkills = listSkills;
exports.listSkillCatalog = listSkillCatalog;
exports.getSkillEntry = getSkillEntry;
exports.getSkillStatus = getSkillStatus;
exports.listAdminSkillCatalog = listAdminSkillCatalog;
exports.createSkillCatalogEntry = createSkillCatalogEntry;
exports.deleteSkillCatalogEntry = deleteSkillCatalogEntry;
