import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(useGSAP, SplitText);

// Phones get one tween on the whole headline instead of a per-line split.
// Same breakpoint the hero parallaxes use.
const COARSE = '(max-width: 768px)';

// Splits text into its actual rendered lines (GSAP SplitText, screen-reader safe)
// and reveals each line with a staggered rise behind a mask. autoSplit waits for
// the webfont and re-splits on resize; under reduced motion the text renders
// plain, so the content is never lost.
// Content can come in as `text` (a plain string) or as `children` when the
// headline carries markup (<br>, <em>). JSX children are a fresh object every
// render, so they can't be what decides when to re-split — pass a stable
// `splitKey` alongside them; a plain string is its own key.
//
// ── Why phones skip the split ────────────────────────────────────────────
// The per-line reveal is three costs stacked, and all three land hardest on a
// phone, during the 260 ms page transition:
//   1. `autoSplit` holds the reveal until the webfont resolves — it must, since
//      line boxes aren't final until then. Nothing is on screen until it does.
//   2. `SplitText.create` measures every line and injects a wrapper + mask div
//      per line: synchronous layout, on the main thread, competing with the
//      transition tween for the same frames.
//   3. Each line then animates `yPercent: 150` inside an overflow-clipped mask,
//      which repaints rather than compositing cleanly.
// The home hero has never used this — it's a plain CSS keyframe (`hero-rise`)
// on the whole element, so it paints on the first frame and reads as instant
// even though its cascade actually runs *longer* in wall-clock. The order page,
// with a single-line headline, feels the same way. Everything with a two-line
// title and a sub felt sluggish next to them.
// So below 768px this does literally what the home hero does: the same
// `hero-rise` CSS keyframe on the whole element, applied by class. Not a GSAP
// tween — a CSS animation runs on the compositor, so it is immune to the very
// main-thread contention this is working around, it carries
// `animation-fill-mode: both` so the end state is guaranteed even if the frame
// budget is blown, and it costs no JS on mount at all. The per-line stagger is
// the thing given up, and it's the least legible part of the effect at phone
// size.
//
// The match is read once per mount, like the parallax guards — rotating a
// phone into a tablet-width landscape keeps whichever path it started on, and
// corrects on the next page visit.
export function LineReveal({ text, children, className, as: Tag = 'div', stagger = 90, splitKey }) {
  const ref = useRef(null);
  // Decided once, at mount, before the first paint — the class has to be on the
  // element in the very first frame or the animation starts late (or not at
  // all). Reduced motion takes the plain path here too; the global
  // reduced-motion block in index.css also flattens the keyframe, so it's
  // belt-and-braces.
  const [simple] = useState(
    () =>
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
      window.matchMedia(COARSE).matches,
  );

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    if (simple) {
      // Nothing to do — `.line-reveal-rise` (added below) is the whole effect.
      // Note it fades opacity rather than toggling visibility, so the headline
      // stays in the accessibility tree while it animates.
      return;
    }

    SplitText.create(ref.current, {
      type: 'lines',
      mask: 'lines',
      autoSplit: true,
      onSplit: (self) =>
        gsap.from(self.lines, {
          // 150 (not 110): the masks' clip windows extend 0.35em below the
          // line box (see .line-reveal CSS), so lines must start deeper down
          // to stay hidden before their reveal.
          yPercent: 150,
          duration: 0.7,
          ease: 'power3.out',
          stagger: stagger / 1000,
        }),
    });
  }, { dependencies: [splitKey ?? text, stagger, simple], revertOnUpdate: true, scope: ref });

  return (
    <Tag
      ref={ref}
      className={[className, 'line-reveal', simple && 'line-reveal-rise'].filter(Boolean).join(' ')}
    >
      {children ?? text}
    </Tag>
  );
}
