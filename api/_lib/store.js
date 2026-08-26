import { Redis } from '@upstash/redis';
import { hasRedisEnv } from './util.js';
import { DEFAULT_SETTINGS } from './hours.js';

// Orders live in Upstash Redis in production (provisioned via the Vercel
// Marketplace). When no Redis env vars are present — local dev, or a deploy
// before the integration is installed — a per-process in-memory map is used
// instead so the whole flow still works end-to-end.

export const ORDER_TTL_SECONDS = 60 * 60 * 24 * 3; // orders self-expire after 3 days
const INDEX_KEY = 'pp:order-index';
export const MAX_LIVE_ORDERS = 300;

function redisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return new Redis({ url, token });
}

// Survives module re-evaluation within one warm serverless instance / dev server
const memory = globalThis.__ppOrderStore ?? (globalThis.__ppOrderStore = new Map());
const codeMemory = globalThis.__ppOrderCodeStore ?? (globalThis.__ppOrderCodeStore = new Map());
const idempotencyMemory = globalThis.__ppOrderIdempotency ?? (globalThis.__ppOrderIdempotency = new Map());

// Capacity, pickup-code uniqueness, idempotency, and the index write are one
// operation. Without this boundary, concurrent serverless invocations can both
// accept the same code or push the board past the number of orders it can list.
const CREATE_ORDER_LUA = `
local idem = redis.call('GET', KEYS[4])
if ARGV[6] == '1' and idem then
  local saved = cjson.decode(idem)
  if saved.fingerprint ~= ARGV[5] then return 'idempotency_conflict' end
  local existing = redis.call('GET', 'pp:order:' .. saved.orderId)
  if existing then return 'existing:' .. existing end
  redis.call('DEL', KEYS[4])
end

local codeReserved = redis.call('EXISTS', KEYS[3])
local ids = redis.call('LRANGE', KEYS[2], 0, -1)
for _, id in ipairs(ids) do
  local existingOrder = redis.call('GET', 'pp:order:' .. id)
  if not existingOrder then
    redis.call('LREM', KEYS[2], 0, id)
  elseif codeReserved == 0 then
    local live = cjson.decode(existingOrder)
    if live.code == ARGV[7] then return 'code_conflict' end
  end
end
if redis.call('LLEN', KEYS[2]) >= tonumber(ARGV[3]) then return 'capacity' end
if codeReserved == 1 then return 'code_conflict' end

redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SET', KEYS[3], ARGV[4], 'EX', ARGV[2])
redis.call('LPUSH', KEYS[2], ARGV[4])
if ARGV[6] == '1' then
  redis.call('SET', KEYS[4], cjson.encode({ orderId = ARGV[4], fingerprint = ARGV[5] }), 'EX', ARGV[2])
end
return 'created'`;

export async function createOrder(order, { idempotencyKey = null, fingerprint = '' } = {}) {
  if (!hasRedisEnv()) {
    if (idempotencyKey && idempotencyMemory.has(idempotencyKey)) {
      const saved = idempotencyMemory.get(idempotencyKey);
      if (saved.fingerprint !== fingerprint) return { reason: 'idempotency_conflict' };
      const existing = memory.get(saved.orderId);
      if (existing) return { order: existing, created: false };
      idempotencyMemory.delete(idempotencyKey);
    }
    if (codeMemory.has(order.code)) return { reason: 'code_conflict' };
    const legacyCodeOwner = [...memory.values()].find((existing) => existing.code === order.code);
    if (legacyCodeOwner) {
      codeMemory.set(order.code, legacyCodeOwner.id);
      return { reason: 'code_conflict' };
    }
    if (memory.size >= MAX_LIVE_ORDERS) return { reason: 'capacity' };
    memory.set(order.id, order);
    codeMemory.set(order.code, order.id);
    if (idempotencyKey) idempotencyMemory.set(idempotencyKey, { orderId: order.id, fingerprint });
    return { order, created: true };
  }
  const redis = redisClient();
  const result = await redis.eval(
    CREATE_ORDER_LUA,
    [
      `pp:order:${order.id}`,
      INDEX_KEY,
      `pp:order-code:${order.code}`,
      `pp:order-idempotency:${idempotencyKey ?? order.id}`,
    ],
    [
      JSON.stringify(order),
      ORDER_TTL_SECONDS,
      MAX_LIVE_ORDERS,
      order.id,
      fingerprint,
      idempotencyKey ? '1' : '0',
      order.code,
    ],
  );
  if (typeof result === 'string' && result.startsWith('existing:')) {
    return { order: JSON.parse(result.slice('existing:'.length)), created: false };
  }
  if (result !== 'created') return { reason: result };
  return { order, created: true };
}

export async function getOrder(id) {
  if (!hasRedisEnv()) return memory.get(id) ?? null;
  return (await redisClient().get(`pp:order:${id}`)) ?? null;
}

export async function getOrderByCode(code) {
  if (!hasRedisEnv()) {
    const id = codeMemory.get(code);
    if (id) return memory.get(id) ?? null;
    // Warm processes can contain orders written before the code index was
    // introduced. Exact-scan once and backfill so those customers keep
    // working through the remainder of the three-day order lifetime.
    const legacy = [...memory.values()].find((order) => order.code === code) ?? null;
    if (legacy) codeMemory.set(code, legacy.id);
    return legacy;
  }
  const redis = redisClient();
  const id = await redis.get(`pp:order-code:${code}`);
  if (id) return (await redis.get(`pp:order:${id}`)) ?? null;

  const legacy = (await listOrders()).find((order) => order.code === code) ?? null;
  if (legacy) {
    const ttl = await redis.ttl(`pp:order:${legacy.id}`);
    if (ttl > 0) await redis.set(`pp:order-code:${code}`, legacy.id, { ex: ttl });
  }
  return legacy;
}

export async function getOrderByIdempotency(idempotencyKey, fingerprint) {
  if (!idempotencyKey) return { order: null };
  if (!hasRedisEnv()) {
    const saved = idempotencyMemory.get(idempotencyKey);
    if (!saved) return { order: null };
    if (saved.fingerprint !== fingerprint) return { conflict: true };
    return { order: memory.get(saved.orderId) ?? null };
  }
  const redis = redisClient();
  const raw = await redis.get(`pp:order-idempotency:${idempotencyKey}`);
  if (!raw) return { order: null };
  const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (saved.fingerprint !== fingerprint) return { conflict: true };
  return { order: (await redis.get(`pp:order:${saved.orderId}`)) ?? null };
}

export async function listOrders() {
  if (!hasRedisEnv()) {
    return [...memory.values()].sort((a, b) => b.createdAt - a.createdAt);
  }
  const redis = redisClient();
  const ids = await redis.lrange(INDEX_KEY, 0, -1);
  if (!ids.length) return [];
  const rows = await redis.mget(...ids.map((id) => `pp:order:${id}`));
  return rows.filter(Boolean); // expired keys read back as null
}

// Removes exactly the given orders — used by "close for the night"
// (api/nights.js) once they've been archived. Takes explicit ids (the same
// ones just archived) rather than re-reading the current index: an order
// placed in the gap between the archive snapshot and this call must survive
// on the live board, not be silently destroyed alongside the ones that were
// actually captured. Orders are operational data (3-day TTL) with no history
// requirement of their own; the archive is what's meant to survive past this.
export async function clearOrders(entries) {
  const ids = entries.map((entry) => (typeof entry === 'string' ? entry : entry.id));
  if (!hasRedisEnv()) {
    for (const id of ids) {
      const order = memory.get(id);
      if (order?.code) codeMemory.delete(order.code);
      memory.delete(id);
    }
    return;
  }
  if (!ids.length) return;
  const redis = redisClient();
  const supplied = entries.every((entry) => typeof entry !== 'string') ? entries : null;
  const orders = supplied ?? (await redis.mget(...ids.map((id) => `pp:order:${id}`))).filter(Boolean);
  await redis.del(
    ...ids.map((id) => `pp:order:${id}`),
    ...orders.flatMap((order) => (order.code ? [`pp:order-code:${order.code}`] : [])),
  );
  // LREM each id individually rather than dropping INDEX_KEY wholesale —
  // dropping it would also erase any id pushed onto the list after this
  // function's caller took its snapshot.
  await Promise.all(ids.map((id) => redis.lrem(INDEX_KEY, 0, id)));
}

// ── Store settings (open/closed switch) ───────────────────────────────

const SETTINGS_KEY = 'pp:settings';

export async function getSettings() {
  const stored = hasRedisEnv()
    ? await redisClient().get(SETTINGS_KEY)
    : globalThis.__ppSettings;
  return normalizeSettings(stored);
}

function normalizeSettings(stored) {
  // Merge over defaults so settings saved before new fields existed stay
  // valid. `hours` merges per-field: a stored hours object from before `tz`
  // existed must not silently evaluate in the server's timezone (UTC).
  return {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    hours: { ...DEFAULT_SETTINGS.hours, ...(stored?.hours ?? {}) },
  };
}

export async function saveSettings(settings) {
  if (!hasRedisEnv()) { globalThis.__ppSettings = settings; return settings; }
  await redisClient().set(SETTINGS_KEY, settings);
  return settings;
}

const PATCH_SETTINGS_LUA = `
local current = redis.call('GET', KEYS[1])
local defaults = cjson.decode(ARGV[1])
local stored = current and cjson.decode(current) or {}
local settings = {
  mode = stored.mode or defaults.mode,
  unavailable = stored.unavailable or defaults.unavailable,
  hours = stored.hours or defaults.hours
}
for key, value in pairs(defaults.hours) do
  if settings.hours[key] == nil then settings.hours[key] = value end
end
local patch = cjson.decode(ARGV[2])
if patch.mode ~= nil then settings.mode = patch.mode end
if patch.hours ~= nil then settings.hours = patch.hours end
if patch.unavailable ~= nil then settings.unavailable = patch.unavailable end
if patch.availability ~= nil then
  local next = {}
  local found = false
  for _, name in ipairs(settings.unavailable or {}) do
    if name == patch.availability.name then
      found = true
      if patch.availability.unavailable then table.insert(next, name) end
    else
      table.insert(next, name)
    end
  end
  if patch.availability.unavailable and not found then table.insert(next, patch.availability.name) end
  settings.unavailable = next
end
local encoded = cjson.encode(settings)
redis.call('SET', KEYS[1], encoded)
return encoded`;

export async function patchSettings(patch) {
  if (!hasRedisEnv()) {
    // Keep the in-memory fallback synchronous through its read-modify-write,
    // matching the single-operation guarantee of the Redis Lua path.
    const current = normalizeSettings(globalThis.__ppSettings);
    const next = { ...current };
    if (patch.mode !== undefined) next.mode = patch.mode;
    if (patch.hours !== undefined) next.hours = patch.hours;
    if (patch.unavailable !== undefined) next.unavailable = patch.unavailable;
    if (patch.availability !== undefined) {
      const unavailable = new Set(current.unavailable ?? []);
      if (patch.availability.unavailable) unavailable.add(patch.availability.name);
      else unavailable.delete(patch.availability.name);
      next.unavailable = [...unavailable];
    }
    globalThis.__ppSettings = next;
    return next;
  }
  const result = await redisClient().eval(
    PATCH_SETTINGS_LUA,
    [SETTINGS_KEY],
    [JSON.stringify(DEFAULT_SETTINGS), JSON.stringify(patch)],
  );
  return typeof result === 'string' ? JSON.parse(result) : result;
}

// ── Rate limiting (fixed window, per key) ─────────────────────────────
// Returns true when the request is allowed. Uses Redis INCR+EXPIRE in
// production and a small in-memory map in dev.

// INCR and EXPIRE run in one script so a crash between them can't leave a
// counter key without a TTL (the window number in the key keeps counting
// correct regardless — this only prevents orphaned keys accumulating).
const RATE_LIMIT_LUA = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return c`;

export async function rateLimit(key, limit, windowSeconds) {
  const bucket = `pp:rl:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  if (!hasRedisEnv()) {
    const mem = globalThis.__ppRate ?? (globalThis.__ppRate = new Map());
    if (mem.size > 5000) mem.clear(); // crude cleanup; buckets rotate anyway
    const count = (mem.get(bucket) ?? 0) + 1;
    mem.set(bucket, count);
    return count <= limit;
  }
  const count = await redisClient().eval(RATE_LIMIT_LUA, [bucket], [windowSeconds]);
  return count <= limit;
}

// Status changes are read-check-write, so they run as one Lua script: two
// admin tabs racing (one marking done, a stale one still on firing) must not
// let the stale write resurrect a terminal order. KEEPTTL preserves the
// original 3-day expiry instead of restarting it on every touch.
// Returns { order }, { conflict: currentStatus }, or { order: null } (missing).
const SET_STATUS_LUA = `
local cur = redis.call('GET', KEYS[1])
if not cur then return nil end
local order = cjson.decode(cur)
if (order.status == 'done' or order.status == 'cancelled') and order.status ~= ARGV[1] then
  return 'terminal:' .. order.status
end
order.status = ARGV[1]
order.updatedAt = tonumber(ARGV[2])
local encoded = cjson.encode(order)
redis.call('SET', KEYS[1], encoded, 'KEEPTTL')
return encoded`;

export async function setOrderStatus(id, status) {
  if (!hasRedisEnv()) {
    // Single-process and synchronous between read and write — no await, no race
    const existing = memory.get(id);
    if (!existing) return { order: null };
    if ((existing.status === 'done' || existing.status === 'cancelled') && existing.status !== status) {
      return { conflict: existing.status };
    }
    const updated = { ...existing, status, updatedAt: Date.now() };
    memory.set(id, updated);
    return { order: updated };
  }
  const res = await redisClient().eval(SET_STATUS_LUA, [`pp:order:${id}`], [status, Date.now()]);
  if (res === null) return { order: null };
  if (typeof res === 'string' && res.startsWith('terminal:')) return { conflict: res.slice('terminal:'.length) };
  // The SDK auto-parses JSON results; a raw string means parsing was disabled
  return { order: typeof res === 'string' ? JSON.parse(res) : res };
}
