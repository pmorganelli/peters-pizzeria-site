import { useCallback, useRef, useState } from 'react';
import { DOUGH_TYPES, MAX_DOUGH_BALLS } from '../utils/dough';

const blankDraft = () => Object.fromEntries(DOUGH_TYPES.map((type) => [type, '']));

// The admin board's dough boxes: the draft the staff type into, and the two
// actions that persist it. Lifted out of AdminPage for the same reason
// useTakedownRequests was — the board is already a large component and a panel
// that owns a draft, a sync rule and two save paths is a self-contained piece
// of it.
//
// The draft holds **strings, not numbers**, and that is the crux of it: '' is
// how the panel says "don't count this dough tonight", and a number-typed
// state cannot hold the difference between empty and zero. Zero balls means
// sold out; empty means sell without a limit. See src/utils/dough.js.
//
// `saveStore` is passed in rather than rebuilt here: it owns the poll-epoch
// bump and the 401 handling that every settings patch on the board shares. It
// resolves true when the save landed.
export function useDoughStock({ saveStore, onError }) {
  const [draft, setDraft] = useState(blankDraft);
  // Types staff have typed into since the last save. Only these boxes hold a
  // value worth protecting from the poll; every other box follows the server.
  const dirty = useRef(new Set());

  // Called with every poll. An untouched box tracks the server's count, and
  // that is load-bearing, not cosmetic: Save sends the whole map (an omitted
  // type means "stop counting"), so a box still showing what this tab saw at
  // load would write it back over whatever another device — or another tab's
  // close-the-night — has set since. Seeding once and never refreshing did
  // exactly that: a blank New York box on this tab untracked the 10 balls a
  // second device had just counted in. A box someone is typing into is left
  // alone, so the 5s poll can't eat a half-typed count mid-service.
  const sync = useCallback((dough) => {
    setDraft((current) => {
      let changed = false;
      const next = { ...current };
      for (const type of DOUGH_TYPES) {
        if (dirty.current.has(type)) continue;
        const server = dough?.[type] ? String(dough[type].balls) : '';
        if (next[type] !== server) { next[type] = server; changed = true; }
      }
      return changed ? next : current;
    });
  }, []);

  const edit = useCallback((type, value) => {
    dirty.current.add(type);
    setDraft((d) => ({ ...d, [type]: value }));
  }, []);

  // A blank box stays out of the patch entirely — an omitted dough type is how
  // the API is told to stop capping that one. Validated here as well as
  // server-side so a typo comes back instantly rather than as a round trip.
  const save = useCallback(async () => {
    const dough = {};
    for (const type of DOUGH_TYPES) {
      const raw = String(draft[type] ?? '').trim();
      if (raw === '') continue;
      const balls = Number(raw);
      if (!Number.isInteger(balls) || balls < 0 || balls > MAX_DOUGH_BALLS) {
        onError(`Dough counts must be whole numbers of balls, 0–${MAX_DOUGH_BALLS}.`);
        return;
      }
      dough[type] = balls;
    }
    // A refused save keeps the boxes dirty, so what staff typed survives the
    // next poll and they can correct it rather than retype it.
    if (await saveStore({ dough })) dirty.current.clear();
  }, [draft, onError, saveStore]);

  const stop = useCallback(async () => {
    dirty.current.clear();
    setDraft(blankDraft());
    await saveStore({ dough: {} });
  }, [saveStore]);

  // Closing the night clears the stock server-side, so the boxes come back to
  // blank with it — including any half-typed one, which was a count for the
  // night that just ended.
  const reset = useCallback(() => {
    dirty.current.clear();
    setDraft(blankDraft());
  }, []);

  return { draft, edit, sync, save, stop, reset };
}
