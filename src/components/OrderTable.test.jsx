// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../tests/helpers/dom.jsx';
import { OrderTable } from './OrderTable';
import { MENU_DATA } from '../data/menu';

const SLICE = MENU_DATA[0].items[0];
const line = { name: SLICE.name, category: MENU_DATA[0].category, priceCents: 500, qty: 2 };
const order = (over = {}) => ({
  id: 'o1', code: 'ABCD', name: 'Sam', notes: '', status: 'new', items: [line], totalCents: 1000,
  createdAt: Date.now() - 5 * 60000, ...over,
});

const renderTable = (props = {}) => {
  const onEdit = vi.fn();
  const utils = render(
    <OrderTable orders={[order()]} view="full" onAdvance={vi.fn()} onCancel={vi.fn()} onEdit={onEdit} {...props} />,
  );
  return { ...utils, onEdit };
};

describe('OrderTable', () => {
  it('never shows the pickup code', () => {
    renderTable();
    expect(screen.queryByText(/ABCD/)).toBeNull();
    expect(screen.getByText(SLICE.name)).toBeTruthy();
  });

  it('saves an edited name on Enter, cleaned of stray spaces', async () => {
    const { onEdit } = renderTable();
    const name = screen.getByRole('textbox', { name: /name on this order/i });
    await userEvent.clear(name);
    await userEvent.type(name, '  Sam   Jones {Enter}');
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }), { name: 'Sam Jones' });
  });

  it('does not save an untouched field, a too-short name, or an edit thrown away with Escape', async () => {
    const { onEdit } = renderTable();
    const name = screen.getByRole('textbox', { name: /name on this order/i });
    await userEvent.click(name);
    await userEvent.tab();
    await userEvent.clear(name);
    await userEvent.type(name, 'S{Enter}');
    await userEvent.type(name, 'xyz{Escape}');
    expect(onEdit).not.toHaveBeenCalled();
    expect(name.value).toBe('Sam');
  });

  it('keeps a half-typed edit when a poll brings new data mid-edit', async () => {
    const props = { onAdvance: vi.fn(), onCancel: vi.fn(), onEdit: vi.fn(), view: 'full' };
    const { rerender } = render(<OrderTable orders={[order()]} {...props} />);
    const notes = screen.getByRole('textbox', { name: /notes for sam/i });
    await userEvent.type(notes, 'no bas');
    rerender(<OrderTable orders={[order({ status: 'new', notes: '' })]} {...props} />);
    expect(notes.value).toBe('no bas');
    await userEvent.type(notes, 'il{Enter}');
    expect(props.onEdit).toHaveBeenCalledWith(expect.anything(), { notes: 'no basil' });
  });

  it('compact view drops notes and total but keeps name, order, age and actions', () => {
    renderTable({ view: 'compact' });
    expect(screen.queryByRole('textbox', { name: /notes/i })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /total/i })).toBeNull();
    expect(screen.getByRole('textbox', { name: /name on this order/i })).toBeTruthy();
    expect(screen.getByText('5m')).toBeTruthy();
    expect(screen.getByRole('group', { name: /stage for sam/i })).toBeTruthy();
  });

  it('splits the board into three labelled stages, each with its own count', () => {
    const now = Date.now();
    renderTable({
      orders: [
        order({ id: 'a', status: 'ready', createdAt: now }),
        order({ id: 'b', status: 'new', createdAt: now }),
        order({ id: 'c', status: 'new', createdAt: now }),
      ],
    });
    const heads = screen.getAllByRole('columnheader').filter((th) => th.getAttribute('scope') === 'colgroup');
    expect(heads.map((th) => th.textContent.replace(/\s+/g, ' ').trim())).toEqual(['New orders 2', 'In the oven 0', 'Ready for pickup 1']);
    expect(screen.getByText('Oven’s empty.')).toBeTruthy();
  });

  it('moves an order backwards as easily as forwards, and not onto the stage it is already in', async () => {
    const onAdvance = vi.fn();
    renderTable({ orders: [order({ status: 'ready' })], onAdvance });
    const stage = screen.getByRole('group', { name: /stage for sam/i });
    const [neu, oven, ready] = stage.querySelectorAll('button');
    expect(ready.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(ready);
    await userEvent.click(oven);
    await userEvent.click(neu);
    expect(onAdvance.mock.calls.map(([, s]) => s)).toEqual(['firing', 'new']);
    await userEvent.click(screen.getByRole('button', { name: /picked up/i }));
    expect(onAdvance).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'o1' }), 'done');
  });

  it('offers Picked up only on ready orders and cancel only on new ones', () => {
    renderTable({ orders: [order({ id: 'n', name: 'Nia', status: 'new' }), order({ id: 'f', name: 'Fay', status: 'firing' })] });
    expect(screen.queryByRole('button', { name: /picked up/i })).toBeNull();
    expect(screen.getByRole('button', { name: /cancel nia/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /cancel fay/i })).toBeNull();
  });

  it('puts each slice on its own line and folds a slice split by add-ons into one count', () => {
    const OTHER = MENU_DATA[0].items[1];
    const ADDON = MENU_DATA[1].items[0];
    const withAddon = { ...line, qty: 1, addons: [{ name: ADDON.name, priceCents: 100 }] };
    const other = { ...line, name: OTHER.name, qty: 1 };
    for (const view of ['full', 'compact']) {
      const { unmount } = renderTable({ view, orders: [order({ items: [line, other, withAddon] })] });
      const rows = screen.getAllByRole('listitem');
      expect(rows).toHaveLength(2);
      expect(rows[0].querySelector('.ot-slice').textContent).toBe(`3× ${SLICE.name}`);
      expect([...rows[0].querySelectorAll('.ot-detail')].map((d) => d.textContent.trim()))
        .toEqual(['2 plain', expect.stringMatching(/^1 \+ /)]);
      expect(rows[1].querySelector('.ot-slice').textContent).toBe(`1× ${OTHER.name}`);
      unmount();
    }
  });

  it('lists new before in-the-oven before ready, oldest first within each', () => {
    const now = Date.now();
    renderTable({
      orders: [
        order({ id: 'a', name: 'Ready One', status: 'ready', createdAt: now - 60000 }),
        order({ id: 'b', name: 'New Late', status: 'new', createdAt: now - 1000 }),
        order({ id: 'c', name: 'Firing', status: 'firing', createdAt: now - 90000 }),
        order({ id: 'd', name: 'New Early', status: 'new', createdAt: now - 120000 }),
        order({ id: 'e', name: 'Gone', status: 'done', createdAt: now }),
      ],
    });
    const names = screen.getAllByRole('textbox', { name: /name on this order/i }).map((el) => el.value);
    expect(names).toEqual(['New Early', 'New Late', 'Firing', 'Ready One']);
  });
});

describe('changing an order', () => {
  const SECOND = MENU_DATA[0].items[1];
  const ADDON = MENU_DATA[1].items[0];

  it('has two slices and an add-on to edit with', () => {
    expect(SECOND).toBeDefined();
    expect(ADDON).toBeDefined();
  });

  const open = async (props = {}) => {
    const onEditItems = vi.fn(async () => ({}));
    renderTable({ onEditItems, ...props });
    await userEvent.click(screen.getByRole('button', { name: /change sam's order/i }));
    return onEditItems;
  };

  it('sends the changed lines — quantity, a new slice, an add-on — and closes on success', async () => {
    const onEditItems = await open();
    await userEvent.click(screen.getByRole('button', { name: `One less ${SLICE.name}` }));
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^\\+?\\s*${SECOND.name}`) }));
    const lines = screen.getAllByRole('listitem').filter((li) => li.classList.contains('oe-line'));
    await userEvent.click(lines[1].querySelector('.oe-chip'));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(onEditItems).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }), [
      { name: SLICE.name, qty: 1 },
      { name: SECOND.name, qty: 1, addons: [ADDON.name] },
    ]);
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
  });

  it('folds lines that end up identical into one, since the server refuses duplicates', async () => {
    const onEditItems = await open();
    const addSecond = () => userEvent.click(screen.getByRole('button', { name: new RegExp(`^\\+?\\s*${SECOND.name}`) }));
    const lineChip = (n) => screen.getAllByRole('listitem').filter((li) => li.classList.contains('oe-line'))[n].querySelector('.oe-chip');
    // Second slice with an add-on, then a plain one (a separate line), then
    // take the add-on back off the first — two identical plain lines.
    await addSecond();
    await userEvent.click(lineChip(1));
    await addSecond();
    await userEvent.click(lineChip(1));
    expect(screen.getAllByRole('listitem').filter((li) => li.classList.contains('oe-line'))).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(onEditItems.mock.calls[0][1]).toEqual([{ name: SLICE.name, qty: 2 }, { name: SECOND.name, qty: 2 }]);
  });

  it('keeps the editor open with the server\'s reason when a change is refused', async () => {
    await open({ onEditItems: vi.fn(async () => ({ error: 'Only 1 New York slice left tonight' })) });
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(screen.getByRole('alert').textContent).toMatch(/only 1/i);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeTruthy();
  });

  it('won\'t add a sold-out slice, but leaves one already on the order alone', async () => {
    await open({ soldOut: new Set([SLICE.name, SECOND.name]) });
    expect(screen.getByRole('button', { name: new RegExp(`${SECOND.name}.*sold out`) }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: `One more ${SLICE.name}` }).disabled).toBe(false);
  });

  it('never sends anything when you back out', async () => {
    const onEditItems = await open();
    await userEvent.click(screen.getByRole('button', { name: `One more ${SLICE.name}` }));
    await userEvent.click(screen.getByRole('button', { name: /never mind/i }));
    expect(onEditItems).not.toHaveBeenCalled();
  });
});
