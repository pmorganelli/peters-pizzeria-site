import { beforeEach, describe, expect, it } from 'vitest';
import {
  readMine, writeMine, readHandoff, clearHandoff, readPosterName, writePosterName,
  deviceToken, formReducer, EMPTY_FORM,
} from './slices.js';

// A minimal Storage stand-in — Node has no global localStorage, and pulling
// in jsdom just for these four functions would be a heavier dependency than
// the thing being tested. See CLAUDE.md's Testing section.
function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

beforeEach(() => {
  globalThis.localStorage = makeLocalStorage();
});

describe('formReducer', () => {
  it('preparing clears a prior error and sets the flag', () => {
    const state = formReducer({ ...EMPTY_FORM, error: 'oops' }, { type: 'preparing' });
    expect(state.preparing).toBe(true);
    expect(state.error).toBe('');
  });

  it('picked stores the photo and clears preparing', () => {
    const state = formReducer({ ...EMPTY_FORM, preparing: true }, { type: 'picked', photo: { dataUrl: 'x' } });
    expect(state.preparing).toBe(false);
    expect(state.photo).toEqual({ dataUrl: 'x' });
  });

  it('pickFailed surfaces an error and clears preparing', () => {
    const state = formReducer({ ...EMPTY_FORM, preparing: true }, { type: 'pickFailed' });
    expect(state.preparing).toBe(false);
    expect(state.error).toMatch(/could not read/i);
  });

  it('clearPhoto drops only the photo', () => {
    const state = formReducer({ ...EMPTY_FORM, photo: { dataUrl: 'x' }, caption: 'hi' }, { type: 'clearPhoto' });
    expect(state.photo).toBeNull();
    expect(state.caption).toBe('hi');
  });

  it('caption updates just the caption field', () => {
    const state = formReducer(EMPTY_FORM, { type: 'caption', caption: 'best slice' });
    expect(state.caption).toBe('best slice');
  });

  it('submitting sets posting and clears error', () => {
    const state = formReducer({ ...EMPTY_FORM, error: 'oops' }, { type: 'submitting' });
    expect(state.posting).toBe(true);
    expect(state.error).toBe('');
  });

  it('posted clears photo and caption together and flips posted', () => {
    const state = formReducer(
      { ...EMPTY_FORM, posting: true, photo: { dataUrl: 'x' }, caption: 'hi' },
      { type: 'posted' },
    );
    expect(state.posting).toBe(false);
    expect(state.photo).toBeNull();
    expect(state.caption).toBe('');
    expect(state.posted).toBe(true);
  });

  it('failed stops posting and surfaces the given error', () => {
    const state = formReducer({ ...EMPTY_FORM, posting: true }, { type: 'failed', error: 'network down' });
    expect(state.posting).toBe(false);
    expect(state.error).toBe('network down');
  });

  it('postAnother resets the posted flag', () => {
    const state = formReducer({ ...EMPTY_FORM, posted: true }, { type: 'postAnother' });
    expect(state.posted).toBe(false);
  });

  it('an unknown action returns the same state reference unchanged', () => {
    expect(formReducer(EMPTY_FORM, { type: 'nonsense' })).toBe(EMPTY_FORM);
  });
});

describe('readMine / writeMine', () => {
  it('returns an empty set with nothing stored', () => {
    expect(readMine()).toEqual(new Set());
  });

  it('round-trips through writeMine', () => {
    writeMine(new Set(['a', 'b']));
    expect(readMine()).toEqual(new Set(['a', 'b']));
  });

  it('tolerates malformed JSON', () => {
    localStorage.setItem('pp_slice_mine:v1', '{not json');
    expect(readMine()).toEqual(new Set());
  });

  it('tolerates valid JSON that is not an array', () => {
    localStorage.setItem('pp_slice_mine:v1', JSON.stringify({ a: 1 }));
    expect(readMine()).toEqual(new Set());
  });
});

describe('readHandoff / clearHandoff', () => {
  it('returns an empty name with nothing stored', () => {
    expect(readHandoff()).toEqual({ name: '' });
  });

  it('parses the {name} shape the order card writes', () => {
    localStorage.setItem('pp_slice_who:v1', JSON.stringify({ name: 'Jamie' }));
    expect(readHandoff()).toEqual({ name: 'Jamie' });
  });

  it('fills in a missing name with an empty string', () => {
    localStorage.setItem('pp_slice_who:v1', JSON.stringify({}));
    expect(readHandoff()).toEqual({ name: '' });
  });

  it('tolerates a stored value that is not valid JSON', () => {
    localStorage.setItem('pp_slice_who:v1', 'not json');
    expect(readHandoff()).toEqual({ name: '' });
  });

  it('tolerates a stored value that parses as a JSON primitive', () => {
    localStorage.setItem('pp_slice_who:v1', '1234');
    expect(readHandoff()).toEqual({ name: '' });
  });

  it('clearHandoff removes the key', () => {
    localStorage.setItem('pp_slice_who:v1', JSON.stringify({ name: 'Jamie' }));
    clearHandoff();
    expect(readHandoff()).toEqual({ name: '' });
  });

  // The key was renamed when the pickup code came out of it. A confirmation
  // screen left open across the deploy is the one thing that can still write
  // the old name, so the same pass that clears the new key clears that too —
  // otherwise it sits in storage for good.
  it('clearHandoff also removes the pre-rename key', () => {
    localStorage.setItem('pp_slice_code:v1', JSON.stringify({ code: 'F4WS', name: 'Jamie' }));
    clearHandoff();
    expect(localStorage.getItem('pp_slice_code:v1')).toBeNull();
  });
});

describe('readPosterName / writePosterName', () => {
  it('returns an empty string before anything has been posted', () => {
    expect(readPosterName()).toBe('');
  });

  it('round-trips a name', () => {
    writePosterName('Jamie');
    expect(readPosterName()).toBe('Jamie');
  });

  // Clearing the field is how you go anonymous, so an empty value has to
  // stick. Skipping the write would helpfully re-attach the name you just
  // removed on the next visit.
  it('remembers a cleared name rather than falling back to the old one', () => {
    writePosterName('Jamie');
    writePosterName('');
    expect(readPosterName()).toBe('');
  });
});

describe('deviceToken', () => {
  it('generates a 32-char hex token and persists it', () => {
    const token = deviceToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(localStorage.getItem('pp_slice_device:v1')).toBe(token);
  });

  it('returns the same token on subsequent calls', () => {
    const first = deviceToken();
    const second = deviceToken();
    expect(second).toBe(first);
  });
});
