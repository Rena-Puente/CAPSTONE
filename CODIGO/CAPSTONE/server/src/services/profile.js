const PROFILE_FIELD_LABELS = {
  NOMBRE_MOSTRAR: 'Nombre para mostrar',
  TITULAR: 'Carrera',
  BIOGRAFIA: 'Biografía (mínimo 80 caracteres)',
  PAIS: 'País',
  CIUDAD: 'Ciudad',
  URL_AVATAR: 'Foto de perfil'
};

const EDUCATION_SECTION_LABEL = 'Historial educativo';
const EDUCATION_DATES_NOTE = 'Historial educativo (revisa las fechas)';
const EXPERIENCE_SECTION_LABEL = 'Experiencia laboral';
const EXPERIENCE_DATES_NOTE = 'Experiencia laboral (revisa las fechas)';
const SKILLS_SECTION_LABEL = 'Habilidades profesionales';

const PROFILE_FIELD_KEYS = ['displayName', 'career', 'biography', 'country', 'city', 'avatarUrl'];

const PROFILE_FIELD_METADATA = {
  displayName: { column: 'NOMBRE_MOSTRAR', label: PROFILE_FIELD_LABELS.NOMBRE_MOSTRAR },
  career: { column: 'TITULAR', label: PROFILE_FIELD_LABELS.TITULAR },
  biography: { column: 'BIOGRAFIA', label: PROFILE_FIELD_LABELS.BIOGRAFIA },
  country: { column: 'PAIS', label: PROFILE_FIELD_LABELS.PAIS },
  city: { column: 'CIUDAD', label: PROFILE_FIELD_LABELS.CIUDAD },
  avatarUrl: { column: 'URL_AVATAR', label: PROFILE_FIELD_LABELS.URL_AVATAR }
};

function createEmptyProfileValues() {
  return PROFILE_FIELD_KEYS.reduce((acc, field) => {
    acc[field] = null;
    return acc;
  }, {});
}

function createDefaultFieldStatuses(defaultOk = true) {
  return PROFILE_FIELD_KEYS.reduce((acc, field) => {
    acc[field] = { ok: defaultOk, error: null };
    return acc;
  }, {});
}

function mapRowToProfile(row) {
  if (!row) {
    return createEmptyProfileValues();
  }

  const profile = createEmptyProfileValues();

  for (const field of PROFILE_FIELD_KEYS) {
    const metadata = PROFILE_FIELD_METADATA[field];
    const value = row[metadata.column];
    if (typeof value === 'string') {
      profile[field] = value.trim();
    } else if (value === undefined || value === null) {
      profile[field] = null;
    } else {
      profile[field] = value;
    }
  }

  return profile;
}

function buildProfileEnvelope(values, statuses, options = {}) {
  const baseValues = {
    ...createEmptyProfileValues(),
    ...(values || {})
  };

  const fieldStatuses = {
    ...createDefaultFieldStatuses(true),
    ...(statuses || {})
  };

  const flags = {};
  const errors = {};

  for (const field of PROFILE_FIELD_KEYS) {
    const status = fieldStatuses[field] || { ok: true, error: null };
    flags[`ok_${field}`] = Boolean(status.ok);
    errors[`error_${field}`] = status.error ?? null;
  }

  const missingFields = Array.isArray(options.missingFields) ? options.missingFields : [];
  const message = options.message ?? null;
  const isComplete = Boolean(options.isComplete);
  const educationSummary = options.educationSummary ?? null;
  const experienceSummary = options.experienceSummary ?? null;
  const skillsSummary = options.skillsSummary ?? null;

  const data = {
    ...baseValues,
    ...flags,
    ...errors,
    isComplete,
    missingFields,
    message,
    educationSummary,
    experienceSummary,
    skillsSummary,
    profile: baseValues
  };

  return {
    ok: true,
    data,
    profile: baseValues,
    validations: {
      ...flags,
      isComplete,
      missingFields
    },
    errors: {
      ...errors,
      message
    },
    isComplete,
    missingFields,
    message,
    educationSummary,
    experienceSummary,
    skillsSummary
  };
}

function sanitizeProfileInput(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return String(value).trim();
}

function isValidUrl(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(value);
    return Boolean(parsed.protocol) && Boolean(parsed.hostname);
  } catch (error) {
    return false;
  }
}

function hasMeaningfulValue(value) {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return String(value).trim().length > 0;
}

function validateProfilePayload(payload = {}, currentProfile = null) {
  const values = createEmptyProfileValues();

  for (const field of PROFILE_FIELD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      values[field] = sanitizeProfileInput(payload[field]);
    } else if (currentProfile && hasMeaningfulValue(currentProfile[field])) {
      const existingValue = currentProfile[field];
      values[field] =
        typeof existingValue === 'string' ? existingValue : sanitizeProfileInput(existingValue);
    } else {
      values[field] = sanitizeProfileInput(payload[field]);
    }
  }

  const statuses = createDefaultFieldStatuses(true);

  if (!values.displayName) {
    statuses.displayName = { ok: false, error: 'Ingresa tu nombre para mostrar.' };
  }

  if (!values.biography || values.biography.length < 80) {
    statuses.biography = {
      ok: false,
      error: 'La biografía debe tener al menos 80 caracteres.'
    };
  }

  if (!values.career) {
    statuses.career = { ok: false, error: 'Selecciona tu carrera.' };
  }

  if (!values.country) {
    statuses.country = { ok: false, error: 'Selecciona tu país.' };
  }

  if (!values.city) {
    statuses.city = { ok: false, error: 'Ingresa tu ciudad.' };
  }

  if (!values.avatarUrl) {
    statuses.avatarUrl = {
      ok: false,
      error: 'Proporciona un enlace para tu foto de perfil.'
    };
  } else if (!isValidUrl(values.avatarUrl)) {
    statuses.avatarUrl = {
      ok: false,
      error: 'Ingresa un enlace válido (incluye https://) para tu foto de perfil.'
    };
  }

  const missingFields = PROFILE_FIELD_KEYS.filter((field) => !statuses[field].ok).map((field) => {
    const metadata = PROFILE_FIELD_METADATA[field];
    return metadata ? metadata.label : field;
  });

  const isValid = missingFields.length === 0;

  return { values, statuses, missingFields, isValid };
}

function computeProfileMissingFields(
  row,
  educationStatus = null,
  experienceStatus = null,
  skillsStatus = null
) {
  if (!row) {
    const defaults = Object.values(PROFILE_FIELD_LABELS);
    const missingEducation =
      !educationStatus || !educationStatus.hasEducation
        ? [EDUCATION_SECTION_LABEL]
        : educationStatus.invalidDateCount > 0
          ? [EDUCATION_DATES_NOTE]
          : [];
    const missingExperience =
      !experienceStatus || !experienceStatus.hasExperience
        ? [EXPERIENCE_SECTION_LABEL]
        : experienceStatus.invalidDateCount > 0
          ? [EXPERIENCE_DATES_NOTE]
          : [];
    const missingSkills =
      !skillsStatus || (skillsStatus.totalSkills ?? 0) <= 0 ? [SKILLS_SECTION_LABEL] : [];

    return [...defaults, ...missingEducation, ...missingExperience, ...missingSkills];
  }

  const missing = [];

  if (!row.NOMBRE_MOSTRAR) {
    missing.push(PROFILE_FIELD_LABELS.NOMBRE_MOSTRAR);
  }

  if (!row.TITULAR) {
    missing.push(PROFILE_FIELD_LABELS.TITULAR);
  }

  const biography = typeof row.BIOGRAFIA === 'string' ? row.BIOGRAFIA : null;
  if (!biography || biography.trim().length < 80) {
    missing.push(PROFILE_FIELD_LABELS.BIOGRAFIA);
  }

  if (!row.PAIS) {
    missing.push(PROFILE_FIELD_LABELS.PAIS);
  }

  if (!row.CIUDAD) {
    missing.push(PROFILE_FIELD_LABELS.CIUDAD);
  }

  if (!row.URL_AVATAR) {
    missing.push(PROFILE_FIELD_LABELS.URL_AVATAR);
  }

  if (!educationStatus || !educationStatus.hasEducation) {
    missing.push(EDUCATION_SECTION_LABEL);
  } else if (educationStatus.invalidDateCount > 0) {
    missing.push(EDUCATION_DATES_NOTE);
  }

  if (!experienceStatus || !experienceStatus.hasExperience) {
    missing.push(EXPERIENCE_SECTION_LABEL);
  } else if (experienceStatus.invalidDateCount > 0) {
    missing.push(EXPERIENCE_DATES_NOTE);
  }

  if (!skillsStatus || (skillsStatus.totalSkills ?? 0) <= 0) {
    missing.push(SKILLS_SECTION_LABEL);
  }

  return missing;
}

module.exports = {
  PROFILE_FIELD_KEYS,
  createEmptyProfileValues,
  createDefaultFieldStatuses,
  mapRowToProfile,
  buildProfileEnvelope,
  validateProfilePayload,
  computeProfileMissingFields
};
