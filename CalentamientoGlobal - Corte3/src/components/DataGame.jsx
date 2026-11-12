import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { anomalyColor, textOn } from '../lib/colors.js';
import { average, formatDate, formatTemperature } from '../lib/gistemp.js';
import { sonifier } from '../lib/sonification.js';

const ROUND_PLAN = ['compare', 'guess', 'ear', 'baseline', 'window', 'order', 'compare', 'guess', 'window', 'guess'];
const MIN_T = -0.5;
const MAX_T = 2.0;
const STREAK_BONUS = 20;
const BEST_KEY = 'termometro-best-v2';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const round05 = (v) => Math.round(v * 20) / 20;
const same = (a, b) => Math.abs(a - b) < 0.001;

/* ───────── Generación de rondas a partir de los datos reales ───────── */
function buildRounds(yearly, monthly, offset) {
  const years = yearly.filter((y) => y.complete);
  const used = new Set();
  const freshYear = (filter = () => true) => {
    const pool = years.filter((y) => !used.has(y.year) && filter(y));
    const y = pick(pool.length ? pool : years);
    used.add(y.year);
    return y;
  };
  const decades = [];
  for (let d = 1930; d <= 2010; d += 10) {
    decades.push({ decade: d, value: average(years.filter((y) => y.year >= d && y.year < d + 10).map((y) => y.value)) });
  }

  let compareCount = 0;
  return ROUND_PLAN.map((type) => {
    if (type === 'compare') {
      compareCount += 1;
      // Primera comparación: años lejanos (se ve la tendencia). Segunda: años vecinos (domina el ruido).
      const a = freshYear((y) => (compareCount === 1 ? y.year < 1975 : y.year > 1980));
      const candidates = years.filter((y) => {
        const gap = Math.abs(y.year - a.year);
        const diff = Math.abs(y.value - a.value);
        return y.year !== a.year && diff > 0.04 && (compareCount === 1 ? gap > 35 : gap <= 4);
      });
      const b = pick(candidates.length ? candidates : years.filter((y) => y.year !== a.year));
      used.add(b.year);
      return { type, options: shuffle([a, b]), answer: a.value > b.value ? a.year : b.year, near: compareCount > 1 };
    }
    if (type === 'guess') {
      const y = freshYear();
      return { type, year: y.year, value: y.value };
    }
    if (type === 'ear') {
      const a = freshYear();
      const far = years.filter((y) => Math.abs(y.value - a.value) > 0.45);
      const b = pick(far.length ? far : years.filter((y) => y.year !== a.year));
      used.add(b.year);
      const options = shuffle([a, b]);
      return { type, options, answer: options[0].value > options[1].value ? 0 : 1 };
    }
    if (type === 'order') {
      let four = shuffle(decades).slice(0, 4);
      for (let tries = 0; tries < 20; tries += 1) {
        const sorted = [...four].sort((p, q) => p.value - q.value);
        if (sorted.every((d, i) => i === 0 || d.value - sorted[i - 1].value > 0.05)) break;
        four = shuffle(decades).slice(0, 4);
      }
      return { type, options: four, answer: [...four].sort((p, q) => p.value - q.value).map((d) => d.decade) };
    }
    if (type === 'baseline') {
      const y = freshYear((d) => d.year > 1990);
      const shown = round05(y.value - offset);
      const correct = round05(shown + offset);
      const decoys = [round05(shown - offset), shown, round05(shown + 2 * offset), round05(shown + 0.5)];
      const opts = [...new Set([correct, ...decoys].map((v) => v.toFixed(2)))].slice(0, 4).map(Number);
      return { type, year: y.year, shown, answer: correct, options: shuffle(opts) };
    }
    // window: un mes con un pico claro por encima de su media de 12 meses
    const spikes = monthly
      .filter((d) => Number.isFinite(d.rolling12) && d.anomalyPreindustrial - d.rolling12 > 0.18 && !used.has(`m${d.date}`));
    const m = pick(spikes.length ? spikes : monthly.slice(12));
    used.add(`m${m.date}`);
    const correct = round05(m.rolling12);
    const spike = round05(m.anomalyPreindustrial);
    const opts = [...new Set([correct, spike, round05(correct - 0.25), round05(spike + 0.2)].map((v) => v.toFixed(2)))]
      .slice(0, 4).map(Number);
    return { type, month: m, spike, answer: correct, options: shuffle(opts) };
  });
}

/* ───────── Termómetro arrastrable ───────── */
function DragThermometer({ value, onChange, reveal, disabled }) {
  const ref = useRef(null);
  const top = 20;
  const bottom = 300;
  const y = (v) => bottom - ((v - MIN_T) / (MAX_T - MIN_T)) * (bottom - top);
  const fromY = (py) => {
    const v = MIN_T + ((bottom - py) / (bottom - top)) * (MAX_T - MIN_T);
    return Math.max(MIN_T, Math.min(MAX_T, round05(v)));
  };
  const handle = (e) => {
    if (disabled) return;
    const rect = ref.current.getBoundingClientRect();
    const py = ((e.clientY - rect.top) / rect.height) * 380;
    const v = fromY(py);
    if (!same(v, value)) {
      onChange(v);
      try { sonifier.playTone(v, { duration: 0.08, gain: 0.07 }); } catch { /* sin audio */ }
    }
  };
  const onKey = (e) => {
    if (disabled) return;
    const step = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.25, PageDown: -0.25 }[e.key];
    if (step) {
      e.preventDefault();
      onChange(Math.max(MIN_T, Math.min(MAX_T, round05(value + step))));
    }
  };

  return (
    <svg ref={ref} viewBox="0 0 200 380" className={`drag-thermo ${disabled ? 'is-locked' : ''}`}
      role="slider" tabIndex={disabled ? -1 : 0} aria-label="Tu estimación de la anomalía"
      aria-valuemin={MIN_T} aria-valuemax={MAX_T} aria-valuenow={value} aria-valuetext={formatTemperature(value)}
      onKeyDown={onKey}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); handle(e); }}
      onPointerMove={(e) => { if (e.buttons) handle(e); }}>
      <rect x="78" y={top - 14} width="44" height={bottom - top + 40} rx="22" className="dt-glass" />
      <circle cx="100" cy="338" r="34" className="dt-glass" />
      {reveal != null && (
        <rect x="84" y={y(reveal)} width="32" height={bottom - y(reveal) + 30} rx="4"
          fill={anomalyColor(reveal)} className="dt-mercury" />
      )}
      <circle cx="100" cy="338" r="28" fill={anomalyColor(reveal ?? value)} />
      {[-0.5, 0, 0.5, 1, 1.5, 2].map((t) => (
        <g key={t}>
          <line x1="124" x2="134" y1={y(t)} y2={y(t)} className="dt-tick" />
          <text x="140" y={y(t) + 4} className="dt-tick-label">{t > 0 ? `+${t}` : t}</text>
        </g>
      ))}
      <g className="dt-guess" transform={`translate(0 ${y(value)})`}>
        <line x1="40" x2="124" y1="0" y2="0" />
        <path d="M30 -9 L46 0 L30 9 Z" />
      </g>
      {reveal != null && <text x="100" y={y(reveal) - 10} textAnchor="middle" className="dt-real-label">real</text>}
    </svg>
  );
}

/* ───────── Juego ───────── */
export default function DataGame({ yearly, monthly, offset }) {
  const sectionRef = useRef(null);
  const [rounds, setRounds] = useState(null);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState([]); // { points, bonus, value }
  const [choice, setChoice] = useState(null);
  const [guess, setGuess] = useState(0.5);
  const [orderPicks, setOrderPicks] = useState([]);
  const [heard, setHeard] = useState([false, false]);
  const [streak, setStreak] = useState(0);
  const [copied, setCopied] = useState(false);
  const [best, setBest] = useState(() => {
    try { return Number(localStorage.getItem(BEST_KEY) || 0); } catch { return 0; }
  });

  const resetRound = () => {
    setChoice(null);
    setGuess(0.5);
    setOrderPicks([]);
    setHeard([false, false]);
  };

  const start = useCallback(() => {
    setRounds(buildRounds(yearly, monthly, offset));
    setIndex(0);
    setResults([]);
    setStreak(0);
    setCopied(false);
    resetRound();
  }, [yearly, monthly, offset]);

  const round = rounds?.[index];
  const answered = choice != null;
  const finished = Boolean(rounds) && index >= rounds.length;
  const base = results.reduce((s, r) => s + r.points, 0);
  const bonus = results.reduce((s, r) => s + r.bonus, 0);
  const total = base + bonus;
  const lastResult = results.at(-1);

  const feedbackSound = (good) => {
    try {
      if (good) {
        sonifier.playTone(0.6, { duration: 0.18, gain: 0.18 });
        sonifier.playTone(1.3, { duration: 0.3, gain: 0.18, when: 0.12 });
      } else {
        sonifier.playTone(-0.4, { duration: 0.45, gain: 0.2 });
      }
    } catch { /* audio no disponible */ }
  };

  const commit = (points, value, picked) => {
    const good = points >= 60;
    const newStreak = good ? streak + 1 : 0;
    feedbackSound(good);
    setStreak(newStreak);
    setChoice(picked);
    setResults((r) => [...r, { points, value, bonus: newStreak >= 2 ? STREAK_BONUS : 0 }]);
  };

  const answer = (picked) => {
    if (answered || !round) return;
    if (round.type === 'compare') {
      commit(picked === round.answer ? 100 : 0, round.options.find((o) => o.year === round.answer).value, picked);
    } else if (round.type === 'guess') {
      const err = Math.abs(guess - round.value);
      commit(Math.max(0, Math.round(100 - err * 250)), round.value, guess);
    } else if (round.type === 'ear') {
      commit(picked === round.answer ? 100 : 0, round.options[round.answer].value, picked);
    } else if (round.type === 'window') {
      commit(same(picked, round.answer) ? 100 : 0, round.month.rolling12, picked);
    } else {
      commit(same(picked, round.answer) ? 100 : 0, round.answer, picked);
    }
  };

  const pickOrder = (decade) => {
    if (answered || orderPicks.includes(decade)) return;
    const next = [...orderPicks, decade];
    setOrderPicks(next);
    try { sonifier.playTone(round.options.find((o) => o.decade === decade).value, { duration: 0.2, gain: 0.12 }); } catch { /* sin audio */ }
    if (next.length === round.options.length) {
      const hits = next.filter((d, i) => d === round.answer[i]).length;
      commit(hits * 25, average(round.options.map((o) => o.value)), next);
    }
  };

  const playEar = (i) => {
    try { sonifier.playTone(round.options[i].value, { duration: 0.7, gain: 0.22 }); } catch { /* sin audio */ }
    setHeard((h) => h.map((v, k) => (k === i ? true : v)));
  };

  const next = () => {
    const nextIndex = index + 1;
    setIndex(nextIndex);
    resetRound();
    if (nextIndex >= rounds.length && total > best) {
      setBest(total);
      try { localStorage.setItem(BEST_KEY, String(total)); } catch { /* sin almacenamiento */ }
    }
    sectionRef.current?.querySelector('.game-board')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  // Atajos de teclado: 1–4 para elegir, Enter para confirmar o continuar
  useEffect(() => {
    if (!round || finished) return undefined;
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
      const rect = sectionRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) return;
      if (e.key === 'Enter' && tag !== 'BUTTON') {
        if (answered) next();
        else if (round.type === 'guess') answer(null);
        return;
      }
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 4 || answered) return;
      if (round.type === 'compare' && round.options[n - 1]) answer(round.options[n - 1].year);
      else if (round.type === 'ear' && n <= 2) answer(n - 1);
      else if (round.type === 'order' && round.options[n - 1]) pickOrder(round.options[n - 1].decade);
      else if ((round.type === 'baseline' || round.type === 'window') && round.options[n - 1] != null) answer(round.options[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const verdict = useMemo(() => {
    const pct = base / ((rounds?.length ?? ROUND_PLAN.length) * 100);
    if (pct >= 0.8) return 'Lees el termómetro del planeta como una persona experta.';
    if (pct >= 0.55) return 'Buen ojo. Ya distingues la tendencia del ruido de cada año.';
    return 'Los datos engañan si se miran de a un mes. Juega otra vez con lo que viste en las respuestas.';
  }, [base, rounds]);

  const share = async () => {
    const squares = results.map((r) => (r.points >= 80 ? '🟩' : r.points >= 40 ? '🟨' : '🟥')).join('');
    const text = `Termómetro a ciegas: ${total} puntos\n${squares}\n¿Puedes leer el clima mejor que yo?`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch { setCopied(false); }
  };

  const optionButtons = (opts) => (
    <div className="game-options">
      {opts.map((o, i) => {
        const cls = answered ? (same(o, round.answer) ? 'is-right' : same(o, choice) ? 'is-wrong' : '') : '';
        return (
          <button type="button" key={o} className={`option ${cls}`} disabled={answered} onClick={() => answer(o)}>
            <kbd>{i + 1}</kbd>{formatTemperature(o)}
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="section game" id="juego" aria-labelledby="juego-title" ref={sectionRef}>
      <div className="section-head">
        <p className="kicker">06 Ponte a prueba</p>
        <h2 id="juego-title">Termómetro a ciegas</h2>
        <p className="section-sub">
          Diez rondas con datos reales de GISTEMP, sin colores ni pistas: compara, estima, ordena y escucha.
          Cada respuesta revela el valor real y explica qué enseña. Tus rondas forman tus propias franjas de calentamiento.
        </p>
      </div>

      <div className="game-board">
        <div className="game-top">
          <ol className="game-strip" aria-label="Progreso del juego" style={{ '--n': ROUND_PLAN.length }}>
            {ROUND_PLAN.map((_, i) => {
              const r = results[i];
              return (
                <li key={i} className={i === index && rounds && !finished ? 'current' : ''}
                  style={r ? { background: anomalyColor(r.value) } : undefined}
                  aria-label={r ? `Ronda ${i + 1}: ${r.points} puntos` : `Ronda ${i + 1}`}>
                  {r && <span style={{ color: textOn(r.value) }}>{r.points}</span>}
                </li>
              );
            })}
          </ol>
          {rounds && (
            <p className="game-meter" aria-live="polite">
              <strong>{total}</strong> puntos
              {streak >= 2 && <span className="game-streak">racha de {streak}</span>}
            </p>
          )}
        </div>

        {!rounds && (
          <div className="game-intro">
            <p>
              Vas a comparar años, estimar anomalías con un termómetro, reconocer el calor de oído, ordenar décadas
              y descubrir por qué un solo mes no basta para hablar del clima. Acertar dos rondas seguidas suma {STREAK_BONUS} puntos extra.
            </p>
            <button type="button" className="game-btn" onClick={start}>Empezar el juego</button>
            <p className="hint">Con teclado: 1 a 4 para elegir, Enter para continuar.{best > 0 ? ` Tu mejor puntaje: ${best}.` : ''}</p>
          </div>
        )}

        {finished && (
          <div className="game-end">
            <p className="game-score"><strong>{total}</strong> puntos</p>
            <p className="game-verdict">{verdict}</p>
            <p className="hint">{base} por respuestas y {bonus} por rachas. Tu mejor puntaje: {Math.max(best, total)}.</p>
            <div className="game-next">
              <button type="button" className="game-btn" onClick={start}>Jugar otra vez</button>
              <button type="button" className="game-btn ghost" onClick={share}>{copied ? 'Resultado copiado' : 'Copiar resultado'}</button>
            </div>
          </div>
        )}

        {round && !finished && (
          <div className="game-stage" key={index}>
            <p className="game-count">Ronda {index + 1} de {rounds.length}</p>

            {round.type === 'compare' && (
              <>
                <h3>¿Qué año fue más cálido en promedio?</h3>
                <div className="game-pair">
                  {round.options.map((o, i) => {
                    const isAnswer = o.year === round.answer;
                    const cls = answered ? (isAnswer ? 'is-right' : o.year === choice ? 'is-wrong' : '') : '';
                    return (
                      <button type="button" key={o.year} className={`year-card ${cls}`} disabled={answered}
                        onClick={() => answer(o.year)}
                        style={answered ? { background: anomalyColor(o.value), color: textOn(o.value) } : undefined}>
                        <span className="year-card-year">{o.year}</span>
                        <span className="year-card-value">{answered ? formatTemperature(o.value) : <kbd>{i + 1}</kbd>}</span>
                      </button>
                    );
                  })}
                </div>
                {answered && (
                  <p className="game-lesson">
                    {round.near
                      ? 'Entre años vecinos la diferencia es pequeña y depende de fenómenos como El Niño o La Niña. Por eso la tendencia se lee en décadas, no año a año.'
                      : 'Con décadas de distancia la respuesta es casi siempre la misma: el año más reciente. La tendencia de largo plazo pesa más que el ruido.'}
                  </p>
                )}
              </>
            )}

            {round.type === 'guess' && (
              <div className="game-guess">
                <div>
                  <h3>¿Cuánto más cálido que la época preindustrial fue {round.year}?</h3>
                  <p className="game-help">Arrastra la flecha del termómetro o usa las flechas del teclado. El tono sube con el valor.</p>
                  <p className="game-guess-value" style={{ color: anomalyColor(Math.max(guess, 0.8)) }}>{formatTemperature(guess)}</p>
                  {!answered ? (
                    <button type="button" className="game-btn" onClick={() => answer(null)}>Confirmar estimación</button>
                  ) : (
                    <p className="game-lesson">
                      El valor real fue <strong>{formatTemperature(round.value)}</strong>; te desviaste {Math.abs(guess - round.value).toFixed(2)} °C.
                      {round.value >= 1.5
                        ? ' Ese año superó +1.5 °C, aunque París se refiere a promedios de unos 20 años.'
                        : round.year < 1980
                          ? ' Hasta los años 70 la Tierra rondaba entre +0 y +0.4 °C sobre la época preindustrial.'
                          : ' Desde 1980 cada década ha sido más cálida que la anterior.'}
                    </p>
                  )}
                </div>
                <DragThermometer value={guess} onChange={setGuess} reveal={answered ? round.value : null} disabled={answered} />
              </div>
            )}

            {round.type === 'ear' && (
              <>
                <h3>Cada sonido es un año. Escucha los dos y elige el más cálido.</h3>
                <div className="game-pair">
                  {round.options.map((o, i) => {
                    const cls = answered ? (i === round.answer ? 'is-right' : i === choice ? 'is-wrong' : '') : '';
                    return (
                      <div key={o.year} className={`ear-card ${cls}`}
                        style={answered ? { background: anomalyColor(o.value), color: textOn(o.value) } : undefined}>
                        <button type="button" className="ear-play" onClick={() => playEar(i)} aria-label={`Escuchar sonido ${i ? 'B' : 'A'}`}>
                          <span aria-hidden="true">▶</span> Sonido {i ? 'B' : 'A'}
                        </button>
                        {answered
                          ? <p><strong>{o.year}</strong> {formatTemperature(o.value)}</p>
                          : (
                            <button type="button" className="option" disabled={!heard[0] || !heard[1]} onClick={() => answer(i)}>
                              <kbd>{i + 1}</kbd>Este es más cálido
                            </button>
                          )}
                      </div>
                    );
                  })}
                </div>
                {!answered && (!heard[0] || !heard[1]) && <p className="game-help">Escucha ambos sonidos para poder responder.</p>}
                {answered && (
                  <p className="game-lesson">
                    En la sonificación de esta página, una nota más aguda significa más calor. Así una persona que no ve la
                    gráfica también puede seguir la tendencia.
                  </p>
                )}
              </>
            )}

            {round.type === 'order' && (
              <>
                <h3>Toca las décadas en orden, de la más fría a la más cálida.</h3>
                <div className="game-order">
                  {round.options.map((o, i) => {
                    const pos = orderPicks.indexOf(o.decade);
                    const correctPos = round.answer.indexOf(o.decade);
                    const cls = answered ? (pos === correctPos ? 'is-right' : 'is-wrong') : pos >= 0 ? 'is-picked' : '';
                    return (
                      <button type="button" key={o.decade} className={`order-card ${cls}`} disabled={answered || pos >= 0}
                        onClick={() => pickOrder(o.decade)}
                        style={answered ? { background: anomalyColor(o.value), color: textOn(o.value) } : undefined}>
                        <span className="order-pos">{pos >= 0 ? pos + 1 : <kbd>{i + 1}</kbd>}</span>
                        <span className="order-decade">Años {o.decade}</span>
                        {answered && <span className="order-value">{formatTemperature(o.value)}, puesto {correctPos + 1}</span>}
                      </button>
                    );
                  })}
                </div>
                {!answered && orderPicks.length > 0 && (
                  <button type="button" className="game-link" onClick={() => setOrderPicks([])}>Empezar el orden de nuevo</button>
                )}
                {answered && (
                  <p className="game-lesson">
                    Los promedios por década casi no tienen ruido. Desde los años 80, cada década ha sido más cálida que la
                    anterior; antes de eso el orden no es tan obvio.
                  </p>
                )}
              </>
            )}

            {round.type === 'baseline' && (
              <>
                <h3>
                  La NASA reporta que {round.year} estuvo {formatTemperature(round.shown)} por encima de 1951–1980.
                  ¿Cuánto es respecto a la época preindustrial (1880–1900)?
                </h3>
                {optionButtons(round.options)}
                {answered && (
                  <p className="game-lesson">
                    El período 1951–1980 ya era {formatTemperature(offset)} más cálido que 1880–1900, así que hay que sumar esa
                    diferencia: {formatTemperature(round.shown)} + {offset.toFixed(2)} ≈ {formatTemperature(round.answer)}.
                    Cambia el número, no el planeta.
                  </p>
                )}
              </>
            )}

            {round.type === 'window' && (
              <>
                <h3>
                  En {formatDate(round.month.date).toLowerCase().replace(' ', ' de ')} la anomalía mensual fue {formatTemperature(round.spike)}.
                  ¿Cuál fue el promedio de los 12 meses que terminan ese mes?
                </h3>
                {optionButtons(round.options)}
                {answered && (
                  <p className="game-lesson">
                    El promedio fue {formatTemperature(round.answer)}: {(round.spike - round.answer).toFixed(2)} °C menos que el pico de ese mes.
                    Un mes aislado exagera. Por eso esta página compara siempre ventanas de 12 meses o más.
                  </p>
                )}
              </>
            )}

            {answered && (
              <div className="game-next">
                <span className="game-points">
                  +{lastResult?.points ?? 0} puntos{lastResult?.bonus ? ` y +${lastResult.bonus} por racha` : ''}
                </span>
                <button type="button" className="game-btn" onClick={next} autoFocus>
                  {index + 1 < rounds.length ? 'Siguiente ronda' : 'Ver resultado'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
