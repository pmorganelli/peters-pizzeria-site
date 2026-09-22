import { Redis } from '@upstash/redis';
import { hasRedisEnv } from './util.js';
import { DEFAULT_SETTINGS } from './hours.js';
import { SLICES_PER_BALL, isDoughType } from '../../src/utils/dough.js';

// Orders live in Upstash Redis in production (provisioned via the Vercel
// Marketplace). When no Redis env vars are present — local dev, or a deploy
// before the integration is installed — a per-process in-memory map is used
// instead so the whole flow still works end-to-end.

export const ORDER_TTL_SECONDS = 60 * 60 * 24 * 3; // orders self-expire after 3 days
const INDEX_KEY = 'pp:order-index';
export const MAX_LIVE_ORDERS = 300;

// The `pp:order-code:<code>` index shipped after the board was already taking
// orders, so at cutover Redis holds up to ORDER_TTL_SECONDS worth of orders
// with no index entry. Two code paths scan the whole board to find those —
// getOrderByCode's fallback and the collision check inside CREATE_ORDER_LUA —
// and both are expensive enough that they must not run forever: the fallback
// fires on every *wrong* pickup code (reachable unauthenticated via ?find= and
// slice posting), and the collision check costs up to MAX_LIVE_ORDERS GETs and
// cjson decodes inside a single blocking EVAL on every order placed.
//
// This key records when the index went live. It is written once, never
// expires, and is what lets both scans retire themselves: once it is older
// than one order lifetime, every order still on the board was written with an
// index entry and there is nothing left for a scan to find.
const CODE_EPOCH_KEY = 'pp:order-code-epoch';
const ORDER_TTL_MS = ORDER_TTL_SECONDS * 1000;

// Slices committed against tonight's dough, per dough type. A hash rather than
// a field on pp:settings because every order placed touches it and almost
// nothing touches the rest of settings — folding it in would mean decoding and
// re-encoding the whole settings blob inside the order-create script, on every
// order, for a two-integer update.
//
// Carries a sliding TTL of one order lifetime (set on each increment). The
// counter is only meaningful while the orders behind it are live, and the TTL
// is what guarantees it can never outlive them and quietly shrink a later
// night's capacity — "close for the night" clears it explicitly, this is the
// backstop for a night nobody closed.
const DOUGH_USED_KEY = 'pp:dough-used';
const SLICES_PER_BALL_JSON = JSON.stringify(SLICES_PER_BALL);

// Missing epoch means the first post-cutover order hasn't landed yet, so the
// board can still be holding nothing but pre-index orders — scan.
async function legacyCodesPossible(redis) {
  const epoch = Number(await redis.get(CODE_EPOCH_KEY));
  return !epoch || Date.now() - epoch <= ORDER_TTL_MS;
}

function redisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return new Redis({ url, token });
}

// Survives module re-evaluation within one warm serverless instance / dev server
const memory = globalThis.__ppOrderStore ?? (globalThis.__ppOrderStore = new Map());
const codeMemory = globalThis.__ppOrderCodeStore ?? (globalThis.__ppOrderCodeStore = new Map());
const idempotencyMemory = globalThis.__ppOrderIdempotency ?? (globalThis.__ppOrderIdempotency = new Map());
const doughMemory = globalThis.__ppDoughUsed ?? (globalThis.__ppDoughUsed = new Map());

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

-- Stamp the code-index epoch on the first order to reach this script, then
-- decide whether pre-index orders can still be on the board (see CODE_EPOCH_KEY).
local epoch = redis.call('GET', KEYS[5])
if not epoch then redis.call('SET', KEYS[5], ARGV[8]) end
local scanLegacy = 1
if epoch and (tonumber(ARGV[8]) - tonumber(epoch)) > tonumber(ARGV[9]) then scanLegacy = 0 end

-- Pruning a dead index entry needs only EXISTS. The GET + decode is purely the
-- pre-index collision check, and it is the half that costs — so it drops out
-- entirely once scanLegacy goes to 0, leaving an EXISTS-only sweep.
local ids = redis.call('LRANGE', KEYS[2], 0, -1)
for _, id in ipairs(ids) do
  local orderKey = 'pp:order:' .. id
  if scanLegacy == 1 and codeReserved == 0 then
    local existingOrder = redis.call('GET', orderKey)
    if not existingOrder then
      redis.call('LREM', KEYS[2], 0, id)
    elseif cjson.decode(existingOrder).code == ARGV[7] then
      return 'code_conflict'
    end
  elseif redis.call('EXISTS', orderKey) == 0 then
    redis.call('LREM', KEYS[2], 0, id)
  end
end
if redis.call('LLEN', KEYS[2]) >= tonumber(ARGV[3]) then return 'capacity' end
if codeReserved == 1 then return 'code_conflict' end

-- Dough stock. This is the whole point of putting the check in here rather
-- than in the handler: two staff devices typing the last slice at the same
-- moment both read "1 left" if the read and the write are separate round
-- trips, and both orders land. Checking and committing inside one script is
-- what makes overselling impossible rather than merely unlikely.
--
-- It sits *below* the code and capacity checks deliberately. A code_conflict
-- sends the caller back around with a fresh code, and a pool debited on an
-- attempt that never became an order would leak a slice per retry.
local want = cjson.decode(ARGV[10])
local perBall = cjson.decode(ARGV[11])
local settingsRaw = redis.call('GET', KEYS[6])
local stock = nil
if settingsRaw then
  -- pcall: a settings key that somehow isn't JSON must not 500 every order.
  -- Untracked dough (the default) is the safe reading of "we can't tell".
  local ok, decoded = pcall(cjson.decode, settingsRaw)
  if ok and type(decoded) == 'table' and type(decoded.dough) == 'table' then
    -- A count older than one order lifetime is last week's, not tonight's:
    -- read it as untracked. Mirrors freshDoughStock() in JS — see there.
    local setAt = tonumber(decoded.doughSetAt)
    if setAt and tonumber(ARGV[8]) - setAt <= tonumber(ARGV[9]) then stock = decoded.dough end
  end
end
if stock then
  for dough, qty in pairs(want) do
    local balls = stock[dough]
    -- A dough type absent from settings is untracked, not zero — skip it.
    if type(balls) == 'number' then
      local capacity = balls * (perBall[dough] or 0)
      local spent = tonumber(redis.call('HGET', KEYS[7], dough)) or 0
      if spent + qty > capacity then
        local left = capacity - spent
        if left < 0 then left = 0 end
        return 'dough:' .. dough .. ':' .. left
      end
    end
  end
end

redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SET', KEYS[3], ARGV[4], 'EX', ARGV[2])
redis.call('LPUSH', KEYS[2], ARGV[4])
if ARGV[6] == '1' then
  redis.call('SET', KEYS[4], cjson.encode({ orderId = ARGV[4], fingerprint = ARGV[5] }), 'EX', ARGV[2])
end
local committed = false
for dough, qty in pairs(want) do
  redis.call('HINCRBY', KEYS[7], dough, qty)
  committed = true
end
-- Sliding, so the counter expires with the last order that touched it rather
-- than outliving the board and eating into a later night's capacity.
if committed then redis.call('EXPIRE', KEYS[7], ARGV[2]) end
return 'created'`;

// The in-memory twin of the Lua gate above. Returns the same
// `dough:<type>:<slices left>` reason string the script returns, or null when
// the order fits — kept in this shape so both storage paths hand api/orders.js
// one thing to parse.
function doughShortfall(stock, used, want) {
  for (const [dough, qty] of Object.entries(want)) {
    const balls = stock?.[dough];
    if (!Number.isFinite(balls)) continue; // untracked → unlimited
    const capacity = balls * (SLICES_PER_BALL[dough] ?? 0);
    const spent = Math.max(0, Number(used?.[dough]) || 0);
    if (spent + qty > capacity) return `dough:${dough}:${Math.max(0, capacity - spent)}`;
  }
  return null;
}

// Slices to put back when an order is cancelled, read off the stored order
// rather than the live menu (see the `dough` note in api/_lib/catalog.js).
function doughOnOrder(order) {
  const back = {};
  for (const item of order?.items ?? []) {
    if (!isDoughType(item.dough) || !Number.isFinite(item.qty)) continue;
    back[item.dough] = (back[item.dough] ?? 0) + item.qty;
  }
  return back;
}

export async function createOrder(order, { idempotencyKey = null, fingerprint = '', doughSlices = {} } = {}) {
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
    const short = doughShortfall(
      normalizeSettings(globalThis.__ppSettings).dough, Object.fromEntries(doughMemory), doughSlices);
    if (short) return { reason: short };
    memory.set(order.id, order);
    codeMemory.set(order.code, order.id);
    if (idempotencyKey) idempotencyMemory.set(idempotencyKey, { orderId: order.id, fingerprint });
    for (const [dough, qty] of Object.entries(doughSlices)) {
      doughMemory.set(dough, (doughMemory.get(dough) ?? 0) + qty);
    }
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
      CODE_EPOCH_KEY,
      SETTINGS_KEY,
      DOUGH_USED_KEY,
    ],
    [
      JSON.stringify(order),
      ORDER_TTL_SECONDS,
      MAX_LIVE_ORDERS,
      order.id,
      fingerprint,
      idempotencyKey ? '1' : '0',
      order.code,
      Date.now(),
      ORDER_TTL_MS,
      JSON.stringify(doughSlices),
      SLICES_PER_BALL_JSON,
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

  if (!(await legacyCodesPossible(redis))) return null;
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
  //
  // `unavailable` is coerced back to an array because Redis's cjson cannot
  // tell an empty array from an empty table: PATCH_SETTINGS_LUA writes
  // `"unavailable":{}` whenever the 86 list is empty (which it is by default,
  // and again whenever the last sold-out item is restored). An empty object
  // and an empty array mean the same thing here, but callers spread this into
  // `new Set(...)` — `new Set({})` throws, which 500s every order and crashes
  // the order page and the admin board. Coerce on read; do not "tidy" away.
  const unavailable = stored?.unavailable;
  return {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    unavailable: Array.isArray(unavailable) ? unavailable : [],
    dough: freshDoughStock(stored),
    hours: { ...DEFAULT_SETTINGS.hours, ...(stored?.hours ?? {}) },
  };
}

// Only real dough types with a real ball count survive. Everything downstream
// treats "key present" as "we are counting this one" and multiplies the value
// by a slices-per-ball figure, so a stray key or a non-integer must not make
// it out of here — an undercount reads as sold out and stops the night.
//
// Note the field is an object, which sidesteps the empty-array-as-`{}` trap
// documented above for `unavailable`: an empty dough map means "tracking
// nothing", and `{}` is exactly how that should decode. It still goes through
// this function so the *contents* are checked.
// A ball count carries the time it was saved (`doughSetAt`, stamped by
// patchSettings) and reads as untracked once it is older than one order
// lifetime — the same horizon the slices-sold counter's TTL gives it. Closing
// the night clears both explicitly, but that reset is best-effort and a night
// nobody closes never runs it at all; without an expiry here the count would
// sit in pp:settings (which never expires) until next Saturday, next to a
// counter that *had* expired, and the board would open selling against dough
// that isn't there. Untracked rather than zero, for the reason on
// DEFAULT_SETTINGS.dough. A count with no timestamp is treated as stale.
//
// CREATE_ORDER_LUA applies the same rule to the raw key; keep the two in step.
function freshDoughStock(stored) {
  const setAt = Number(stored?.doughSetAt);
  if (!Number.isFinite(setAt) || Date.now() - setAt > ORDER_TTL_MS) return {};
  return normalizeDoughStock(stored?.dough);
}

function normalizeDoughStock(stored) {
  const dough = {};
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return dough;
  for (const [type, balls] of Object.entries(stored)) {
    if (isDoughType(type) && Number.isInteger(balls) && balls >= 0) dough[type] = balls;
  }
  return dough;
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
  dough = stored.dough or defaults.dough,
  doughSetAt = stored.doughSetAt,
  hours = stored.hours or defaults.hours
}
for key, value in pairs(defaults.hours) do
  if settings.hours[key] == nil then settings.hours[key] = value end
end
local patch = cjson.decode(ARGV[2])
if patch.mode ~= nil then settings.mode = patch.mode end
if patch.hours ~= nil then settings.hours = patch.hours end
if patch.unavailable ~= nil then settings.unavailable = patch.unavailable end
-- Whole-map replace, not a merge: the panel always sends both dough types (or
-- neither), and an omitted type means "stop tracking this one", which a merge
-- could never express. Field-level atomicity against mode/hours/availability
-- is preserved — those are separate keys on the patch.
if patch.dough ~= nil then
  settings.dough = patch.dough
  settings.doughSetAt = patch.doughSetAt
end
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
-- NOTE: an empty settings.unavailable encodes as an empty JSON *object*, not
-- an empty array — cjson cannot tell the two apart. normalizeSettings()
-- coerces it back on the way out; every reader of this key must go through it.
local encoded = cjson.encode(settings)
redis.call('SET', KEYS[1], encoded)
return encoded`;

export async function patchSettings(patch) {
  // Every dough save restarts the count's lifetime — see freshDoughStock().
  if (patch.dough !== undefined) patch = { ...patch, doughSetAt: Date.now() };
  if (!hasRedisEnv()) {
    // Keep the in-memory fallback synchronous through its read-modify-write,
    // matching the single-operation guarantee of the Redis Lua path.
    const current = normalizeSettings(globalThis.__ppSettings);
    const next = { ...current };
    if (patch.mode !== undefined) next.mode = patch.mode;
    if (patch.hours !== undefined) next.hours = patch.hours;
    if (patch.unavailable !== undefined) next.unavailable = patch.unavailable;
    if (patch.dough !== undefined) {
      next.dough = normalizeDoughStock(patch.dough);
      next.doughSetAt = patch.doughSetAt;
    }
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
  // Through normalizeSettings for the same reason getSettings is: the script
  // hands back exactly what it stored, empty-list-as-`{}` included, and this
  // return value is what the admin board renders after a save.
  return normalizeSettings(typeof result === 'string' ? JSON.parse(result) : result);
}

// ── Dough counter ─────────────────────────────────────────────────────
// Slices already committed tonight, per dough type. Read-only — the counter is
// only ever *written* inside the order-create and status-change scripts, where
// the write is atomic with the thing that justifies it. Anything that reads
// this and then writes based on what it saw has reintroduced the race the Lua
// exists to close.

export async function getDoughUsed() {
  if (!hasRedisEnv()) return Object.fromEntries(doughMemory);
  const raw = await redisClient().hgetall(DOUGH_USED_KEY);
  const used = {};
  for (const [dough, value] of Object.entries(raw ?? {})) {
    const count = Number(value);
    if (isDoughType(dough) && Number.isFinite(count)) used[dough] = Math.max(0, count);
  }
  return used;
}

// Zeroes the counter. Called by "close for the night" alongside clearing the
// stock itself — the orders it was counting are archived and gone by then, so
// a carried-over count would silently shrink next Saturday's capacity.
export async function clearDoughUsed() {
  if (!hasRedisEnv()) { doughMemory.clear(); return; }
  await redisClient().del(DOUGH_USED_KEY);
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
-- Cancelling a *new* order hands its slices back to tonight's pool: nothing
-- has been fired, so the dough is really still there. Guarded on the previous
-- status being exactly 'new', and not merely "not cancelled yet" — the board
-- only offers cancel on a new order, but a stale tab still showing it as new
-- can cancel one another device has already moved to firing or ready, and
-- that dough is in the oven. Refunding it would let the pool sell slices it
-- doesn't have. The same guard stops a double tap crediting twice (the second
-- sees 'cancelled'). Marking an order picked up refunds nothing either.
if ARGV[1] == 'cancelled' and order.status == 'new' then
  local back = {}
  for _, item in ipairs(order.items or {}) do
    if type(item.dough) == 'string' and type(item.qty) == 'number' then
      back[item.dough] = (back[item.dough] or 0) + item.qty
    end
  end
  local credited = false
  for dough, qty in pairs(back) do
    -- Floor at zero: an order written before dough tracking existed, or one
    -- whose counter has since expired, must not push the pool negative and
    -- hand out free capacity.
    if redis.call('HINCRBY', KEYS[2], dough, -qty) < 0 then redis.call('HSET', KEYS[2], dough, 0) end
    credited = true
  end
  -- HINCRBY *creates* the hash when it is missing, which it is whenever the
  -- counter has expired or the night was closed under a still-live order — so
  -- a refund can resurrect the key with no TTL at all and leave it behind
  -- forever. Re-arm the same sliding expiry the create path sets.
  if credited then redis.call('EXPIRE', KEYS[2], ARGV[3]) end
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
    if (status === 'cancelled' && existing.status === 'new') {
      for (const [dough, qty] of Object.entries(doughOnOrder(existing))) {
        doughMemory.set(dough, Math.max(0, (doughMemory.get(dough) ?? 0) - qty));
      }
    }
    const updated = { ...existing, status, updatedAt: Date.now() };
    memory.set(id, updated);
    return { order: updated };
  }
  const res = await redisClient().eval(
    SET_STATUS_LUA, [`pp:order:${id}`, DOUGH_USED_KEY], [status, Date.now(), ORDER_TTL_SECONDS]);
  if (res === null) return { order: null };
  if (typeof res === 'string' && res.startsWith('terminal:')) return { conflict: res.slice('terminal:'.length) };
  // The SDK auto-parses JSON results; a raw string means parsing was disabled
  return { order: typeof res === 'string' ? JSON.parse(res) : res };
}
