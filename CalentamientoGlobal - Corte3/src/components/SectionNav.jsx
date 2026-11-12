import { useEffect, useRef, useState } from 'react';

const LINKS = [
  { id: 'entender', label: 'El dato' },
  { id: 'explorar', label: 'Tu período' },
  { id: 'mapa', label: 'Mapa' },
  { id: 'colombia', label: 'Colombia' },
  { id: 'diorama', label: 'Diorama' },
  { id: 'juego', label: 'Juego' },
];

/** Navegación fija: aparece al salir de la portada, marca la sección actual y el avance de lectura */
export default function SectionNav({ logoSrc }) {
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState('');
  const barRef = useRef(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setVisible(y > window.innerHeight * 0.7);
      if (barRef.current) barRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      let current = '';
      LINKS.forEach((l) => {
        const el = document.getElementById(l.id);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.4) current = l.id;
      });
      setActive(current);
    };
    let lastRun = 0;
    const onScroll = () => {
      const now = performance.now();
      if (now - lastRun > 80) { lastRun = now; update(); }
      clearTimeout(raf);
      raf = setTimeout(update, 120); // asegura el estado final al terminar el scroll
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => { window.removeEventListener('scroll', onScroll); clearTimeout(raf); };
  }, []);

  return (
    <nav className={`section-nav ${visible ? 'is-visible' : ''}`} aria-label="Secciones" inert={!visible}>
      <div className="section-nav-inner">
        <a href="#top" className="section-nav-logo" aria-label="Volver al inicio">
          <img src={logoSrc} alt="Universidad Autónoma de Occidente" />
        </a>
        <ul>
          {LINKS.map((l) => (
            <li key={l.id}>
              <a href={`#${l.id}`} className={active === l.id ? 'on' : ''} aria-current={active === l.id ? 'true' : undefined}>{l.label}</a>
            </li>
          ))}
        </ul>
      </div>
      <span className="section-nav-progress" ref={barRef} aria-hidden="true" />
    </nav>
  );
}
