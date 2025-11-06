function resolveExpiry(ttlMs, defaultTtlMs) {
  const baseTtl = Number.isFinite(ttlMs) ? ttlMs : defaultTtlMs;

  if (!Number.isFinite(baseTtl) || baseTtl <= 0) {
    return null;
  }

  return Date.now() + baseTtl;
}

function createMemoryCache({ ttlMs = 60_000, maxEntries = 100 } = {}) {
  const store = new Map();
  const normalizedMaxEntries = Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : 100;
  const defaultTtl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 60_000;

  function pruneExpired(key) {
    const entry = store.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  function get(key) {
    if (!store.has(key)) {
      return undefined;
    }

    return pruneExpired(key);
  }

  function has(key) {
    return get(key) !== undefined;
  }

  function deleteKey(key) {
    return store.delete(key);
  }

  function clear() {
    store.clear();
  }

  function trim() {
    while (store.size > normalizedMaxEntries) {
      const oldestKey = store.keys().next().value;

      if (oldestKey === undefined) {
        break;
      }

      store.delete(oldestKey);
    }
  }

  function set(key, value, customTtlMs = defaultTtl) {
    const expiresAt = resolveExpiry(customTtlMs, defaultTtl);
    store.set(key, { value, expiresAt });
    trim();
    return value;
  }

  function remember(key, factory, customTtlMs = defaultTtl) {
    const cached = get(key);

    if (cached !== undefined) {
      return cached;
    }

    const pending = Promise.resolve().then(factory);

    set(key, pending, customTtlMs);

    return pending
      .then((result) => {
        set(key, result, customTtlMs);
        return result;
      })
      .catch((error) => {
        deleteKey(key);
        throw error;
      });
  }

  function size() {
    return store.size;
  }

  return {
    get,
    set,
    has,
    delete: deleteKey,
    clear,
    remember,
    size
  };
}

module.exports = {
  createMemoryCache
};
