import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight } from 'lucide-react';
import { Footer } from '../components/Footer';
import { LineReveal } from '../components/LineReveal';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { MENU_DATA } from '../data/menu';
import { api } from '../utils/api';
import { webSrc } from '../utils/photos';

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function MenuPage({ nav }) {
  const ref = useScrollReveal();
  const pageRef = useRef(null);
  const [unavailable, setUnavailable] = useState(new Set());

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Mark sold-out items; fail silent if the check fails
  useEffect(() => {
    let cancelled = false;
    api('/api/store')
      .then((d) => { if (!cancelled) setUnavailable(new Set(d.unavailable || [])); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Hero background drifts slower than the page scroll (parallax).
  // Desktop-only — see HomePage for the mobile rationale.
  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(max-width: 768px)').matches) return;
    gsap.to('.menu-hero-bg', {
      yPercent: 14,
      ease: 'none',
      scrollTrigger: { trigger: '.menu-hero', start: 'top top', end: 'bottom top', scrub: true },
    });
  }, { scope: pageRef });

  return (
    <div className="menu-page" ref={pageRef}>
      <div className="menu-hero">
        <div className="menu-hero-bg" />
        <div className="section-label" style={{ color: 'var(--gold)', position: 'relative', zIndex: 1 }}>Menu</div>
        <LineReveal as="h1" className="menu-hero-title" splitKey="menu-hero">
          Dough on Wednesday.<br /><em>Pizzas fresh on Saturday.</em>
        </LineReveal>
        <LineReveal
          as="p"
          className="menu-hero-sub"
          text="72-hour ferment · Ooni fired at 900°F · Pizza steels at 550°F"
        />
      </div>

      <div className="menu-body">
        <img src={webSrc('/photos/menu-board.jpg')} alt="Saturday Slices board" className="menu-board-photo" loading="lazy" decoding="async" />

        {MENU_DATA.map((section, si) => (
          <div key={section.category} ref={ref(si)} className="reveal">
            <div className="menu-section-title">{section.category}</div>
            <div className="menu-items">
              {section.items.map((item) => {
                const soldOut = unavailable.has(item.name);
                return (
                  <div key={item.name} className={`menu-item${soldOut ? ' menu-item-soldout' : ''}`}>
                    <span className="menu-item-name">
                      {item.name}
                      {!soldOut && item.special && (
                        <span className="menu-item-special"><span aria-hidden="true">✦</span>{item.special}</span>
                      )}
                    </span>
                    <span className="menu-item-desc">{item.desc}</span>
                    <span className="menu-item-dots" />
                    {soldOut && <span className="menu-item-86">Sold out</span>}
                    <span className="menu-item-price">{item.price}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="menu-venmo-box">
          <div>
            <div className="menu-venmo-title">Pay via Venmo or Zelle</div>
            <div className="menu-venmo-handle">
              <a href="https://venmo.com/u/Peter-Morganelli24" target="_blank" rel="noreferrer">@Peter-Morganelli24</a>
            </div>
          </div>
          <div className="menu-quote">
            &ldquo;Can you save me a slice?&rdquo; <span className="menu-quote-by">— Jonah Pflaster</span>
            <span className="menu-quote-alt">
              &ldquo;really f*cking good&rdquo; <span className="menu-quote-by">— Harrison Tun</span>
            </span>
          </div>
          <button type="button"
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            onClick={() => nav('order')}
          >
            Order Now <ArrowRight size={13} />
          </button>
        </div>
      </div>

      <Footer nav={nav} />
    </div>
  );
}
