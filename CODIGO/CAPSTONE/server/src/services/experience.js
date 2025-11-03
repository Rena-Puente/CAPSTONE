const { executeQuery, withConnection, fetchCursorRows, oracledb } = require('../db/oracle');
const { parseEducationDate } = require('../utils/dates');
const { toIsoString, toNullableTrimmedString } = require('../utils/format');

function normalizeExperiencePayload(payload = {}) {
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';

  if (!title) {
    throw new Error('El título es obligatorio.');
  }

  const company = typeof payload.company === 'string' ? payload.company.trim() : '';
  const location = typeof payload.location === 'string' ? payload.location.trim() : '';
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';

  const startDate = parseEducationDate(payload.startDate, 'inicio');
  const endDate = parseEducationDate(payload.endDate, 'fin');

  if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
    throw new Error('La fecha de fin no puede ser anterior a la fecha de inicio.');
  }

  return {
    title,
    company: company || null,
    location: location || null,
    startDate,
    endDate,
    description: description || null
  };
}

function mapExperienceRow(row) {
  if (!row) {
    return null;
  }

  const idValue = Number(row.ID_EXPERIENCIA ?? row.id_experiencia ?? null);
  const id = Number.isNaN(idValue) ? null : idValue;

  return {
    id,
    title: toNullableTrimmedString(row.TITULO ?? row.titulo),
    company: toNullableTrimmedString(row.EMPRESA ?? row.empresa),
    startDate: toIsoString(row.FECHA_INICIO ?? row.fecha_inicio),
    endDate: toIsoString(row.FECHA_FIN ?? row.fecha_fin),
    location: toNullableTrimmedString(row.UBICACION ?? row.ubicacion),
    description: toNullableTrimmedString(row.DESCRIPCION ?? row.descripcion)
  };
}

async function listExperience(userId) {
  return withConnection(async (connection) => {
    const result = await connection.execute(
      'BEGIN sp_experiencia_pkg.sp_listar_experiencia(:userId, :items); END;',
      {
        userId,
        items: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
      }
    );

    const cursor = result.outBinds?.items || null;
    const rows = await fetchCursorRows(cursor);

    const mappedEntries = rows
      .map((row) => mapExperienceRow(row))
      .filter((entry) => entry && typeof entry.id === 'number');

    return mappedEntries;
  });
}

async function getExperienceEntry(userId, experienceId) {
  const result = await executeQuery(
    `BEGIN sp_experiencia_pkg.sp_obtener_experiencia(
         p_id_experiencia => :experienceId,
         p_id_usuario     => :userId,
         o_titulo         => :title,
         o_empresa        => :company,
         o_fecha_inicio   => :startDate,
         o_fecha_fin      => :endDate,
         o_ubicacion      => :location,
         o_descripcion    => :description,
         o_existe         => :exists
       ); END;`,
    {
      experienceId,
      userId,
      title: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 256 },
      company: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 256 },
      startDate: { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_TIMESTAMP },
      endDate: { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_TIMESTAMP },
      location: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 256 },
      description: { dir: oracledb.BIND_OUT, type: oracledb.CLOB },
      exists: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    }
  );

  const outBinds = result.outBinds || {};
  const exists = Number(outBinds.exists ?? 0) === 1;

  if (!exists) {
    return null;
  }

  const entry = mapExperienceRow({
    ID_EXPERIENCIA: experienceId,
    TITULO: outBinds.title,
    EMPRESA: outBinds.company,
    FECHA_INICIO: outBinds.startDate,
    FECHA_FIN: outBinds.endDate,
    UBICACION: outBinds.location,
    DESCRIPCION: outBinds.description
  });

  return entry;
}

async function getExperienceStatus(userId) {
  const result = await executeQuery(
    `BEGIN sp_experiencia_pkg.sp_experiencia_chk(
       p_id_usuario         => :userId,
       o_tiene_experiencia  => :hasExperience,
       o_total_registros    => :totalRecords,
       o_con_fechas_validas => :validDates,
       o_actuales           => :currentCount
     ); END;`,
    {
      userId,
      hasExperience: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      totalRecords: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      validDates: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      currentCount: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    }
  );

  const outBinds = result.outBinds || {};
  const totalRecords = Number(outBinds.totalRecords ?? 0);
  const validDates = Number(outBinds.validDates ?? 0);
  const invalidDateCount = Math.max(totalRecords - validDates, 0);

  return {
    hasExperience: Number(outBinds.hasExperience ?? 0) === 1,
    totalRecords,
    validDateCount: validDates,
    invalidDateCount,
    currentCount: Number(outBinds.currentCount ?? 0)
  };
}

module.exports = {
  normalizeExperiencePayload,
  listExperience,
  getExperienceEntry,
  getExperienceStatus
};
