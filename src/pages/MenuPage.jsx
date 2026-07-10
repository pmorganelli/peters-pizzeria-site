import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Footer } from '../components/Footer';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { MENU_DATA } from '../data/menu';
import { webSrc } from '../utils/photos';

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function MenuPage({ nav }) {
  const ref = useScrollReveal();
  const pageRef = useRef(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Hero background drifts slower than the page scroll (parallax)
  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
        <h1 className="menu-hero-title">Dough on Wednesday.<br /><em>Pizzas fresh on Saturday.</em></h1>
        <p className="menu-hero-sub">72-hour ferment · Ooni fired at 900°F · Pizza steels at 550°F</p>
      </div>

      <div className="menu-body">
        <img src={webSrc('/photos/menu-board.jpg')} alt="Saturday Slices board" className="menu-board-photo" />

        {MENU_DATA.map((section, si) => (
          <div key={section.category} ref={ref(si)} className="reveal">
            <div className="menu-section-title">{section.category}</div>
            <div className="menu-items">
              {section.items.map((item) => (
                <div key={item.name} className="menu-item">
                  <span className="menu-item-name">{item.name}</span>
                  <span className="menu-item-desc">{item.desc}</span>
                  <span className="menu-item-dots" />
                  <span className="menu-item-price">{item.price}</span>
                </div>
              ))}
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
            &ldquo;Can you save me a slice?&rdquo; — Jonah Pflaster<br />
            <span style={{ opacity: 0.6, fontSize: 14 }}>&ldquo;really f*cking good&rdquo; — Harrison Tun</span>
          </div>
        </div>
      </div>

      <Footer nav={nav} />
    </div>
  );
}
