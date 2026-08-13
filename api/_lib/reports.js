import { Redis } from '@upstash/redis';
import { hasRedisEnv } from './util.js';

// Takedown requests from the public wall. A customer who sees a photo they
// want removed — their own face, someone else's kid, a bad shot of the shop —
// flags it here, and it surfaces on the admin board.
//
// Keyed by **slice id, not report id**: one record per photo, aggregating
// however many people flagged it. Ten separate reports for one photo would be
// ten rows on the board for a single decision, and the decision is the same
// either way — take it down or keep it.
//
// The record outlives nothing: a report for a photo that's already gone is
// meaningless, so reports carry the same 90-day TTL as slices and are deleted
// outright when their photo is (api/slices.js's remove()).
const REPORT_TTL_SECONDS = 60 * 60 * 24 * 90;
const INDEX_KEY = 'pp:report-index';
const MAX_LISTED = 200;

function redisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return new Redis({ url, token });
}

const memory = globalThis.__ppReportStore ?? (globalThis.__ppReportStore = new Map());

// Merge a new flag into an existing record rather than replacing it. The
// device hash list is what makes the count trustworthy: one person tapping
// report ten times (or on ten devices they don't own) shouldn't read as ten
// people objecting, and the count is the main thing the admin weighs.
function merge(existing, deviceHash, at) {
  if (!existing) return { count: 1, devices: [deviceHash], firstAt: at, lastAt: at };
  if (existing.devices.includes(deviceHash)) return { ...existing, lastAt: at };
  return {
    ...existing,
    count: existing.count + 1,
    devices: [...existing.devices, deviceHash],
    lastAt: at,
  };
}

export async function addReport(sliceId, deviceHash) {
  const at = Date.now();
  if (!hasRedisEnv()) {
    const updated = { sliceId, ...merge(memory.get(sliceId), deviceHash, at) };
    memory.set(sliceId, updated);
    return updated;
  }
  const redis = redisClient();
  const key = `pp:report:${sliceId}`;
  const existing = await redis.get(key);
  const updated = { sliceId, ...merge(existing, deviceHash, at) };
  await redis.set(key, updated, { ex: REPORT_TTL_SECONDS });
  // A repeat flag on a photo already in the index must not add a second entry
  // — LREM first makes LPUSH idempotent without a separate membership read.
  if (existing) await redis.lrem(INDEX_KEY, 0, sliceId);
  await redis.lpush(INDEX_KEY, sliceId);
  await redis.ltrim(INDEX_KEY, 0, MAX_LISTED - 1);
  return updated;
}

export async function listReports() {
  if (!hasRedisEnv()) {
    return [...memory.values()].sort((a, b) => b.lastAt - a.lastAt);
  }
  const redis = redisClient();
  const ids = await redis.lrange(INDEX_KEY, 0, MAX_LISTED - 1);
  if (!ids.length) return [];
  const rows = await redis.mget(...ids.map((id) => `pp:report:${id}`));
  return rows.filter(Boolean); // expired keys read back as null
}

export async function deleteReport(sliceId) {
  if (!hasRedisEnv()) return memory.delete(sliceId);
  const redis = redisClient();
  await redis.lrem(INDEX_KEY, 0, sliceId);
  await redis.del(`pp:report:${sliceId}`);
  return true;
}
