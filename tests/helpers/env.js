// Test isolation for the api/ layer. Handlers branch on env vars
// (hasRedisEnv(), devMode(), blobConfigured()) and on module-level Map
// singletons pinned to globalThis so they survive dev-server hot reload —
// both need resetting between tests or state leaks across cases.
const REDIS_KEYS = [
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
  'KV_REST_API_URL', 'KV_REST_API_TOKEN',
];
const BLOB_KEYS = ['BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID', 'VERCEL_OIDC_TOKEN'];

// Leaves the process with no Redis configured (in-memory store fallback,
// same as local dev), no VERCEL flag (so the "no Redis in prod" 503 guards
// don't fire), no admin password (devMode() true, password "admin"), and
// fresh in-memory stores.
export function resetEnv() {
  for (const k of [...REDIS_KEYS, ...BLOB_KEYS, 'VERCEL', 'ADMIN_PASSWORD']) delete process.env[k];
  // api/_lib/slices.js and api/_lib/store.js each capture their in-memory
  // Map in a module-top-level `const`, read once at first import — deleting
  // the globalThis key wouldn't un-bind that reference for the rest of the
  // test file, so the maps must be cleared in place instead.
  globalThis.__ppOrderStore?.clear();
  globalThis.__ppSliceStore?.clear();
  globalThis.__ppSliceQuota?.clear();
  globalThis.__ppRate?.clear();
  delete globalThis.__ppSettings;
}

export function configureBlob() {
  process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token';
}
