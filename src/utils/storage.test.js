// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readStored, writeStored, removeStored, readStoredJSON, writeStoredJSON } from './storage';
import { deviceToken, readMine, writeMine, readPosterName, writePosterName } from './slices';

// Safari with "Block All Cookies" throws a SecurityError from the
// `localStorage` *getter* — before any method is called — and a full quota
// throws from setItem. Both are settings a customer can be sitting on at the
// window, and before this wrapper either one took the page down: the app
// touches storage during mount, so the throw escaped an effect into the
// ErrorBoundary.
function blockStorageEntirely() {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
  });
}

function blockWritesOnly() {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: () => { throw new DOMException('exceeded the quota', 'QuotaExceededError'); },
      removeItem: () => {},
    },
  });
}

let realStorage;
beforeEach(() => {
  realStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  // The wrapper warns once per page load about an unreadable store; that's
  // deliberate, so the console guard has to be told to expect it.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  if (realStorage) Object.defineProperty(globalThis, 'localStorage', realStorage);
  vi.restoreAllMocks();
});

describe('storage with localStorage unreachable', () => {
  it('reads and writes without throwing', () => {
    blockStorageEntirely();
    expect(() => writeStored('k', 'v')).not.toThrow();
    expect(() => removeStored('k')).not.toThrow();
    expect(() => readStored('nothing')).not.toThrow();
  });

  it('still serves a value back within the session', () => {
    // Not persistence — the point is that the visit works. A cart built and
    // submitted in one sitting must not depend on the disk.
    blockStorageEntirely();
    writeStored('pp_test', 'kept');
    expect(readStored('pp_test')).toBe('kept');
    writeStoredJSON('pp_test_json', { a: 1 });
    expect(readStoredJSON('pp_test_json')).toEqual({ a: 1 });
  });

  it('survives a store that reads fine but refuses writes', () => {
    blockWritesOnly();
    expect(() => writeStored('pp_test', 'v')).not.toThrow();
    expect(readStored('pp_test')).toBe('v');
  });

  it('returns the fallback for a missing key and for malformed JSON', () => {
    writeStored('pp_bad', '{not json');
    expect(readStoredJSON('pp_bad', 'fallback')).toBe('fallback');
    expect(readStoredJSON('pp_absent', 'fallback')).toBe('fallback');
  });
});

describe('the community wall on a browser that blocks storage', () => {
  // Posting *requires* a device token now — it's what the per-device photo cap
  // is counted on, and the server 400s a post without one. So this is the
  // difference between a working wall and one nobody on that browser can use.
  it('still mints a usable device token', () => {
    blockStorageEntirely();
    const token = deviceToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    // And the same one for the rest of the session, or a photo posted a minute
    // ago would stop being deletable by the device that posted it.
    expect(deviceToken()).toBe(token);
  });

  it('keeps the rest of the composer state working', () => {
    blockStorageEntirely();
    expect(() => writeMine(new Set(['s1']))).not.toThrow();
    expect(readMine().has('s1')).toBe(true);
    writePosterName('Jamie');
    expect(readPosterName()).toBe('Jamie');
  });
});

describe('the in-memory fallback stays out of the way', () => {
  // It exists for browsers where a write failed. Letting it answer for keys the
  // real store handles would make it a second source of truth — and one that
  // survives the store being cleared, so a value would come back from the dead.
  it('does not answer for a key the real store can hold', () => {
    writeStored('pp_real', 'first');
    globalThis.localStorage.clear();
    expect(readStored('pp_real')).toBeNull();
  });

  it('stops answering once a write finally lands', () => {
    blockWritesOnly();
    writeStored('pp_flaky', 'from-memory');
    expect(readStored('pp_flaky')).toBe('from-memory');

    // Storage comes back (a quota freed up, a setting changed mid-session).
    Object.defineProperty(globalThis, 'localStorage', realStorage);
    writeStored('pp_flaky', 'from-disk');
    globalThis.localStorage.clear();
    expect(readStored('pp_flaky')).toBeNull();
  });
});
