// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, mockFetch } from '../../tests/helpers/dom.jsx';
import { StatusPage } from './StatusPage';
import { MENU_DATA } from '../data/menu';
import { parsePriceCents } from '../utils/orders';

// Derived, never typed — a test naming a slice the menu no longer sells fails
// for a reason that has nothing to do with what it's checking.
const SLICE = MENU_DATA[0].items[0];
const CENTS = parsePriceCents(SLICE.price);

const line = (qty) => ({ name: SLICE.name, category: MENU_DATA[0].category, priceCents: CENTS, qty });

const order = (id, code, qty) => ({
  id,
  code,
  name: 'Sam',
  items: [line(qty)],
  totalCents: CENTS * qty,
  status: 'new',
  createdAt: Date.now() - 60_000,
  updatedAt: Date.now() - 60_000,
});

// What the server returns for a name with more than one live order: enough to
// recognise your own, and deliberately no pickup code.
const summary = (o) => ({
  id: o.id, status: o.status, createdAt: o.createdAt, items: o.items, totalCents: o.totalCents,
});

const TWO = [order('o-one', 'AA22', 1), order('o-two', 'BB33', 3)];

function mountWith(routes) {
  mockFetch({ '/api/orders': { body: {} }, ...routes });
  return render(<StatusPage nav={vi.fn()} isAdmin={false} />);
}

beforeEach(() => {
  localStorage.clear();
});

describe('StatusPage lookup', () => {
  it('asks for a pickup code or a name in one field', () => {
    mountWith({});
    expect(screen.getByText(/pickup code or name/i)).toBeTruthy();
  });

  // Ordering is staff-only, so a customer is never sent to /order from here —
  // the line about opening hours that used to sit under the form is gone.
  it('offers a visitor no ordering copy under the form', () => {
    mountWith({});
    expect(screen.queryByText(/we're open/i)).toBeNull();
    expect(screen.queryByText(/no order yet/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /take an order/i })).toBeNull();
  });

  it('finds a single order straight away without a picker', async () => {
    mountWith({ '/api/orders?find=': { body: { order: TWO[0] } } });
    fireEvent.change(screen.getByPlaceholderText(/or the name you gave us/i), { target: { value: 'sam' } });
    fireEvent.click(screen.getByRole('button', { name: /find my order/i }));
    await waitFor(() => expect(screen.getByText(`#${TWO[0].code}`)).toBeTruthy());
  });

  it('lets the customer pick their own when a name ties', async () => {
    const fetchSpy = mockFetch({
      '/api/orders': { body: {} },
      '/api/orders?find=': { body: { matches: TWO.map(summary) } },
      '/api/orders?id=': { body: { order: TWO[1] } },
    });
    render(<StatusPage nav={vi.fn()} isAdmin={false} />);

    fireEvent.change(screen.getByPlaceholderText(/or the name you gave us/i), { target: { value: 'sam' } });
    fireEvent.click(screen.getByRole('button', { name: /find my order/i }));

    await waitFor(() => expect(screen.getByText(/which one is yours/i)).toBeTruthy());
    const rows = document.querySelectorAll('.status-match');
    expect(rows).toHaveLength(2);
    // The rows have to be tellable apart, or picking is a coin flip — the
    // quantities differ, so the item summaries must too.
    expect(rows[0].textContent).not.toBe(rows[1].textContent);

    fireEvent.click(rows[1]);
    await waitFor(() => expect(screen.getByText(`#${TWO[1].code}`)).toBeTruthy());
    // The summaries carry no code, so the real order has to come from ?id=.
    expect(fetchSpy.mock.calls.some(([url]) => url.includes(`id=${TWO[1].id}`))).toBe(true);
    expect(localStorage.getItem('pp_order_id')).toBe(TWO[1].id);
  });

  it('does not leave the lookup form up while the picked order loads', async () => {
    let release;
    mockFetch({
      '/api/orders': { body: {} },
      '/api/orders?find=': { body: { matches: TWO.map(summary) } },
      '/api/orders?id=': () => new Promise((resolve) => { release = () => resolve({ body: { order: TWO[0] } }); }),
    });
    render(<StatusPage nav={vi.fn()} isAdmin={false} />);
    fireEvent.change(screen.getByPlaceholderText(/or the name you gave us/i), { target: { value: 'sam' } });
    fireEvent.click(screen.getByRole('button', { name: /find my order/i }));
    await waitFor(() => expect(document.querySelectorAll('.status-match')).toHaveLength(2));

    fireEvent.click(document.querySelectorAll('.status-match')[0]);
    // Neither the picker nor the form: the gap between picking and the order
    // arriving must not flash the search back up.
    await waitFor(() => expect(document.querySelector('.status-match')).toBeNull());
    expect(screen.queryByRole('button', { name: /find my order/i })).toBeNull();

    release();
    await waitFor(() => expect(screen.getByText(`#${TWO[0].code}`)).toBeTruthy());
  });

  it('surfaces a miss as an error rather than an empty picker', async () => {
    mountWith({ '/api/orders?find=': { status: 404, body: { error: 'No order under that pickup code or name — double-check it, or it may have expired.' } } });
    fireEvent.change(screen.getByPlaceholderText(/or the name you gave us/i), { target: { value: 'nobody' } });
    fireEvent.click(screen.getByRole('button', { name: /find my order/i }));
    await waitFor(() => expect(screen.getByText(/no order under that pickup code or name/i)).toBeTruthy());
    expect(document.querySelector('.status-match')).toBeNull();
  });
});
