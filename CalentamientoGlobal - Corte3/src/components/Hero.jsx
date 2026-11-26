import { useEffect, useRef, useState } from 'react';
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import countries from 'world-atlas/countries-110m.json';
import { anomalyColor, anomalyRgb } from '../lib/colors.js';
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

const land = feature(countries, countries.objects.countries);
const graticule = geoGraticule10();
const SPHERE = { type: 'Sphere' };
const CALI = [-76.52, 3.45];
const CX = 210;
const CY = 210;
const GLOBE_R = 148;
const GAUGE_R = 188;
const MIN = -0.5;
const MAX = 2.5;

const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
const rgb = (c) => `rgb(${c.join(',')})`;
const polar = (deg, r = GAUGE_R) => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
};
const angleOf = (v) => -135 + ((Math.max(MIN, Math.min(MAX, v)) - MIN) / (MAX - MIN)) * 270;
function arc(v0, v1, r = GAUGE_R) {
  const a0 = angleOf(v0);
  const a1 = angleOf(v1);
  const [x0, y0] = polar(a0, r);
  const [x1, y1] = polar(a1, r);
  return `M${x0},${y0} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1}`;
}

/** La Tierra girando (centrada al inicio en Cali), con su temperatura en un dial alrededor */
function Earth({ value }) {
  const landRef = useRef(null);
  const gratRef = useRef(null);
  const caliRef = useRef(null);
  const shown = Number.isFinite(value) ? value : 0;
  const heat = anomalyRgb(shown);
  const t = Math.max(0, Math.min(1, shown / 2));
  const landColor = rgb(mix([70, 140, 84], heat, 0.2 + t * 0.55));
  const oceanColor = rgb(mix([16, 62, 110], heat, t * 0.18));
  const ticks = [-0.5, 0, 0.5, 1, 2.5];

  useEffect(() => {
    const projection = geoOrthographic().translate([CX, CY]).scale(GLOBE_R).clipAngle(90);
    const path = geoPath(projection);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = 0;
    const t0 = performance.now();
    const draw = (now) => {
      if (now - last > 33) {
        last = now;
        const lon = -CALI[0] - ((now - t0) / 1000) * 9;
        projection.rotate([lon, -CALI[1] + 8, 0]);
        landRef.current?.setAttribute('d', path(land));
        gratRef.current?.setAttribute('d', path(graticule));
        const visible = geoDistance(CALI, [-projection.rotate()[0], -projection.rotate()[1]]) < Math.PI / 2 - 0.05;
        if (caliRef.current) {
          const [x, y] = projection(CALI);
          caliRef.current.setAttribute('transform', `translate(${x},${y})`);
          caliRef.current.style.opacity = visible ? 1 : 0;
        }
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw(t0 + 100);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <svg viewBox="0 0 420 430" className="earth" role="img"
      aria-label={`La Tierra está ${formatTemperature(value)} por encima de la época preindustrial. Límites del Acuerdo de París: +1.5 y +2.0 grados.`}>
      <defs>
        <radialGradient id="earth-shade" cx="38%" cy="34%" r="70%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".22" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity=".55" />
        </radialGradient>
        <radialGradient id="earth-glow">
          <stop offset="70%" stopColor={rgb(heat)} stopOpacity=".55" />
          <stop offset="100%" stopColor={rgb(heat)} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx={CX} cy={CY + 8} r="232" className="earth-backdrop" />
      {/* Atmósfera que se enciende con el calor */}
      <circle cx={CX} cy={CY} r={GLOBE_R + 26} fill="url(#earth-glow)" className="earth-halo" />
      <circle cx={CX} cy={CY} r={GLOBE_R} className="earth-ocean" fill={oceanColor} />
      <path ref={gratRef} className="earth-grat" />
      <path ref={landRef} className="earth-land" fill={landColor} />
      <circle cx={CX} cy={CY} r={GLOBE_R} fill="url(#earth-shade)" />
      <circle cx={CX} cy={CY} r={GLOBE_R} className="earth-rim" />
      <g ref={caliRef} className="earth-cali">
        <circle className="ping" r="6" />
        <circle r="4.5" />
        <text x="9" y="-7">Cali</text>
      </g>

      {/* Dial de temperatura */}
      <path d={arc(MIN, MAX)} className="earth-track" />
      <path d={arc(MIN, shown)} className="earth-heat" stroke={rgb(heat)} />
      {ticks.map((v) => {
        const [x1, y1] = polar(angleOf(v), GAUGE_R + 8);
        const [x2, y2] = polar(angleOf(v), GAUGE_R + 14);
        const [lx, ly] = polar(angleOf(v), GAUGE_R + 26);
        return (
          <g key={v}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} className="earth-tick" />
            <text x={lx} y={ly + 4} textAnchor="middle" className="earth-tick-label">{v > 0 ? `+${v}` : v}</text>
          </g>
        );
      })}
      {[1.5, 2.0].map((v) => {
        const [x1, y1] = polar(angleOf(v), GAUGE_R - 9);
        const [x2, y2] = polar(angleOf(v), GAUGE_R + 14);
        const [lx, ly] = v < 1.7 ? polar(angleOf(v), GAUGE_R + 30) : [x2, y2 - 10];
        return (
          <g key={`p${v}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} className="earth-paris" />
            <text x={lx} y={ly + 4} textAnchor={v < 1.7 ? 'middle' : 'end'} className="earth-paris-label">París +{v.toFixed(1)}</text>
          </g>
        );
      })}
      {(() => {
        const [x1, y1] = polar(angleOf(shown), GAUGE_R - 12);
        const [x2, y2] = polar(angleOf(shown), GAUGE_R + 12);
        return <line x1={x1} y1={y1} x2={x2} y2={y2} className="earth-needle" />;
      })()}
      <text x={CX} y="404" textAnchor="middle" className="earth-value">{formatTemperature(value)}</text>
      <text x={CX} y="424" textAnchor="middle" className="earth-caption">temperatura de la Tierra vs. 1880–1900</text>
    </svg>
  );
}

export default function Hero({ latest, baselineLabel }) {
  const counted = useCountUp(latest?.rolling12);
  return (
    <header className="hero">
      <div className="hero-copy">
        <p className="eyebrow">Desde Cali, con datos de NASA GISS (GISTEMP v4), de 1926 a hoy</p>
        <h1>
          La Tierra <span>y su temperatura</span>
        </h1>
        <p className="lede">
          Un siglo de temperaturas del planeta, convertidas en color, mapa y salsa.
          Toca las teclas, elige tu período, escúchalo a ritmo de clave y míralo frente a los límites del Acuerdo de París.
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
      <Earth value={counted} />
    </header>
  );
}
