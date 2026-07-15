import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
// Mobile browsers fire resize when the address bar collapses/expands mid-scroll;
// a full ScrollTrigger refresh there makes scrubbed/parallax tweens jump.
ScrollTrigger.config({ ignoreMobileResize: true });

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Stagger is encoded in the JSX as reveal-delay-N marker classes.
const delayOf = (el) => {
  const m = /reveal-delay-(\d)/.exec(el.className);
  return m ? Number(m[1]) * 0.1 : 0;
};

function animate(el) {
  gsap.fromTo(
    el,
    { autoAlpha: 0, y: 28 },
    {
      autoAlpha: 1,
      y: 0,
      duration: 0.85,
      delay: delayOf(el),
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      onComplete() {
        // Hand styling back to CSS so hover transforms (e.g. card lifts) still
        // apply. A data attribute, not a class: React rewrites className
        // wholesale when a dynamic className prop changes (e.g. a special card
        // going sold-out), which would strip a class we added here and snap the
        // element back to the hidden .reveal state — attributes React didn't
        // render are left alone.
        el.dataset.revealed = 'true';
        gsap.set(el, { clearProps: 'all' });
      },
    }
  );
}

export function useScrollReveal() {
  const els = useRef([]);
  const ctx = useRef(null);
  const setters = useRef([]);
  // Guards against re-animating an element that already has its tween — without
  // it, any re-render re-invokes the callback refs and every reveal replays.
  const animated = useRef(new WeakSet());

  useEffect(() => {
    // Under reduced motion the CSS override shows everything; skip the tweens.
    if (prefersReducedMotion()) return undefined;
    ctx.current = gsap.context(() => {
      els.current.forEach((el) => {
        if (el && !animated.current.has(el)) {
          animated.current.add(el);
          animate(el);
        }
      });
    });
    return () => {
      ctx.current?.revert();
      ctx.current = null;
      animated.current = new WeakSet();
    };
  }, []);

  // Returns a stable ref-setter for index i (identity must not change across
  // renders, or React detaches/reattaches the ref every render); stamps the
  // 'reveal' class immediately on mount. Elements attached after the initial
  // mount get their tween created here.
  return (i) => {
    if (!setters.current[i]) {
      setters.current[i] = (el) => {
        els.current[i] = el;
        if (el) {
          el.classList.add('reveal');
          if (ctx.current && !animated.current.has(el)) {
            animated.current.add(el);
            ctx.current.add(() => animate(el));
          }
        }
      };
    }
    return setters.current[i];
  };
}
