function parseEducationDate(value, fieldLabel) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`La fecha de ${fieldLabel} no es válida.`);
    }

    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const normalized = /^\d{4}-\d{2}$/.test(trimmed) ? `${trimmed}-01` : trimmed;
    const parsed = new Date(normalized);

    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`La fecha de ${fieldLabel} no es válida.`);
    }

    return parsed;
  }

  throw new Error(`La fecha de ${fieldLabel} no es válida.`);
}

module.exports = {
  parseEducationDate
};
