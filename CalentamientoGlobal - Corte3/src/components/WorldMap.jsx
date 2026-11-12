import { useEffect, useMemo, useRef, useState } from 'react';
import { geoEqualEarth, geoGraticule10, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import countries from 'world-atlas/countries-110m.json';
import { anomalyColor, LEGEND_STOPS } from '../lib/colors.js';
import { ZONES, formatTemperature } from '../lib/gistemp.js';
import { sonifier } from '../lib/sonification.js';

const W = 960;
const H = 470;
const land = feature(countries, countries.objects.countries);
const borders = mesh(countries, countries.objects.countries, (a, b) => a !== b);
const projection = geoEqualEarth().fitExtent([[10, 10], [W - 130, H - 10]], { type: 'Sphere' });
const SPHERE = { type: 'Sphere' };
const graticule = geoGraticule10();

/** Dibuja el mapa en canvas (mucho más ligero que 8 copias SVG recortadas del mundo) */
function drawMap(canvas, row, hoverZone) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== W * dpr) {
    canvas.width = W * dpr;
    canvas.height = H * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const path = geoPath(projection, ctx);

  ctx.beginPath(); path(SPHERE); ctx.fillStyle = '#101015'; ctx.fill();

  ZONES.forEach((z) => {
    const v = row.zones[z.key].anomalyPreindustrial;
    const y0 = latY(z.lat[1]);
    const y1 = latY(z.lat[0]);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y0, W, y1 - y0); ctx.clip();
    ctx.globalAlpha = hoverZone && hoverZone !== z.key ? 0.3 : 1;
    ctx.beginPath(); path(SPHERE); ctx.fillStyle = anomalyColor(v, 0.42); ctx.fill();
    ctx.beginPath(); path(land); ctx.fillStyle = anomalyColor(v); ctx.fill();
    ctx.restore();
  });

  ctx.save();
  ctx.beginPath(); path(SPHERE); ctx.clip();
  ctx.beginPath(); path(graticule); ctx.strokeStyle = 'rgba(243,237,226,.07)'; ctx.lineWidth = 0.6; ctx.stroke();
  ctx.beginPath(); path(borders); ctx.strokeStyle = 'rgba(11,10,13,.55)'; ctx.lineWidth = 0.5; ctx.stroke();
  ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(243,237,226,.35)'; ctx.lineWidth = 1;
  ZONES.slice(0, -1).forEach((z) => {
    ctx.beginPath(); ctx.moveTo(0, latY(z.lat[0])); ctx.lineTo(W, latY(z.lat[0])); ctx.stroke();
  });
  ctx.restore();
  ctx.setLineDash([]);
  ctx.beginPath(); path(SPHERE); ctx.strokeStyle = 'rgba(243,237,226,.4)'; ctx.lineWidth = 1.2; ctx.stroke();
}
// En Equal Earth los paralelos son rectas horizontales: cada banda es un rectángulo recortado por la esfera.
const latY = (lat) => projection([0, lat])[1];

export default function WorldMap({ zonal, shift, baselineLabel, soundOn }) {
  const years = zonal.data.map((d) => d.year);
  const [year, setYear] = useState(years.at(-1));
  const [playing, setPlaying] = useState(false);
  const [hoverZone, setHoverZone] = useState(null);
  const timer = useRef(null);
  const canvasRef = useRef(null);

  const row = useMemo(() => zonal.data.find((d) => d.year === year) ?? zonal.data.at(-1), [zonal, year]);
  const first = zonal.data[0];

  useEffect(() => {
    if (canvasRef.current) drawMap(canvasRef.current, row, hoverZone);
  }, [row, hoverZone]);

  // Reproducción animada año a año
  useEffect(() => {
    if (!playing) return undefined;
    timer.current = setInterval(() => {
      setYear((y) => {
        const next = y + 1;
        if (next > years.at(-1)) {
          setPlaying(false);
          return y;
        }
        return next;
      });
    }, 380);
    return () => clearInterval(timer.current);
  }, [playing, years]);

  // Acorde por año (cada banda de latitud es una voz, norte a la izquierda, sur a la derecha)
  useEffect(() => {
    if (playing && soundOn) {
      sonifier.playChord(ZONES.map((z) => row.zones[z.key].anomalyPreindustrial), 0.42);
    }
  }, [row, playing, soundOn]);

  const togglePlay = () => {
    if (!playing && year >= years.at(-1)) setYear(years[0]);
    setPlaying((p) => !p);
  };

  const maxBar = 4.5;
  const zoneInfo = hoverZone ? ZONES.find((z) => z.key === hoverZone) : null;

  return (
    <section className="section" id="mapa">
      <div className="section-head">
        <p className="kicker">03 El planeta por latitudes</p>
        <h2>El calor no se reparte igual: el Ártico se calienta mucho más rápido</h2>
        <p className="section-sub">
          GISTEMP también publica anomalías anuales para 8 bandas de latitud. Cada franja del mapa se colorea con
          la anomalía de su banda. Pulsa reproducir y mira (y escucha) un siglo pasar.
        </p>
      </div>

      <div className="map-layout">
        <div className="map-card">
          <div className="map-toolbar">
            <button type="button" className={`play small ${playing ? 'is-playing' : ''}`} onClick={togglePlay}
              aria-label={playing ? 'Pausar animación' : 'Reproducir animación por años'}>
              <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
            </button>
            <div className="map-year mono" aria-live="polite">{year}</div>
            <input className="map-slider" type="range" min={years[0]} max={years.at(-1)} value={year}
              aria-label="Año del mapa"
              onChange={(e) => { setPlaying(false); setYear(Number(e.target.value)); }} />
            <div className="map-global">
              <span>Global</span>
              <strong className="mono" style={{ color: anomalyColor(row.global.anomalyPreindustrial) }}>
                {formatTemperature(row.global.anomalyPreindustrial - shift)}
              </strong>
            </div>
          </div>

          <div className="map-svg-wrap">
            <canvas ref={canvasRef} className="map-canvas" aria-hidden="true" />
            <svg viewBox={`0 0 ${W} ${H}`} className="map-svg" role="img"
              aria-label={`Mapa mundial de anomalías por bandas de latitud en ${year}`}>
              {ZONES.map((z) => {
                const v = row.zones[z.key].anomalyPreindustrial;
                return (
                  <rect key={z.key} x="0" width={W - 120} y={latY(z.lat[1])} height={latY(z.lat[0]) - latY(z.lat[1])}
                    className={`map-hit ${hoverZone === z.key ? 'on' : ''}`}
                    onMouseEnter={() => { setHoverZone(z.key); if (soundOn && !playing) sonifier.playTone(v * 0.7, { duration: 0.3 }); }}
                    onMouseLeave={() => setHoverZone(null)}
                    onClick={() => setHoverZone(z.key)} />
                );
              })}
              {/* Etiquetas laterales */}
              {ZONES.map((z) => {
                const v = row.zones[z.key].anomalyPreindustrial;
                const yMid = (latY(z.lat[0]) + latY(z.lat[1])) / 2;
                return (
                  <g key={`l-${z.key}`} pointerEvents="none">
                    <text x={W - 118} y={yMid + 5} className="map-band-value" fill={v >= 1.6 ? "#ff9b85" : anomalyColor(Math.max(v, 0.9))}>
                      {formatTemperature(v - shift, 1)}
                    </text>
                  </g>
                );
              })}
            </svg>
            {zoneInfo && (
              <div className="map-tip">
                <strong>{zoneInfo.label}</strong> <span>{zoneInfo.range}</span>
                <b className="mono">{formatTemperature(row.zones[zoneInfo.key].anomalyPreindustrial - shift)}</b>
                <small>en {year}, respecto a {baselineLabel}</small>
              </div>
            )}
          </div>

          <div className="legend" aria-label="Leyenda de colores (anomalía respecto a 1880–1900)">
            <div className="legend-bar" style={{
              background: `linear-gradient(90deg, ${LEGEND_STOPS.map((v) => anomalyColor(v)).join(',')})`,
            }} />
            <div className="legend-ticks mono">
              {LEGEND_STOPS.filter((_, i) => i % 2 === 0).map((v) => <span key={v}>{v > 0 ? '+' : ''}{v}</span>)}
            </div>
            <small>Color = anomalía respecto a 1880–1900 (°C)</small>
          </div>
        </div>

        <aside className="profile">
          <h3>Perfil por latitud</h3>
          <p className="hint">Barra = {year}. Marca blanca = {first.year}.</p>
          <ul>
            {ZONES.map((z) => {
              const v = row.zones[z.key].anomalyPreindustrial;
              const v0 = first.zones[z.key].anomalyPreindustrial;
              const pct = (n) => `${(Math.max(-0.5, Math.min(maxBar, n)) + 0.5) / (maxBar + 0.5) * 100}%`;
              return (
                <li key={z.key} className={hoverZone === z.key ? 'on' : ''}
                  onMouseEnter={() => setHoverZone(z.key)} onMouseLeave={() => setHoverZone(null)}>
                  <span className="profile-name">{z.label}<small>{z.range}</small></span>
                  <span className="profile-track">
                    <span className="profile-zero" style={{ left: pct(0) }} />
                    <span className="profile-bar" style={{ left: pct(Math.min(0, v)), width: `${(Math.min(Math.abs(v), maxBar) / (maxBar + 0.5)) * 100}%`, background: anomalyColor(v) }} />
                    <span className="profile-ref" style={{ left: pct(v0) }} />
                  </span>
                  <b className="mono">{formatTemperature(v - shift, 1)}</b>
                </li>
              );
            })}
          </ul>
          <p className="note">
            Entre {first.year} y {year}, el Ártico pasó de {formatTemperature(first.zones['64N-90N'].anomalyPreindustrial - shift, 1)} a{' '}
            {formatTemperature(row.zones['64N-90N'].anomalyPreindustrial - shift, 1)}, mientras el promedio global pasó de{' '}
            {formatTemperature(first.global.anomalyPreindustrial - shift, 1)} a {formatTemperature(row.global.anomalyPreindustrial - shift, 1)}.
            Los datos polares antiguos tienen pocas estaciones, así que son más inciertos.
          </p>
        </aside>
      </div>
    </section>
  );
}
