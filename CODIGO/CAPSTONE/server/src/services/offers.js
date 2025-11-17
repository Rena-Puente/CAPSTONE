const { executeQuery, withConnection, fetchCursorRows, oracledb } = require('../db/oracle');
const { toIsoString, toNullableTrimmedString } = require('../utils/format');
const { parseOfferQuestionsFromJson, parseOfferAnswersFromJson } = require('../utils/questions');

const normalizedRowCache = new WeakMap();

function normalizeKey(key) {
  if (!key) {
    return '';
  }

  return String(key)
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase();
}

function getNormalizedRow(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  let cached = normalizedRowCache.get(row);

  if (cached) {
    return cached;
  }

  const normalized = new Map();

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeKey(key);

    if (!normalizedKey || normalized.has(normalizedKey)) {
      continue;
    }

    normalized.set(normalizedKey, value);
  }

  normalizedRowCache.set(row, normalized);

  return normalized;
}

function getRowValue(row, ...keys) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  for (const key of keys) {
    if (!key || typeof key !== 'string') {
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];

      if (value !== undefined) {
        return value;
      }
    }
  }

  const normalized = getNormalizedRow(row);

  if (!normalized) {
    return null;
  }

  for (const key of keys) {
    if (!key || typeof key !== 'string') {
      continue;
    }

    const normalizedKey = normalizeKey(key);

    if (normalizedKey && normalized.has(normalizedKey)) {
      return normalized.get(normalizedKey);
    }
  }

  return null;
}

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
  if (!row || typeof row !== 'object') {
    return null;
  }

  const normalized = getNormalizedRow(row);

  for (const key of keys) {
    if (!key || typeof key !== 'string') {
      continue;
    }

    let value = row[key];

    if (value === undefined && normalized) {
      value = normalized.get(normalizeKey(key));
    }

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

  const id = getPositiveInteger(
    row,
    'ID_OFERTA',
    'id_oferta',
    'IDOFERTA',
    'OFERTA_ID',
    'idOferta',
    'ID'
  );

  if (!id) {
    return null;
  }

  const companyId = getPositiveInteger(
    row,
    'ID_EMPRESA',
    'id_empresa',
    'IDEMPRESA',
    'COMPANY_ID',
    'company_id',
    'idEmpresa'
  );

  const title = toNullableTrimmedString(
    getRowValue(row, 'TITULO_OFERTA', 'titulo_oferta', 'TITULO', 'titulo', 'title')
  );
  const description = toNullableTrimmedString(
    getRowValue(row, 'DESCRIPCION', 'descripcion', 'DETALLE', 'detalle', 'description')
  );
  const locationType = toNullableTrimmedString(
    getRowValue(
      row,
      'TIPO_UBICACION',
      'tipo_ubicacion',
      'TIPOUBICACION',
      'locationType',
      'tipoUbicacion'
    )
  );
  const city = toNullableTrimmedString(
    getRowValue(row, 'CIUDAD', 'ciudad', 'CIUDAD_OFERTA', 'ciudad_oferta', 'city')
  );
  const country = toNullableTrimmedString(
    getRowValue(row, 'PAIS', 'pais', 'PAIS_OFERTA', 'pais_oferta', 'country')
  );
  const seniority = toNullableTrimmedString(
    getRowValue(row, 'SENIORITY', 'seniority', 'NIVEL', 'nivel', 'seniorityLevel')
  );
  const contractType = toNullableTrimmedString(
    getRowValue(
      row,
      'TIPO_CONTRATO',
      'tipo_contrato',
      'TIPOCONTRATO',
      'contractType',
      'tipoContrato'
    )
  );
  const createdAt = toIsoString(
    getRowValue(row, 'FECHA_CREACION', 'fecha_creacion', 'CREATED_AT', 'created_at', 'createdAt')
  );

  const companyName =
    toNullableTrimmedString(
      getRowValue(
        row,
        'NOMBRE_EMPRESA',
        'nombre_empresa',
        'NOMBRE',
        'nombre',
        'EMPRESA_NOMBRE',
        'empresaNombre'
      )
    ) || 'Empresa sin nombre';
  const companyCity = toNullableTrimmedString(
    getRowValue(
      row,
      'CIUDAD_EMPRESA',
      'ciudad_empresa',
      'EMPRESA_CIUDAD',
      'empresa_ciudad',
      'companyCity'
    )
  );
  const companyCountry = toNullableTrimmedString(
    getRowValue(
      row,
      'PAIS_EMPRESA',
      'pais_empresa',
      'EMPRESA_PAIS',
      'empresa_pais',
      'companyCountry'
    )
  );
  const companyWebsite = toNullableTrimmedString(
    getRowValue(
      row,
      'SITIO_WEB_EMPRESA',
      'sitio_web_empresa',
      'SITIO_WEB',
      'sitio_web',
      'WEBSITE',
      'website'
    )
  );
  const companyLogo = toNullableTrimmedString(
    getRowValue(
      row,
      'LOGO_URL_EMPRESA',
      'logo_url_empresa',
      'LOGO_EMPRESA',
      'logo_empresa',
      'LOGO_URL',
      'logo_url',
      'companyLogoUrl'
    )
  );
  const companyAvatar = toNullableTrimmedString(
    getRowValue(
      row,
      'URL_AVATAR_EMPRESA',
      'url_avatar_empresa',
      'URL_AVATAR',
      'url_avatar',
      'AVATAR_URL',
      'avatar_url',
      'companyAvatarUrl'
    )
  );
  const questions = parseOfferQuestionsFromJson(
    getRowValue(
      row,
      'PREGUNTAS_JSON',
      'preguntas_json',
      'PREGUNTAS',
      'preguntas',
      'QUESTIONS_JSON',
      'questionsJson'
    )
  );

  return {
    id,
    companyId: companyId ?? null,
    title,
    description,
    locationType,
    city,
    country,
    seniority,
    contractType,
    createdAt,
    company: {
      id: Number.isInteger(companyId) && companyId > 0 ? companyId : null,
      name: companyName,
      city: companyCity,
      country: companyCountry,
      website: companyWebsite,
      logoUrl: companyLogo,
      avatarUrl: companyAvatar
    },
    questions
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
    const totalRows = Array.isArray(rows) ? rows.length : 0;
    const offers = [];
    let discardedRows = 0;

    if (Array.isArray(rows)) {
      for (const row of rows) {
        const offer = mapOfferRow(row);

        if (offer && offer.id) {
          offers.push(offer);
        } else {
          discardedRows += 1;
        }
      }
    }

    const companyIds = new Set();

    for (const offer of offers) {
      const companyIdentifier = Number.isInteger(offer.company?.id) && offer.company.id > 0
        ? offer.company.id
        : Number.isInteger(offer.companyId) && offer.companyId > 0
          ? offer.companyId
          : null;

      if (companyIdentifier) {
        companyIds.add(companyIdentifier);
      }
    }

    console.info('[Offers] Listed public offers', {
      totalRows,
      offers: offers.length,
      discardedRows,
      companies: companyIds.size
    });

    return offers;
  });
}

async function applyToOffer(offerId, userId, coverLetter, answersJson = '[]') {
  if (!Number.isInteger(offerId) || offerId <= 0) {
    throw new OfferApplicationError('El identificador de la oferta no es válido.', 400, 'INVALID_OFFER_ID');
  }

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new OfferApplicationError('Debes iniciar sesión para postular a una oferta.', 401, 'INVALID_USER');
  }

  const normalizedCoverLetter = typeof coverLetter === 'string' ? coverLetter : null;
  const normalizedAnswersJson =
    typeof answersJson === 'string' && answersJson.trim() ? answersJson.trim() : '[]';

  try {
    const result = await executeQuery(
      `BEGIN sp_empresas_pkg.sp_postular_oferta(
         p_id_oferta => :offerId,
         p_id_usuario => :userId,
         p_carta_presentacion => :coverLetter,
         p_respuestas_json => :answersJson,
         o_id_postulacion => :applicationId
       ); END;`,
      {
        offerId,
        userId,
        coverLetter: normalizedCoverLetter,
        answersJson: normalizedAnswersJson,
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
      submittedAt: new Date().toISOString(),
      answers: parseOfferAnswersFromJson(normalizedAnswersJson)
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
