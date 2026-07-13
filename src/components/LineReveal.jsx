import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(useGSAP, SplitText);

// Splits text into its actual rendered lines (GSAP SplitText, screen-reader safe)
// and reveals each line with a staggered rise behind a mask. autoSplit waits for
// the webfont and re-splits on resize; under reduced motion the text renders
// plain, so the content is never lost.
export function LineReveal({ text, className, as: Tag = 'div', stagger = 90 }) {
  const ref = useRef(null);

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
  }, { dependencies: [text, stagger], revertOnUpdate: true, scope: ref });

  return <Tag ref={ref} className={[className, 'line-reveal'].filter(Boolean).join(' ')}>{text}</Tag>;
}
