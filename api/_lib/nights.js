import { Redis } from '@upstash/redis';
import { hasRedisEnv } from './util.js';

// Past-night revenue archives, written once by the admin's "Close for the
// night" action (api/nights.js). Unlike orders (3-day TTL) and slices (90-day
// TTL), night records never expire — they're the permanent record of how much
// a given night made, since the orders behind them will be gone long before
// anyone wants to look back at a month of Saturdays.
const INDEX_KEY = 'pp:night-index';
const MAX_LISTED = 200; // years of Saturdays

function redisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return new Redis({ url, token });
}

const memory = globalThis.__ppNightStore ?? (globalThis.__ppNightStore = new Map());

export async function createNight(night) {
  if (!hasRedisEnv()) {
    memory.set(night.id, night);
    return night;
  }
  const redis = redisClient();
  await redis.set(`pp:night:${night.id}`, night);
  await redis.lpush(INDEX_KEY, night.id);
  await redis.ltrim(INDEX_KEY, 0, MAX_LISTED - 1);
  return night;
}

export async function listNights() {
  if (!hasRedisEnv()) {
    return [...memory.values()].sort((a, b) => b.closedAt - a.closedAt);
  }
  const redis = redisClient();
  const ids = await redis.lrange(INDEX_KEY, 0, MAX_LISTED - 1);
  if (!ids.length) return [];
  const rows = await redis.mget(...ids.map((id) => `pp:night:${id}`));
  return rows.filter(Boolean);
}

export async function getNight(id) {
  if (!hasRedisEnv()) return memory.get(id) ?? null;
  return (await redisClient().get(`pp:night:${id}`)) ?? null;
}

// Permanently drop a night from the archive. There is no soft-delete and no
// undo: the orders behind this record were wiped when the night closed, so
// this record *is* the data. That's deliberate — the reason to reach for this
// is a test night that never should have been in the books, and a "deleted"
// night still sitting in the totals would defeat the point. The two-tap arm on
// the archive page is the only guard, so callers must be sure.
export async function deleteNight(id) {
  if (!hasRedisEnv()) return memory.delete(id);
  const redis = redisClient();
  // Index entry first: a crash between the two calls leaves an unreferenced
  // record (invisible, harmless) rather than an index id whose record is gone
  // — listNights() tolerates the latter via filter(Boolean), but only because
  // expiry already produces it; an id that never resolves is still noise on
  // every read for as long as the index holds it.
  await redis.lrem(INDEX_KEY, 0, id);
  await redis.del(`pp:night:${id}`);
  return true;
}
