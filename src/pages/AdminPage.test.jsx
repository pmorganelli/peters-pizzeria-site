// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within, mockFetch } from '../../tests/helpers/dom.jsx';
import { AdminPage } from './AdminPage';
import { MENU_DATA } from '../data/menu';

// Derived, never typed — see tests/helpers/fixtures.js.
const [A, B] = MENU_DATA[0].items;
const line = (item, qty, given) => ({
  name: item.name, category: MENU_DATA[0].category, priceCents: 300, qty,
  ...(given === undefined ? {} : { given }),
});
const order = (over = {}) => ({
  id: 'o1', code: 'AB23', name: 'Sam', notes: '', status: 'new', totalCents: 1200,
  items: [line(A, 3), line(B, 1)], createdAt: Date.now() - 60_000, updatedAt: Date.now() - 60_000, ...over,
});

// A PATCH the test answers by hand, so it can look at the board while the
// request is still in the air.
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

async function mountBoard(orders, onPatch) {
  const patches = [];
  mockFetch({
    '/api/login': { body: { authenticated: true } },
    '/api/store': { body: { open: true, mode: 'open', hours: { day: 6, start: '19:00', end: '20:30' }, unavailable: [], dough: {} } },
    '/api/reports': { body: { reports: [] } },
    '/api/orders': (url, init) => {
      if (init.method !== 'PATCH') return { body: { orders } };
      const body = JSON.parse(init.body);
      patches.push(body);
      return onPatch(body, patches.length);
    },
  });
  render(<AdminPage nav={vi.fn()} onAuthChange={vi.fn()} />);
  await screen.findByRole('group', { name: /stage for sam/i });
  return patches;
}

const handOver = (item) => screen.getByRole('button', { name: `Hand over one ${item.name} to Sam` });
const withGiven = (o, item, count) => ({
  ...o, items: o.items.map((it) => (it.name === item.name ? { ...it, given: count } : it)),
});

beforeEach(() => {
  localStorage.clear();
});

describe('AdminPage — handing over part of an order', () => {
  it('has two slices to put on an order', () => {
    expect(A).toBeDefined();
    expect(B).toBeDefined();
  });

  it('ticks the slice off at once and tells the server which line and how many', async () => {
    const reply = deferred();
    const o = order();
    const patches = await mountBoard([o], () => reply.promise);
    await userEvent.click(handOver(B));
    // Before the server has said anything: this is a tap at the window.
    expect(screen.getByText('Partial · 1 of 4 given')).toBeTruthy();
    expect(patches).toEqual([{ given: { name: B.name, addons: [], count: 1 } }]);
    reply.resolve({ body: { order: withGiven(o, B, 1) } });
    await waitFor(() => expect(handOver(B).disabled).toBe(true));
  });

  it('sends quick taps one at a time and in order, and never steps the count back', async () => {
    const first = deferred();
    const second = deferred();
    const o = order();
    const patches = await mountBoard([o], (body, n) => (n === 1 ? first.promise : second.promise));
    await userEvent.click(handOver(A));
    await userEvent.click(handOver(A));
    expect(screen.getByText('2 of 3 given')).toBeTruthy();
    // The second waits for the first: two absolute counts racing each other
    // could land backwards and leave the line on 1.
    expect(patches.map((p) => p.given.count)).toEqual([1]);
    first.resolve({ body: { order: withGiven(o, A, 1) } });
    await waitFor(() => expect(patches.map((p) => p.given.count)).toEqual([1, 2]));
    // The reply to "1" is in, "2" is still out — the board keeps showing 2.
    expect(screen.getByText('2 of 3 given')).toBeTruthy();
    second.resolve({ body: { order: withGiven(o, A, 2) } });
    await waitFor(() => expect(screen.getByText('Partial · 2 of 4 given')).toBeTruthy());
  });

  it('moves the order to Finished when its last slice goes out', async () => {
    const o = order({ items: [line(A, 1, 1), line(B, 1)], totalCents: 600 });
    const reply = deferred();
    await mountBoard([o], () => reply.promise);
    await userEvent.click(handOver(B));
    // Without waiting on the server — that is what it is about to do with it,
    // and a finished order lingering on the live board invites a second tap.
    expect(screen.queryByRole('group', { name: /stage for sam/i })).toBeNull();
    const finished = screen.getByText(/^Finished/).closest('.admin-finished');
    expect(within(finished).getByText('picked up')).toBeTruthy();
    reply.resolve({ body: { order: { ...withGiven(o, B, 1), status: 'done' } } });
    await waitFor(() => expect(within(finished).getByText('picked up')).toBeTruthy());
  });

  it('says why when the server refuses, and puts the board back to the truth', async () => {
    const o = order();
    await mountBoard([o], () => ({ status: 409, body: { error: 'That order was changed on another device — refresh the board.' } }));
    await userEvent.click(handOver(B));
    expect((await screen.findByRole('alert')).textContent).toMatch(/changed on another device/);
    await waitFor(() => expect(screen.queryByText(/partial/i)).toBeNull());
  });

  it('leaves a slice already handed over out of Fire next', async () => {
    await mountBoard([order({ items: [line(A, 3, 2), line(B, 1)] })], () => ({ body: {} }));
    const chips = [...document.querySelectorAll('.fire-chip:not(.fire-chip-dim)')].map((el) => el.textContent);
    expect(chips).toEqual([`1× ${A.name}`, `1× ${B.name}`]);
  });
});
