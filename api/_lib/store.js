import { Redis } from '@upstash/redis';
import { hasRedisEnv } from './util.js';
import { DEFAULT_SETTINGS } from './hours.js';

// Orders live in Upstash Redis in production (provisioned via the Vercel
// Marketplace). When no Redis env vars are present — local dev, or a deploy
// before the integration is installed — a per-process in-memory map is used
// instead so the whole flow still works end-to-end.

const ORDER_TTL_SECONDS = 60 * 60 * 24 * 3; // orders self-expire after 3 days
const INDEX_KEY = 'pp:order-index';
const MAX_LISTED = 300;

function redisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return new Redis({ url, token });
}

// Survives module re-evaluation within one warm serverless instance / dev server
const memory = globalThis.__ppOrderStore ?? (globalThis.__ppOrderStore = new Map());

export async function createOrder(order) {
  if (!hasRedisEnv()) {
    memory.set(order.id, order);
    return order;
  }
  const redis = redisClient();
  await redis.set(`pp:order:${order.id}`, order, { ex: ORDER_TTL_SECONDS });
  await redis.lpush(INDEX_KEY, order.id);
  await redis.ltrim(INDEX_KEY, 0, MAX_LISTED - 1);
  return order;
}

export async function getOrder(id) {
  if (!hasRedisEnv()) return memory.get(id) ?? null;
  return (await redisClient().get(`pp:order:${id}`)) ?? null;
}

export async function listOrders() {
  if (!hasRedisEnv()) {
    return [...memory.values()].sort((a, b) => b.createdAt - a.createdAt);
  }
  const redis = redisClient();
  const ids = await redis.lrange(INDEX_KEY, 0, MAX_LISTED - 1);
  if (!ids.length) return [];
  const rows = await redis.mget(...ids.map((id) => `pp:order:${id}`));
  return rows.filter(Boolean); // expired keys read back as null
}

// ── Store settings (open/closed switch) ───────────────────────────────

const SETTINGS_KEY = 'pp:settings';

export async function getSettings() {
  const stored = hasRedisEnv()
    ? await redisClient().get(SETTINGS_KEY)
    : globalThis.__ppSettings;
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
