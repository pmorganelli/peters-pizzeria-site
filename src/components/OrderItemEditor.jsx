import { useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { MENU_DATA } from '../data/menu';
import { DEFAULT_MAX_QTY, addonLabel, displayName, fmtMoney, givenQty, parsePriceCents } from '../utils/orders';

const SLICES = MENU_DATA[0].items;
const ADDONS = MENU_DATA[1].items;
const PRICE = new Map(MENU_DATA.flatMap((s) => s.items.map((it) => [it.name, parsePriceCents(it.price)])));
const MAX_QTY = new Map(SLICES.map((it) => [it.name, it.maxQty ?? DEFAULT_MAX_QTY]));

const lineKey = (l) => `${l.name}::${[...l.addons].sort().join(',')}`;

// Lines that ended up identical (same slice, same add-ons) fold into one —
// the server refuses two lines with the same key, and a staffer toggling
// add-ons around shouldn't have to notice they've made a duplicate.
export function mergeLines(lines) {
  const byKey = new Map();
  for (const l of lines) {
    if (l.qty < 1) continue;
    const key = lineKey(l);
    const prev = byKey.get(key);
    if (prev) prev.qty += l.qty;
    else byKey.set(key, { name: l.name, qty: l.qty, addons: [...l.addons] });
  }
  return [...byKey.values()];
}

// A preview only — the server re-prices from the same menu on save, and its
// total is the one that's stored.
const previewCents = (lines) =>
  lines.reduce((sum, l) => sum + ((PRICE.get(l.name) ?? 0) + l.addons.reduce((a, n) => a + (PRICE.get(n) ?? 0), 0)) * l.qty, 0);

// Changing what a customer ordered, in place under their row. Edits are local
// until Save, so the 5-second poll can't reset them, and nothing is sent until
// the staffer means it — a half-edited order must never reach the kitchen.
//
// Slices already handed over are split off into their own locked rows and only
// what's still owed is editable. That keeps the two from being edited as one:
// with "2 of 3 given" on a single stepper, toggling an add-on would re-describe
// slices the customer has already eaten, and the server would refuse the save
// for taking them off the order. Both halves are snapshotted when the editor
// opens — a hand-over on another device mid-edit can't shift the rows under
// the staffer's fingers, and the server has the final say on save either way.
export function OrderItemEditor({ order, soldOut, onSave, onClose }) {
  const [held] = useState(() =>
    order.items.filter((it) => givenQty(it) > 0)
      .map((it) => ({ name: it.name, qty: givenQty(it), addons: (it.addons ?? []).map((a) => a.name) })));
  const [lines, setLines] = useState(() =>
    order.items.filter((it) => it.qty > givenQty(it))
      .map((it) => ({ name: it.name, qty: it.qty - givenQty(it), addons: (it.addons ?? []).map((a) => a.name) })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // What the order already had can stay even if it's been 86'd since; only
  // adding something sold out is refused (same rule as the server).
  const had = new Set(order.items.flatMap((it) => [it.name, ...(it.addons ?? []).map((a) => a.name)]));
  const blocked = (name) => soldOut.has(name) && !had.has(name);
  const totalOf = (name) => [...held, ...lines].filter((l) => l.name === name).reduce((sum, l) => sum + l.qty, 0);
  const atCap = (name) => totalOf(name) >= (MAX_QTY.get(name) ?? DEFAULT_MAX_QTY);

  const update = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const remove = (i) => setLines((ls) => ls.filter((_, j) => j !== i));
  const toggleAddon = (i, name) => {
    const { addons } = lines[i];
    update(i, { addons: addons.includes(name) ? addons.filter((a) => a !== name) : [...addons, name] });
  };
  const addSlice = (name) => {
    const plain = lines.findIndex((l) => l.name === name && l.addons.length === 0);
    if (plain >= 0) update(plain, { qty: lines[plain].qty + 1 });
    else setLines((ls) => [...ls, { name, qty: 1, addons: [] }]);
  };

  const merged = mergeLines([...held, ...lines]);
  // Nothing left to make: the customer is leaving with what they already have.
  const closesOrder = held.length > 0 && lines.length === 0;

  const save = async () => {
    setBusy(true);
    setError('');
    const result = await onSave(merged.map((l) => (l.addons.length ? l : { name: l.name, qty: l.qty })));
    setBusy(false);
    if (result?.error) setError(result.error);
    else onClose();
  };

  return (
    <div className="oe" role="group" aria-label={`Change ${order.name}'s order`}>
      <ul className="oe-lines">
        {held.map((l) => (
          <li key={`held:${lineKey(l)}`} className="oe-line oe-line-held">
            <span className="oe-held-qty">{l.qty}×</span>
            <span className="oe-name">
              {l.name}
              {l.addons.length > 0 && <span className="oe-held-addons"> + {l.addons.map((a) => addonLabel(a, l.name)).join(', ')}</span>}
            </span>
            <span className="oe-held-tag">Handed over</span>
          </li>
        ))}
        {lines.map((l, i) => (
          // Lines are reordered only by being appended or removed, and two
          // lines can briefly share a name+add-on key mid-edit, so position is
          // the only identity that stays unique here.
          // eslint-disable-next-line react/no-array-index-key
          <li key={i} className="oe-line">
            <div className="oe-line-main">
              <div className="oe-stepper">
                <button type="button" aria-label={`One less ${l.name}`} disabled={l.qty <= 1} onClick={() => update(i, { qty: l.qty - 1 })}>
                  <Minus size={12} />
                </button>
                <span className="oe-qty" aria-live="polite">{l.qty}</span>
                <button type="button" aria-label={`One more ${l.name}`} disabled={atCap(l.name)} onClick={() => update(i, { qty: l.qty + 1 })}>
                  <Plus size={12} />
                </button>
              </div>
              <span className="oe-name">{l.name}</span>
              <button type="button" className="oe-remove" aria-label={`Remove ${l.name}`} disabled={lines.length === 1 && held.length === 0} onClick={() => remove(i)}>
                <X size={13} />
              </button>
            </div>
            <div className="oe-addons">
              {ADDONS.map((a) => {
                const on = l.addons.includes(a.name);
                return (
                  <button
                    type="button" key={a.name}
                    className={`oe-chip${on ? ' oe-chip-on' : ''}`}
                    aria-pressed={on}
                    disabled={!on && blocked(a.name)}
                    onClick={() => toggleAddon(i, a.name)}
                  >
                    {addonLabel(a.name, l.name)}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <div className="oe-add">
        <span className="oe-add-label">Add a slice</span>
        {SLICES.map((s) => (
          <button type="button" key={s.name} className="oe-chip" disabled={blocked(s.name) || atCap(s.name)} onClick={() => addSlice(s.name)}>
            <Plus size={11} /> {displayName(s.name)}{blocked(s.name) ? ' — sold out' : ''}
          </button>
        ))}
      </div>
      {closesOrder && (
        <div className="oe-note" role="status">Nothing left to make — saving marks this order picked up.</div>
      )}
      {error && <div className="order-error oe-error" role="alert">{error}</div>}
      <div className="oe-foot">
        <span className="oe-total">
          New total <strong>{fmtMoney(previewCents(merged))}</strong>
          {previewCents(merged) !== order.totalCents && <span className="oe-was"> (was {fmtMoney(order.totalCents)})</span>}
        </span>
        <button type="button" className="oe-cancel" onClick={onClose} disabled={busy}>Never mind</button>
        <button type="button" className="oe-save" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  );
}
