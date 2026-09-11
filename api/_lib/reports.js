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

const ADD_REPORT_LUA = `
local existing = redis.call('GET', KEYS[1])
local report
if existing then
  report = cjson.decode(existing)
  report.devices = report.devices or {}
  local found = false
  for _, device in ipairs(report.devices) do
    if device == ARGV[2] then found = true break end
  end
  if not found then
    table.insert(report.devices, ARGV[2])
    report.count = report.count + 1
  end
  report.lastAt = tonumber(ARGV[3])
else
  report = {
    sliceId = ARGV[1], count = 1, devices = {ARGV[2]},
    firstAt = tonumber(ARGV[3]), lastAt = tonumber(ARGV[3])
  }
end
local encoded = cjson.encode(report)
redis.call('SET', KEYS[1], encoded, 'EX', ARGV[4])
redis.call('LREM', KEYS[2], 0, ARGV[1])
redis.call('LPUSH', KEYS[2], ARGV[1])
redis.call('LTRIM', KEYS[2], 0, ARGV[5])
return encoded`;

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
  const result = await redis.eval(
    ADD_REPORT_LUA,
    [key, INDEX_KEY],
    [sliceId, deviceHash, at, REPORT_TTL_SECONDS, MAX_LISTED - 1],
  );
  return typeof result === 'string' ? JSON.parse(result) : result;
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
