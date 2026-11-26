import { useEffect, useMemo, useState } from 'react';
import { anomalyColor, anomalyRgb, textOn } from '../lib/colors.js';
import { formatTemperature } from '../lib/gistemp.js';
import { ENTRY, sonifier } from '../lib/sonification.js';

/*
 * La orquesta del clima, en una tarima en medio del Parque El Obrero (Barrio Obrero, Cali).
 * Cada año es un compás y cada músico entra cuando el planeta cruza su umbral de temperatura.
 * Los umbrales (ENTRY) son los mismos que usa el motor de sonido: lo que se ve es lo que suena.
 */
const MUSICIANS = [
  { id: 'clave', name: 'Sonero con clave', role: 'Marca el pulso: un compás por año', min: null, x: 600, y: 426, s: 1, shirt: '#fdf6e3', pants: '#2b2d42', skin: '#8d5524', hair: '#1b1b1b', hat: true },
  { id: 'bajo', name: 'Bajo tumbao', role: 'Su nota sube con la temperatura', min: null, x: 388, y: 362, s: 0.9, shirt: '#f4d35e', pants: '#3d405b', skin: '#c68642', hair: '#2b1d14' },
  { id: 'piano', name: 'Piano montuno', role: 'Cada nota es un año: más agudo, más calor', min: null, x: 512, y: 362, s: 0.9, shirt: '#90e0ef', pants: '#22223b', skin: '#e0ac69', hair: '#3b2414' },
  { id: 'guiro', name: 'Güiro', role: 'Raspa más fuerte cuanto más calor', min: ENTRY.guiro, x: 486, y: 426, s: 1, shirt: '#ff99c8', pants: '#33415c', skin: '#a0662f', hair: '#111' },
  { id: 'conga', name: 'Conga', role: 'El tumbao empieza a calentar', min: ENTRY.conga, x: 364, y: 426, s: 1, shirt: '#ffffff', pants: '#5c3d2e', skin: '#5a3825', hair: '#111', hat: true },
  { id: 'campana', name: 'Campana', role: 'Avisa que la fiesta cambió', min: ENTRY.campana, x: 812, y: 362, s: 0.9, shirt: '#caffbf', pants: '#2f3e46', skin: '#c68642', hair: '#2b1d14' },
  { id: 'trombon', name: 'Trombón', role: 'Refuerza la melodía cuando sube el calor', min: ENTRY.trombon, x: 714, y: 426, s: 1, shirt: '#ffadad', pants: '#1d3557', skin: '#e0ac69', hair: '#4a2c17' },
  { id: 'timbal', name: 'Timbal', role: 'Repica cuando el calor aprieta', min: ENTRY.timbal, x: 690, y: 362, s: 0.9, shirt: '#ffd6a5', pants: '#3a3a3a', skin: '#8d5524', hair: '#111' },
  { id: 'trompeta', name: 'Trompeta', role: 'A un paso de París: le quita la melodía al piano', min: ENTRY.trompeta, x: 842, y: 426, s: 1, shirt: '#bdb2ff', pants: '#222', skin: '#a0662f', hair: '#111', hat: true },
];

const ENTRANCE = {
  guiro: 'El güiro raspa bajito: el calor apenas se asoma.',
  conga: '¡Llegó la conga! El planeta pasó +0.4 °C y el tumbao empieza a calentar.',
  campana: '¡Suena la campana! Pasamos +0.7 °C: esto ya no es un bolero.',
  trombon: '¡Entran los trombones! +1.0 °C: la temperatura sube como un mambo.',
  timbal: '¡Repica el timbal! +1.2 °C: en el Obrero ya nadie se queda sentado.',
  trompeta: '¡La trompeta le quita la melodía al piano! +1.4 °C, a un paso del límite de París.',
};

const isOn = (m, v) => m.min === null || v >= m.min;

/** Pregón del sonero: explica cada década según quién entra y cómo cambió la temperatura */
function pregon(decade, prev) {
  const v = decade.value;
  if (!prev) {
    return `Años ${decade.label}: la orquesta afina con clave, bajo y piano. Así sonaba un planeta a ${formatTemperature(v)} de la época preindustrial.`;
  }
  const joined = MUSICIANS.filter((m) => m.min !== null && v >= m.min && prev.value < m.min);
  if (joined.length) return `Años ${decade.label} (${formatTemperature(v)}): ${ENTRANCE[joined.at(-1).id]}`;
  const d = v - prev.value;
  if (d < -0.02) return `Años ${decade.label} (${formatTemperature(v)}): una década algo más fresca. La orquesta baja el volumen, pero nadie se va de la tarima.`;
  if (d < 0.08) return `Años ${decade.label} (${formatTemperature(v)}): el mismo combo, casi la misma temperatura. El baile sigue.`;
  return `Años ${decade.label} (${formatTemperature(v)}): ${d.toFixed(2)} °C más que la década anterior. Mismo combo, más candela.`;
}

/* ───────── Dibujo 2D ───────── */

const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
const rgb = (c) => `rgb(${c.join(',')})`;

function Arm({ from, to, color, skin }) {
  return (
    <g>
      <path d={`M${from[0]} ${from[1]} L${to[0]} ${to[1]}`} stroke={color} strokeWidth="8" strokeLinecap="round" />
      <circle cx={to[0]} cy={to[1]} r="4.5" fill={skin} />
    </g>
  );
}

const HANDS = {
  clave: [[-8, -80], [9, -82]],
  guiro: [[-20, -78], [22, -74]],
  conga: [[-11, -66], [11, -68]],
  bajo: [[22, -118], [20, -64]],
  piano: [[-16, -66], [16, -66]],
  campana: [[-20, -86], [16, -92]],
  timbal: [[-26, -70], [24, -72]],
  trombon: [[14, -100], [44, -96]],
  trompeta: [[16, -106], [26, -110]],
};

function Instrument({ id }) {
  const brass = '#e0a526';
  switch (id) {
    case 'clave':
      return (
        <g>
          <path d="M-14 -76 L-2 -88 M3 -88 L16 -76" stroke="#7a4b24" strokeWidth="5" strokeLinecap="round" />
          <path d="M34 0 L34 -104" stroke="#444" strokeWidth="3" />
          <path d="M26 0 L42 0" stroke="#444" strokeWidth="3" />
          <path d="M34 -104 L22 -112" stroke="#444" strokeWidth="3" />
          <ellipse cx="19" cy="-114" rx="5" ry="7" fill="#222" transform="rotate(-30 19 -114)" />
        </g>
      );
    case 'guiro':
      return (
        <g>
          <ellipse cx="0" cy="-78" rx="25" ry="9" fill="#c98a3c" />
          {[-12, -6, 0, 6, 12].map((x) => <path key={x} d={`M${x} -86 L${x} -70`} stroke="#7a4b24" strokeWidth="1.6" />)}
          <path d="M22 -74 L36 -90" stroke="#5b3a1a" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'conga':
      return (
        <g>
          <path d="M-17 -64 Q-23 -30 -12 0 L12 0 Q23 -30 17 -64 Z" fill="#a0522d" />
          <path d="M-19 -48 L19 -48 M-18 -16 L18 -16" stroke="#e9c46a" strokeWidth="3" />
          <ellipse cx="0" cy="-64" rx="17" ry="5" fill="#f1e3c6" stroke="#6b3a1e" strokeWidth="2" />
        </g>
      );
    case 'bajo':
      return (
        <g>
          <path d="M22 -150 L22 -84" stroke="#3b2414" strokeWidth="5" strokeLinecap="round" />
          <circle cx="22" cy="-154" r="5" fill="#3b2414" />
          <path d="M22 -86 C4 -86 2 -70 10 -60 C-2 -50 0 -14 22 -8 C44 -14 46 -50 34 -60 C42 -70 40 -86 22 -86 Z" fill="#8b4513" stroke="#4a230a" strokeWidth="2" />
          <path d="M16 -70 Q14 -62 16 -54 M28 -70 Q30 -62 28 -54" stroke="#2b1408" strokeWidth="2" fill="none" />
          <path d="M22 -8 L22 0" stroke="#222" strokeWidth="3" />
        </g>
      );
    case 'piano':
      return (
        <g>
          <rect x="-52" y="-64" width="104" height="46" rx="4" fill="#1f1a16" />
          <rect x="-48" y="-62" width="96" height="10" fill="#fdfdfd" />
          {Array.from({ length: 11 }, (_, i) => <rect key={i} x={-44 + i * 8.6} y="-62" width="4" height="6" fill="#111" />)}
          <path d="M-46 -18 L-46 0 M46 -18 L46 0" stroke="#1f1a16" strokeWidth="5" />
          <text x="0" y="-30" textAnchor="middle" className="orq-brand">SALSA</text>
        </g>
      );
    case 'campana':
      return (
        <g>
          <path d="M-28 -98 L-14 -98 L-10 -76 L-32 -76 Z" fill="#b8b8b8" stroke="#666" strokeWidth="1.5" />
          <path d="M16 -92 L-6 -100" stroke="#7a4b24" strokeWidth="3.5" strokeLinecap="round" />
        </g>
      );
    case 'timbal':
      return (
        <g>
          <path d="M-40 -66 L-12 -66 L-12 -48 L-40 -48 Z" fill="#c0c0c0" stroke="#777" strokeWidth="1.5" />
          <ellipse cx="-26" cy="-66" rx="14" ry="4" fill="#eee" stroke="#777" />
          <path d="M8 -68 L38 -68 L38 -48 L8 -48 Z" fill="#c0c0c0" stroke="#777" strokeWidth="1.5" />
          <ellipse cx="23" cy="-68" rx="15" ry="4" fill="#eee" stroke="#777" />
          <path d="M-26 -48 L-34 0 M-26 -48 L-18 0 M23 -48 L15 0 M23 -48 L31 0" stroke="#555" strokeWidth="2.5" />
          <path d="M-26 -70 L-12 -84 M24 -72 L38 -86" stroke="#7a4b24" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'trombon':
      return (
        <g stroke={brass} strokeWidth="4" fill="none" strokeLinecap="round">
          <path d="M8 -112 L80 -112 L80 -102 L20 -102" />
          <path d="M44 -112 L44 -122" />
          <path d="M30 -122 L52 -122" />
          <path d="M8 -112 L-6 -112" />
          <path d="M-6 -126 L-22 -132 L-22 -92 L-6 -98" fill={brass} />
        </g>
      );
    case 'trompeta':
      return (
        <g transform="rotate(-18 10 -114)">
          <path d="M6 -114 L58 -114" stroke={brass} strokeWidth="5" strokeLinecap="round" />
          <path d="M58 -114 L74 -124 L74 -104 Z" fill={brass} />
          <path d="M20 -114 L20 -122 M28 -114 L28 -122 M36 -114 L36 -122" stroke={brass} strokeWidth="3" />
          <path d="M18 -106 L46 -106" stroke={brass} strokeWidth="3" />
        </g>
      );
    default:
      return null;
  }
}

/** Un músico de la orquesta: cuerpo, cabeza, brazos según el instrumento y un atril con su temperatura de entrada */
function Musician({ m, on, v }) {
  const [h1, h2] = HANDS[m.id];
  const front = ['conga', 'piano', 'timbal'].includes(m.id);
  const color = on ? anomalyColor(Math.max(v, 0.5)) : '#9a8f84';
  return (
    <g className={`orq-m ${on ? 'on' : 'off'}`} transform={`translate(${m.x} ${m.y}) scale(${m.s})`}>
      {on && <path className="orq-spot" d="M-10 -260 L10 -260 L70 4 L-70 4 Z" />}
      {/* Atril con la partitura: dice a qué temperatura entra */}
      <g transform={m.id === 'bajo' ? 'translate(-46 0)' : 'translate(-44 0)'}>
        <path d="M0 0 L0 -54" stroke="#3b2414" strokeWidth="3" />
        <rect x="-15" y="-74" width="30" height="22" rx="2" fill="#fffaf0" stroke={color} strokeWidth="2.5" />
        <text x="0" y="-59" textAnchor="middle" className="orq-stand">{m.min === null ? '♪' : `+${m.min.toFixed(1)}`}</text>
      </g>
      <g className="orq-body">
        <ellipse cx="0" cy="2" rx="22" ry="5" fill="rgba(0,0,0,.25)" />
        <rect x="-11" y="-50" width="9" height="50" rx="3" fill={m.pants} />
        <rect x="2" y="-50" width="9" height="50" rx="3" fill={m.pants} />
        <ellipse cx="-7" cy="-1" rx="7" ry="3.5" fill="#1a1a1a" />
        <ellipse cx="7" cy="-1" rx="7" ry="3.5" fill="#1a1a1a" />
        <path d="M-18 -48 L-20 -94 Q-20 -102 -11 -104 L11 -104 Q20 -102 20 -94 L18 -48 Z" fill={m.shirt} stroke="rgba(0,0,0,.18)" />
        <path d="M-8 -100 L-8 -52 M8 -100 L8 -52" stroke="rgba(0,0,0,.12)" strokeWidth="2" />
        <rect x="-4" y="-112" width="8" height="9" fill={m.skin} />
        <circle cx="0" cy="-122" r="13" fill={m.skin} />
        <path d="M-13 -124 Q-12 -138 0 -137 Q12 -138 13 -124 Q8 -131 0 -130 Q-8 -131 -13 -124 Z" fill={m.hair} />
        {m.hat && (
          <g>
            <ellipse cx="0" cy="-132" rx="19" ry="4" fill="#f5e6c8" />
            <path d="M-10 -132 Q-10 -146 0 -146 Q10 -146 10 -132 Z" fill="#f5e6c8" />
            <path d="M-10 -135 L10 -135" stroke="#222" strokeWidth="3" />
          </g>
        )}
        <circle cx="-4.5" cy="-122" r="1.6" fill="#1a1a1a" />
        <circle cx="4.5" cy="-122" r="1.6" fill="#1a1a1a" />
        <path d={on ? 'M-5 -115 Q0 -110 5 -115' : 'M-4 -114 L4 -114'} stroke="#3a1f0f" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <g className="orq-inst">
          {!front && <Instrument id={m.id} />}
          <Arm from={[-15, -96]} to={h1} color={m.shirt} skin={m.skin} />
          <Arm from={[15, -96]} to={h2} color={m.shirt} skin={m.skin} />
          {front && <Instrument id={m.id} />}
        </g>
      </g>
      {on && (
        <g className="orq-notes">
          <text x="20" y="-150">♪</text>
          <text x="-24" y="-140">♫</text>
        </g>
      )}
    </g>
  );
}

const HOUSES = [
  ['#f6bd60', 150], ['#84a59d', 132], ['#f28482', 168], ['#8ecae6', 140], ['#e9c46a', 158],
  ['#b5838d', 136], ['#a8dadc', 164], ['#f4a261', 146], ['#90be6d', 154], ['#e76f51', 138],
];

function Houses() {
  let x = -10;
  return (
    <g>
      {HOUSES.map(([c, h], i) => {
        const w = 118 + ((i * 37) % 30);
        const x0 = x;
        x += w;
        const top = 336 - h;
        return (
          <g key={i}>
            <rect x={x0} y={top} width={w} height={h} fill={c} />
            <rect x={x0 - 3} y={top - 8} width={w + 6} height="10" fill="rgba(0,0,0,.22)" />
            <rect x={x0 + w / 2 - 12} y={336 - 46} width="24" height="46" fill="#6b3e26" />
            {[0.25, 0.75].map((f) => (
              <g key={f}>
                <rect x={x0 + w * f - 13} y={top + 24} width="26" height="34" fill="#3a2a1e" opacity=".75" />
                <path d={`M${x0 + w * f - 18} ${top + 58} h36 M${x0 + w * f - 18} ${top + 66} h36`} stroke="#fff" strokeWidth="2" opacity=".8" />
                {[-12, -4, 4, 12].map((dx) => <path key={dx} d={`M${x0 + w * f + dx} ${top + 58} v8`} stroke="#fff" strokeWidth="1.5" opacity=".8" />)}
              </g>
            ))}
          </g>
        );
      })}
    </g>
  );
}

function Tree({ x, s = 1 }) {
  return (
    <g transform={`translate(${x} 340) scale(${s})`}>
      <path d="M-9 0 L-6 -120 L6 -120 L9 0 Z" fill="#5b3a29" />
      <path d="M-4 -100 L-40 -140 M4 -96 L44 -136" stroke="#5b3a29" strokeWidth="8" strokeLinecap="round" />
      <ellipse cx="0" cy="-160" rx="96" ry="44" fill="#2d6a4f" />
      <ellipse cx="-50" cy="-140" rx="56" ry="30" fill="#40916c" />
      <ellipse cx="52" cy="-146" rx="58" ry="30" fill="#40916c" />
      <ellipse cx="0" cy="-182" rx="60" ry="26" fill="#52b788" />
    </g>
  );
}

function Couple({ x, dress, shirt, delay }) {
  return (
    <g className="orq-couple" style={{ animationDelay: `${delay}s` }} transform={`translate(${x} 596) scale(.8)`}>
      <ellipse cx="0" cy="2" rx="40" ry="6" fill="rgba(0,0,0,.2)" />
      <g transform="translate(-16 0)">
        <rect x="-8" y="-50" width="7" height="50" fill="#2b2d42" />
        <rect x="2" y="-50" width="7" height="50" fill="#2b2d42" />
        <path d="M-15 -48 L-16 -96 L16 -96 L15 -48 Z" fill={shirt} />
        <circle cx="0" cy="-110" r="12" fill="#8d5524" />
        <path d="M14 -90 L30 -78" stroke={shirt} strokeWidth="7" strokeLinecap="round" />
        <path d="M-14 -90 L-6 -116" stroke={shirt} strokeWidth="7" strokeLinecap="round" />
      </g>
      <g transform="translate(20 0)">
        <rect x="-6" y="-30" width="5" height="30" fill="#c68642" />
        <rect x="2" y="-30" width="5" height="30" fill="#c68642" />
        <path d="M-28 -26 Q0 -40 28 -26 L12 -70 L-12 -70 Z" fill={dress} />
        <path d="M-12 -70 L-12 -96 L12 -96 L12 -70 Z" fill={dress} />
        <circle cx="0" cy="-108" r="11" fill="#c68642" />
        <path d="M-11 -112 Q0 -126 11 -112 Q14 -96 8 -92 Q0 -100 -8 -92 Q-14 -96 -11 -112 Z" fill="#1b1b1b" />
        <path d="M-10 -90 L-28 -100" stroke="#c68642" strokeWidth="5" strokeLinecap="round" />
        <path d="M10 -90 L20 -118" stroke="#c68642" strokeWidth="5" strokeLinecap="round" />
      </g>
    </g>
  );
}

function ParkScene({ current, playing }) {
  const v = current?.value;
  const t = current ? Math.max(0, Math.min(1, (v + 0.2) / 1.8)) : 0.35;
  const skyTop = rgb(mix([24, 38, 82], [70, 28, 52], t));
  const skyMid = rgb(mix([110, 92, 150], [190, 70, 60], t));
  const horizon = rgb(mix([250, 196, 130], anomalyRgb(Math.max(v ?? 0.6, 0.6)), t));
  const bulbs = [];
  for (let k = 0; k <= 22; k += 1) {
    const x = 90 + k * 46;
    const sag = 40 * Math.sin((Math.PI * k) / 22);
    bulbs.push([x, 150 + sag]);
  }
  const bulbColors = ['#ffd166', '#ef476f', '#06d6a0', '#ffffff', '#f78c6b'];

  return (
    <svg viewBox="40 70 1120 540" className={`orq-scene ${playing ? 'is-playing' : ''}`} role="img"
      aria-label={`Orquesta de salsa en una tarima en el Parque El Obrero de Cali. ${current ? `Año ${current.year}, ${formatTemperature(v)}. Tocan: ${MUSICIANS.filter((m) => isOn(m, v)).map((m) => m.name).join(', ')}.` : 'La orquesta espera para tocar.'}`}>
      <defs>
        <linearGradient id="orq-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={skyTop} />
          <stop offset="55%" stopColor={skyMid} />
          <stop offset="100%" stopColor={horizon} />
        </linearGradient>
        <linearGradient id="orq-curtain" x1="0" y1="0" x2="1" y2="0">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => <stop key={i} offset={`${i * 12.5}%`} stopColor={i % 2 ? '#7b1e2b' : '#9d2235'} />)}
        </linearGradient>
      </defs>

      {/* Cielo de Cali al atardecer: se enrojece con el calor */}
      <rect width="1200" height="640" fill="url(#orq-sky)" />
      <circle cx="1060" cy="92" r="34" fill="#fff4d6" opacity=".9" />
      <path d="M0 250 L120 200 L230 232 L360 170 L480 220 L600 180 L720 214 L860 160 L980 210 L1100 186 L1200 220 L1200 340 L0 340 Z" fill="#3c4f76" opacity=".75" />

      <Houses />
      <Tree x={80} s={1.05} />
      <Tree x={1125} s={1.1} />
      <Tree x={250} s={0.7} />
      <Tree x={960} s={0.72} />

      {/* Plaza */}
      <rect y="336" width="1200" height="304" fill="#d8c7a7" />
      {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M0 ${370 + i * 32} L1200 ${370 + i * 32}`} stroke="rgba(120,90,60,.15)" strokeWidth="2" />)}
      <path d="M0 336 L1200 336" stroke="#6a994e" strokeWidth="10" />

      {/* Bombillos de fiesta */}
      <path d={`M${bulbs.map(([x, y]) => `${x} ${y}`).join(' L')}`} stroke="#2b2b2b" strokeWidth="1.5" fill="none" />
      {bulbs.map(([x, y], k) => (
        <circle key={k} cx={x} cy={y + 6} r="5.5" fill={bulbColors[k % bulbColors.length]}
          className={`orq-bulb ${k % 2 ? 'b' : 'a'}`} />
      ))}

      {/* Tarima */}
      <rect x="268" y="214" width="664" height="210" fill="url(#orq-curtain)" />
      <path d="M252 214 L948 214 L948 196 Q600 150 252 196 Z" fill="#ffd166" />
      <path d="M252 214 Q600 172 948 214" stroke="#ef476f" strokeWidth="6" fill="none" />
      <rect x="250" y="196" width="18" height="236" fill="#5b3a29" />
      <rect x="932" y="196" width="18" height="236" fill="#5b3a29" />
      <rect x="420" y="160" width="360" height="40" rx="8" fill="#1f1a16" />
      <text x="600" y="187" textAnchor="middle" className="orq-sign">PARQUE EL OBRERO · CALI</text>
      <rect x="320" y="360" width="560" height="10" fill="#7a4e2d" />
      <rect x="240" y="424" width="720" height="16" fill="#8a5a36" />
      <rect x="240" y="440" width="720" height="46" fill="#6d4426" />
      <text x="600" y="472" textAnchor="middle" className="orq-stage-text">
        {current ? `${current.year}  ·  ${formatTemperature(v)}` : 'LA ORQUESTA DEL CLIMA'}
      </text>

      {/* Músicos: primero la fila de atrás */}
      {[...MUSICIANS].sort((a, b) => a.y - b.y).map((m) => (
        <Musician key={m.id} m={m} on={!!current && isOn(m, v)} v={v} />
      ))}

      {/* Carrito de lulada */}
      <g transform="translate(1060 580)">
        <rect x="-50" y="-60" width="100" height="44" rx="6" fill="#fefae0" stroke="#bc6c25" strokeWidth="3" />
        <text x="0" y="-32" textAnchor="middle" className="orq-cart">LULADA</text>
        <path d="M-56 -60 L0 -92 L56 -60 Z" fill="#06d6a0" />
        <circle cx="-30" cy="-10" r="10" fill="#333" />
        <circle cx="30" cy="-10" r="10" fill="#333" />
      </g>

      {/* Bailadores: bailan cuando suena la orquesta */}
      {(
        <g>
          <Couple x={150} dress="#ef476f" shirt="#fdf6e3" delay={0} />
          <Couple x={420} dress="#ffd166" shirt="#90e0ef" delay={0.16} />
          <Couple x={780} dress="#06d6a0" shirt="#ffadad" delay={0.08} />
        </g>
      )}
    </svg>
  );
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
  const [playing, setPlaying] = useState(null); // 'all' | inicio de década | null
  const [text, setText] = useState('Pulsa "Que suene la orquesta" y escucha un siglo de temperatura: cada compás es un año y cada músico entra cuando el planeta cruza la temperatura de su atril.');

  useEffect(() => () => sonifier.stop(), []);

  const decadeOf = (year) => decades.findIndex((d) => year >= d.start && year < d.start + 10);

  const play = (list, mode, duration) => {
    if (playing === mode) {
      sonifier.stop();
      setPlaying(null);
      return;
    }
    setPlaying(mode);
    let lastDecade = -1;
    const entered = new Set(MUSICIANS.filter((m) => m.min === null || list[0].value >= m.min).map((m) => m.id));
    sonifier.playSeries(list.map((y) => y.value), {
      duration,
      onStep: (i) => {
        const y = list[i];
        setCurrent(y);
        // Si un músico entra por primera vez en este año, el sonero lo anuncia
        const newcomer = MUSICIANS.filter((m) => !entered.has(m.id) && y.value >= m.min).at(-1);
        MUSICIANS.forEach((m) => { if (m.min !== null && y.value >= m.min) entered.add(m.id); });
        const k = decadeOf(y.year);
        if (newcomer) {
          lastDecade = k;
          setText(`${y.year} (${formatTemperature(y.value)}): ${ENTRANCE[newcomer.id]}`);
        } else if (k !== lastDecade) {
          lastDecade = k;
          setText(pregon(decades[k], decades[k - 1]));
        }
      },
      onEnd: () => setPlaying(null),
    });
  };

  const v = current?.value;
  const scaleMin = -0.2;
  const scaleMax = 1.6;
  const pos = (x) => `${((Math.min(scaleMax, Math.max(scaleMin, x)) - scaleMin) / (scaleMax - scaleMin)) * 100}%`;

  return (
    <section className="section" id="orquesta" aria-labelledby="orq-title">
      <div className="section-head">
        <p className="kicker">03 La orquesta del clima</p>
        <h2 id="orq-title">Un siglo de temperatura, en vivo desde <em>el Parque El Obrero</em></h2>
        <p className="section-sub">
          En el barrio Obrero de Cali se montó la tarima. Cada año es un compás y cada músico tiene en su atril la
          temperatura a la que debe entrar. Con el planeta fresco solo suenan la clave, el bajo y el piano; a medida que
          la Tierra se calienta, la tarima se llena y el cielo se pone rojo.
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

        <div className="orq-scene-wrap">
          <ParkScene current={current} playing={!!playing} />
        </div>

        <ul className="orq-roster" aria-label="Quién toca y cuándo entra">
          {MUSICIANS.map((m) => {
            const on = !!current && isOn(m, v);
            return (
              <li key={m.id} className={on ? 'on' : ''}
                style={on ? { '--c': anomalyColor(Math.max(v, 0.6)), '--t': textOn(Math.max(v, 0.6)) } : undefined}>
                <strong>{m.name}</strong>
                <span>{m.min === null ? 'Siempre' : `Desde +${m.min.toFixed(1)} °C`}</span>
                <small>{m.role}</small>
              </li>
            );
          })}
        </ul>

        <div className="orq-scale" aria-hidden="true">
          <div className="orq-scale-bar" />
          {MUSICIANS.filter((m) => m.min !== null).map((m) => (
            <span key={m.id} className="orq-entry" style={{ left: pos(m.min) }}>
              <i />{m.name.toLowerCase()} · +{m.min.toFixed(1)}
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
