// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '../../tests/helpers/dom.jsx';
import { Nav } from './Nav';

describe('Nav mobile menu', () => {
  it('exposes its expanded state and closes after route history changes', () => {
    const { rerender } = render(<Nav page="home" nav={vi.fn()} />);
    const toggle = screen.getAllByRole('button', { name: 'Menu' })
      .find((button) => button.classList.contains('nav-hamburger'));
    expect(toggle.getAttribute('aria-controls')).toBe('primary-navigation');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    rerender(<Nav page="blog" nav={vi.fn()} />);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('stays closed when Forward returns to the page the menu was opened on', () => {
    // The regression this guards: menu state used to be derived by comparing
    // the page the menu was opened on against the current page. Back closed
    // the overlay (the ids stopped matching) but never forgot the id, so
    // Forward re-satisfied the comparison and the full-screen menu reopened
    // with nobody having touched it. Going away and coming back is the whole
    // test — a Back-only assertion passes under the broken version.
    const { rerender } = render(<Nav page="menu" nav={vi.fn()} />);
    const toggle = screen.getAllByRole('button', { name: 'Menu' })
      .find((button) => button.classList.contains('nav-hamburger'));

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    rerender(<Nav page="home" nav={vi.fn()} />);   // Back
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    rerender(<Nav page="menu" nav={vi.fn()} />);   // Forward
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.nav-links').classList.contains('mobile-open')).toBe(false);
  });
});
