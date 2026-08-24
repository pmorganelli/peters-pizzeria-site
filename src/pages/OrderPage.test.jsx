// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, mockFetch } from '../../tests/helpers/dom.jsx';
import { OrderPage } from './OrderPage';
import { MENU_DATA } from '../data/menu';
import { DEFAULT_MAX_QTY } from '../utils/orders';

const ADDONS = MENU_DATA.find((c) => c.category === 'Add Ons').items;
const SLICES = MENU_DATA.find((c) => c.category === 'Saturday Slices').items;

const OPEN_STORE = { open: true, mode: 'open', unavailable: [] };

function openOrderPage(store = OPEN_STORE) {
  mockFetch({ '/api/store': { body: store } });
  const utils = render(<OrderPage nav={vi.fn()} />);
  // The menu only renders once the store check resolves.
  return waitFor(() => {
    expect(screen.getByText(SLICES[0].name)).toBeTruthy();
  }).then(() => utils);
}

// The row for a given menu item, so queries are scoped to it rather than
// picking up a same-named element elsewhere on the page.
function rowFor(itemName) {
  return screen.getByText(itemName).closest('.order-row').parentElement;
}

function addOne(itemName) {
  fireEvent.click(within(rowFor(itemName)).getByRole('button', { name: /^Add$/i }));
}

beforeEach(() => {
  localStorage.clear();
});

describe('OrderPage', () => {
  it('shows the closed card instead of the menu when the store is shut', async () => {
    mockFetch({ '/api/store': { body: { open: false, mode: 'closed', hours: null } } });
    render(<OrderPage nav={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/right now/i)).toBeTruthy());
    expect(screen.queryByText(SLICES[0].name)).toBeNull();
  });

  // Fail open: the server enforces hours on submit anyway, and a blip on this
  // check shouldn't strand a customer in front of a closed sign.
  it('falls open when the store check itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    render(<OrderPage nav={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(SLICES[0].name)).toBeTruthy());
  });

  it('renders every slice on the menu', async () => {
    await openOrderPage();
    for (const item of SLICES) {
      expect(screen.getByText(item.name)).toBeTruthy();
    }
  });

  describe('add-on chips', () => {
    it('shows no add-on rows until a slice is in the cart', async () => {
      await openOrderPage();
      expect(document.querySelectorAll('.addon-unit')).toHaveLength(0);
    });

    // The layout invariant. The chip grid is a fixed four-across (2×2 on
    // phones) rather than an auto-fill floor, so the number of chips in a unit
    // must stay equal to the number of add-ons on the menu — adding a fifth
    // add-on to menu.js silently makes the row wrap and this is what says so.
    it('renders exactly one chip per add-on, one unit per slice', async () => {
      await openOrderPage();
      const item = SLICES[0];
      addOne(item.name);

      let units = document.querySelectorAll('.addon-unit');
      expect(units).toHaveLength(1);
      expect(units[0].querySelectorAll('.addon-chip')).toHaveLength(ADDONS.length);
      expect(ADDONS).toHaveLength(4);

      fireEvent.click(within(rowFor(item.name)).getByLabelText('Add one'));
      units = document.querySelectorAll('.addon-unit');
      expect(units).toHaveLength(2);
      for (const unit of units) {
        expect(unit.querySelectorAll('.addon-chip')).toHaveLength(ADDONS.length);
      }
    });

    // Name and price are separate elements so the chip can stack them. Joined
    // into one run they broke mid-string at a quarter of the row width.
    it('gives every chip a name and a price in their own elements', async () => {
      await openOrderPage();
      addOne(SLICES[0].name);

      const chips = document.querySelectorAll('.addon-chip');
      for (const chip of chips) {
        expect(chip.querySelector('.addon-chip-name').textContent.trim()).not.toBe('');
        expect(chip.querySelector('.addon-chip-price').textContent.trim()).not.toBe('');
      }
    });

    it('prices Extra Basil at 50¢ rather than free', async () => {
      await openOrderPage();
      addOne(SLICES[0].name);

      const basil = [...document.querySelectorAll('.addon-chip')]
        .find((c) => /basil/i.test(c.querySelector('.addon-chip-name').textContent));
      expect(basil).toBeTruthy();
      expect(basil.querySelector('.addon-chip-price').textContent).toBe('+50¢');
      // Guard the whole list: nothing on the add-on menu is free any more.
      expect(ADDONS.every((a) => a.price !== 'Free')).toBe(true);
    });

    it('toggles a chip on and off and reports state to assistive tech', async () => {
      await openOrderPage();
      addOne(SLICES[0].name);

      const chip = document.querySelector('.addon-chip');
      expect(chip.getAttribute('aria-pressed')).toBe('false');
      fireEvent.click(chip);
      expect(document.querySelector('.addon-chip').getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(document.querySelector('.addon-chip'));
      expect(document.querySelector('.addon-chip').getAttribute('aria-pressed')).toBe('false');
    });

    // The label is what a screen-reader user hears in place of the stacked
    // spans, so it has to carry the price and the sold-out state that sighted
    // users read off the chip.
    it('names the slice, the price and the sold-out state in the aria-label', async () => {
      await openOrderPage({ ...OPEN_STORE, unavailable: [ADDONS[1].name] });
      addOne(SLICES[0].name);

      const chips = [...document.querySelectorAll('.addon-chip')];
      expect(chips[0].getAttribute('aria-label')).toContain(ADDONS[0].price);
      expect(chips[0].getAttribute('aria-label')).toContain(SLICES[0].name);
      expect(chips[1].getAttribute('aria-label')).toContain('sold out');
      expect(chips[1].disabled).toBe(true);
    });

    it('numbers the units once there is more than one slice', async () => {
      await openOrderPage();
      addOne(SLICES[0].name);
      expect(screen.getByText('Add-ons')).toBeTruthy();

      fireEvent.click(within(rowFor(SLICES[0].name)).getByLabelText('Add one'));
      expect(screen.getByText('Slice 1')).toBeTruthy();
      expect(screen.getByText('Slice 2')).toBeTruthy();
    });

    // Add-ons are per unit, not per line: turning one on for slice 2 must not
    // light up slice 1.
    it('keeps each unit’s add-ons independent', async () => {
      await openOrderPage();
      addOne(SLICES[0].name);
      fireEvent.click(within(rowFor(SLICES[0].name)).getByLabelText('Add one'));

      const units = document.querySelectorAll('.addon-unit');
      fireEvent.click(units[1].querySelector('.addon-chip'));

      expect(document.querySelectorAll('.addon-unit')[0].querySelector('.addon-chip').getAttribute('aria-pressed')).toBe('false');
      expect(document.querySelectorAll('.addon-unit')[1].querySelector('.addon-chip').getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('quantity caps', () => {
    it('stops the stepper at an item’s own maxQty', async () => {
      const capped = SLICES.find((i) => i.maxQty);
      expect(capped).toBeTruthy(); // Margherita is capped at 4
      await openOrderPage();

      addOne(capped.name);
      const plus = () => within(rowFor(capped.name)).getByLabelText('Add one');
      for (let i = 1; i < capped.maxQty; i += 1) {
        expect(plus().disabled).toBe(false);
        fireEvent.click(plus());
      }
      expect(plus().disabled).toBe(true);
      expect(document.querySelectorAll('.addon-unit')).toHaveLength(capped.maxQty);
    });

    it('falls back to the default cap for an item without its own', async () => {
      const uncapped = SLICES.find((i) => !i.maxQty);
      await openOrderPage();
      addOne(uncapped.name);

      const plus = () => within(rowFor(uncapped.name)).getByLabelText('Add one');
      for (let i = 1; i < DEFAULT_MAX_QTY; i += 1) fireEvent.click(plus());
      expect(plus().disabled).toBe(true);
    });

    it('removes the unit rows as the quantity comes back down', async () => {
      await openOrderPage();
      addOne(SLICES[0].name);
      fireEvent.click(within(rowFor(SLICES[0].name)).getByLabelText('Add one'));
      expect(document.querySelectorAll('.addon-unit')).toHaveLength(2);

      fireEvent.click(within(rowFor(SLICES[0].name)).getByLabelText('Remove one'));
      expect(document.querySelectorAll('.addon-unit')).toHaveLength(1);
      fireEvent.click(within(rowFor(SLICES[0].name)).getByLabelText('Remove one'));
      expect(document.querySelectorAll('.addon-unit')).toHaveLength(0);
    });
  });

  describe('sold-out items', () => {
    it('greys out an 86’d slice and offers no stepper', async () => {
      const soldOut = SLICES[0];
      await openOrderPage({ ...OPEN_STORE, unavailable: [soldOut.name] });

      const row = rowFor(soldOut.name);
      expect(within(row).getByText('Sold out')).toBeTruthy();
      expect(within(row).queryByRole('button', { name: /^Add$/i })).toBeNull();
    });
  });

  it('persists the cart to localStorage so a refresh keeps it', async () => {
    await openOrderPage();
    addOne(SLICES[0].name);

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('pp_cart:v2'));
      expect(saved[SLICES[0].name]).toHaveLength(1);
    });
  });
});
