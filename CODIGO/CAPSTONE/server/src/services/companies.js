const { executeQuery, oracledb } = require('../db/oracle');
const { toNullableTrimmedString } = require('../utils/format');

const MAX_NAME_LENGTH = 150;
const MAX_COUNTRY_LENGTH = 80;
const MAX_CITY_LENGTH = 80;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 64;
const MAX_RUT_LENGTH = 12; // after formatting with hyphen
const MAX_SALT_LENGTH = 32;
const MAX_WEBSITE_LENGTH = 2048;
const MAX_PASSWORD_ITERATIONS = 999999;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeString(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return String(value).trim();
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
    rut: toNullableTrimmedString(row.RUT_EMPRESA ?? row.rut_empresa)
  };
}

module.exports = {
  normalizeCompanyPayload,
  createCompany,
  mapCompanyRow
};
