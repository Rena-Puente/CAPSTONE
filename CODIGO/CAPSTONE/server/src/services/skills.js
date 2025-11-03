const { executeQuery, withConnection, fetchCursorRows, normalizeCursorRow, oracledb } = require('../db/oracle');
const { toNullableTrimmedString } = require('../utils/format');

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

module.exports = {
  normalizeSkillPayload,
  listSkills,
  listSkillCatalog,
  getSkillEntry,
  getSkillStatus
};
