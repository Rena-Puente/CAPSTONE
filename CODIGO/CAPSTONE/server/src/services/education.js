const { executeQuery, withConnection, fetchCursorRows, oracledb } = require('../db/oracle');
const { parseEducationDate } = require('../utils/dates');
const { toIsoString, toNullableTrimmedString } = require('../utils/format');

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
  return withConnection(async (connection) => {
    const result = await connection.execute(
      'BEGIN sp_educacion_pkg.sp_listar_educacion(:userId, :items); END;',
      {
        userId,
        items: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
      }
    );

    const cursor = result.outBinds?.items || null;
    const rows = await fetchCursorRows(cursor);

    const mappedEntries = rows
      .map((row) => mapEducationRow(row))
      .filter((entry) => entry && typeof entry.id === 'number');

    return mappedEntries;
  });
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
      institution: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 256 },
      degree: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 256 },
      fieldOfStudy: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 256 },
      startDate: { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_TIMESTAMP },
      endDate: { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_TIMESTAMP },
      description: { dir: oracledb.BIND_OUT, type: oracledb.CLOB },
      exists: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    }
  );

  const outBinds = result.outBinds || {};
  const exists = Number(outBinds.exists ?? 0) === 1;

  if (!exists) {
    return null;
  }

  const entry = mapEducationRow({
    ID_EDUCACION: educationId,
    INSTITUCION: outBinds.institution,
    GRADO: outBinds.degree,
    AREA_ESTUDIO: outBinds.fieldOfStudy,
    FECHA_INICIO: outBinds.startDate,
    FECHA_FIN: outBinds.endDate,
    DESCRIPCION: outBinds.description
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

  return {
    hasEducation: Number(outBinds.hasEducation ?? 0) === 1,
    totalRecords,
    validDateCount: validDates,
    invalidDateCount
  };
}

module.exports = {
  normalizeEducationPayload,
  listEducation,
  getEducationEntry,
  getEducationStatus
};
