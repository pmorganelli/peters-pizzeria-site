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
});
