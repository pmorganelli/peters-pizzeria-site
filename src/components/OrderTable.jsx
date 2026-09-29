import { Fragment, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { OrderItemEditor } from './OrderItemEditor';
import { MENU_DATA } from '../data/menu';
import { ageLabel, displayName, fmtMoney, groupOrderLines } from '../utils/orders';

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

export const BOARD_VIEWS = ['full', 'compact'];


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

function Items({ items, compact }) {
  return (
    <ul className={`ot-items${compact ? ' ot-items-compact' : ''}`}>
      {groupOrderLines(items).map((g) => {
        const details = g.variants.length > 0
          ? g.variants.map((v) => ({ qty: v.qty, text: v.addons.length ? addonText(v.addons) : 'plain' }))
          : g.addons.length > 0 ? [{ qty: null, text: addonText(g.addons) }] : [];
        return (
          <li key={g.name} className={g.category === PIZZA_CATEGORY ? 'ot-item-pizza' : undefined}>
            <span className="ot-slice">
              <span className="ot-qty">{g.qty}×</span> {g.category === ADDON_CATEGORY ? `+ ${displayName(g.name)}` : g.name}
            </span>
            {details.length > 0 && (
              <span className="ot-details">
                {details.map((d) => (
                  <span key={d.text} className="ot-detail">
                    {d.qty !== null && <span className="ot-detail-qty">{d.qty}</span>} {d.text}
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

export function OrderTable({ orders, view, soldOut = new Set(), onAdvance, onCancel, onEdit, onEditItems }) {
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
            return (
              <Fragment key={o.id}>
                <tr className={`ot-row${editing ? ' ot-row-editing' : ''}`}>
                  <td className="ot-col-name">
                    <EditableText
                      value={o.name} label={`Name on this order (${stage.label})`}
                      maxLength={60} required onSave={(name) => onEdit(o, { name })}
                    />
                  </td>
                  <td className="ot-col-items">
                    <Items items={o.items} compact={compact} />
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
                      {o.status === 'new' && (
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
