const { withConnection, fetchCursorRows, oracledb } = require('../db/oracle');
const { toIsoString, toNullableTrimmedString } = require('../utils/format');

function toBooleanFlag(value) {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'bigint') {
    return value === 1n;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'y' || normalized === 's';
  }

  if (value instanceof Date) {
    return true;
  }

  return Boolean(value);
}

function mapUserApplicationRow(row) {
  if (!row) {
    return null;
  }

  const idValue = Number(row.ID_POSTULACION ?? row.id_postulacion ?? null);
  const offerIdValue = Number(row.ID_OFERTA ?? row.id_oferta ?? null);
  const companyIdValue = Number(row.ID_EMPRESA ?? row.id_empresa ?? null);

  const id = Number.isNaN(idValue) ? null : idValue;

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  const offerId = Number.isNaN(offerIdValue) ? null : offerIdValue;
  const companyId = Number.isNaN(companyIdValue) ? null : companyIdValue;

  return {
    id,
    offerId,
    companyId,
    offerTitle: toNullableTrimmedString(row.TITULO_OFERTA ?? row.titulo_oferta ?? row.TITULO ?? row.titulo),
    companyName: toNullableTrimmedString(row.NOMBRE_EMPRESA ?? row.nombre_empresa ?? row.NOMBRE ?? row.nombre),
    status: toNullableTrimmedString(row.ESTADO ?? row.estado),
    coverLetter: toNullableTrimmedString(row.CARTA_PRESENTACION ?? row.carta_presentacion),
    submittedAt: toIsoString(
      row.FECHA_POSTULACION ?? row.fecha_postulacion ?? row.FECHA_CREACION ?? row.fecha_creacion
    ),
    updatedAt: toIsoString(row.FECHA_ACTUALIZACION ?? row.fecha_actualizacion),
    city: toNullableTrimmedString(row.CIUDAD ?? row.ciudad),
    country: toNullableTrimmedString(row.PAIS ?? row.pais),
    locationType: toNullableTrimmedString(row.TIPO_UBICACION ?? row.tipo_ubicacion),
    seniority: toNullableTrimmedString(row.SENIORITY ?? row.seniority),
    contractType: toNullableTrimmedString(row.TIPO_CONTRATO ?? row.tipo_contrato),
    offerActive: toBooleanFlag(row.OFERTA_ACTIVA ?? row.oferta_activa ?? row.ACTIVA ?? row.activa),
    offerPublishedAt: toIsoString(row.FECHA_OFERTA ?? row.fecha_oferta)
  };
}

async function listUserApplications(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    return [];
  }

  return withConnection(async (connection) => {
    const result = await connection.execute(
      'BEGIN sp_listar_postulaciones_usuario(:userId, :items); END;',
      {
        userId,
        items: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
      }
    );

    const cursor = result.outBinds?.items || null;
    const rows = await fetchCursorRows(cursor);

    return rows
      .map((row) => mapUserApplicationRow(row))
      .filter((entry) => entry !== null);
  });
}

module.exports = {
  listUserApplications,
  mapUserApplicationRow
};
