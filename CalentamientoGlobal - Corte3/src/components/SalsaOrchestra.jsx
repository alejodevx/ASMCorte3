import { useEffect, useMemo, useState } from 'react';
import { anomalyColor, textOn } from '../lib/colors.js';
import { formatTemperature } from '../lib/gistemp.js';
import { sonifier } from '../lib/sonification.js';

/*
 * La orquesta del clima: cada año es un compás de salsa y cada músico representa un umbral de temperatura.
 * Las reglas coinciden con el motor de sonido (lib/sonification.js), así que lo que se ve es lo que suena.
 */
const MUSICIANS = [
  { id: 'clave', name: 'Clave', role: 'El pulso: un compás por año', rule: 'Siempre', on: () => true },
  { id: 'bajo', name: 'Bajo tumbao', role: 'Su nota sube con la temperatura', rule: 'Siempre', on: () => true },
  { id: 'piano', name: 'Piano montuno', role: 'Cada nota es un año: más agudo, más calor', rule: 'Hasta +1.5 °C', on: (v) => v < 1.5 },
  { id: 'guiro', name: 'Güiro', role: 'Raspa más fuerte cuanto más calor', rule: 'Desde +0.2 °C', min: 0.2, on: (v) => v >= 0.2 },
  { id: 'conga', name: 'Conga', role: 'El tumbao que empieza a calentar', rule: 'Desde +0.3 °C', min: 0.3, on: (v) => v >= 0.3 },
  { id: 'campana', name: 'Campana', role: 'La señal de que la fiesta cambió', rule: 'Desde +1.0 °C', min: 1.0, on: (v) => v >= 1.0 },
  { id: 'trombon', name: 'Trombón', role: 'Refuerza la melodía cuando sube el calor', rule: '+1.0 a +1.5 °C', min: 1.0, on: (v) => v >= 1.0 && v < 1.5 },
  { id: 'timbal', name: 'Timbal', role: 'Repica al cruzar el límite de París', rule: 'Desde +1.5 °C', min: 1.5, on: (v) => v >= 1.5 },
  { id: 'trompeta', name: 'Trompeta', role: 'Le quita la melodía al piano', rule: 'Desde +1.5 °C', min: 1.5, on: (v) => v >= 1.5 },
];

const ENTRANCE = {
  guiro: 'El güiro raspa bajito: el calor apenas se asoma.',
  conga: '¡Llegó la conga! El planeta pasó +0.3 °C y el tumbao empieza a calentar.',
  campana: '¡Suena la campana! Pasamos +1.0 °C: esto ya no es un bolero.',
  trombon: 'Entran los trombones: la temperatura sube como un mambo.',
  timbal: '¡Repica el timbal! Cruzamos +1.5 °C, el límite de París.',
  trompeta: 'La trompeta le quita la melodía al piano: la orquesta está que arde.',
};

function Icon({ id }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (id) {
    case 'clave':
      return <g {...p}><path d="M10 34 L34 14" /><path d="M14 38 L38 18" /></g>;
    case 'bajo':
      return <g {...p}><path d="M24 6 v8" /><path d="M24 14 c-8 0 -9 7 -5 10 c-6 3 -6 13 5 14 c11 -1 11 -11 5 -14 c4 -3 3 -10 -5 -10z" /><path d="M24 40 v4" /><path d="M22 22 h4 M22 30 h4" /></g>;
    case 'piano':
      return <g {...p}><rect x="6" y="14" width="36" height="22" rx="3" /><path d="M14 14 v22 M22 14 v22 M30 14 v22" /><path d="M11 14 v12 M19 14 v12 M27 14 v12 M35 14 v12" strokeWidth="4" /></g>;
    case 'guiro':
      return <g {...p}><path d="M8 28 c0 -8 8 -12 18 -12 c8 0 14 4 14 10 c0 6 -6 8 -14 8 c-10 0 -18 -2 -18 -6z" /><path d="M16 19 v14 M21 17 v17 M26 16 v18 M31 17 v17" /></g>;
    case 'conga':
      return <g {...p}><ellipse cx="24" cy="10" rx="10" ry="3.5" /><path d="M14 10 c-2 10 -1 20 3 30 h14 c4 -10 5 -20 3 -30" /><path d="M16 24 h16" /></g>;
    case 'campana':
      return <g {...p}><path d="M14 12 h20 l5 26 h-30z" /><path d="M24 12 v-5" /><path d="M36 8 L44 4" /></g>;
    case 'trombon':
      return <g {...p}><path d="M6 20 h28 a4 4 0 0 1 0 8 h-20" /><path d="M34 20 l8 -6 v20 l-8 -6" /><path d="M14 28 v6" /></g>;
    case 'timbal':
      return <g {...p}><ellipse cx="16" cy="20" rx="9" ry="3" /><path d="M7 20 v10 c0 2 18 2 18 0 v-10" /><ellipse cx="33" cy="22" rx="8" ry="3" /><path d="M25 22 v9 c0 2 16 2 16 0 v-9" /><path d="M30 8 L22 16 M40 10 L34 17" /></g>;
    case 'trompeta':
      return <g {...p}><path d="M6 24 h22" /><path d="M28 18 l12 -6 v24 l-12 -6z" /><path d="M14 24 v-6 M18 24 v-6 M22 24 v-6" /><path d="M14 18 h8" /></g>;
    default:
      return null;
  }
}

/** Pregón del sonero: explica cada década según quién entra y cómo cambió la temperatura */
function pregon(decade, prev) {
  const v = decade.value;
  if (!prev) {
    return `Años ${decade.label}: la orquesta afina con clave, bajo y piano. Así sonaba un planeta a ${formatTemperature(v)} de la época preindustrial.`;
  }
  const joined = MUSICIANS.filter((m) => ENTRANCE[m.id] && m.on(v) && !m.on(prev.value));
  if (joined.length) return `Años ${decade.label} (${formatTemperature(v)}): ${ENTRANCE[joined.at(-1).id]}`;
  const d = v - prev.value;
  if (d < -0.02) return `Años ${decade.label} (${formatTemperature(v)}): una década algo más fresca. La orquesta baja el volumen, pero nadie se va de la tarima.`;
  if (d < 0.08) return `Años ${decade.label} (${formatTemperature(v)}): el mismo combo, casi la misma temperatura. El baile sigue.`;
  return `Años ${decade.label} (${formatTemperature(v)}): ${d.toFixed(2)} °C más que la década anterior. Mismo combo, más candela.`;
}

export default function SalsaOrchestra({ yearly }) {
  const years = useMemo(() => yearly.filter((y) => y.complete), [yearly]);
  const decades = useMemo(() => {
    const map = new Map();
    years.forEach((y) => {
      const d = Math.floor(y.year / 10) * 10;
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(y);
    });
    return [...map.entries()].map(([d, ys]) => ({
      start: d,
      label: `${d}`,
      years: ys,
      value: Math.round((ys.reduce((a, b) => a + b.value, 0) / ys.length) * 100) / 100 || 0,
    }));
  }, [years]);

  const [current, setCurrent] = useState(null);
  const [playing, setPlaying] = useState(null); // 'all' | decade start | null
  const [text, setText] = useState('Pulsa "Que suene la orquesta" y escucha un siglo de temperatura: cada compás es un año y cada músico entra cuando el planeta cruza su umbral.');

  useEffect(() => () => sonifier.stop(), []);

  const decadeOf = (year) => decades.findIndex((d) => year >= d.start && year < d.start + 10);

  const stop = () => {
    sonifier.stop();
    setPlaying(null);
  };

  const play = (list, mode, duration) => {
    if (playing === mode) { stop(); return; }
    setPlaying(mode);
    let lastDecade = -1;
    sonifier.playSeries(list.map((y) => y.value), {
      duration,
      onStep: (i) => {
        const y = list[i];
        setCurrent(y);
        const k = decadeOf(y.year);
        if (k !== lastDecade) {
          lastDecade = k;
          setText(pregon(decades[k], decades[k - 1]));
        }
      },
      onEnd: () => setPlaying(null),
    });
  };

  const v = current?.value;
  const active = (m) => current && m.on(v);
  const scaleMin = -0.2;
  const scaleMax = 1.8;
  const pos = (x) => `${((Math.min(scaleMax, Math.max(scaleMin, x)) - scaleMin) / (scaleMax - scaleMin)) * 100}%`;

  return (
    <section className="section" id="orquesta" aria-labelledby="orq-title">
      <div className="section-head">
        <p className="kicker">03 La orquesta del clima</p>
        <h2 id="orq-title">Un siglo de temperatura tocado <em>en clave de salsa</em></h2>
        <p className="section-sub">
          Cada año es un compás y cada músico es un umbral de temperatura. Con el planeta fresco solo suenan la clave,
          el bajo y el piano; a medida que se calienta, la tarima se llena. Escucha cuándo entra cada instrumento y sabrás
          cuánto se ha calentado la Tierra.
        </p>
      </div>

      <div className="panel orq">
        <div className="orq-top">
          <div className="orq-now" style={{ '--heat': current ? anomalyColor(v) : 'var(--line)' }}>
            <span className="orq-year mono">{current ? current.year : '—'}</span>
            <span className="orq-temp mono">{current ? formatTemperature(v) : 'sin tocar'}</span>
          </div>
          <p className="orq-pregon" aria-live="polite"><b>El sonero dice:</b> {text}</p>
          <button type="button" className={`play ${playing === 'all' ? 'is-playing' : ''}`}
            onClick={() => play(years, 'all', 48)}>
            <span className="play-icon" aria-hidden="true">{playing === 'all' ? '■' : '▶'}</span>
            <span>{playing === 'all' ? 'Parar la orquesta' : 'Que suene la orquesta'}</span>
          </button>
        </div>

        <ul className="orq-stage" aria-label="Músicos de la orquesta">
          {MUSICIANS.map((m) => (
            <li key={m.id} className={`orq-musician ${active(m) ? 'on' : ''}`}
              style={active(m) ? { '--c': anomalyColor(Math.max(v, 0.6)), '--t': textOn(Math.max(v, 0.6)) } : undefined}>
              <svg viewBox="0 0 48 48" aria-hidden="true"><Icon id={m.id} /></svg>
              <div>
                <strong>{m.name}</strong>
                <small>{m.role}</small>
              </div>
              <span className="orq-rule">{m.rule}</span>
            </li>
          ))}
        </ul>

        <div className="orq-scale" aria-hidden="true">
          <div className="orq-scale-bar" />
          {MUSICIANS.filter((m) => m.min !== undefined && m.id !== 'trompeta' && m.id !== 'trombon').map((m) => (
            <span key={m.id} className="orq-entry" style={{ left: pos(m.min) }}>
              <i />{m.min === 1.5 ? 'timbal y trompeta' : m.min === 1.0 ? 'campana y trombón' : m.name.toLowerCase()} · +{m.min.toFixed(1)}
            </span>
          ))}
          {current && <span className="orq-pointer" style={{ left: pos(v) }}>{current.year}</span>}
        </div>
        <p className="hint">Escala de entradas: el marcador muestra la temperatura del año que suena (respecto a 1880–1900).</p>

        <div className="orq-decades" role="group" aria-label="Escuchar una década">
          {decades.map((d, k) => (
            <button type="button" key={d.start} className={playing === d.start ? 'on' : ''}
              style={{ background: anomalyColor(d.value), color: textOn(d.value) }}
              onClick={() => { setText(pregon(d, decades[k - 1])); play(d.years, d.start, Math.max(4, d.years.length * 0.7)); }}>
              <b>{d.label}s</b>
              <small>{formatTemperature(d.value)}</small>
            </button>
          ))}
        </div>
        <p className="hint">Toca una década para escuchar solo esos años y leer lo que dice el sonero.</p>
      </div>
    </section>
  );
}
