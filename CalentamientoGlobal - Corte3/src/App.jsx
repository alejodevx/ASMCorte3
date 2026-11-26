import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hero from './components/Hero.jsx';
import AnomalyExplainer from './components/AnomalyExplainer.jsx';
import RangeSelector from './components/RangeSelector.jsx';
import TemperatureChart from './components/TemperatureChart.jsx';
import ComparisonPanel from './components/ComparisonPanel.jsx';
import SoundPanel from './components/SoundPanel.jsx';
import WorldMap from './components/WorldMap.jsx';
import ColombiaSection from './components/ColombiaSection.jsx';
import DataGame from './components/DataGame.jsx';
import BiomeDiorama from './components/BiomeDiorama.jsx';
import SectionNav from './components/SectionNav.jsx';
import SalsaOrchestra from './components/SalsaOrchestra.jsx';
import { anomalyColor } from './lib/colors.js';
import {
  compareEdges, formatTemperature, parseGistempCsv, parseZonalCsv,
  prepareGistempData, yearlyAverages,
} from './lib/gistemp.js';
import { sonifier } from './lib/sonification.js';

const BASE = import.meta.env.BASE_URL;

/** Franjas de calentamiento convertidas en un teclado de piano: cada año es una tecla que suena */
/** Teclado de calentamiento: cada año es una tecla de piano que suena y abre ese año */
function Stripes({ yearly, onPick }) {
  const [pressed, setPressed] = useState(null);
  const press = (y) => {
    setPressed(y.year);
    setTimeout(() => setPressed((p) => (p === y.year ? null : p)), 220);
    try { sonifier.playTone(y.value, { duration: 0.35, gain: 0.2 }); } catch { /* sin audio */ }
  };
  const first = yearly[0]?.year ?? 0;
  const span = Math.max(1, yearly.length);
  const decades = yearly.filter((y) => y.year % 20 === 0);
  return (
    <section className="keyboard" aria-label="Teclado de calentamiento">
      <p className="keyboard-title"><b>Toca un año</b> · cada tecla es un año desde {first}, coloreada por su temperatura</p>
      <div className="stripes" role="group" aria-label="Una tecla por año; tócala para oírla y explorarla">
        {yearly.map((y) => (
          <button type="button" key={y.year} className={pressed === y.year ? 'is-pressed' : ''}
            style={{ backgroundColor: anomalyColor(y.value) }}
            title={`${y.year}: ${formatTemperature(y.value)}`}
            onMouseEnter={() => { if (sonifier.ctx?.state === 'running' && !sonifier.playing) press(y); }}
            onClick={() => { press(y); onPick?.(y.year); }}
            aria-label={`${y.year}: ${formatTemperature(y.value)}`} />
        ))}
      </div>
      <div className="keyboard-axis" aria-hidden="true">
        {decades.map((y) => (
          <span key={y.year} style={{ left: `${((y.year - first + 0.5) / span) * 100}%` }}>{y.year}</span>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [data, setData] = useState([]);
  const [baseline, setBaseline] = useState(NaN);
  const [zonal, setZonal] = useState(null);
  const [colombia, setColombia] = useState(null);
  const [error, setError] = useState('');
  const [startIdx, setStartIdx] = useState(0);
  const [endIdx, setEndIdx] = useState(0);
  const [windowSize, setWindowSize] = useState(12);
  const [baselineMode, setBaselineMode] = useState('pre');
  const [playIndex, setPlayIndex] = useState(null);
  const [hoverSound, setHoverSound] = useState(false);
  const [mapSound, setMapSound] = useState(true);
  const lastHoverTone = useRef(0);

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}data/gistemp_global_monthly_subset.csv`).then((r) => r.text()),
      fetch(`${BASE}data/gistemp_zonal_annual.csv`).then((r) => r.text()),
      fetch(`${BASE}data/colombia_estaciones.json`).then((r) => r.json()),
    ])
      .then(([monthlyText, zonalText, colombiaData]) => {
        const prepared = prepareGistempData(parseGistempCsv(monthlyText));
        setData(prepared.visualizationData);
        setBaseline(prepared.baseline1880_1900);
        setStartIdx(0);
        setEndIdx(prepared.visualizationData.length - 1);
        setZonal(parseZonalCsv(zonalText));
        setColombia(colombiaData);
      })
      .catch((e) => setError(e.message));
  }, []);

  // offset = cuánto está 1951–1980 por encima de 1880–1900
  const offset = -baseline;
  const shift = baselineMode === 'nasa' ? offset : 0;
  const baselineLabel = baselineMode === 'nasa' ? '1951–1980 (referencia NASA)' : '1880–1900 (preindustrial)';

  const range = useMemo(() => data.slice(startIdx, endIdx + 1), [data, startIdx, endIdx]);
  const comparison = useMemo(() => compareEdges(range, windowSize), [range, windowSize]);
  const yearly = useMemo(() => yearlyAverages(data), [data]);
  const latest = data.at(-1);

  useEffect(() => {
    if (windowSize > Math.floor(range.length / 2)) {
      const fits = [120, 60, 36, 12].find((w) => w <= Math.floor(range.length / 2));
      if (fits) setWindowSize(fits);
    }
  }, [range.length, windowSize]);

  const onHoverValue = useCallback((v) => {
    if (!hoverSound || sonifier.playing) return;
    const now = performance.now();
    if (now - lastHoverTone.current < 70) return;
    lastHoverTone.current = now;
    sonifier.playTone(v, { duration: 0.18, gain: 0.15 });
  }, [hoverSound]);

  const pickYear = (year) => {
    const s = data.findIndex((d) => d.year === Math.max(1926, year - 5));
    const e = data.findLastIndex((d) => d.year === Math.min(data.at(-1).year, year + 5));
    setStartIdx(s);
    setEndIdx(e);
    document.getElementById('explorar')?.scrollIntoView({ behavior: 'smooth' });
  };

  if (error) return <main className="loading">No se pudieron cargar los datos: {error}</main>;
  if (!data.length || !zonal || !colombia) return <main className="loading"><span className="spinner" />Cargando datos de la NASA…</main>;

  return (
    <>
      <SectionNav logoSrc={`${BASE}brand/uao-logo-horizontal-blanco.png`} />
      <div className="hero-wrap" id="top">
        <nav className="topbar" aria-label="Institución">
          <a href="https://www.uao.edu.co/" target="_blank" rel="noreferrer" className="uao-logo">
            <img src={`${BASE}brand/uao-logo-horizontal-blanco.png`} alt="Universidad Autónoma de Occidente" width="745" height="133" />
          </a>
          <span className="topbar-course">Arquitectura de Sistemas Multimedia</span>
        </nav>
        <Hero latest={latest} baselineLabel="la época preindustrial (1880–1900)"
          keyboard={<Stripes yearly={yearly} onPick={pickYear} />} />
      </div>

      <main>
        <AnomalyExplainer yearly={yearly} offset={offset} baselineMode={baselineMode} setBaselineMode={setBaselineMode} />

        <section className="section" id="explorar">
          <div className="section-head">
            <p className="kicker">02 Tu período</p>
            <h2>Elige un rango de fechas y observa cuánto cambió</h2>
            <p className="section-sub">
              Arrastra los extremos sobre las franjas (cada franja es un mes, coloreado por la media de 12 meses),
              escribe fechas exactas o usa un atajo. Números respecto a <strong>{baselineLabel}</strong>.
            </p>
          </div>

          <div className="panel">
            <RangeSelector data={data} startIdx={startIdx} endIdx={endIdx} minSpan={24}
              onChange={(s, e) => { setStartIdx(s); setEndIdx(e); }} />
          </div>

          <div className="panel chart-panel">
            <div className="chart-legend">
              <span><i className="lg-month" /> anomalía mensual</span>
              <span><i className="lg-roll" /> media móvil 12 meses</span>
              <span><i className="lg-win" /> ventanas comparadas</span>
              <span><i className="lg-paris" /> umbrales de París</span>
            </div>
            <TemperatureChart data={range} comparison={comparison} shift={shift} baselineLabel={baselineLabel}
              playIndex={playIndex} onHoverValue={onHoverValue}
              onBrush={(a, b) => { setEndIdx(startIdx + b); setStartIdx(startIdx + a); }} />
            <p className="chart-tip">
              Arrastra sobre la gráfica para acercarte a un tramo.
              {(startIdx > 0 || endIdx < data.length - 1) && (
                <button type="button" className="game-link" onClick={() => { setStartIdx(0); setEndIdx(data.length - 1); }}>Ver todo el siglo</button>
              )}
            </p>
            <SoundPanel range={range} onPlayIndex={setPlayIndex} hoverSound={hoverSound} setHoverSound={setHoverSound} />
          </div>

          <div className="panel">
            <ComparisonPanel range={range} comparison={comparison} windowSize={windowSize}
              setWindowSize={setWindowSize} shift={shift} baselineLabel={baselineLabel} />
          </div>
        </section>

        <SalsaOrchestra yearly={yearly} />

        <WorldMap zonal={zonal} shift={shift} baselineLabel={baselineLabel} soundOn={mapSound} />
        <label className="check center">
          <input type="checkbox" checked={mapSound} onChange={(e) => setMapSound(e.target.checked)} />
          Sonido en el mapa (cada banda de latitud es una voz; norte a la izquierda, sur a la derecha)
        </label>

        <ColombiaSection colombia={colombia} zonalWorld={zonal.data} />
        <BiomeDiorama colombia={colombia} />
        <DataGame yearly={yearly} monthly={data} offset={offset} />
      </main>

      <footer className="footer">
        <img src={`${BASE}brand/uao-logo-horizontal-blanco.png`} alt="Universidad Autónoma de Occidente" width="745" height="133" />
        <p>La Tierra y su temperatura · hecho en Cali para Arquitectura de Sistemas Multimedia.</p>
      </footer>
    </>
  );
}
