const { executeQuery, withConnection, fetchCursorRows, oracledb } = require('../db/oracle');
const { toIsoString, toNullableTrimmedString } = require('../utils/format');

function parsePositiveInteger(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }

    const integer = Math.trunc(value);
    return integer > 0 ? integer : null;
  }

  if (typeof value === 'bigint') {
    return value > 0n ? Number(value) : null;
  }

  const stringValue = String(value).trim();

  if (!stringValue) {
    return null;
  }

  const parsed = Number.parseInt(stringValue, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function getPositiveInteger(row, ...keys) {
  for (const key of keys) {
    if (!key || typeof key !== 'string') {
      continue;
    }

    const value = row?.[key];
    const parsed = parsePositiveInteger(value);

    if (parsed) {
      return parsed;
    }
  }

  return null;
}

class OfferApplicationError extends Error {
  constructor(message, statusCode = 400, code = 'OFFER_APPLICATION_ERROR') {
    super(message);
    this.name = 'OfferApplicationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function mapOfferRow(row) {
  if (!row) {
    return null;
  }

    const id = getPositiveInteger(row, 'ID_OFERTA', 'id_oferta', 'ID', 'id', 'OFERTA_ID', 'oferta_id');

  if (!id) {
    return null;
  }

  const companyId = getPositiveInteger(row, 'ID_EMPRESA', 'id_empresa', 'COMPANY_ID', 'company_id');

  return {
    id,
    companyId: companyId ?? null,
    title: toNullableTrimmedString(row.TITULO ?? row.titulo),
    description: toNullableTrimmedString(row.DESCRIPCION ?? row.descripcion),
    locationType: toNullableTrimmedString(row.TIPO_UBICACION ?? row.tipo_ubicacion),
    city: toNullableTrimmedString(row.CIUDAD ?? row.ciudad),
    country: toNullableTrimmedString(row.PAIS ?? row.pais),
    seniority: toNullableTrimmedString(row.SENIORITY ?? row.seniority),
    contractType: toNullableTrimmedString(row.TIPO_CONTRATO ?? row.tipo_contrato),
    createdAt: toIsoString(row.FECHA_CREACION ?? row.fecha_creacion ?? null),
    company: {
      id: Number.isInteger(companyId) && companyId > 0 ? companyId : null,
      name:
        toNullableTrimmedString(
          row.NOMBRE_EMPRESA ?? row.nombre_empresa ?? row.NOMBRE ?? row.nombre
        ) || 'Empresa sin nombre',
      city: toNullableTrimmedString(row.CIUDAD_EMPRESA ?? row.ciudad_empresa),
      country: toNullableTrimmedString(row.PAIS_EMPRESA ?? row.pais_empresa),
      website: toNullableTrimmedString(row.SITIO_WEB_EMPRESA ?? row.sitio_web_empresa),
      logoUrl: toNullableTrimmedString(row.LOGO_URL ?? row.logo_url),
      avatarUrl: toNullableTrimmedString(
        row.URL_AVATAR_EMPRESA ?? row.url_avatar_empresa ?? row.URL_AVATAR ?? row.url_avatar
      )
    }
  };
}

async function listPublicOffers() {
  return withConnection(async (connection) => {
    const result = await connection.execute(
      `BEGIN sp_empresas_pkg.sp_listar_ofertas_publicas(o_ofertas => :cursor); END;`,
      {
        cursor: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
      }
    );

    const cursor = result.outBinds?.cursor || null;
    const rows = await fetchCursorRows(cursor);

    return rows.map((row) => mapOfferRow(row)).filter((offer) => offer && offer.id);
  });
}

async function applyToOffer(offerId, userId, coverLetter) {
  if (!Number.isInteger(offerId) || offerId <= 0) {
    throw new OfferApplicationError('El identificador de la oferta no es válido.', 400, 'INVALID_OFFER_ID');
  }

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new OfferApplicationError('Debes iniciar sesión para postular a una oferta.', 401, 'INVALID_USER');
  }

  const normalizedCoverLetter = typeof coverLetter === 'string' ? coverLetter : null;

  try {
    const result = await executeQuery(
      `BEGIN sp_empresas_pkg.sp_postular_oferta(
         p_id_oferta => :offerId,
         p_id_usuario => :userId,
         p_carta_presentacion => :coverLetter,
         o_id_postulacion => :applicationId
       ); END;`,
      {
        offerId,
        userId,
        coverLetter: normalizedCoverLetter,
        applicationId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: true }
    );

    const applicationId = Number(result.outBinds?.applicationId ?? 0);

    if (!Number.isInteger(applicationId) || applicationId <= 0) {
      throw new OfferApplicationError(
        'No se pudo registrar la postulación correctamente.',
        500,
        'APPLICATION_ID_MISSING'
      );
    }

    return {
      id: applicationId,
      offerId,
      userId,
      status: 'enviada',
      coverLetter: normalizedCoverLetter ?? null,
      submittedAt: new Date().toISOString()
    };
  } catch (error) {
    if (typeof error?.errorNum === 'number') {
      switch (error.errorNum) {
        case 20080:
          throw new OfferApplicationError('Debes seleccionar una oferta válida.', 400, 'INVALID_OFFER');
        case 20081:
          throw new OfferApplicationError(
            'Debes iniciar sesión para postular a una oferta.',
            401,
            'INVALID_USER'
          );
        case 20082:
          throw new OfferApplicationError('La oferta seleccionada no existe.', 404, 'OFFER_NOT_FOUND');
        case 20083:
          throw new OfferApplicationError(
            'La oferta seleccionada no está disponible para nuevas postulaciones.',
            400,
            'OFFER_INACTIVE'
          );
        case 20084:
          throw new OfferApplicationError(
            'El usuario indicado no existe o no está activo.',
            401,
            'INVALID_USER'
          );
        case 20085:
          throw new OfferApplicationError('Ya postulaste a esta oferta.', 409, 'ALREADY_APPLIED');
        default:
          break;
      }
    }

    throw error;
  }
}

module.exports = {
  listPublicOffers,
  applyToOffer,
  OfferApplicationError
};
