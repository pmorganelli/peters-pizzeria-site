// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act } from '../../tests/helpers/dom.jsx';
import { Lightbox } from './Lightbox';

const PHOTOS = ['/photos/a.jpg', '/photos/b.jpg', '/photos/c.jpg'];

function setup(props = {}) {
  const handlers = { onClose: vi.fn(), onPrev: vi.fn(), onNext: vi.fn() };
  const utils = render(<Lightbox photos={PHOTOS} index={0} {...handlers} {...props} />);
  return { ...utils, ...handlers };
}

describe('Lightbox', () => {
  it('opens as a modal dialog and closes on unmount', () => {
    const { unmount } = setup();
    const dialog = document.querySelector('dialog');
    expect(dialog.open).toBe(true);
    unmount();
    expect(dialog.open).toBe(false);
  });

  it('drives navigation from the arrow keys', () => {
    const { onPrev, onNext } = setup();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('ignores keys it does not handle', () => {
    const { onPrev, onNext, onClose } = setup();
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  // The regression this file exists for. onPrev/onNext are fresh closures on
  // every render of the parent, so listing them as effect deps detached and
  // reattached the keydown listener on each one. useEffectEvent reads the
  // latest callback without joining the dependency list.
  //
  // The assertion is deliberately about the *listener*, not about the callback
  // firing: a naive test ("press the key, the handler runs") passes under both
  // implementations, because re-subscribing still leaves a working listener
  // attached. Counting add/removeEventListener is what tells the two apart.
  describe('keydown listener stability', () => {
    function Harness() {
      const [, setTick] = useState(0);
      // A new function identity per render, exactly like a parent that defines
      // its handlers inline.
      return (
        <>
          <button type="button" onClick={() => setTick((t) => t + 1)}>re-render</button>
          <Lightbox
            photos={PHOTOS}
            index={0}
            onClose={() => {}}
            onPrev={() => {}}
            onNext={() => {}}
          />
        </>
      );
    }

    it('attaches once across parent re-renders', () => {
      const add = vi.spyOn(window, 'addEventListener');
      const remove = vi.spyOn(window, 'removeEventListener');
      render(<Harness />);

      const keydownAdds = () => add.mock.calls.filter(([type]) => type === 'keydown').length;
      const keydownRemoves = () => remove.mock.calls.filter(([type]) => type === 'keydown').length;

      expect(keydownAdds()).toBe(1);

      for (let i = 0; i < 3; i += 1) {
        fireEvent.click(screen.getByRole('button', { name: 're-render' }));
      }

      expect(keydownAdds()).toBe(1);
      expect(keydownRemoves()).toBe(0);
    });

    it('still calls the newest callback after a re-render', () => {
      // The other half of useEffectEvent's contract: a stable subscription must
      // not mean a stale closure. If the effect captured the first render's
      // callback, this would report the stale count.
      const calls = [];
      function Latest() {
        const [n, setN] = useState(0);
        return (
          <>
            <button type="button" onClick={() => setN((v) => v + 1)}>bump</button>
            <Lightbox
              photos={PHOTOS}
              index={0}
              onClose={() => {}}
              onPrev={() => {}}
              onNext={() => calls.push(n)}
            />
          </>
        );
      }
      render(<Latest />);
      fireEvent.click(screen.getByRole('button', { name: 'bump' }));
      fireEvent.click(screen.getByRole('button', { name: 'bump' }));
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(calls).toEqual([2]);
    });

    it('detaches on unmount so a closed lightbox stops swallowing arrows', () => {
      const remove = vi.spyOn(window, 'removeEventListener');
      const { unmount } = setup();
      unmount();
      expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    });
  });

  // React 18 did not recognise the camelCase spelling: it dropped the prop and
  // warned. Written lowercase it survived 18 but reads as an unknown property
  // now. Either way the bug is silent — the attribute simply isn't in the DOM
  // and the browser loses the priority hint — so assert on the rendered
  // attribute rather than on the source spelling.
  it('forwards fetchPriority to the DOM', () => {
    setup();
    const img = document.querySelector('img.lb-img');
    expect(img.getAttribute('fetchpriority')).toBe('high');
    expect(img.getAttribute('decoding')).toBe('sync');
  });

  it('reuses one <img> element across navigation rather than remounting it', () => {
    // No `key` on the <img>: keying it on the photo threw away the decoded
    // image on every step, so each press started from a blank frame.
    const { rerender } = setup();
    const first = document.querySelector('img.lb-img');
    rerender(<Lightbox photos={PHOTOS} index={1} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);
    expect(document.querySelector('img.lb-img')).toBe(first);
  });

  it('shows arrows and a counter only when there is more than one photo', () => {
    const { unmount } = setup();
    expect(screen.getByLabelText('Next photo')).toBeTruthy();
    expect(screen.getByText('1 / 3')).toBeTruthy();
    unmount();

    setup({ photos: ['/photos/only.jpg'] });
    expect(screen.queryByLabelText('Next photo')).toBeNull();
  });

  it('closes from the visible button and the backdrop', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByLabelText('Close lightbox'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('.lb-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  // The backdrop is a real <button> so it isn't a click-handler-on-a-div, but
  // it must stay out of the tab order and out of the accessibility tree — it
  // would otherwise be a second, viewport-sized "Close lightbox" control.
  it('keeps the backdrop out of the tab order and the a11y tree', () => {
    setup();
    const backdrop = document.querySelector('.lb-backdrop');
    expect(backdrop.getAttribute('tabindex')).toBe('-1');
    expect(backdrop.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getAllByLabelText('Close lightbox')).toHaveLength(1);
  });

  it('renders a caption only when one carries content', () => {
    const captions = [{ name: 'Ada', caption: 'first slice' }, null, { name: '', caption: '' }];
    const { rerender } = setup({ captions });
    expect(screen.getByText('Ada')).toBeTruthy();

    rerender(<Lightbox photos={PHOTOS} index={1} captions={captions} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);
    expect(document.querySelector('.lb-caption')).toBeNull();

    rerender(<Lightbox photos={PHOTOS} index={2} captions={captions} onClose={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} />);
    expect(document.querySelector('.lb-caption')).toBeNull();
  });

  it('restores page scroll when it closes', () => {
    document.body.style.overflow = 'scroll';
    const { unmount } = setup();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('closes when the dialog is cancelled with Escape', () => {
    const { onClose } = setup();
    const dialog = document.querySelector('dialog');
    act(() => { fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true })); });
    expect(onClose).toHaveBeenCalled();
  });
});
