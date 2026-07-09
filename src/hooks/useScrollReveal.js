import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

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
        // Hand styling back to CSS so hover transforms (e.g. card lifts) still apply.
        el.classList.add('revealed');
        gsap.set(el, { clearProps: 'all' });
      },
    }
  );
}

export function useScrollReveal() {
  const els = useRef([]);
  const ctx = useRef(null);

  useEffect(() => {
    // Under reduced motion the CSS override shows everything; skip the tweens.
    if (prefersReducedMotion()) return undefined;
    ctx.current = gsap.context(() => { els.current.forEach((el) => el && animate(el)); });
    return () => { ctx.current?.revert(); ctx.current = null; };
  }, []);

  // Returns a ref-setter for index i; also stamps the 'reveal' class immediately on mount.
  // Elements attached after the initial mount get their tween created here.
  return (i) => (el) => {
    els.current[i] = el;
    if (el) {
      el.classList.add('reveal');
      ctx.current?.add(() => animate(el));
    }
  };
}
