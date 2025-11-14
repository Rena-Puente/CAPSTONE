const { executeQuery, withConnection, fetchCursorRows, oracledb } = require('../db/oracle');
const { toNullableTrimmedString, toIsoString } = require('../utils/format');

const MAX_NAME_LENGTH = 150;
const MAX_COUNTRY_LENGTH = 80;
const MAX_CITY_LENGTH = 80;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 64;
const MAX_RUT_LENGTH = 12; // after formatting with hyphen
const MAX_SALT_LENGTH = 32;
const MAX_WEBSITE_LENGTH = 2048;
const MAX_PASSWORD_ITERATIONS = 999999;
const MAX_OFFER_TITLE_LENGTH = 150;
const MAX_LOCATION_TYPE_LENGTH = 20;
const MAX_SENIORITY_LENGTH = 30;
const MAX_CONTRACT_TYPE_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 8000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const APPLICATION_STATUS_VALUES = Object.freeze(['enviada', 'en_revision', 'aceptada', 'rechazada']);
const APPLICATION_STATUS_ALIASES = new Map(
  APPLICATION_STATUS_VALUES.map((status) => [status, status])
);

APPLICATION_STATUS_ALIASES.set('enrevision', 'en_revision');
APPLICATION_STATUS_ALIASES.set('en-revision', 'en_revision');
APPLICATION_STATUS_ALIASES.set('en revision', 'en_revision');
APPLICATION_STATUS_ALIASES.set('revision', 'en_revision');
APPLICATION_STATUS_ALIASES.set('revisando', 'en_revision');
APPLICATION_STATUS_ALIASES.set('aceptado', 'aceptada');
APPLICATION_STATUS_ALIASES.set('aprobado', 'aceptada');
APPLICATION_STATUS_ALIASES.set('aprobada', 'aceptada');
APPLICATION_STATUS_ALIASES.set('rechazado', 'rechazada');
APPLICATION_STATUS_ALIASES.set('descartado', 'rechazada');
APPLICATION_STATUS_ALIASES.set('descartada', 'rechazada');

function sanitizeString(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return String(value).trim();
}

function normalizeBooleanInput(value) {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return null;
    }

    if (value === 1) {
      return 1;
    }

    if (value === 0) {
      return 0;
    }

    return null;
  }

  const sanitized = sanitizeString(value);

  if (!sanitized) {
    return null;
  }

  const normalized = sanitized
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'si' ||
    normalized === 'on' ||
    normalized === 'enabled' ||
    normalized === 'activo' ||
    normalized === 'activa'
  ) {
    return 1;
  }

  if (
    normalized === '0' ||
    normalized === 'false' ||
    normalized === 'no' ||
    normalized === 'off' ||
    normalized === 'disabled' ||
    normalized === 'inactivo' ||
    normalized === 'inactiva'
  ) {
    return 0;
  }

  return null;
}

function assertRequired(value, label) {
  if (!value) {
    throw new Error(`${label} es obligatorio.`);
  }
}

function normalizeWebsite(value) {
  const website = sanitizeString(value);

  assertRequired(website, 'El sitio web de la empresa');

  if (website.length > MAX_WEBSITE_LENGTH) {
    throw new Error('El sitio web es demasiado largo.');
  }

  try {
    const parsed = new URL(website.startsWith('http://') || website.startsWith('https://') ? website : `https://${website}`);
    if (!parsed.protocol || !parsed.hostname) {
      throw new Error('URL inválida');
    }
    return parsed.toString();
  } catch (error) {
    throw new Error('El sitio web de la empresa no es válido.');
  }
}

function calculateRutCheckDigit(rutDigits) {
  let sum = 0;
  let multiplier = 2;

  for (let i = rutDigits.length - 1; i >= 0; i -= 1) {
    sum += Number.parseInt(rutDigits[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = sum % 11;
  const result = 11 - remainder;

  if (result === 11) {
    return '0';
  }

  if (result === 10) {
    return 'K';
  }

  return String(result);
}

function normalizeRut(value) {
  const rut = sanitizeString(value).toUpperCase().replace(/\./g, '');

  const match = rut.match(/^(\d+)-?(\d|K)$/);
  if (!match) {
    throw new Error('El RUT de la empresa no es válido.');
  }

  const [, digits, dv] = match;

  if (digits.length < 7 || digits.length > 9) {
    throw new Error('El RUT de la empresa no es válido.');
  }

  const expectedDv = calculateRutCheckDigit(digits);

  if (expectedDv !== dv) {
    throw new Error('El RUT de la empresa no es válido.');
  }

  const normalizedDigits = digits.replace(/^0+/, '') || '0';
  const normalized = `${normalizedDigits}-${dv}`;

  if (normalized.length > MAX_RUT_LENGTH) {
    throw new Error('El RUT de la empresa es demasiado largo.');
  }

  return normalized;
}

function normalizeEmail(value) {
  const email = sanitizeString(value).toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('El correo electrónico de la empresa no es válido.');
  }

  if (email.length > MAX_EMAIL_LENGTH) {
    throw new Error('El correo electrónico de la empresa es demasiado largo.');
  }

  return email;
}

function normalizePassword(value) {
  const password = sanitizeString(value);

  assertRequired(password, 'La contraseña');

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error('La contraseña de la empresa es demasiado larga.');
  }

  if (password.length < 8) {
    throw new Error('La contraseña de la empresa debe tener al menos 8 caracteres.');
  }

  return password;
}

function normalizePasswordSalt(value) {
  const salt = sanitizeString(value);

  if (!salt) {
    return null;
  }

  if (salt.length > MAX_SALT_LENGTH) {
    throw new Error('El salt de la contraseña es demasiado largo.');
  }

  return salt;
}

function normalizePasswordIterations(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const iterations = Number.parseInt(value, 10);

  if (!Number.isInteger(iterations) || iterations <= 0) {
    throw new Error('El número de iteraciones de la contraseña debe ser un número entero positivo.');
  }

  if (iterations > MAX_PASSWORD_ITERATIONS) {
    throw new Error('El número de iteraciones de la contraseña es demasiado grande.');
  }

  return iterations;
}

function normalizeOfferDescription(value) {
  if (value === undefined || value === null) {
    return '';
  }

  const description = typeof value === 'string' ? value.trim() : String(value).trim();

  if (!description) {
    throw new Error('La descripción de la oferta es obligatoria.');
  }

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error('La descripción de la oferta es demasiado extensa.');
  }

  return description;
}

function normalizeCompanyPayload(payload = {}) {
  const name = sanitizeString(payload.name);
  assertRequired(name, 'El nombre de la empresa');
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error('El nombre de la empresa es demasiado largo.');
  }

  const country = sanitizeString(payload.country);
  assertRequired(country, 'El país de la empresa');
  if (country.length > MAX_COUNTRY_LENGTH) {
    throw new Error('El país de la empresa es demasiado largo.');
  }

  const city = sanitizeString(payload.city);
  assertRequired(city, 'La ciudad de la empresa');
  if (city.length > MAX_CITY_LENGTH) {
    throw new Error('La ciudad de la empresa es demasiado larga.');
  }

  const website = normalizeWebsite(payload.website || payload.websiteUrl || payload.site);
  const email = normalizeEmail(payload.email);
  const password = normalizePassword(payload.password);
  const rut = normalizeRut(payload.rut || payload.rutEmpresa || payload.taxId);
  const passwordSalt = normalizePasswordSalt(payload.passwordSalt || payload.salt);
  const passwordIterations = normalizePasswordIterations(payload.passwordIterations || payload.iterations);

  return {
    name,
    website,
    country,
    city,
    email,
    password,
    rut,
    passwordSalt,
    passwordIterations
  };
}

function normalizeOfferPayload(payload = {}) {
  const title = sanitizeString(payload.title);
  assertRequired(title, 'El título de la oferta');

  if (title.length > MAX_OFFER_TITLE_LENGTH) {
    throw new Error('El título de la oferta es demasiado largo.');
  }

  const description = normalizeOfferDescription(payload.description);

  const locationType = sanitizeString(payload.locationType || payload.tipoUbicacion || payload.modality);
  assertRequired(locationType, 'El tipo de ubicación de la oferta');

  if (locationType.length > MAX_LOCATION_TYPE_LENGTH) {
    throw new Error('El tipo de ubicación es demasiado largo.');
  }

  const city = sanitizeString(payload.city);
  assertRequired(city, 'La ciudad de la oferta');

  if (city.length > MAX_CITY_LENGTH) {
    throw new Error('La ciudad de la oferta es demasiado larga.');
  }

  const country = sanitizeString(payload.country);
  assertRequired(country, 'El país de la oferta');

  if (country.length > MAX_COUNTRY_LENGTH) {
    throw new Error('El país de la oferta es demasiado largo.');
  }

  const seniority = sanitizeString(payload.seniority);
  assertRequired(seniority, 'La seniority de la oferta');

  if (seniority.length > MAX_SENIORITY_LENGTH) {
    throw new Error('La seniority es demasiado larga.');
  }

  const contractType = sanitizeString(payload.contractType || payload.tipoContrato);
  assertRequired(contractType, 'El tipo de contrato de la oferta');

  if (contractType.length > MAX_CONTRACT_TYPE_LENGTH) {
    throw new Error('El tipo de contrato es demasiado largo.');
  }

  return {
    title,
    description,
    locationType,
    city,
    country,
    seniority,
    contractType
  };
}

async function createCompany(payload, options = {}) {
  const shouldSkipValidation = Boolean(options.skipValidation);
  const normalizedPayload = shouldSkipValidation ? payload : normalizeCompanyPayload(payload);

  const result = await executeQuery(
    `BEGIN
       sp_empresas_pkg.sp_registrar_empresa(
         p_nombre        => :name,
         p_sitio_web     => :website,
         p_pais          => :country,
         p_ciudad        => :city,
         p_email         => :email,
         p_contrasena    => :password,
         p_rut_empresa   => :rut,
         p_pw_salt       => :passwordSalt,
         p_pw_iters      => :passwordIterations,
         o_id_empresa    => :companyId
       );
     END;`,
    {
      name: normalizedPayload.name,
      website: normalizedPayload.website,
      country: normalizedPayload.country,
      city: normalizedPayload.city,
      email: normalizedPayload.email,
      password: normalizedPayload.password,
      rut: normalizedPayload.rut,
      passwordSalt: normalizedPayload.passwordSalt ?? null,
      passwordIterations: normalizedPayload.passwordIterations ?? null,
      companyId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    { autoCommit: true }
  );

  const newId = Number(result.outBinds?.companyId ?? 0);

  if (!Number.isInteger(newId) || newId <= 0) {
    throw new Error('No se pudo determinar el identificador de la empresa creada.');
  }

  return {
    id: newId,
    name: normalizedPayload.name,
    website: normalizedPayload.website,
    country: normalizedPayload.country,
    city: normalizedPayload.city,
    email: normalizedPayload.email,
    rut: normalizedPayload.rut
  };
}

function mapCompanyRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.ID_EMPRESA ?? row.id_empresa ?? null) || null,
    name: toNullableTrimmedString(row.NOMBRE ?? row.nombre),
    website: toNullableTrimmedString(row.SITIO_WEB ?? row.sitio_web),
    country: toNullableTrimmedString(row.PAIS ?? row.pais),
    city: toNullableTrimmedString(row.CIUDAD ?? row.ciudad),
    email: toNullableTrimmedString(row.EMAIL ?? row.email),
    rut: toNullableTrimmedString(row.RUT_EMPRESA ?? row.rut_empresa),
    createdAt: toIsoString(row.FECHA_CREACION ?? row.fecha_creacion ?? null),
    updatedAt: toIsoString(row.FECHA_ACTUALIZACION ?? row.fecha_actualizacion ?? null)
  };
}

async function getCompanyForUser(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  return withConnection(async (connection) => {
    const result = await connection.execute(
      `BEGIN sp_empresas_pkg.sp_obtener_empresa_usuario(
         p_id_usuario => :userId,
         o_empresa    => :cursor
       ); END;`,
      {
        userId,
        cursor: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
      }
    );

    const cursor = result.outBinds?.cursor || null;
    const rows = await fetchCursorRows(cursor);

    if (!rows || rows.length === 0) {
      return null;
    }

    return mapCompanyRow(rows[0]);
  });
}

async function createOffer(companyId, payload) {
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new Error('El identificador de la empresa no es válido.');
  }

  const normalized = normalizeOfferPayload(payload);

  const result = await executeQuery(
    `BEGIN sp_empresas_pkg.sp_crear_oferta(
       p_id_empresa     => :companyId,
       p_titulo         => :title,
       p_descripcion    => :description,
       p_tipo_ubicacion => :locationType,
       p_ciudad         => :city,
       p_pais           => :country,
       p_seniority      => :seniority,
       p_tipo_contrato  => :contractType,
       o_id_oferta      => :offerId
     ); END;`,
    {
      companyId,
      title: normalized.title,
      description: normalized.description,
      locationType: normalized.locationType,
      city: normalized.city,
      country: normalized.country,
      seniority: normalized.seniority,
      contractType: normalized.contractType,
      offerId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    { autoCommit: true }
  );

  const newId = Number(result.outBinds?.offerId ?? 0);

  if (!Number.isInteger(newId) || newId <= 0) {
    throw new Error('No se pudo determinar el identificador de la oferta creada.');
  }

  return {
    id: newId,
    companyId,
    title: normalized.title,
    description: normalized.description,
    locationType: normalized.locationType,
    city: normalized.city,
    country: normalized.country,
    seniority: normalized.seniority,
    contractType: normalized.contractType
  };
}

function mapApplicantRow(row) {
  if (!row) {
    return null;
  }

  return {
    applicationId: Number(row.ID_POSTULACION ?? row.id_postulacion ?? null) || null,
    offerId: Number(row.ID_OFERTA ?? row.id_oferta ?? null) || null,
    offerTitle: toNullableTrimmedString(row.TITULO_OFERTA ?? row.titulo_oferta ?? row.TITULO ?? row.titulo),
    applicantId: Number(row.ID_USUARIO ?? row.id_usuario ?? null) || null,
    applicantName: toNullableTrimmedString(row.NOMBRE_POSTULANTE ?? row.nombre_postulante ?? row.NOMBRE_MOSTRAR ?? row.nombre_mostrar),
    applicantEmail: toNullableTrimmedString(row.CORREO_POSTULANTE ?? row.correo_postulante ?? row.CORREO ?? row.correo),
    applicantPhone: toNullableTrimmedString(
      row.TELEFONO_POSTULANTE ??
        row.telefono_postulante ??
        row.TELEFONO ??
        row.telefono ??
        row.TELEFONO_CONTACTO ??
        row.telefono_contacto ??
        row.CELULAR ??
        row.celular
    ),
    applicantProfileSlug: toNullableTrimmedString(row.SLUG_PERFIL ?? row.slug_perfil ?? row.SLUG ?? row.slug),
    status: toNullableTrimmedString(row.ESTADO ?? row.estado),
    submittedAt: toIsoString(row.FECHA_CREACION ?? row.fecha_creacion ?? null)
  };
}

function mapOfferRow(row) {
  if (!row) {
    return null;
  }

  const activeFlag = toNonNegativeInteger(row.ACTIVA ?? row.activa ?? 1);

  return {
    id: Number(row.ID_OFERTA ?? row.id_oferta ?? null) || null,
    title: toNullableTrimmedString(row.TITULO ?? row.titulo),
    description: toNullableTrimmedString(row.DESCRIPCION ?? row.descripcion),
    locationType: toNullableTrimmedString(row.TIPO_UBICACION ?? row.tipo_ubicacion),
    city: toNullableTrimmedString(row.CIUDAD ?? row.ciudad),
    country: toNullableTrimmedString(row.PAIS ?? row.pais),
    seniority: toNullableTrimmedString(row.SENIORITY ?? row.seniority),
    contractType: toNullableTrimmedString(row.TIPO_CONTRATO ?? row.tipo_contrato),
    createdAt: toIsoString(row.FECHA_CREACION ?? row.fecha_creacion ?? null),
    active: activeFlag === 1,
    totalApplicants: toNonNegativeInteger(row.TOTAL_POSTULANTES ?? row.total_postulantes)
  };
}

class ApplicationStatusUpdateError extends Error {
  constructor(message, statusCode = 400, code = 'APPLICATION_STATUS_ERROR') {
    super(message);
    this.name = 'ApplicationStatusUpdateError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

class CompanyOfferError extends Error {
  constructor(message, statusCode = 400, code = 'COMPANY_OFFER_ERROR') {
    super(message);
    this.name = 'CompanyOfferError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function normalizeStatusKey(value) {
  if (!value) {
    return '';
  }

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
}

function normalizeApplicationStatus(value) {
  const sanitized = sanitizeString(value);

  if (!sanitized) {
    throw new ApplicationStatusUpdateError(
      'Debes indicar el estado al que quieres mover la postulación.',
      400,
      'INVALID_STATUS'
    );
  }

  const normalizedKey = normalizeStatusKey(sanitized);

  if (!normalizedKey) {
    throw new ApplicationStatusUpdateError(
      'El estado indicado para la postulación no es válido.',
      400,
      'INVALID_STATUS'
    );
  }

  const candidateKeys = [normalizedKey, normalizedKey.replace(/_/g, '')];

  for (const key of candidateKeys) {
    if (APPLICATION_STATUS_ALIASES.has(key)) {
      return APPLICATION_STATUS_ALIASES.get(key);
    }
  }

  throw new ApplicationStatusUpdateError(
    'El estado indicado para la postulación no es válido.',
    400,
    'INVALID_STATUS'
  );
}

function createDefaultApplicationSummary() {
  return {
    totalApplications: 0,
    totalOffers: 0,
    activeOffers: 0,
    lastApplicationAt: null,
    lastUpdatedAt: null,
    byStatus: {
      enviada: 0,
      en_revision: 0,
      aceptada: 0,
      rechazada: 0
    }
  };
}

function toNonNegativeInteger(value) {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return 0;
    }

    const integer = Math.trunc(value);
    return integer >= 0 ? integer : 0;
  }

  if (typeof value === 'bigint') {
    if (value < 0n) {
      return 0;
    }

    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : Number.MAX_SAFE_INTEGER;
  }

  const stringValue = String(value).trim();

  if (!stringValue) {
    return 0;
  }

  const parsed = Number.parseInt(stringValue, 10);

  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return 0;
  }

  return parsed >= 0 ? parsed : 0;
}

function mapApplicationSummaryRow(row) {
  const summary = createDefaultApplicationSummary();

  if (!row || typeof row !== 'object') {
    return summary;
  }

  summary.totalApplications = toNonNegativeInteger(
    row.TOTAL_POSTULACIONES ?? row.total_postulaciones ?? row.TOTALPOSTULACIONES
  );
  summary.byStatus.enviada = toNonNegativeInteger(row.ENVIADAS ?? row.enviadas ?? row.ENVIADA);
  summary.byStatus.en_revision = toNonNegativeInteger(
    row.EN_REVISION ?? row.en_revision ?? row.ENREVISION ?? row.enRevision
  );
  summary.byStatus.aceptada = toNonNegativeInteger(row.ACEPTADAS ?? row.aceptadas ?? row.ACEPTADA);
  summary.byStatus.rechazada = toNonNegativeInteger(
    row.RECHAZADAS ?? row.rechazadas ?? row.RECHAZADA ?? row.rechazada
  );
  summary.totalOffers = toNonNegativeInteger(
    row.TOTAL_OFERTAS ?? row.total_ofertas ?? row.TOTALOFERTAS ?? row.totalOfertas
  );
  summary.activeOffers = toNonNegativeInteger(
    row.OFERTAS_ACTIVAS ?? row.ofertas_activas ?? row.OFERTASACTIVAS ?? row.ofertasActivas
  );
  summary.lastApplicationAt = toIsoString(
    row.ULTIMA_POSTULACION ?? row.ultima_postulacion ?? row.ULTIMAPOSTULACION ?? row.lastApplicationAt
  );
  summary.lastUpdatedAt = toIsoString(
    row.ULTIMA_ACTUALIZACION ??
      row.ultima_actualizacion ??
      row.ULTIMAACTUALIZACION ??
      row.lastUpdatedAt
  );

  return summary;
}

async function listApplicants(companyId) {
  if (!Number.isInteger(companyId) || companyId <= 0) {
    return [];
  }

  return withConnection(async (connection) => {
    const result = await connection.execute(
      `BEGIN sp_empresas_pkg.sp_listar_postulantes(
         p_id_empresa  => :companyId,
         o_postulantes => :cursor
       ); END;`,
      {
        companyId,
        cursor: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
      }
    );

    const cursor = result.outBinds?.cursor || null;
    const rows = await fetchCursorRows(cursor);

    return rows
      .map((row) => mapApplicantRow(row))
      .filter((item) => item && item.applicationId);
  });
}

async function listCompanyOffers(companyId) {
  if (!Number.isInteger(companyId) || companyId <= 0) {
    return [];
  }

  return withConnection(async (connection) => {
    const result = await connection.execute(
      `BEGIN sp_empresas_pkg.sp_listar_ofertas_empresa(
         p_id_empresa => :companyId,
         o_ofertas    => :cursor
       ); END;`,
      {
        companyId,
        cursor: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
      }
    );

    const cursor = result.outBinds?.cursor || null;
    const rows = await fetchCursorRows(cursor);

    return rows
      .map((row) => mapOfferRow(row))
      .filter((item) => item && item.id);
  });
}

async function listApplicantsForOffer(companyId, offerId) {
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new CompanyOfferError('El identificador de la empresa no es válido.', 400, 'INVALID_COMPANY');
  }

  if (!Number.isInteger(offerId) || offerId <= 0) {
    throw new CompanyOfferError('El identificador de la oferta no es válido.', 400, 'INVALID_OFFER');
  }

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(
        `BEGIN sp_empresas_pkg.sp_listar_postulantes_oferta(
           p_id_empresa  => :companyId,
           p_id_oferta   => :offerId,
           o_postulantes => :cursor
         ); END;`,
        {
          companyId,
          offerId,
          cursor: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
        }
      );

      const cursor = result.outBinds?.cursor || null;
      const rows = await fetchCursorRows(cursor);

      return rows
        .map((row) => mapApplicantRow(row))
        .filter((item) => item && item.applicationId);
    });
  } catch (error) {
    if (typeof error?.errorNum === 'number') {
      switch (error.errorNum) {
        case 20090:
          throw new CompanyOfferError('La oferta indicada no existe.', 404, 'OFFER_NOT_FOUND');
        case 20091:
          throw new CompanyOfferError('La empresa no puede ver los postulantes de esta oferta.', 403, 'OFFER_FORBIDDEN');
        default:
          break;
      }
    }

    throw error;
  }
}

async function getApplicationSummary(companyId) {
  if (!Number.isInteger(companyId) || companyId <= 0) {
    return createDefaultApplicationSummary();
  }

  return withConnection(async (connection) => {
    const result = await connection.execute(
      `BEGIN sp_empresas_pkg.sp_resumen_postulaciones_empresa(
         p_id_empresa => :companyId,
         o_resumen   => :cursor
       ); END;`,
      {
        companyId,
        cursor: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
      }
    );

    const cursor = result.outBinds?.cursor || null;
    const rows = await fetchCursorRows(cursor);

    if (!rows || rows.length === 0) {
      return createDefaultApplicationSummary();
    }

    return mapApplicationSummaryRow(rows[0]);
  });
}

async function updateApplicationStatus(companyId, applicationId, status) {
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new ApplicationStatusUpdateError(
      'El identificador de la empresa no es válido.',
      400,
      'INVALID_COMPANY'
    );
  }

  if (!Number.isInteger(applicationId) || applicationId <= 0) {
    throw new ApplicationStatusUpdateError(
      'El identificador de la postulación no es válido.',
      400,
      'INVALID_APPLICATION'
    );
  }

  const normalizedStatus = normalizeApplicationStatus(status);

  try {
    const result = await executeQuery(
      `BEGIN sp_empresas_pkg.sp_actualizar_estado_postulacion(
         p_id_empresa        => :companyId,
         p_id_postulacion    => :applicationId,
         p_estado            => :status,
         o_estado_nuevo      => :newStatus,
         o_estado_anterior   => :previousStatus
       ); END;`,
      {
        companyId,
        applicationId,
        status: normalizedStatus,
        newStatus: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
        previousStatus: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 }
      },
      { autoCommit: true }
    );

    const newStatus = toNullableTrimmedString(result.outBinds?.newStatus) || normalizedStatus;
    const previousStatus = toNullableTrimmedString(result.outBinds?.previousStatus) || null;

    return {
      applicationId,
      companyId,
      status: newStatus,
      previousStatus
    };
  } catch (error) {
    if (typeof error?.errorNum === 'number') {
      switch (error.errorNum) {
        case 20086:
          throw new ApplicationStatusUpdateError(
            'El estado indicado para la postulación no es válido.',
            400,
            'INVALID_STATUS'
          );
        case 20087:
          throw new ApplicationStatusUpdateError(
            'No se encontró la postulación indicada.',
            404,
            'APPLICATION_NOT_FOUND'
          );
        case 20088:
          throw new ApplicationStatusUpdateError(
            'La empresa no puede actualizar esta postulación.',
            403,
            'APPLICATION_FORBIDDEN'
          );
        default:
          break;
      }
    }

    throw error;
  }
}

async function updateOfferActiveState(companyId, offerId, active) {
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new CompanyOfferError('El identificador de la empresa no es válido.', 400, 'INVALID_COMPANY');
  }

  if (!Number.isInteger(offerId) || offerId <= 0) {
    throw new CompanyOfferError('El identificador de la oferta no es válido.', 400, 'INVALID_OFFER');
  }

  const normalizedActive = normalizeBooleanInput(active);

  if (normalizedActive === null) {
    throw new CompanyOfferError(
      'Debes indicar si la oferta debe estar activa o inactiva.',
      400,
      'INVALID_OFFER_STATE'
    );
  }

  try {
    const result = await executeQuery(
      `BEGIN sp_empresas_pkg.sp_actualizar_estado_oferta(
         p_id_empresa       => :companyId,
         p_id_oferta        => :offerId,
         p_activa           => :activeFlag,
         o_activa_nueva     => :newActive,
         o_activa_anterior  => :previousActive
       ); END;`,
      {
        companyId,
        offerId,
        activeFlag: normalizedActive,
        newActive: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        previousActive: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: true }
    );

    const newFlag = toNonNegativeInteger(result.outBinds?.newActive);
    const previousFlag = toNonNegativeInteger(result.outBinds?.previousActive);

    return {
      offerId,
      companyId,
      active: newFlag === 1,
      previousActive: previousFlag === 1
    };
  } catch (error) {
    if (typeof error?.errorNum === 'number') {
      switch (error.errorNum) {
        case 20092:
          throw new CompanyOfferError('La empresa no puede administrar esta oferta.', 403, 'OFFER_FORBIDDEN');
        case 20093:
          throw new CompanyOfferError('La oferta indicada no existe.', 404, 'OFFER_NOT_FOUND');
        case 20094:
          throw new CompanyOfferError('El estado indicado para la oferta no es válido.', 400, 'INVALID_OFFER_STATE');
        default:
          break;
      }
    }

    throw error;
  }
}

async function deleteOffer(companyId, offerId) {
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new CompanyOfferError('El identificador de la empresa no es válido.', 400, 'INVALID_COMPANY');
  }

  if (!Number.isInteger(offerId) || offerId <= 0) {
    throw new CompanyOfferError('El identificador de la oferta no es válido.', 400, 'INVALID_OFFER');
  }

  try {
    await executeQuery(
      `BEGIN sp_empresas_pkg.sp_eliminar_oferta(
         p_id_empresa => :companyId,
         p_id_oferta  => :offerId
       ); END;`,
      {
        companyId,
        offerId
      },
      { autoCommit: true }
    );
  } catch (error) {
    if (typeof error?.errorNum === 'number') {
      switch (error.errorNum) {
        case 20095:
          throw new CompanyOfferError('La empresa no puede eliminar esta oferta.', 403, 'OFFER_FORBIDDEN');
        case 20096:
          throw new CompanyOfferError('La oferta indicada no existe.', 404, 'OFFER_NOT_FOUND');
        case 20097:
          throw new CompanyOfferError(
            'No puedes eliminar la oferta porque tiene postulaciones asociadas.',
            409,
            'OFFER_HAS_APPLICATIONS'
          );
        default:
          break;
      }
    }

    throw error;
  }

  return { offerId, companyId };
}

module.exports = {
  normalizeCompanyPayload,
  createCompany,
  mapCompanyRow,
  mapOfferRow,
  getCompanyForUser,
  createOffer,
  listApplicants,
  listCompanyOffers,
  listApplicantsForOffer,
  getApplicationSummary,
  updateApplicationStatus,
  updateOfferActiveState,
  deleteOffer,
  normalizeApplicationStatus,
  ApplicationStatusUpdateError,
  CompanyOfferError,
  APPLICATION_STATUS_VALUES,
  __test__: {
    createDefaultApplicationSummary,
    mapApplicationSummaryRow,
    toNonNegativeInteger,
    normalizeBooleanInput
  }
};
