function toIsoString(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  try {
    return new Date(value).toISOString();
  } catch (error) {
    console.warn('[Util] Failed to convert value to ISO string:', value, error);
    return null;
  }
}

function toNullableTrimmedString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed || trimmed === '[object Object]') {
      return null;
    }

    return trimmed;
  }

  const stringValue = String(value).trim();
  if (!stringValue || stringValue === '[object Object]') {
    return null;
  }

  return stringValue;
}

module.exports = {
  toIsoString,
  toNullableTrimmedString
};
