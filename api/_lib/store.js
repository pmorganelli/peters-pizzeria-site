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
  // Merge over defaults so settings saved before new fields existed stay valid
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function saveSettings(settings) {
  if (!hasRedisEnv()) { globalThis.__ppSettings = settings; return settings; }
  await redisClient().set(SETTINGS_KEY, settings);
  return settings;
}

// ── Rate limiting (fixed window, per key) ─────────────────────────────
// Returns true when the request is allowed. Uses Redis INCR+EXPIRE in
// production and a small in-memory map in dev.

export async function rateLimit(key, limit, windowSeconds) {
  const bucket = `pp:rl:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  if (!hasRedisEnv()) {
    const mem = globalThis.__ppRate ?? (globalThis.__ppRate = new Map());
    if (mem.size > 5000) mem.clear(); // crude cleanup; buckets rotate anyway
    const count = (mem.get(bucket) ?? 0) + 1;
    mem.set(bucket, count);
    return count <= limit;
  }
  const redis = redisClient();
  const count = await redis.incr(bucket);
  if (count === 1) await redis.expire(bucket, windowSeconds);
  return count <= limit;
}

export async function updateOrder(id, patch) {
  const existing = await getOrder(id);
  if (!existing) return null;
  const updated = { ...existing, ...patch, updatedAt: Date.now() };
  if (!hasRedisEnv()) {
    memory.set(id, updated);
    return updated;
  }
  await redisClient().set(`pp:order:${id}`, updated, { ex: ORDER_TTL_SECONDS });
  return updated;
}
