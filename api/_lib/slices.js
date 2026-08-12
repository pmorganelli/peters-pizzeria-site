import { Redis } from '@upstash/redis';
import { hasRedisEnv } from './util.js';

// Community wall posts ("Post your slice"). Same storage story as store.js:
// Upstash Redis in production, a per-process Map when no Redis env vars are
// present so local dev works end-to-end.
//
// Posts outlive orders by a lot — an order is operational data that expires in
// 3 days, but the wall is the point of the feature and should stay up.
const SLICE_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
const INDEX_KEY = 'pp:slice-index';
const MAX_LISTED = 300;

// The per-order quota outlives the order itself (orders expire in 3 days), so
// a counter can't be reset by simply waiting for the order to disappear.
const QUOTA_TTL_SECONDS = 60 * 60 * 24 * 14;

function redisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return new Redis({ url, token });
}

const memory = globalThis.__ppSliceStore ?? (globalThis.__ppSliceStore = new Map());

export async function createSlice(slice) {
  if (!hasRedisEnv()) {
    memory.set(slice.id, slice);
    return slice;
  }
  const redis = redisClient();
  await redis.set(`pp:slice:${slice.id}`, slice, { ex: SLICE_TTL_SECONDS });
  await redis.lpush(INDEX_KEY, slice.id);
  await redis.ltrim(INDEX_KEY, 0, MAX_LISTED - 1);
  return slice;
}

export async function getSlice(id) {
  if (!hasRedisEnv()) return memory.get(id) ?? null;
  return (await redisClient().get(`pp:slice:${id}`)) ?? null;
}

export async function listSlices() {
  if (!hasRedisEnv()) {
    return [...memory.values()].sort((a, b) => b.createdAt - a.createdAt);
  }
  const redis = redisClient();
  const ids = await redis.lrange(INDEX_KEY, 0, MAX_LISTED - 1);
  if (!ids.length) return [];
  const rows = await redis.mget(...ids.map((id) => `pp:slice:${id}`));
  return rows.filter(Boolean); // expired keys read back as null
}

export async function setSliceHidden(id, hidden) {
  if (!hasRedisEnv()) {
    const existing = memory.get(id);
    if (!existing) return null;
    const updated = { ...existing, hidden };
    memory.set(id, updated);
    return updated;
  }
  const redis = redisClient();
  const existing = await redis.get(`pp:slice:${id}`);
  if (!existing) return null;
  const updated = { ...existing, hidden };
  // KEEPTTL — hiding a post must not restart its 90-day expiry.
  await redis.set(`pp:slice:${id}`, updated, { keepTtl: true });
  return updated;
}

export async function deleteSlice(id) {
  if (!hasRedisEnv()) return memory.delete(id);
  const redis = redisClient();
  await redis.del(`pp:slice:${id}`);
  await redis.lrem(INDEX_KEY, 0, id);
  return true;
}

// ── Per-order upload quota ────────────────────────────────────────────
// Read-then-write would let a burst of parallel uploads all observe the same
// count and slip past the cap, so the increment and the limit test happen in
// one round trip — same reasoning as rateLimit() in store.js.

// Checking the limit inside the script — rather than incrementing first and
// comparing after — keeps a customer who keeps retrying from inflating their
// own counter past the cap. Left unchecked, a refused attempt still consumed a
// number, so releasing a slot after a failed upload could never bring them
// back under. Returns -1 when the order is already at its limit.
const QUOTA_LUA = `
local c = tonumber(redis.call('GET', KEYS[1]) or '0')
if c >= tonumber(ARGV[2]) then return -1 end
c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return c`;

export async function claimSliceQuota(orderId, max) {
  const key = `pp:slice-quota:${orderId}`;
  if (!hasRedisEnv()) {
    const mem = globalThis.__ppSliceQuota ?? (globalThis.__ppSliceQuota = new Map());
    const current = mem.get(key) ?? 0;
    if (current >= max) return { ok: false, count: current };
    mem.set(key, current + 1);
    return { ok: true, count: current + 1 };
  }
  const count = await redisClient().eval(QUOTA_LUA, [key], [QUOTA_TTL_SECONDS, max]);
  return count === -1 ? { ok: false, count: max } : { ok: true, count };
}

// Claiming happens before the upload so two parallel requests can't both win
// the last slot. If the upload then fails, give the slot back rather than
// burning one of the customer's three on our own error.
export async function releaseSliceQuota(orderId) {
  const key = `pp:slice-quota:${orderId}`;
  if (!hasRedisEnv()) {
    const mem = globalThis.__ppSliceQuota;
    if (mem?.has(key)) mem.set(key, Math.max(0, mem.get(key) - 1));
    return;
  }
  // DECR on a key that already expired would create it at -1; the floor keeps
  // a stray key from handing out extra uploads later.
  await redisClient().eval(
    `local c = redis.call('DECR', KEYS[1])
     if c < 0 then redis.call('SET', KEYS[1], 0) end
     return c`,
    [key],
    [],
  );
}
