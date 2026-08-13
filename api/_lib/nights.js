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
