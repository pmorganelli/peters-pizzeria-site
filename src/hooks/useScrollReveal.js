import { useRef, useEffect } from 'react';

export function useScrollReveal() {
  const refs = useRef([]);
  const observerRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('revealed'); }),
      { threshold: 0.1 }
    );
    observerRef.current = observer;
    refs.current.forEach((r) => r && observer.observe(r));
    return () => { observer.disconnect(); observerRef.current = null; };
  }, []);

  // Returns a ref-setter for index i; also stamps the 'reveal' class immediately on mount.
  // Elements attached after the initial mount are observed here so they still reveal.
  return (i) => (el) => {
    refs.current[i] = el;
    if (el) {
      el.classList.add('reveal');
      observerRef.current?.observe(el);
    }
  };
}
