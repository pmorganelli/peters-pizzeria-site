import { useRef, useEffect } from 'react';

export function useScrollReveal() {
  const refs = useRef([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('revealed'); }),
      { threshold: 0.1 }
    );
    refs.current.forEach((r) => r && observer.observe(r));
    return () => observer.disconnect();
  }, []);

  // Returns a ref-setter for index i; also stamps the 'reveal' class immediately on mount
  return (i) => (el) => {
    refs.current[i] = el;
    if (el) el.classList.add('reveal');
  };
}
