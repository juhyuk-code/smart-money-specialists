const stores = new Map();

export function getCachedValue(namespace, key) {
  const store = stores.get(namespace);
  const entry = store?.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return {
    value: entry.value,
    cachedAt: entry.cachedAt,
    expiresAt: entry.expiresAt,
  };
}

export function setCachedValue(namespace, key, value, ttlMs) {
  if (!stores.has(namespace)) stores.set(namespace, new Map());
  const cachedAt = new Date().toISOString();
  const entry = {
    value,
    cachedAt,
    expiresAt: Date.now() + ttlMs,
  };
  stores.get(namespace).set(key, entry);
  return {
    value,
    cachedAt,
    expiresAt: entry.expiresAt,
  };
}

export function clearCache(namespace) {
  if (namespace) {
    stores.delete(namespace);
    return;
  }
  stores.clear();
}
