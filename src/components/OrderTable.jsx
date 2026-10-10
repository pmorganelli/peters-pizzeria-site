import { Fragment, useState } from 'react';
import { Check, Pencil, Undo2, X } from 'lucide-react';
import { OrderItemEditor } from './OrderItemEditor';
import { MENU_DATA } from '../data/menu';
import { ageLabel, displayName, fmtMoney, givenQty, groupOrderLines, orderProgress } from '../utils/orders';

const PIZZA_CATEGORY = MENU_DATA[0].category;
const ADDON_CATEGORY = MENU_DATA[1].category;

// The live board: one band per stage (new, in the oven, ready for pickup),
// oldest first within each — a queue reads top to bottom, and the order
// nearest to firing or pickup belongs at the top, not under whatever just
// came in. One <table> with a <tbody> per stage rather than three tables, so
// the columns line up down the whole board.
const STAGES = [
  { status: 'new', label: 'New', short: 'New', title: 'New orders', empty: 'Nothing waiting.' },
  { status: 'firing', label: 'In the oven', short: 'Oven', title: 'In the oven', empty: 'Oven’s empty.' },
  { status: 'ready', label: 'Ready', short: 'Ready', title: 'Ready for pickup', empty: 'Nothing waiting on the counter.' },
];

// Looks like plain text until you touch it. `draft` is null except while the
// field has focus, and that's what keeps the 5-second poll from clobbering a
// half-typed correction: while editing, the box shows the draft and ignores
// the server's copy; once it blurs it goes back to showing whatever the board
// says. Enter or leaving the field saves, Escape throws the edit away.
function EditableText({ value, onSave, label, placeholder, maxLength, required = false }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? value ?? '';

  const commit = () => {
    if (draft === null) return;
    const next = draft.replace(/\s+/g, ' ').trim();
    setDraft(null);
    if (next === (value ?? '') || (required && next.length < 2)) return;
    onSave(next);
  };

  return (
    <input
      className="ot-edit"
      value={shown}
      aria-label={label}
      placeholder={placeholder}
      maxLength={maxLength}
      size={1}
      onFocus={() => setDraft(value ?? '')}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { setDraft(null); requestAnimationFrame(() => e.target.blur()); }
      }}
    />
  );
}

// One slice per line, same-slice lines folded together (see groupOrderLines).
// Full view hangs the add-ons and variations on indented lines underneath;
// compact trails them on the same line so each slice stays one row tall.
const addonText = (labels) => `+ ${labels.join(', ')}`;

// Handing over part of an order. The tick gives out one more slice of this
// line; once any have gone, the count and a take-back appear beside it. One
// slice per tap rather than a whole line at once, because that is how they
// leave the window — and a line's last slice is no different from its first,
// so there is no separate "all of these" control to mis-hit.
//
// The tick leads the line, in a fixed gutter, so it reads as a checklist and
// the slice names still line up down the cell.
function Give({ order, item, what, onGive }) {
  const given = givenQty(item);
  return (
    <button
      type="button" className={`ot-give${given >= item.qty ? ' ot-give-all' : ''}`}
      disabled={given >= item.qty}
      aria-label={`Hand over one ${what} to ${order.name}`}
      onClick={() => onGive(order, item, given + 1)}
    >
      <Check size={12} />
    </button>
  );
}

function Given({ order, item, what, onGive }) {
  const given = givenQty(item);
  if (given === 0) return null;
  return (
    <span className="ot-given">
      <span className="ot-given-count">{item.qty === 1 ? 'given' : `${given} of ${item.qty} given`}</span>
      <button
        type="button" className="ot-take-back"
        aria-label={`Take back one ${what} from ${order.name}`}
        onClick={() => onGive(order, item, given - 1)}
      >
        <Undo2 size={11} />
      </button>
    </span>
  );
}

function Items({ order, compact, onGive }) {
  return (
    <ul className={`ot-items${compact ? ' ot-items-compact' : ''}`}>
      {groupOrderLines(order.items).map((g) => {
        const label = g.category === ADDON_CATEGORY ? `+ ${displayName(g.name)}` : g.name;
        // A slice split across add-on combinations is handed over per
        // combination — the one with hot honey is a particular slice — so the
        // ticks move down onto the variations and the heading only totals them.
        const details = g.variants.length > 0
          ? g.variants.map((v) => ({
            qty: v.qty, item: v.item, done: v.given >= v.qty,
            text: v.addons.length ? addonText(v.addons) : 'plain',
            what: v.addons.length ? `${g.name} ${addonText(v.addons)}` : `plain ${g.name}`,
          }))
          : g.addons.length > 0 ? [{ qty: null, text: addonText(g.addons) }] : [];
        return (
          <li key={g.name} className={`${g.category === PIZZA_CATEGORY ? 'ot-item-pizza' : ''}${g.given >= g.qty ? ' ot-line-done' : ''}`}>
            <span className="ot-line">
              {g.item ? <Give order={order} item={g.item} what={g.name} onGive={onGive} /> : <span className="ot-give-gap" aria-hidden="true" />}
              <span className="ot-slice">
                <span className="ot-qty">{g.qty}×</span> {label}
              </span>
              {g.item && <Given order={order} item={g.item} what={g.name} onGive={onGive} />}
            </span>
            {details.length > 0 && (
              <span className={`ot-details${g.variants.length > 0 ? ' ot-details-ticks' : ''}`}>
                {details.map((d) => (
                  <span key={d.text} className={`ot-detail-line${d.done ? ' ot-line-done' : ''}`}>
                    {d.item && <Give order={order} item={d.item} what={d.what} onGive={onGive} />}
                    <span className="ot-detail">
                      {d.qty !== null && <span className="ot-detail-qty">{d.qty}</span>} {d.text}
                    </span>
                    {d.item && <Given order={order} item={d.item} what={d.what} onGive={onGive} />}
                  </span>
                ))}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Data columns before Stage + actions — the band and editor rows span all.
const DATA_COLS_FULL = 4;
const DATA_COLS_COMPACT = 3;

// New / Oven / Ready as one control, so a row can go either way in one tap —
// an order fired by mistake goes straight back to New, a "ready" one that
// wasn't goes back in the oven. Picked up and cancel stay separate buttons:
// those two are final (the server refuses to move an order out of either).
function StageSwitch({ order, onMove }) {
  return (
    <div className="ot-switch" role="group" aria-label={`Stage for ${order.name}`}>
      {STAGES.map((s) => (
        <button
          key={s.status} type="button"
          className={`ot-stage-${s.status}${order.status === s.status ? ' active' : ''}`}
          aria-pressed={order.status === s.status}
          onClick={() => order.status !== s.status && onMove(order, s.status)}
        >
          {s.short}
        </button>
      ))}
    </div>
  );
}

export function OrderTable({ orders, view, soldOut = new Set(), onAdvance, onCancel, onEdit, onEditItems, onGive }) {
  const compact = view === 'compact';
  const [editingId, setEditingId] = useState(null);
  const cols = compact ? DATA_COLS_COMPACT : DATA_COLS_FULL;
  const groups = STAGES.map((s) => ({
    stage: s,
    rows: orders.filter((o) => o.status === s.status).sort((a, b) => a.createdAt - b.createdAt),
  }));

  return (
    <table className={`ot${compact ? ' ot-compact' : ''}`}>
      <thead>
        <tr>
          <th scope="col" className="ot-col-name">Name</th>
          <th scope="col">Order</th>
          {!compact && <th scope="col" className="ot-col-num">Total</th>}
          <th scope="col" className="ot-col-num">Age</th>
          <th scope="col">Stage</th>
          <th scope="col" aria-label="Actions" />
        </tr>
      </thead>
      {groups.map(({ stage, rows }) => (
        <tbody key={stage.status} className={`ot-group ot-stage-${stage.status}`}>
          <tr className="ot-group-head">
            <th scope="colgroup" colSpan={cols + 2}>
              <span className="ot-dot" aria-hidden="true" /> {stage.title} <span className="ot-group-count">{rows.length}</span>
            </th>
          </tr>
          {rows.length === 0 && (
            <tr className="ot-empty"><td colSpan={cols + 2}>{stage.empty}</td></tr>
          )}
          {rows.map((o) => {
            const editing = editingId === o.id;
            const progress = orderProgress(o.items);
            return (
              <Fragment key={o.id}>
                <tr className={`ot-row${editing ? ' ot-row-editing' : ''}${progress.partial ? ' ot-row-partial' : ''}`}>
                  <td className="ot-col-name">
                    <EditableText
                      value={o.name} label={`Name on this order (${stage.label})`}
                      maxLength={60} required onSave={(name) => onEdit(o, { name })}
                    />
                    {/* The row stays in its band — the band says where the
                        slices still owed are up to — so this is the only thing
                        that tells a part-collected order from a whole one. */}
                    {progress.partial && (
                      <div className="ot-partial">Partial · {progress.given} of {progress.total} given</div>
                    )}
                  </td>
                  <td className="ot-col-items">
                    <Items order={o} compact={compact} onGive={onGive} />
                    {/* Under the order rather than its own column: a note is
                        read with the order, and a column for it squeezed the
                        names down to a few letters. */}
                    {!compact && (
                      <div className="ot-notes">
                        <EditableText
                          value={o.notes} label={`Notes for ${o.name}`} placeholder="Add a note"
                          maxLength={280} onSave={(notes) => onEdit(o, { notes })}
                        />
                      </div>
                    )}
                  </td>
                  {!compact && <td className="ot-col-num ot-total">{fmtMoney(o.totalCents)}</td>}
                  <td className="ot-col-num ot-age">{ageLabel(o.createdAt)}</td>
                  <td className="ot-col-stage"><StageSwitch order={o} onMove={onAdvance} /></td>
                  <td className="ot-col-actions">
                    <div className="ot-actions">
                      {o.status === 'ready' && (
                        <button type="button" className="ot-done" onClick={() => onAdvance(o, 'done')}>
                          <Check size={12} /> Picked up
                        </button>
                      )}
                      <button
                        type="button" className="ot-icon-btn" aria-expanded={editing}
                        aria-label={`Change ${o.name}'s order`}
                        onClick={() => setEditingId(editing ? null : o.id)}
                      >
                        <Pencil size={12} />
                      </button>
                      {/* Not once anything has gone out: those slices can't
                          be un-sold, and the server refuses it too. Dropping
                          the rest is an edit, which completes the order. */}
                      {o.status === 'new' && progress.given === 0 && (
                        <button type="button" className="ot-icon-btn ot-cancel" aria-label={`Cancel ${o.name}'s order`} onClick={() => onCancel(o)}>
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {editing && (
                  <tr className="ot-editor-row">
                    <td colSpan={cols + 2}>
                      <OrderItemEditor
                        order={o} soldOut={soldOut}
                        onSave={(items) => onEditItems(o, items)}
                        onClose={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      ))}
    </table>
  );
}
