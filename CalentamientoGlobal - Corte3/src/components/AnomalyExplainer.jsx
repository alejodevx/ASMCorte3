import { useMemo, useState } from 'react';
import { anomalyColor } from '../lib/colors.js';
import { formatTemperature } from '../lib/gistemp.js';

/**
 * Explica qué es una anomalía y por qué hay dos líneas base.
 * El usuario elige un año y ve su valor medido desde cada referencia.
 */
export default function AnomalyExplainer({ yearly, offset, baselineMode, setBaselineMode }) {
  const complete = yearly.filter((y) => y.complete);
  const [year, setYear] = useState(complete.at(-1)?.year ?? 2024);
  const item = useMemo(() => complete.find((y) => y.year === year) ?? complete.at(-1), [complete, year]);

  // Escala vertical del diagrama (preindustrial)
  const min = -0.4;
  const max = 1.8;
  const H = 300;
  const y = (v) => 20 + ((max - v) / (max - min)) * (H - 40);
  const pre = 0;
  const nasa = offset; // 1951–1980 respecto a 1880–1900 (≈ +0.22)
  const v = item?.value ?? 0;
  const absolute = 14 + (v - nasa); // ~14 °C es la media aproximada 1951–1980

  return (
    <section className="section" id="entender">
      <div className="section-head">
        <p className="kicker">01 Entender el dato</p>
        <h2>No medimos la temperatura: medimos cuánto se ha <em>desviado</em></h2>
      </div>

      <div className="explainer">
        <div className="explainer-text">
          <p>
            GISTEMP no publica “la temperatura de la Tierra” en grados absolutos. Publica <strong>anomalías</strong>:
            la diferencia entre lo que se midió y lo que era <em>normal</em> en un período de referencia.
            Es más fiable así, porque las diferencias se comparan bien entre estaciones, océanos y décadas.
          </p>
          <ol className="steps">
            <li>
              <span className="dot" style={{ background: 'var(--nasa)' }} />
              <div><strong>Referencia NASA: 1951–1980.</strong> Es el “cero” oficial con el que se publica la serie.</div>
            </li>
            <li>
              <span className="dot" style={{ background: 'var(--pre)' }} />
              <div>
                <strong>Referencia preindustrial: 1880–1900.</strong> El Acuerdo de París habla de +1.5 °C y +2.0 °C
                sobre la época preindustrial. Usamos el promedio 1880–1900 de la misma serie como aproximación
                (ese período no se dibuja: sólo sirve de “cero”).
              </div>
            </li>
            <li>
              <span className="dot" style={{ background: 'var(--ink-3)' }} />
              <div>
                Entre ambos ceros hay <strong className="mono">{formatTemperature(offset)}</strong>.
                Por eso el mismo mes muestra números distintos según la referencia, pero el planeta es el mismo.
              </div>
            </li>
          </ol>

          <div className="toggle-group" role="radiogroup" aria-label="Referencia para mostrar los números">
            <span className="toggle-title">Mostrar los números de toda la página respecto a:</span>
            <button type="button" role="radio" aria-checked={baselineMode === 'pre'}
              className={baselineMode === 'pre' ? 'on' : ''} onClick={() => setBaselineMode('pre')}>
              1880–1900 · preindustrial
            </button>
            <button type="button" role="radio" aria-checked={baselineMode === 'nasa'}
              className={baselineMode === 'nasa' ? 'on' : ''} onClick={() => setBaselineMode('nasa')}>
              1951–1980 · NASA
            </button>
          </div>
          <p className="hint">Los colores no cambian al cambiar la referencia: el calor es el mismo, sólo se mueve el cero.</p>
        </div>

        <figure className="explainer-fig">
          <label className="year-pick">
            Año a examinar <strong className="mono">{item?.year}</strong>
            <input type="range" min={complete[0]?.year} max={complete.at(-1)?.year} value={year}
              onChange={(e) => setYear(Number(e.target.value))} />
          </label>
          <svg viewBox={`0 0 420 ${H}`} className="baseline-svg" role="img"
            aria-label={`En ${item?.year} la anomalía fue ${formatTemperature(v)} respecto a 1880–1900 y ${formatTemperature(v - nasa)} respecto a 1951–1980`}>
            {/* Líneas base */}
            <line x1="20" x2="400" y1={y(pre)} y2={y(pre)} className="bl bl-pre" />
            <text x="22" y={y(pre) + 16} className="bl-label pre">cero preindustrial (1880–1900)</text>
            <line x1="20" x2="400" y1={y(nasa)} y2={y(nasa)} className="bl bl-nasa" />
            <text x="22" y={y(nasa) - 8} className="bl-label nasa">cero NASA (1951–1980)</text>
            {/* París */}
            <line x1="20" x2="400" y1={y(1.5)} y2={y(1.5)} className="bl bl-paris" />
            <text x="398" y={y(1.5) - 6} textAnchor="end" className="bl-label paris">+1.5 °C París</text>

            {/* Flechas */}
            <line x1="250" x2="250" y1={y(pre)} y2={y(v)} className="arrow pre" markerEnd="url(#ah-pre)" />
            <line x1="320" x2="320" y1={y(nasa)} y2={y(v)} className="arrow nasa" markerEnd="url(#ah-nasa)" />
            <defs>
              <marker id="ah-pre" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--pre)" />
              </marker>
              <marker id="ah-nasa" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--nasa)" />
              </marker>
            </defs>
            <text x="244" y={(y(pre) + y(v)) / 2 + 30} textAnchor="end" className="arrow-label pre">{formatTemperature(v)}</text>
            <text x="328" y={(y(nasa) + y(v)) / 2} className="arrow-label nasa">{formatTemperature(v - nasa)}</text>

            {/* Punto del año */}
            <circle cx="285" cy={y(v)} r="13" fill={anomalyColor(v)} className="year-dot" />
            <text x="285" y={y(v) - 20} textAnchor="middle" className="year-dot-label">{item?.year}</text>
          </svg>
          <figcaption>
            En <strong>{item?.year}</strong> la Tierra estuvo <strong className="mono">{formatTemperature(v)}</strong> sobre
            la época preindustrial, o <strong className="mono">{formatTemperature(v - nasa)}</strong> sobre 1951–1980.
            Como referencia aproximada, eso equivale a una media global cercana a
            <strong className="mono"> {absolute.toFixed(1)} °C</strong> (tomando ≈14 °C para 1951–1980).
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
