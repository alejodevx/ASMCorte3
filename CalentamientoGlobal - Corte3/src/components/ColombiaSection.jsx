import { useMemo, useState } from 'react';
import { anomalyColor } from '../lib/colors.js';
import { average, formatTemperature } from '../lib/gistemp.js';
import { sonifier } from '../lib/sonification.js';

const RECENT = [2016, 2025];
const FLOORS = [
  { name: 'Piso cálido', from: 0, to: 1000 },
  { name: 'Piso templado', from: 1000, to: 2000 },
  { name: 'Piso frío', from: 2000, to: 3100 },
];

function prettyName(raw) {
  const fixes = {
    'Bogota Eldorado': 'Bogotá (El Dorado)',
    'Cali Alfonso Bonill': 'Cali (Alfonso Bonilla)',
    'San Andres Isla S': 'San Andrés',
    'Pasto Antonio Narin': 'Pasto (Antonio Nariño)',
    'Olaya Herrera': 'Medellín (Olaya Herrera)',
    'Jose Maria Cordova': 'Rionegro (José María Córdova)',
    'Rafael Nunez': 'Cartagena (Rafael Núñez)',
    'Ernesto Cortissoz': 'Barranquilla (Ernesto Cortissoz)',
    'Simon Bolivar': 'Santa Marta (Simón Bolívar)',
    'Camilo Daza': 'Cúcuta (Camilo Daza)',
    'Palonegro': 'Bucaramanga (Palonegro)',
    'Matecana': 'Pereira (Matecaña)',
    'El Eden': 'Armenia (El Edén)',
    'Perales': 'Ibagué (Perales)',
    'Vanguardia': 'Villavicencio (Vanguardia)',
    'Benito Salas': 'Neiva (Benito Salas)',
    'Alfredo Vasquez Cobo': 'Leticia (Vásquez Cobo)',
    'Almirante Padilla': 'Riohacha (Almirante Padilla)',
    'Alfonso Lopez Pumarejo': 'Valledupar (Alfonso López)',
    'Los Garzones': 'Montería (Los Garzones)',
    'Yariguies': 'Barrancabermeja (Yariguíes)',
    'San Luis': 'Ipiales (San Luis)',
    'El Carano': 'Quibdó (El Caraño)',
    'Santiago Perez': 'Arauca (Santiago Pérez)',
  };
  return fixes[raw] ?? raw;
}

/** Media móvil centrada de 5 años para suavizar el ruido */
function smooth(points, k = 2) {
  return points.map((p, i) => {
    const win = points.slice(Math.max(0, i - k), i + k + 1).map((q) => q[1]);
    return [p[0], average(win)];
  });
}

function LineCompare({ colombia, world, coShift }) {
  const W = 640;
  const H = 260;
  const pad = { l: 40, r: 16, t: 16, b: 28 };
  const years = colombia.map((d) => d[0]);
  const x0 = years[0];
  const x1 = Math.max(years.at(-1), world.at(-1)[0]);
  const all = [...colombia, ...world].map((d) => d[1]);
  const minY = Math.min(-0.6, ...all);
  const maxY = Math.max(1.6, ...all);
  const x = (yr) => pad.l + ((yr - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + ((maxY - v) / (maxY - minY)) * (H - pad.t - pad.b);
  const line = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
  const sCo = smooth(colombia);
  const sW = smooth(world.filter((d) => d[0] >= x0));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="co-lines" role="img"
      aria-label="Anomalía anual de Colombia comparada con la global, ambas respecto a 1961–1990">
      {[-0.5, 0, 0.5, 1, 1.5].filter((v) => v >= minY && v <= maxY).map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'grid zero' : 'grid'} />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="axis-label">{v > 0 ? `+${v}` : v}</text>
        </g>
      ))}
      {[1970, 1980, 1990, 2000, 2010, 2020].map((yr) => (
        <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" className="axis-label">{yr}</text>
      ))}
      {colombia.map((d) => (
        <rect key={d[0]} x={x(d[0]) - 2.5} width="5" y={Math.min(y(0), y(d[1]))} height={Math.abs(y(d[1]) - y(0))}
          fill={anomalyColor(d[1] + coShift)} opacity="0.55" />
      ))}
      <path d={line(sW)} className="co-line-world" />
      <path d={line(sCo)} className="co-line-col" />
    </svg>
  );
}

export default function ColombiaSection({ colombia, zonalWorld }) {
  const stations = useMemo(() => colombia.stations
    .filter((s) => s.baseline && s.annual.at(-1)[0] >= 2020)
    .map((s) => {
      const recent = s.annual.filter((a) => a[0] >= RECENT[0] && a[0] <= RECENT[1] && a[2] != null);
      const recentAbs = average(recent.map((a) => a[1]));
      return {
        ...s,
        label: prettyName(s.name),
        warming: recent.length >= 5 ? average(recent.map((a) => a[2])) : NaN,
        recentAbs,
      };
    })
    .filter((s) => Number.isFinite(s.warming))
    .sort((a, b) => a.elev - b.elev), [colombia]);

  const defaultId = stations.find((s) => s.label.startsWith('Cali'))?.id ?? stations[0]?.id;
  const [selectedId, setSelectedId] = useState(defaultId);
  const selected = stations.find((s) => s.id === selectedId) ?? stations[0];

  // Serie global convertida a la misma referencia (1961–1990)
  // coShift = cuánto más cálido era 1961–1990 que 1880–1900 (para usar la misma escala de color)
  const coShift = useMemo(
    () => average(zonalWorld.filter((d) => d.year >= 1961 && d.year <= 1990).map((d) => d.global.anomalyPreindustrial)),
    [zonalWorld],
  );
  const world = useMemo(
    () => zonalWorld.map((d) => [d.year, d.global.anomalyPreindustrial - coShift]),
    [zonalWorld, coShift],
  );

  const composite = colombia.composite.filter((d) => d[0] <= RECENT[1]);
  const coRecent = average(composite.filter((d) => d[0] >= RECENT[0]).map((d) => d[1]));
  const worldRecent = average(world.filter((d) => d[0] >= RECENT[0] && d[0] <= RECENT[1]).map((d) => d[1]));

  // Perfil de altitud
  const W = 760;
  const H = 360;
  const pad = { l: 56, r: 24, t: 24, b: 30 };
  const maxElev = 3100;
  const px = (i) => pad.l + ((i + 0.5) / stations.length) * (W - pad.l - pad.r);
  const py = (e) => pad.t + (1 - e / maxElev) * (H - pad.t - pad.b);
  const ridge = stations.map((s, i) => [px(i), py(s.elev)]);
  let ridgePath = `M${pad.l},${H - pad.b} L${pad.l},${ridge[0]?.[1] ?? H}`;
  ridge.forEach(([rx, ry]) => { ridgePath += ` L${rx.toFixed(1)},${ry.toFixed(1)}`; });
  ridgePath += ` L${W - pad.r},${ridge.at(-1)?.[1] ?? H} L${W - pad.r},${H - pad.b} Z`;

  const selectStation = (s) => {
    setSelectedId(s.id);
    try { sonifier.playTone(s.warming + 0.35, { duration: 0.3, gain: 0.16 }); } catch { /* sin audio */ }
  };

  const nStations = composite.at(-1)?.[2];

  return (
    <section className="section colombia" id="colombia" aria-labelledby="co-title">
      <div className="section-head">
        <p className="kicker">04 Colombia</p>
        <h2 id="co-title">En Colombia el calentamiento se mide piso por piso</h2>
        <p className="section-sub">
          Datos de las estaciones meteorológicas colombianas que usa GISTEMP, desde el nivel del mar en San Andrés
          hasta los 2 548 m de Bogotá. Cada estación se compara con su propio clima de 1961–1990, porque antes de 1961
          casi no hay registros continuos en el país.
        </p>
      </div>

      <div className="co-figures">
        <p className="co-figure">
          <strong style={{ color: anomalyColor(coRecent + coShift) }}>{formatTemperature(coRecent)}</strong>
          Colombia, promedio {RECENT[0]}–{RECENT[1]} frente a 1961–1990
        </p>
        <p className="co-figure">
          <strong style={{ color: anomalyColor(worldRecent + coShift) }}>{formatTemperature(worldRecent)}</strong>
          El planeta en el mismo período y con la misma referencia
        </p>
      </div>

      <div className="co-layout">
        <figure className="co-profile">
          <figcaption>
            Cada punto es una estación ubicada a su altitud. El color muestra cuánto se calentó entre {RECENT[0]} y {RECENT[1]}.
            Toca una para ver su historia.
          </figcaption>
          <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Perfil de altitud de las estaciones colombianas">
            <defs>
              <linearGradient id="mountain" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3a3340" />
                <stop offset="100%" stopColor="#1b171d" />
              </linearGradient>
            </defs>
            {FLOORS.map((f) => (
              <g key={f.name}>
                <line x1={pad.l} x2={W - pad.r} y1={py(f.to)} y2={py(f.to)} className="co-floor-line" />
                <text x={pad.l + 6} y={py(f.to) + 16} className="co-floor-label">{f.name}</text>
              </g>
            ))}
            {[0, 1000, 2000, 3000].map((e) => (
              <text key={e} x={pad.l - 8} y={py(e) + 4} textAnchor="end" className="axis-label">{e} m</text>
            ))}
            <path d={ridgePath} fill="url(#mountain)" className="co-ridge" />
            {stations.map((s, i) => {
              const on = s.id === selected?.id;
              return (
                <g key={s.id} className={`co-station ${on ? 'on' : ''}`} transform={`translate(${px(i)} ${py(s.elev)})`}
                  role="button" tabIndex={0} aria-pressed={on}
                  aria-label={`${s.label}, ${Math.round(s.elev)} metros, ${formatTemperature(s.warming)}`}
                  onClick={() => selectStation(s)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectStation(s); } }}>
                  <circle r={on ? 11 : 7.5} fill={anomalyColor(s.warming + coShift)} />
                  {on && <circle r="17" className="co-ring" />}
                  <text y={i % 2 ? -40 : -24} textAnchor="middle" className={`co-station-name ${on ? 'on' : ''}`}>
                    {s.label.split(' (')[0].replace('Barrancabermeja', 'Barranca')}
                  </text>
                  <text y="28" textAnchor="middle" className="co-station-value">
                    {formatTemperature(s.warming, 1)}
                  </text>
                </g>
              );
            })}
          </svg>
        </figure>

        {selected && (
          <article className="co-detail" aria-live="polite">
            <h3>{selected.label}</h3>
            <p className="co-detail-meta">{Math.round(selected.elev).toLocaleString('es-CO')} m sobre el nivel del mar</p>
            <dl>
              <div><dt>Temperatura media 1961–1990</dt><dd>{selected.climate.toFixed(1)} °C</dd></div>
              <div><dt>Temperatura media {RECENT[0]}–{RECENT[1]}</dt><dd>{selected.recentAbs.toFixed(1)} °C</dd></div>
              <div className="co-dd-big">
                <dt>Cambio</dt>
                <dd style={{ color: anomalyColor(selected.warming + coShift) }}>{formatTemperature(selected.warming)}</dd>
              </div>
            </dl>
            <div className="co-stripes" role="img" aria-label={`Franjas anuales de ${selected.label}`}>
              {selected.annual.filter((a) => a[2] != null).map((a) => (
                <span key={a[0]} title={`${a[0]}: ${formatTemperature(a[2])}`} style={{ background: anomalyColor(a[2] + coShift) }} />
              ))}
            </div>
            <p className="co-stripes-axis">
              <span>{selected.annual.find((a) => a[2] != null)?.[0]}</span>
              <span>{selected.annual.at(-1)[0]}</span>
            </p>
            <label className="co-select">
              Otra estación
              <select value={selected.id} onChange={(e) => selectStation(stations.find((s) => s.id === e.target.value))}>
                {[...stations].sort((a, b) => a.label.localeCompare(b.label, 'es')).map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
          </article>
        )}
      </div>

      <figure className="co-compare">
        <figcaption>
          Colombia frente al mundo. Las barras son el promedio anual de las estaciones colombianas; las líneas, la tendencia
          de 5 años. Ambas series comparan con 1961–1990.
          <span className="co-legend">
            <span><i className="co-key col" />Colombia</span>
            <span><i className="co-key world" />Mundo</span>
          </span>
        </figcaption>
        <LineCompare colombia={composite.map((d) => [d[0], d[1]])} world={world} coShift={coShift} />
      </figure>

      <p className="co-note">
        Colombia es un país tropical: su temperatura cambia poco de un mes a otro y mucho con la altitud. Por eso aquí
        no se dibujan los umbrales de París, que se refieren al promedio de todo el planeta. La serie nacional promedia las{' '}
        {colombia.stations.filter((s) => s.baseline).length} estaciones de la versión homogeneizada de GISTEMP v4 que tienen
        clima de referencia; no todas siguen activas ({nStations} reportaron en {composite.at(-1)?.[0]}).
        El color usa la misma escala de la página, desplazada para que el cero de 1961–1990 coincida con el cero global equivalente.
      </p>
    </section>
  );
}
