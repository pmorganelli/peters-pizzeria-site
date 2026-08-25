// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { markChunkLoaded, shouldReloadForChunkFailure } from './chunkReload';

describe('chunk reload guard', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('grants the retry on the first failure and refuses it after', () => {
    expect(shouldReloadForChunkFailure()).toBe(true);
    // The reload it just authorized may not happen (a slow tab teardown, a
    // second chunk failing in the same tick). Every later ask must still be
    // refused, or the page reload-loops on a genuinely broken chunk.
    expect(shouldReloadForChunkFailure()).toBe(false);
    expect(shouldReloadForChunkFailure()).toBe(false);
  });

  it('re-arms once a chunk loads, so a later deploy gets its own retry', () => {
    expect(shouldReloadForChunkFailure()).toBe(true);
    markChunkLoaded();
    expect(shouldReloadForChunkFailure()).toBe(true);
  });

  it('never authorizes a reload when storage is unavailable', () => {
    // Private mode / blocked site data: the flag can't be written, so a
    // reload would have nothing holding it back.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(shouldReloadForChunkFailure()).toBe(false);
    expect(() => markChunkLoaded()).not.toThrow();
  });
});
