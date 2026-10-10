// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../tests/helpers/dom.jsx';
import { OrderStatusCard } from './OrderStatusCard';
import { MENU_DATA } from '../data/menu';
import { displayName } from '../utils/orders';

// Derived, never typed — see tests/helpers/fixtures.js.
const [A, B, C] = MENU_DATA[0].items;
const line = (item, qty, given) => ({
  name: item.name, category: MENU_DATA[0].category, priceCents: 300, qty,
  ...(given === undefined ? {} : { given }),
});
const order = (over = {}) => ({
  id: 'o1', code: 'AB23', name: 'Sam Jones', status: 'firing', totalCents: 600,
  items: [line(A, 1, 1), line(B, 1)], createdAt: Date.now(), ...over,
});
const renderCard = (o, props = {}) => render(<OrderStatusCard order={o} onNewOrder={vi.fn()} {...props} />);
const banner = () => screen.getByRole('status').textContent;

describe('OrderStatusCard — partial pickup', () => {
  it('has three slices to build orders from', () => {
    expect([A, B, C].every(Boolean)).toBe(true);
  });

  it('says how much has been collected and where the rest is up to', () => {
    renderCard(order());
    expect(banner()).toContain(`1 of 2 picked up — ${displayName(B.name)} is still in the oven.`);
    expect(screen.getByText(/the rest is on its way/i)).toBeTruthy();
  });

  it('follows the order through its stages', () => {
    for (const [status, phrase] of [['new', 'still in line'], ['firing', 'still in the oven'], ['ready', 'ready at the window']]) {
      const { unmount } = renderCard(order({ status }));
      expect(banner()).toContain(phrase);
      unmount();
    }
  });

  it('names two outstanding slices and stops naming them past that', () => {
    const two = renderCard(order({ items: [line(A, 2, 2), line(B, 1), line(C, 1)] }));
    expect(banner()).toContain(`${displayName(B.name)} and ${displayName(C.name)} are still in the oven.`);
    two.unmount();
    // The slice partly collected is still owed too, which makes three.
    renderCard(order({ items: [line(A, 2, 1), line(B, 1), line(C, 1)] }));
    expect(banner()).toContain('1 of 4 picked up — the rest is still in the oven.');
  });

  it('ticks off the lines that have gone, with a count where a line is only partly out', () => {
    const { container } = renderCard(order({ items: [line(A, 1, 1), line(B, 3, 2), line(C, 1)] }));
    const marks = [...container.querySelectorAll('.order-line-given')].map((el) => el.textContent.trim());
    expect(marks).toEqual(['picked up', '2 of 3 picked up']);
  });

  it('reads exactly as before when nothing has been collected', () => {
    const { container } = renderCard(order({ items: [line(A, 1), line(B, 1)] }));
    expect(banner()).toContain('Your slices are cooking right now.');
    expect(screen.getByText(/you're in the queue/i)).toBeTruthy();
    expect(container.querySelector('.order-line-given')).toBeNull();
    expect(screen.queryByText(/picked up/i)).toBeNull();
  });

  it('is simply picked up once everything has gone, with no partial wording left over', () => {
    const { container } = renderCard(order({ status: 'done', items: [line(A, 1, 1), line(B, 1, 1)] }));
    expect(banner()).toContain('Enjoy! Thanks for supporting us.');
    expect(container.querySelector('.order-line-given')).toBeNull();
    expect(screen.queryByText(/of 2 picked up/i)).toBeNull();
  });

  it('offers the photo wall once there is a slice in hand, even before the order is ready', () => {
    const withSlice = renderCard(order({ status: 'new' }), { nav: vi.fn() });
    expect(screen.getByRole('button', { name: /got your slice/i })).toBeTruthy();
    withSlice.unmount();
    renderCard(order({ status: 'new', items: [line(A, 1), line(B, 1)] }), { nav: vi.fn() });
    expect(screen.queryByRole('button', { name: /got your slice/i })).toBeNull();
  });
});
