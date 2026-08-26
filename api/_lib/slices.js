import { Redis } from '@upstash/redis';
import { hasRedisEnv } from './util.js';

// Community wall posts ("Post your slice"). Same storage story as store.js:
// Upstash Redis in production, a per-process Map when no Redis env vars are
// present so local dev works end-to-end.
//
// Posts outlive orders by a lot — an order is operational data that expires in
// 3 days, but the wall is the point of the feature and should stay up.
export const SLICE_RETENTION_MS = 1000 * 60 * 60 * 24 * 90;
// Metadata intentionally has no Redis TTL. Once a post reaches 90 days it is
// hidden from feeds, but the record must remain discoverable until the cleanup
// job successfully deletes its Blob. Expiring metadata first would orphan the
// Blob permanently during a prolonged cron or credential outage.
const INDEX_KEY = 'pp:slice-index';

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
  const stored = { ...slice, expiresAt: slice.expiresAt ?? slice.createdAt + SLICE_RETENTION_MS };
  if (!hasRedisEnv()) {
    memory.set(stored.id, stored);
    return stored;
  }
  const redis = redisClient();
  await redis.set(`pp:slice:${stored.id}`, stored);
  await redis.lrem(INDEX_KEY, 0, stored.id);
  await redis.lpush(INDEX_KEY, stored.id);
  return stored;
}

// Records written before `expiresAt` was introduced still have the old Redis
// TTL. The cleanup cron calls this once per legacy record to remove that TTL
// and make the Blob pointer durable until deletion succeeds.
export async function preserveSliceMetadata(slice) {
  if (slice.expiresAt !== undefined) return slice;
  const updated = { ...slice, expiresAt: slice.createdAt + SLICE_RETENTION_MS };
  if (!hasRedisEnv()) memory.set(updated.id, updated);
  else await redisClient().set(`pp:slice:${updated.id}`, updated);
  return updated;
}

const isExpired = (slice, now) => (slice.expiresAt ?? slice.createdAt + SLICE_RETENTION_MS) <= now;

export async function getSlice(id, { includeExpired = false, now = Date.now() } = {}) {
  const slice = !hasRedisEnv()
    ? (memory.get(id) ?? null)
    : ((await redisClient().get(`pp:slice:${id}`)) ?? null);
  return slice && (includeExpired || !isExpired(slice, now)) ? slice : null;
}

export async function listSlices({ includeExpired = false, now = Date.now(), limit } = {}) {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
    throw new TypeError('limit must be a non-negative integer');
  }
  if (!hasRedisEnv()) {
    const rows = [...memory.values()]
      .filter((slice) => includeExpired || !isExpired(slice, now))
      .sort((a, b) => b.createdAt - a.createdAt);
    return limit === undefined ? rows : rows.slice(0, limit);
  }
  if (limit === 0) return [];
  const redis = redisClient();
  // Keep unbounded access available for the cleanup job, but let frequently
  // polled feeds bound both the Redis range and subsequent mget work.
  const ids = await redis.lrange(INDEX_KEY, 0, limit === undefined ? -1 : limit - 1);
  if (!ids.length) return [];
  const rows = [];
  for (let start = 0; start < ids.length; start += 100) {
    rows.push(...await redis.mget(...ids.slice(start, start + 100).map((id) => `pp:slice:${id}`)));
  }
  return rows.filter((slice) => slice && (includeExpired || !isExpired(slice, now)));
}

export async function setSliceHidden(id, hidden) {
  if (!hasRedisEnv()) {
    const existing = memory.get(id);
    if (!existing || isExpired(existing, Date.now())) return null;
    const updated = { ...existing, hidden };
    memory.set(id, updated);
    return updated;
  }
  const redis = redisClient();
  const existing = await redis.get(`pp:slice:${id}`);
  if (!existing || isExpired(existing, Date.now())) return null;
  const updated = { ...existing, hidden };
  // Preserve any TTL carried by records written by an older deployment;
  // current records remain persistent until Blob cleanup succeeds.
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
