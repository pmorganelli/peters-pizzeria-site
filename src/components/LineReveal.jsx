import { useLayoutEffect, useRef, useState } from 'react';
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';

// Splits text into its actual rendered lines (measured by Pretext, no DOM reflow)
// and reveals each line with a staggered rise. Falls back to plain text if
// measurement fails, so the content is never lost.
export function LineReveal({ text, className, as: Tag = 'div', stagger = 90 }) {
  const ref = useRef(null);
  const [state, setState] = useState({ lines: null, animate: true });

  useLayoutEffect(() => {
    let cancelled = false;
    const el = ref.current;
    if (!el) return undefined;

    setState({ lines: null, animate: true });
    // ResizeObserver fires once on observe() and again when our own line spans
    // change the element's height — only re-measure when the width truly changed,
    // or the refire would flip `animate` off and kill the reveal mid-flight.
    let measuredWidth = -1;
    let ro;

    const compute = () => {
      if (cancelled || !el) return;
      const cs = getComputedStyle(el);
      const width = el.clientWidth
        - (parseFloat(cs.paddingLeft) || 0)
        - (parseFloat(cs.paddingRight) || 0);
      if (width <= 0 || width === measuredWidth) return;
      try {
        const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const letterSpacing = parseFloat(cs.letterSpacing) || 0;
        // text-transform happens at paint time, so measure the transformed string
        const rendered = cs.textTransform === 'uppercase' ? text.toUpperCase()
          : cs.textTransform === 'lowercase' ? text.toLowerCase() : text;
        const prepared = prepareWithSegments(rendered, font, { letterSpacing });
        const { lines } = layoutWithLines(prepared, width, 1);
        if (cancelled) return;
        measuredWidth = width;
        setState((prev) => ({
          lines: lines.map((l) => l.text),
          animate: prev.lines === null,
        }));
      } catch {
        if (!cancelled) setState({ lines: null, animate: false });
      }
    };

    // Wait for the real webfont before the first measure, or the fallback
    // font's widths get locked in by the width guard above.
    const start = () => {
      if (cancelled) return;
      compute();
      ro = new ResizeObserver(compute);
      ro.observe(el);
    };

    const cs = getComputedStyle(el);
    const fontSpec = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if (document.fonts?.load) {
      document.fonts.load(fontSpec, text).then(start, start);
    } else {
      start();
    }

    return () => { cancelled = true; ro?.disconnect(); };
  }, [text]);

  return (
    <Tag ref={ref} className={className}>
      {state.lines
        ? state.lines.map((line, i) => (
            <span key={`${i}-${line}`} className="line-reveal-line">
              <span
                className="line-reveal-inner"
                style={state.animate ? { animationDelay: `${i * stagger}ms` } : { animation: 'none' }}
              >
                {line}
              </span>
            </span>
          ))
        : text}
    </Tag>
  );
}
