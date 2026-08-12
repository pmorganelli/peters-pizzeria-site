import { beforeEach, describe, expect, it } from 'vitest';
import { resetEnv } from '../../tests/helpers/env.js';
import {
  createSlice, getSlice, listSlices, setSliceHidden, deleteSlice,
  claimSliceQuota, releaseSliceQuota,
} from './slices.js';

// These exercise the in-memory fallback only (no Redis env configured, same
// as local dev) — see CLAUDE.md's Testing section for why the Redis-backed
// path (Lua atomicity, TTL/expiry, MAX_LISTED trimming) isn't covered here.
beforeEach(() => {
  resetEnv();
});

describe('createSlice / getSlice', () => {
  it('round-trips a stored slice', async () => {
    const slice = { id: 's1', url: 'https://x/1.jpg', createdAt: Date.now() };
    await createSlice(slice);
    expect(await getSlice('s1')).toEqual(slice);
  });

  it('returns null for an unknown id', async () => {
    expect(await getSlice('nope')).toBeNull();
  });
});

describe('listSlices', () => {
  it('orders newest first', async () => {
    await createSlice({ id: 'a', createdAt: 1000 });
    await createSlice({ id: 'b', createdAt: 3000 });
    await createSlice({ id: 'c', createdAt: 2000 });
    expect((await listSlices()).map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('is empty with nothing stored', async () => {
    expect(await listSlices()).toEqual([]);
  });
});

describe('setSliceHidden', () => {
  it('toggles hidden while preserving other fields', async () => {
    await createSlice({ id: 's1', url: 'https://x/1.jpg', caption: 'nice', hidden: false, createdAt: 1 });
    const hidden = await setSliceHidden('s1', true);
    expect(hidden).toMatchObject({ id: 's1', url: 'https://x/1.jpg', caption: 'nice', hidden: true });
    const shown = await setSliceHidden('s1', false);
    expect(shown.hidden).toBe(false);
  });

  it('returns null for an unknown id', async () => {
    expect(await setSliceHidden('nope', true)).toBeNull();
  });
});

describe('deleteSlice', () => {
  it('removes the record from get and list', async () => {
    await createSlice({ id: 's1', createdAt: 1 });
    await deleteSlice('s1');
    expect(await getSlice('s1')).toBeNull();
    expect(await listSlices()).toEqual([]);
  });
});

describe('claimSliceQuota / releaseSliceQuota', () => {
  it('grants up to max, then refuses', async () => {
    expect(await claimSliceQuota('o1', 3)).toEqual({ ok: true, count: 1 });
    expect(await claimSliceQuota('o1', 3)).toEqual({ ok: true, count: 2 });
    expect(await claimSliceQuota('o1', 3)).toEqual({ ok: true, count: 3 });
    expect(await claimSliceQuota('o1', 3)).toEqual({ ok: false, count: 3 });
  });

  it('tracks quota independently per order', async () => {
    await claimSliceQuota('o1', 1);
    expect(await claimSliceQuota('o2', 1)).toEqual({ ok: true, count: 1 });
  });

  it('releasing a slot lets a later claim through again', async () => {
    await claimSliceQuota('o1', 1);
    expect(await claimSliceQuota('o1', 1)).toEqual({ ok: false, count: 1 });
    await releaseSliceQuota('o1');
    expect(await claimSliceQuota('o1', 1)).toEqual({ ok: true, count: 1 });
  });

  it('does not go negative when releasing an unclaimed order', async () => {
    await releaseSliceQuota('fresh-order');
    // Still grants the full 3 — an errant extra release must not manufacture
    // bonus quota for the next claimer.
    expect(await claimSliceQuota('fresh-order', 3)).toEqual({ ok: true, count: 1 });
    expect(await claimSliceQuota('fresh-order', 3)).toEqual({ ok: true, count: 2 });
    expect(await claimSliceQuota('fresh-order', 3)).toEqual({ ok: true, count: 3 });
  });

  it('floors at zero rather than going negative when released more than claimed', async () => {
    await claimSliceQuota('o1', 3); // count -> 1
    await releaseSliceQuota('o1');  // count -> 0
    await releaseSliceQuota('o1');  // one extra release; must not push it to -1
    // If it had gone negative, a claim would need to climb back through 0
    // first — count on the first claim below would come back as 0, not 1.
    expect(await claimSliceQuota('o1', 3)).toEqual({ ok: true, count: 1 });
    expect(await claimSliceQuota('o1', 3)).toEqual({ ok: true, count: 2 });
    expect(await claimSliceQuota('o1', 3)).toEqual({ ok: true, count: 3 });
    expect(await claimSliceQuota('o1', 3)).toEqual({ ok: false, count: 3 });
  });

  it('grants exactly max under concurrent claims (no double-grant race)', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => claimSliceQuota('race', 3)));
    const granted = results.filter((r) => r.ok);
    const refused = results.filter((r) => !r.ok);
    expect(granted).toHaveLength(3);
    expect(refused).toHaveLength(5);
    expect(new Set(granted.map((r) => r.count))).toEqual(new Set([1, 2, 3]));
  });
});
