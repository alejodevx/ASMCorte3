import { useEffect, useMemo, useRef, useState } from 'react';
import { anomalyColor } from '../lib/colors.js';
import { formatDate, formatTemperature } from '../lib/gistemp.js';

function useWidth(ref) {
  const [w, setW] = useState(900);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export default function TemperatureChart({ data, comparison, shift, baselineLabel, playIndex, onHoverValue, onBrush }) {
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);
  const height = width < 600 ? 320 : 440;
  const pad = { left: width < 600 ? 40 : 56, right: width < 600 ? 12 : 24, top: 24, bottom: 36 };
  const [hover, setHover] = useState(null);
  const [brush, setBrush] = useState(null); // { a, b } índices mientras se arrastra

  const geo = useMemo(() => {
    if (!data.length) return null;
    const values = data.map((d) => d.anomalyPreindustrial);
    const minY = Math.min(-0.4, ...values) - 0.1;
    const maxY = Math.max(2.2, ...values) + 0.1;
    const x = (i) => pad.left + (i / Math.max(1, data.length - 1)) * (width - pad.left - pad.right);
    const y = (v) => pad.top + ((maxY - v) / (maxY - minY)) * (height - pad.top - pad.bottom);
    const monthly = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.anomalyPreindustrial).toFixed(1)}`).join('');
    let rolling = '';
    let started = false;
    data.forEach((d, i) => {
      if (!Number.isFinite(d.rolling12)) return;
      rolling += `${started ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.rolling12).toFixed(1)}`;
      started = true;
    });
    const area = `${monthly}L${x(data.length - 1)},${y(minY)}L${x(0)},${y(minY)}Z`;
    // Marcas de años
    const span = data.length / 12;
    const stepYears = span > 60 ? 20 : span > 25 ? 10 : span > 10 ? 5 : span > 4 ? 2 : 1;
    const yearTicks = [];
    data.forEach((d, i) => {
      if (d.month === 1 && d.year % stepYears === 0) yearTicks.push({ i, year: d.year });
    });
    return { minY, maxY, x, y, monthly, rolling, area, yearTicks };
  }, [data, width, height, pad.left, pad.right, pad.top, pad.bottom]);

  if (!data.length || !geo) {
    return <div ref={wrapRef} className="chart-empty">No hay datos para el rango seleccionado.</div>;
  }

  const { minY, maxY, x, y } = geo;
  const gradStops = [];
  for (let k = 0; k <= 12; k += 1) {
    const v = maxY - (k / 12) * (maxY - minY);
    gradStops.push(<stop key={k} offset={`${(k / 12) * 100}%`} stopColor={anomalyColor(v)} />);
  }

  const gridValues = [];
  for (let v = Math.ceil((minY - shift) * 2) / 2; v <= maxY - shift + 1e-9; v += 0.5) gridValues.push(v);

  const indexAt = (clientX) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * width;
    return Math.round(((px - pad.left) / (width - pad.left - pad.right)) * (data.length - 1));
  };
  const handleMove = (clientX) => {
    const i = indexAt(clientX);
    if (i < 0 || i >= data.length) return;
    if (brush) setBrush((b) => (b ? { ...b, b: i } : b));
    if (hover !== i) {
      setHover(i);
      onHoverValue?.(data[i].anomalyPreindustrial);
    }
  };

  const active = playIndex ?? hover;
  const a = active != null ? data[active] : null;
  const windowEnd = comparison ? comparison.windowSize - 1 : 0;

  return (
    <div ref={wrapRef} className="chart-wrap"
      onMouseDown={(e) => {
        if (!onBrush || e.button !== 0) return;
        const i = Math.max(0, Math.min(data.length - 1, indexAt(e.clientX)));
        setBrush({ a: i, b: i });
      }}
      onMouseUp={() => {
        if (!brush) return;
        const a = Math.min(brush.a, brush.b);
        const b = Math.max(brush.a, brush.b);
        setBrush(null);
        if (b - a >= 23) onBrush(a, b);
      }}
      onMouseMove={(e) => handleMove(e.clientX)}
      onMouseLeave={() => { setHover(null); setBrush(null); }}
      onTouchMove={(e) => handleMove(e.touches[0].clientX)}
      onTouchEnd={() => setHover(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img"
        aria-label={`Anomalía mensual de temperatura global de ${formatDate(data[0].date)} a ${formatDate(data.at(-1).date)}, respecto a ${baselineLabel}`}>
        <defs>
          <linearGradient id="heatline" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={y(maxY)} y2={y(minY)}>{gradStops}</linearGradient>
          <linearGradient id="heatarea" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={y(maxY)} y2={y(minY)}>
            {gradStops.map((s) => <stop key={s.key} offset={s.props.offset} stopColor={s.props.stopColor} stopOpacity="0.22" />)}
          </linearGradient>
        </defs>

        {/* Zonas de París */}
        <rect x={pad.left} width={width - pad.left - pad.right} y={y(Math.min(maxY, 2.0))} height={Math.max(0, y(1.5) - y(Math.min(maxY, 2.0)))} className="zone-15" />
        {maxY > 2 && <rect x={pad.left} width={width - pad.left - pad.right} y={y(maxY)} height={y(2.0) - y(maxY)} className="zone-20" />}

        {/* Rejilla */}
        {gridValues.map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={width - pad.right} y1={y(v + shift)} y2={y(v + shift)} className={Math.abs(v) < 1e-9 ? 'grid zero' : 'grid'} />
            <text x={pad.left - 8} y={y(v + shift) + 4} textAnchor="end" className="axis-label">{v > 0 ? '+' : ''}{v.toFixed(1)}</text>
          </g>
        ))}
        {geo.yearTicks.map(({ i, year }) => (
          <text key={year} x={x(i)} y={height - 12} textAnchor="middle" className="axis-label">{year}</text>
        ))}

        {/* Ventanas de comparación */}
        {comparison && (
          <>
            <rect x={x(0)} width={Math.max(2, x(windowEnd) - x(0))} y={pad.top} height={height - pad.top - pad.bottom} className="win" />
            <rect x={x(data.length - 1 - windowEnd)} width={Math.max(2, x(data.length - 1) - x(data.length - 1 - windowEnd))} y={pad.top} height={height - pad.top - pad.bottom} className="win" />
            <line x1={x(0)} x2={x(windowEnd)} y1={y(comparison.initialAverage)} y2={y(comparison.initialAverage)} className="win-avg" />
            <line x1={x(data.length - 1 - windowEnd)} x2={x(data.length - 1)} y1={y(comparison.finalAverage)} y2={y(comparison.finalAverage)} className="win-avg" />
          </>
        )}

        <path d={geo.area} fill="url(#heatarea)" />
        <path d={geo.monthly} className="line-monthly" />
        <path d={geo.rolling} className="line-rolling" stroke="url(#heatline)" />

        {/* Umbrales de París */}
        {[1.5, 2.0].map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className="paris-line" />
            <text x={width - pad.right - 4} y={y(t) - 6} textAnchor="end" className="paris-label">
              París +{t.toFixed(1)} °C{shift ? ` (= ${formatTemperature(t - shift)} vs 1951–80)` : ''}
            </text>
          </g>
        ))}

        {brush && brush.a !== brush.b && (
          <rect x={x(Math.min(brush.a, brush.b))} width={Math.abs(x(brush.b) - x(brush.a))} y={pad.top}
            height={height - pad.top - pad.bottom} className={`brush ${Math.abs(brush.b - brush.a) >= 23 ? 'ok' : ''}`} />
        )}

        {a && (
          <g className="cursor">
            <line x1={x(active)} x2={x(active)} y1={pad.top} y2={height - pad.bottom} />
            <circle cx={x(active)} cy={y(a.anomalyPreindustrial)} r="6" fill={anomalyColor(a.anomalyPreindustrial)} />
          </g>
        )}
      </svg>

      {a && (
        <div className="tooltip" style={{
          left: `${(x(active) / width) * 100}%`,
          transform: `translateX(${x(active) > width * 0.65 ? '-105%' : '5%'})`,
        }}>
          <strong>{formatDate(a.date)}</strong>
          <span>Mes: <b className="mono">{formatTemperature(a.anomalyPreindustrial - shift)}</b></span>
          <span>Media 12 m: <b className="mono">{formatTemperature(a.rolling12 - shift)}</b></span>
          <small>respecto a {baselineLabel}</small>
        </div>
      )}
    </div>
  );
}
