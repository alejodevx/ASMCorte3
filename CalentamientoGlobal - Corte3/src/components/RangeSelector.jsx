import { useEffect, useRef, useState } from 'react';
import { anomalyColor } from '../lib/colors.js';
import { shortDate } from '../lib/gistemp.js';

/** Barras de calentamiento (una franja por mes, color = media móvil de 12 meses) */
function StripesCanvas({ data }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !data.length) return;
    const ctx = c.getContext('2d');
    c.width = data.length;
    c.height = 1;
    data.forEach((d, i) => {
      const v = Number.isFinite(d.rolling12) ? d.rolling12 : d.anomalyPreindustrial;
      ctx.fillStyle = anomalyColor(v);
      ctx.fillRect(i, 0, 1, 1);
    });
  }, [data]);
  return <canvas ref={ref} className="stripes-canvas" aria-hidden="true" />;
}

export default function RangeSelector({ data, startIdx, endIdx, onChange, minSpan }) {
  const last = data.length - 1;
  const [birth, setBirth] = useState('');
  const idxOf = (date) => {
    const i = data.findIndex((d) => d.date >= date);
    return i === -1 ? last : i;
  };

  const setRange = (a, b) => {
    let s = Math.max(0, Math.min(a, last));
    let e = Math.max(0, Math.min(b, last));
    if (e - s < minSpan - 1) {
      if (s + minSpan - 1 <= last) e = s + minSpan - 1;
      else s = Math.max(0, e - minSpan + 1);
    }
    onChange(s, e);
  };

  const presets = [
    { label: 'Último siglo', run: () => setRange(0, last) },
    { label: 'Últimos 30 años', run: () => setRange(last - 30 * 12 + 1, last) },
    { label: 'Desde París (2015)', run: () => setRange(idxOf('2015-12'), last) },
    { label: 'Siglo XX', run: () => setRange(0, idxOf('2000-01') - 1) },
    { label: '1926 vs 1976', run: () => setRange(0, idxOf('1976-12')) },
  ];

  const birthValid = Number(birth) >= 1926 && Number(birth) <= Number(data.at(-1)?.year) - 2;

  const pct = (i) => `${(i / last) * 100}%`;

  return (
    <div className="range">
      <div className="range-dates">
        <label>
          <span>Desde</span>
          <input type="month" value={data[startIdx]?.date ?? ''} min={data[0]?.date} max={data.at(-1)?.date}
            onChange={(e) => e.target.value && setRange(idxOf(e.target.value), endIdx)} />
        </label>
        <span className="range-arrow" aria-hidden="true">→</span>
        <label>
          <span>Hasta</span>
          <input type="month" value={data[endIdx]?.date ?? ''} min={data[0]?.date} max={data.at(-1)?.date}
            onChange={(e) => {
              if (!e.target.value) return;
              const i = data.findIndex((d) => d.date > e.target.value);
              setRange(startIdx, i === -1 ? last : i - 1);
            }} />
        </label>
        <span className="range-span mono">{((endIdx - startIdx + 1) / 12).toFixed(1)} años</span>
      </div>

      <div className="dual-slider">
        <StripesCanvas data={data} />
        <div className="dual-shade" style={{ left: 0, width: pct(startIdx) }} />
        <div className="dual-shade" style={{ left: pct(endIdx), right: 0 }} />
        <div className="dual-window" style={{ left: pct(startIdx), width: `calc(${pct(endIdx)} - ${pct(startIdx)})` }} />
        <input type="range" min="0" max={last} value={startIdx} aria-label="Fecha de inicio"
          aria-valuetext={shortDate(data[startIdx]?.date)}
          onChange={(e) => setRange(Math.min(Number(e.target.value), endIdx - minSpan + 1), endIdx)} />
        <input type="range" min="0" max={last} value={endIdx} aria-label="Fecha final"
          aria-valuetext={shortDate(data[endIdx]?.date)}
          onChange={(e) => setRange(startIdx, Math.max(Number(e.target.value), startIdx + minSpan - 1))} />
      </div>
      <div className="dual-axis mono" aria-hidden="true">
        {[1926, 1950, 1975, 2000, 2025].map((yr) => (
          <span key={yr} style={{ left: pct(idxOf(`${yr}-01`)) }}>{yr}</span>
        ))}
      </div>

      <div className="presets">
        {presets.map((p) => (
          <button type="button" key={p.label} className="chip" onClick={p.run}>{p.label}</button>
        ))}
        <form className="chip chip-form" onSubmit={(e) => {
          e.preventDefault();
          if (birthValid) setRange(idxOf(`${birth}-01`), last);
        }}>
          <label htmlFor="birth">Mi vida, desde</label>
          <input id="birth" type="number" inputMode="numeric" placeholder="año" min="1926" value={birth}
            onChange={(e) => setBirth(e.target.value)} />
          <button type="submit" disabled={!birthValid} aria-label="Aplicar año de nacimiento">→</button>
        </form>
      </div>
    </div>
  );
}
