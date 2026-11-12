import { useEffect, useMemo, useRef, useState } from 'react';
import { anomalyColor } from '../lib/colors.js';
import { average, formatTemperature } from '../lib/gistemp.js';
import { sonifier } from '../lib/sonification.js';
import { createAmbient } from '../lib/ambient.js';

const Y0 = 1970;
const Y1 = 2020;
const DECADES = [1970, 1980, 1990, 2000, 2010, 2020];

const STORY = {
  1970: 'El río cubre la regla hasta la tercera franja. Se pesca desde el muelle y el maíz crece sin riego.',
  1980: 'Los veranos se alargan un poco. Casi nadie lo nota: el agua sigue llegando a los juncos.',
  1990: 'Aparecen playas de arena en la orilla. Algunos árboles de la ladera amarillean en la temporada seca.',
  2000: 'La canoa ya no flota todo el año. El cultivo pide riego y las garzas llegan en grupos más pequeños.',
  2010: 'El lecho agrietado queda a la vista. A mediodía las chicharras suenan más que el agua.',
  2020: 'El río es un hilo entre bancos de arena. El aire trae polvo y la cosecha depende de un pozo.',
};

const HOTSPOTS = [
  {
    id: 'rio', label: 'Río',
    text: [
      'El agua tapa casi toda la regla. Cada franja mide medio metro: cuéntalas ahora y vuelve a contarlas en 2020.',
      'Más calor significa más evaporación y suelos que absorben más agua antes de que llegue al cauce. Ya asoman franjas que antes estaban sumergidas.',
      'Con el caudal bajo el agua se calienta y pierde oxígeno. Los peces de aguas frescas son los primeros en desaparecer.',
    ],
  },
  {
    id: 'cultivo', label: 'Cultivo',
    text: [
      'Las plantas crecen con la lluvia de la temporada. El suelo oscuro indica humedad.',
      'Cada grado extra aumenta el agua que la planta transpira. Las hileras empiezan a amarillear por parches.',
      'Sin riego, el calor acorta el llenado del grano. Parte del cultivo se pierde y el suelo queda desnudo y pálido.',
    ],
  },
  {
    id: 'ladera', label: 'Ladera',
    text: [
      'El bosque de ladera retiene agua como una esponja y la suelta poco a poco hacia el río.',
      'Los árboles más expuestos se secan primero. Los de la ribera aguantan más porque sus raíces alcanzan el agua.',
      'Con menos bosque, la lluvia escurre de golpe y el río pasa de crecidas breves a largos meses secos.',
    ],
  },
  {
    id: 'cielo', label: 'Cielo',
    text: [
      'Aire húmedo, nubes frecuentes y luz suave.',
      'Menos nubes bajas y más horas de sol directo. La luz se vuelve más dura.',
      'El polvo del suelo seco queda suspendido y tiñe el cielo de ocre. La bruma acorta el horizonte.',
    ],
  },
];

export default function BiomeDiorama({ colombia }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const ambientRef = useRef(null);
  const hotspotRefs = useRef({});
  const [entered, setEntered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState('');
  const [year, setYear] = useState(Y0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [active, setActive] = useState(null);
  const [hint, setHint] = useState(true);
  const [isFull, setIsFull] = useState(false);

  // Serie de Colombia suavizada (media centrada de 5 años) → estrés térmico 0–1
  const series = useMemo(() => {
    const byYear = new Map(colombia.composite.map((d) => [d[0], d[1]]));
    const sm = (y) => average([-2, -1, 0, 1, 2].map((k) => byYear.get(y + k)).filter(Number.isFinite));
    const out = {};
    for (let y = Y0; y <= Y1; y += 1) out[y] = sm(y);
    const lo = out[Y0];
    const hi = Math.max(...Object.values(out));
    return { smooth: out, lo, hi, raw: byYear };
  }, [colombia]);

  const anomaly = series.smooth[year];
  const stress = Math.max(0, Math.min(1, (anomaly - series.lo) / (series.hi - series.lo)));
  const stage = stress < 0.34 ? 0 : stress < 0.7 ? 1 : 2;
  const decade = Math.min(2020, Math.floor(year / 10) * 10);
  const riverPct = Math.round(100 - 80 * stress);
  const greenPct = Math.round(100 - 68 * stress);

  // Enviar el estrés a la escena y al sonido
  useEffect(() => {
    sceneRef.current?.setStress(stress);
    ambientRef.current?.setStress(stress);
  }, [stress, entered]);

  // Reproducción automática por años
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      setYear((y) => {
        if (y >= Y1) { setPlaying(false); return y; }
        return y + 1;
      });
    }, 520);
    return () => clearInterval(id);
  }, [playing]);

  // Montar la escena al entrar; pausar cuando no se ve
  useEffect(() => {
    if (!entered) return undefined;
    let disposed = false;
    let ro;
    let io;
    const onVis = () => {
      const s = sceneRef.current;
      if (!s) return;
      if (document.hidden) { s.stop(); ambientRef.current?.stop(); }
      else { s.start(); if (!muted) ambientRef.current?.start(); }
    };
    (async () => {
      try {
        const { createDiorama } = await import('./diorama/scene.js');
        if (disposed) return;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const s = createDiorama(canvasRef.current, { reducedMotion });
        sceneRef.current = s;
        s.setHotspotElements(hotspotRefs.current);
        s.setStress(stress);
        const fit = () => {
          const r = stageRef.current.getBoundingClientRect();
          s.resize(r.width, r.height);
          s.renderOnce();
        };
        fit();
        ro = new ResizeObserver(fit);
        ro.observe(stageRef.current);
        io = new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting) { s.start(); if (!muted) ambientRef.current?.start(); }
          else { s.stop(); ambientRef.current?.stop(); }
        }, { threshold: 0.05 });
        io.observe(stageRef.current);
        document.addEventListener('visibilitychange', onVis);
        setLoading(false);
      } catch (e) {
        setFailed('Tu navegador no pudo iniciar los gráficos 3D (WebGL). Prueba con otro navegador o activa la aceleración por hardware.');
        setLoading(false);
      }
    })();
    return () => {
      disposed = true;
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      sceneRef.current?.dispose();
      sceneRef.current = null;
      ambientRef.current?.dispose();
      ambientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered]);

  // La pista de arrastre se retira sola
  useEffect(() => {
    if (!entered || !hint) return undefined;
    const id = setTimeout(() => setHint(false), 7000);
    return () => clearTimeout(id);
  }, [entered, hint]);

  useEffect(() => {
    const onFs = () => setIsFull(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const enter = () => {
    setLoading(true);
    try {
      const ctx = sonifier.ensure();
      const amb = createAmbient(ctx);
      amb.setStress(stress);
      amb.start();
      ambientRef.current = amb;
    } catch { /* sin audio: el diorama funciona igual */ }
    setEntered(true);
  };

  const toggleMute = () => {
    setMuted((m) => {
      if (m) ambientRef.current?.start(); else ambientRef.current?.stop();
      return !m;
    });
  };

  const togglePlay = () => {
    if (!playing && year >= Y1) setYear(Y0);
    setPlaying((p) => !p);
  };

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else stageRef.current.requestFullscreen?.();
  };

  const openHotspot = (id) => {
    setActive((a) => (a === id ? null : id));
    sceneRef.current?.lookAt(id);
    setHint(false);
  };

  const activeSpot = HOTSPOTS.find((h) => h.id === active);

  return (
    <section className="section diorama" id="diorama" aria-labelledby="diorama-title">
      <div className="section-head">
        <p className="kicker">05 Diorama</p>
        <h2 id="diorama-title">Párate en la orilla y mira pasar cincuenta años</h2>
        <p className="section-sub">
          Los mapas muestran el calentamiento desde arriba. Aquí lo ves a ras de suelo: un valle fluvial en 3D que
          reacciona a la temperatura medida en Colombia entre 1970 y 2020. Mueve el tiempo, mira alrededor y toca los
          puntos para entender qué cambia y por qué.
        </p>
      </div>

      <div className={`dio-stage ${entered ? 'is-live' : ''}`} ref={stageRef}>
        {!entered && (
          <div className="dio-poster">
            <div className="dio-poster-art" aria-hidden="true">
              <span className="dio-poster-sun" />
              <span className="dio-poster-hill a" />
              <span className="dio-poster-hill b" />
              <span className="dio-poster-river" />
            </div>
            <div className="dio-poster-copy">
              <button type="button" className="dio-enter" onClick={enter}>Entrar al diorama</button>
              <p>Vista de 360°. Arrastra para mirar alrededor. Incluye sonido ambiente.</p>
            </div>
          </div>
        )}

        {entered && (
          <>
            <canvas ref={canvasRef} className="dio-canvas" tabIndex={0}
              aria-label={`Valle fluvial en ${year}. Río al ${riverPct} por ciento, vegetación sana al ${greenPct} por ciento. Usa las flechas para mirar alrededor.`}
              onPointerDown={() => setHint(false)} />
            {loading && <p className="dio-loading">Preparando el valle…</p>}
            {failed && <p className="dio-loading">{failed}</p>}

            {HOTSPOTS.map((h) => (
              <button type="button" key={h.id} className={`dio-hotspot ${active === h.id ? 'on' : ''}`}
                ref={(el) => { hotspotRefs.current[h.id] = el; }} onClick={() => openHotspot(h.id)}
                aria-expanded={active === h.id}>
                <i aria-hidden="true" /><span>{h.label}</span>
              </button>
            ))}

            <div className="dio-hud">
              <p className="dio-year">{year}</p>
              <dl>
                <div>
                  <dt>Temperatura en Colombia</dt>
                  <dd style={{ color: anomalyColor(Math.max(anomaly + 0.4, 0.8)) }}>{formatTemperature(anomaly)}</dd>
                </div>
                <div><dt>Caudal del río</dt><dd>{riverPct} %</dd></div>
                <div><dt>Vegetación sana</dt><dd>{greenPct} %</dd></div>
              </dl>
            </div>

            <div className="dio-tools">
              <button type="button" onClick={toggleMute} aria-pressed={muted}>{muted ? 'Activar sonido' : 'Silenciar'}</button>
              <button type="button" onClick={toggleFull}>{isFull ? 'Salir de pantalla completa' : 'Pantalla completa'}</button>
            </div>

            {hint && !loading && <p className="dio-hint">Arrastra para mirar alrededor</p>}

            {activeSpot ? (
              <div className="dio-card" role="status">
                <button type="button" className="dio-card-close" onClick={() => setActive(null)} aria-label="Cerrar">×</button>
                <h3>{activeSpot.label} en {year}</h3>
                <p>{activeSpot.text[stage]}</p>
              </div>
            ) : (
              <p className="dio-story" aria-live="polite"><strong>Década de {decade}.</strong> {STORY[decade]}</p>
            )}

            <div className="dio-timeline">
              <button type="button" className={`play small ${playing ? 'is-playing' : ''}`} onClick={togglePlay}
                aria-label={playing ? 'Pausar el paso del tiempo' : 'Reproducir el paso del tiempo'}>
                <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
              </button>
              <div className="dio-slider">
                <input type="range" min={Y0} max={Y1} step="1" value={year} aria-label="Año del diorama"
                  style={{ '--fill': `${((year - Y0) / (Y1 - Y0)) * 100}%` }}
                  onChange={(e) => { setPlaying(false); setYear(Number(e.target.value)); }} />
                <div className="dio-decades">
                  {DECADES.map((d) => (
                    <button type="button" key={d} className={decade === d ? 'on' : ''}
                      style={{ '--c': anomalyColor(series.smooth[d] + 0.4) }}
                      onClick={() => { setPlaying(false); setYear(d); }}>{d}</button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <p className="co-note">
        Qué es dato y qué es simulación: la temperatura es real (promedio de 5 años de las estaciones colombianas de
        GISTEMP, respecto a 1961–1990). El caudal, la vegetación y el relato son una simulación ilustrativa que traduce
        ese número a un paisaje; exagera a propósito para que el cambio se perciba y no representa un río concreto ni un pronóstico.
        Escena y sonido generados por código con three.js (licencia MIT).
      </p>
    </section>
  );
}
