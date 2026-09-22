// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '../../tests/helpers/dom.jsx';
import { useDoughStock } from './useDoughStock';
import { DOUGH_TYPES } from '../utils/dough';

// Save sends the whole map, and an omitted type means "stop counting". So a
// box that isn't following the server is a box that will overwrite it: these
// cases are about two devices (or two tabs) sharing one night's count.
const [A, B] = DOUGH_TYPES;
const pool = (balls) => ({ balls, slices: 0, used: 0, remaining: 0 });

function setup() {
  const saveStore = vi.fn(async () => true);
  const hook = renderHook(() => useDoughStock({ saveStore, onError: vi.fn() }));
  return { saveStore, hook };
}

describe('useDoughStock', () => {
  it('has two dough types to test against', () => {
    expect(A).toBeDefined();
    expect(B).toBeDefined();
  });

  it("keeps an untouched box following another device's count", async () => {
    const { saveStore, hook } = setup();
    act(() => hook.result.current.sync({})); // loaded before anyone counted
    act(() => hook.result.current.sync({ [A]: pool(10) })); // device B saves
    expect(hook.result.current.draft[A]).toBe('10');

    act(() => hook.result.current.edit(B, '3'));
    await act(() => hook.result.current.save());
    // The other device's 10 goes back up with this tab's 3, not untracked.
    expect(saveStore).toHaveBeenCalledWith({ dough: { [A]: 10, [B]: 3 } });
  });

  it('follows a close-the-night from another tab back to blank', () => {
    const { hook } = setup();
    act(() => hook.result.current.sync({ [A]: pool(4) }));
    act(() => hook.result.current.sync({}));
    expect(hook.result.current.draft[A]).toBe('');
  });

  it('leaves a box being typed into alone until it is saved', async () => {
    const { hook } = setup();
    act(() => hook.result.current.sync({ [A]: pool(4) }));
    act(() => hook.result.current.edit(A, '6'));
    act(() => hook.result.current.sync({ [A]: pool(4) })); // a poll mid-typing
    expect(hook.result.current.draft[A]).toBe('6');

    await act(() => hook.result.current.save());
    act(() => hook.result.current.sync({ [A]: pool(7) }));
    expect(hook.result.current.draft[A]).toBe('7');
  });

  it('keeps what was typed when the save is refused', async () => {
    const saveStore = vi.fn(async () => false);
    const hook = renderHook(() => useDoughStock({ saveStore, onError: vi.fn() }));
    act(() => hook.result.current.edit(A, '1'));
    await act(() => hook.result.current.save());
    act(() => hook.result.current.sync({ [A]: pool(3) }));
    expect(hook.result.current.draft[A]).toBe('1');
  });
});
