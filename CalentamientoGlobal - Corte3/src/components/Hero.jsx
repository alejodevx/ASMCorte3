import { useEffect, useState } from 'react';
import { anomalyColor } from '../lib/colors.js';
import { formatDate, formatTemperature } from '../lib/gistemp.js';

function useCountUp(target, ms = 2200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!Number.isFinite(target)) return undefined;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setValue(target);
      return undefined;
    }
    let raf;
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const eased = 1 - (1 - t) ** 3;
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

/** Termómetro SVG: el mercurio sube hasta la media de los últimos 12 meses */
function Thermometer({ value }) {
  const min = -0.5;
  const max = 2.5;
  const top = 30;
  const bottom = 330;
  const y = (v) => bottom - ((v - min) / (max - min)) * (bottom - top);
  const shown = Number.isFinite(value) ? value : min;
  const ticks = [-0.5, 0, 0.5, 1, 1.5, 2, 2.5];

  return (
    <svg viewBox="0 0 160 420" className="thermo" role="img"
      aria-label={`Termómetro: la Tierra está ${formatTemperature(value)} por encima de la época preindustrial`}>
      <defs>
        <linearGradient id="mercury" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={anomalyColor(-0.3)} />
          <stop offset="30%" stopColor={anomalyColor(0.45)} />
          <stop offset="55%" stopColor={anomalyColor(1.0)} />
          <stop offset="75%" stopColor={anomalyColor(1.5)} />
          <stop offset="100%" stopColor={anomalyColor(2.4)} />
        </linearGradient>
        <clipPath id="tube"><rect x="62" y={top - 12} width="36" height={bottom - top + 60} rx="18" /></clipPath>
        <filter id="glow"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      {/* Tubo */}
      <rect x="58" y={top - 16} width="44" height={bottom - top + 40} rx="22" className="thermo-glass" />
      <circle cx="80" cy="370" r="38" className="thermo-glass" />
      {/* Mercurio */}
      <g clipPath="url(#tube)">
        <rect x="62" y={y(shown)} width="36" height={bottom - y(shown) + 60} fill="url(#mercury)" className="thermo-mercury" />
      </g>
      <circle cx="80" cy="370" r="32" fill={anomalyColor(shown)} />
      <circle cx="80" cy="370" r="40" fill={anomalyColor(shown)} opacity="0.35" filter="url(#glow)" className="thermo-pulse" />
      {/* Escala */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1="104" x2={t % 1 === 0 ? 118 : 112} y1={y(t)} y2={y(t)} className="thermo-tick" />
          <text x="122" y={y(t) + 4} className="thermo-label">{t > 0 ? `+${t}` : t}</text>
        </g>
      ))}
      {[1.5, 2.0].map((t) => (
        <g key={`p${t}`}>
          <line x1="20" x2="58" y1={y(t)} y2={y(t)} className="thermo-paris" />
          <text x="6" y={y(t) - 5} className="thermo-paris-label">París</text>
        </g>
      ))}
    </svg>
  );
}

export default function Hero({ latest, baselineLabel }) {
  const counted = useCountUp(latest?.rolling12);
  return (
    <header className="hero">
      <div className="hero-copy">
        <p className="eyebrow">Datos de NASA GISS (GISTEMP v4), de 1926 a hoy</p>
        <h1>
          Termómetro <span>de la Tierra</span>
        </h1>
        <p className="lede">
          Un siglo de temperaturas del planeta, convertidas en color, mapa y sonido.
          Elige tu período, escúchalo y míralo frente a los límites del Acuerdo de París.
        </p>
        <div className="hero-reading" style={{ '--heat': anomalyColor(latest?.rolling12 ?? 0) }}>
          <strong className="mono">{formatTemperature(counted)}</strong>
          <span>
            Calentamiento medio de los últimos 12 meses (hasta {formatDate(latest?.date)}),
            comparado con {baselineLabel}.
          </span>
        </div>
        <a className="scroll-cue" href="#entender">Empezar ↓</a>
      </div>
      <Thermometer value={counted} />
    </header>
  );
}
