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
import { anomalyColor } from './lib/colors.js';
import {
  compareEdges, formatDate, formatTemperature, parseGistempCsv, parseZonalCsv,
  prepareGistempData, yearlyAverages,
} from './lib/gistemp.js';
import { sonifier } from './lib/sonification.js';

const BASE = import.meta.env.BASE_URL;

function Stripes({ yearly, onPick }) {
  return (
    <div className="stripes" role="img" aria-label="Franjas de calentamiento: un color por año desde 1926">
      {yearly.map((y) => (
        <button type="button" key={y.year} style={{ background: anomalyColor(y.value) }}
          title={`${y.year}: ${formatTemperature(y.value)}`} onClick={() => onPick?.(y.year)}
          aria-label={`${y.year}: ${formatTemperature(y.value)}`} />
      ))}
    </div>
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
        <Stripes yearly={yearly} onPick={pickYear} />
        <Hero latest={latest} baselineLabel="la época preindustrial (1880–1900)" />
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
        <div>
          <h3>Fuentes y método</h3>
          <ul>
            <li>
              Datos: <a href="https://data.giss.nasa.gov/gistemp/" target="_blank" rel="noreferrer">NASA GISS Surface Temperature Analysis (GISTEMP v4)</a>,
              índice global tierra-océano mensual (datos hasta {formatDate(latest.date)}) y anomalías zonales anuales. Datos de dominio público.
            </li>
            <li>GISTEMP publica anomalías respecto a 1951–1980. La línea base preindustrial se aproxima con el promedio 1880–1900 de la misma serie
              ({formatTemperature(baseline)} respecto a 1951–1980); ese período no se dibuja.</li>
            <li>Las comparaciones usan promedios de ventanas (12 a 120 meses), nunca meses aislados.</li>
            <li>El mapa colorea bandas de latitud enteras: no muestra diferencias entre países dentro de una misma banda.</li>
            <li>Colombia: estaciones colombianas de la versión homogeneizada de GISTEMP v4 (v4.mean_GISS_homogenized), con anomalías respecto
              al clima 1961–1990 de cada estación.</li>
          </ul>
        </div>
        <div>
          <h3>Recursos libres</h3>
          <ul>
            <li>Software: React y Vite (MIT), three.js (MIT), d3-geo y topojson-client (ISC), world-atlas / Natural Earth (dominio público).</li>
            <li>Tipografías: Fraunces, Inter e IBM Plex Mono (SIL Open Font License, Google Fonts).</li>
            <li>Sonidos: sintetizados en tiempo real con Web Audio API; no se usan archivos de audio.</li>
            <li>Gráficos, iconografía y escena 3D: hechos para este proyecto con SVG, Canvas y geometría generada por código.</li>
          </ul>
          <div className="credit">
            <img src={`${BASE}brand/uao-logo-horizontal-blanco.png`} alt="Universidad Autónoma de Occidente" width="745" height="133" />
            <p>Termómetro de la Tierra, proyecto de Arquitectura de Sistemas Multimedia.</p>
          </div>
        </div>
      </footer>
    </>
  );
}
