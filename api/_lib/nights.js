import { Redis } from '@upstash/redis';
import { hasRedisEnv } from './util.js';

// Past-night revenue archives, written once by the admin's "Close for the
// night" action (api/nights.js). Unlike orders (3-day TTL) and slices (90-day
// TTL), night records never expire — they're the permanent record of how much
// a given night made, since the orders behind them will be gone long before
// anyone wants to look back at a month of Saturdays.
const INDEX_KEY = 'pp:night-index';
const CLOSE_LOCK_KEY = 'pp:night-close-lock';

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
  await redis.lrem(INDEX_KEY, 0, night.id);
  await redis.lpush(INDEX_KEY, night.id);
  return night;
}

export async function listNights() {
  if (!hasRedisEnv()) {
    return [...memory.values()].sort((a, b) => b.closedAt - a.closedAt);
  }
  const redis = redisClient();
  const ids = await redis.lrange(INDEX_KEY, 0, -1);
  if (!ids.length) return [];
  const rows = [];
  for (let start = 0; start < ids.length; start += 100) {
    rows.push(...await redis.mget(...ids.slice(start, start + 100).map((id) => `pp:night:${id}`)));
  }
  return rows.filter(Boolean);
}

// A short lease serializes close requests across serverless instances. The
// archive and removal still happen in one Redis script below, so a process
// crash cannot leave orders cleared without their permanent night record.
export async function acquireNightCloseLock(token) {
  if (!hasRedisEnv()) {
    if (globalThis.__ppNightCloseLock) return null;
    globalThis.__ppNightCloseLock = token;
    return async () => {
      if (globalThis.__ppNightCloseLock === token) delete globalThis.__ppNightCloseLock;
    };
  }
  const redis = redisClient();
  const claimed = await redis.set(CLOSE_LOCK_KEY, token, { nx: true, ex: 120 });
  if (!claimed) return null;
  return async () => {
    await redis.eval(
      `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`,
      [CLOSE_LOCK_KEY],
      [token],
    );
  };
}

const ARCHIVE_AND_CLEAR_LUA = `
local existing = redis.call('GET', KEYS[1])
if existing then return existing end
local night = cjson.decode(ARGV[1])
redis.call('SET', KEYS[1], ARGV[1])
redis.call('LREM', KEYS[2], 0, night.id)
redis.call('LPUSH', KEYS[2], night.id)
for _, order in ipairs(night.orders) do
  redis.call('DEL', 'pp:order:' .. order.id)
  if order.code then redis.call('DEL', 'pp:order-code:' .. order.code) end
  redis.call('LREM', KEYS[3], 0, order.id)
end
return ARGV[1]`;

export async function archiveNightAndClear(night, orders) {
  if (!hasRedisEnv()) {
    memory.set(night.id, night);
    const orderMemory = globalThis.__ppOrderStore;
    const codeMemory = globalThis.__ppOrderCodeStore;
    for (const order of orders) {
      orderMemory?.delete(order.id);
      if (order.code) codeMemory?.delete(order.code);
    }
    return night;
  }
  const result = await redisClient().eval(
    ARCHIVE_AND_CLEAR_LUA,
    [`pp:night:${night.id}`, INDEX_KEY, 'pp:order-index'],
    [JSON.stringify(night)],
  );
  return typeof result === 'string' ? JSON.parse(result) : result;
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
