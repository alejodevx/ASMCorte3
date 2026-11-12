import { anomalyColor, textOn } from '../lib/colors.js';
import { formatDate, formatTemperature, shortDate } from '../lib/gistemp.js';

const WINDOWS = [
  { months: 12, label: '1 año' },
  { months: 36, label: '3 años' },
  { months: 60, label: '5 años' },
  { months: 120, label: '10 años' },
];

function ParisGauge({ value }) {
  // Barra 0 → 2.5 °C con marcas de París
  const max = 2.5;
  const pct = (v) => `${(Math.max(0, Math.min(max, v)) / max) * 100}%`;
  const used = Math.max(0, (value / 1.5) * 100);
  return (
    <div className="gauge">
      <div className="gauge-track">
        <div className="gauge-fill" style={{ width: pct(value), background: anomalyColor(value) }} />
        <span className="gauge-mark" style={{ left: pct(1.5) }}><i>1.5</i></span>
        <span className="gauge-mark" style={{ left: pct(2.0) }}><i>2.0</i></span>
      </div>
      <p>
        {value < 1.5
          ? <>Se ha recorrido el <strong className="mono">{used.toFixed(0)} %</strong> del camino hacia +1.5 °C (promedio de la ventana final).</>
          : value < 2
            ? <>La ventana final <strong>supera +1.5 °C</strong>. Faltan <strong className="mono">{(2 - value).toFixed(2)} °C</strong> para +2.0 °C.</>
            : <>La ventana final <strong>supera +2.0 °C</strong>.</>}
      </p>
    </div>
  );
}

export default function ComparisonPanel({ range, comparison, windowSize, setWindowSize, shift, baselineLabel }) {
  const maxWindow = Math.floor(range.length / 2);
  const above15 = range.filter((d) => d.anomalyPreindustrial >= 1.5).length;
  const warmest = range.reduce((m, d) => (d.anomalyPreindustrial > (m?.anomalyPreindustrial ?? -Infinity) ? d : m), null);
  const coldest = range.reduce((m, d) => (d.anomalyPreindustrial < (m?.anomalyPreindustrial ?? Infinity) ? d : m), null);
  const decades = (range.length / 120);
  const rate = comparison ? (comparison.difference / Math.max(0.1, (range.length - comparison.windowSize) / 120)) : NaN;

  return (
    <div className="compare">
      <div className="compare-head">
        <h3>Comparar los extremos del período</h3>
        <p>
          Para no sacar conclusiones de un solo mes (que puede ser un pico de El Niño o un invierno raro),
          comparamos el <strong>promedio</strong> de una ventana al inicio con el de una ventana al final.
        </p>
        <div className="seg" role="radiogroup" aria-label="Tamaño de la ventana de comparación">
          {WINDOWS.map((w) => (
            <button type="button" key={w.months} role="radio" aria-checked={windowSize === w.months}
              className={windowSize === w.months ? 'on' : ''} disabled={w.months > maxWindow}
              onClick={() => setWindowSize(w.months)}>
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {comparison ? (
        <>
          <div className="compare-cards">
            <article style={{ background: anomalyColor(comparison.initialAverage), color: textOn(comparison.initialAverage) }}>
              <span>Inicio · {shortDate(comparison.initialRange[0])} – {shortDate(comparison.initialRange[1])}</span>
              <strong className="mono">{formatTemperature(comparison.initialAverage - shift)}</strong>
            </article>
            <div className="compare-delta">
              <span>{comparison.difference >= 0 ? 'se calentó' : 'se enfrió'}</span>
              <strong className="mono">{formatTemperature(comparison.difference)}</strong>
              <small>{Number.isFinite(rate) && decades >= 1 ? `≈ ${formatTemperature(rate)} por década` : ''}</small>
            </div>
            <article style={{ background: anomalyColor(comparison.finalAverage), color: textOn(comparison.finalAverage) }}>
              <span>Final · {shortDate(comparison.finalRange[0])} – {shortDate(comparison.finalRange[1])}</span>
              <strong className="mono">{formatTemperature(comparison.finalAverage - shift)}</strong>
            </article>
          </div>
          <p className="hint">Valores respecto a {baselineLabel}. La diferencia no depende de la referencia elegida.</p>
          <ParisGauge value={comparison.finalAverage} />
        </>
      ) : (
        <p className="warn">El período es demasiado corto para comparar dos ventanas de {windowSize} meses. Amplía el rango o elige una ventana menor.</p>
      )}

      <dl className="facts">
        <div><dt>Mes más cálido</dt><dd>{formatDate(warmest?.date)} <b className="mono">{formatTemperature(warmest?.anomalyPreindustrial - shift)}</b></dd></div>
        <div><dt>Mes más frío</dt><dd>{formatDate(coldest?.date)} <b className="mono">{formatTemperature(coldest?.anomalyPreindustrial - shift)}</b></dd></div>
        <div><dt>Meses sobre +1.5 °C</dt><dd><b className="mono">{above15}</b> de {range.length}</dd></div>
      </dl>
    </div>
  );
}
