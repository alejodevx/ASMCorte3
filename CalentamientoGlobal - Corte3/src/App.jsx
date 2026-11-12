import { useEffect, useMemo, useState } from 'react';
import TemperatureChart from './components/TemperatureChart.jsx';
import { compareEdges, filterDateRange, formatTemperature, parseGistempCsv, prepareGistempData } from './lib/gistemp.js';

export default function App() {
  const [data, setData] = useState([]);
  const [baseline, setBaseline] = useState(NaN);
  const [start, setStart] = useState('1926-01');
  const [end, setEnd] = useState('');



  
  useEffect(() => {
    fetch('/data/gistemp_global_monthly_subset.csv')
      .then(r => r.text())
      .then(text => {
        const raw = parseGistempCsv(text);
        const prepared = prepareGistempData(raw);
        setData(prepared.visualizationData);
        setBaseline(prepared.baseline1880_1900);
        setEnd(prepared.visualizationData.at(-1).date);
      });
  }, []);

  

  const range = useMemo(() => filterDateRange(data, start, end), [data, start, end]);
  const comparison = useMemo(() => compareEdges(range, 12), [range]);

  return <main>
    <header><p>Arquitectura de Sistemas Multimedia</p><h1>Termómetro de la Tierra</h1><p>Proyecto React base con NASA GISS/GISTEMP v4.</p></header>
    <section className="panel controls">
      <label>Inicio<input type="month" value={start} min={data[0]?.date} max={data.at(-1)?.date} onChange={e=>setStart(e.target.value)}/></label>
      <label>Fin<input type="month" value={end} min={data[0]?.date} max={data.at(-1)?.date} onChange={e=>setEnd(e.target.value)}/></label>
    </section>
    <section className="stats">
      <article><span>Base 1880–1900</span><strong>{formatTemperature(baseline)}</strong></article>
      <article><span>Promedio inicial</span><strong>{comparison ? formatTemperature(comparison.initialAverage) : '—'}</strong></article>
      <article><span>Promedio final</span><strong>{comparison ? formatTemperature(comparison.finalAverage) : '—'}</strong></article>
      <article><span>Diferencia</span><strong>{comparison ? formatTemperature(comparison.difference) : '—'}</strong></article>
    </section>
    <section className="panel"><TemperatureChart data={range}/></section>
    <section className="panel"><h2>Siguiente trabajo</h2><p>Modifiquen la visualización, creen su metáfora artística y añadan un módulo de sonificación con Web Audio API.</p></section>
  </main>;
}
