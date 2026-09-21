import { useCallback, useRef, useState } from 'react';
import { DOUGH_TYPES, MAX_DOUGH_BALLS } from '../utils/dough';

const blankDraft = () => Object.fromEntries(DOUGH_TYPES.map((type) => [type, '']));

// The admin board's dough boxes: the draft the staff type into, and the two
// actions that persist it. Lifted out of AdminPage for the same reason
// useTakedownRequests was — the board is already a large component and a panel
// that owns a draft, a seed-once rule and two save paths is a self-contained
// piece of it.
//
// The draft holds **strings, not numbers**, and that is the crux of it: '' is
// how the panel says "don't count this dough tonight", and a number-typed
// state cannot hold the difference between empty and zero. Zero balls means
// sold out; empty means sell without a limit. See src/utils/dough.js.
//
// `saveStore` is passed in rather than rebuilt here: it owns the poll-epoch
// bump and the 401 handling that every settings patch on the board shares.
export function useDoughStock({ saveStore, onError }) {
  const [draft, setDraft] = useState(blankDraft);
  const seeded = useRef(false);

  // Seeded once from the first poll that lands, then left alone — the 5s poll
  // must not overwrite a half-typed count mid-service. The readout beside the
  // boxes is fed straight from `storeInfo` and does keep updating, which is
  // the part that has to stay live.
  const seed = useCallback((dough) => {
    if (seeded.current) return;
    seeded.current = true;
    setDraft(Object.fromEntries(
      DOUGH_TYPES.map((type) => [type, dough?.[type] ? String(dough[type].balls) : ''])));
  }, []);

  // A blank box stays out of the patch entirely — an omitted dough type is how
  // the API is told to stop capping that one. Validated here as well as
  // server-side so a typo comes back instantly rather than as a round trip.
  const save = useCallback(() => {
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
    saveStore({ dough });
  }, [draft, onError, saveStore]);

  const stop = useCallback(() => {
    setDraft(blankDraft());
    saveStore({ dough: {} });
  }, [saveStore]);

  return { draft, setDraft, seed, save, stop };
}
