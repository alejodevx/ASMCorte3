import { useEffect, useState } from 'react';
import { sonifier } from '../lib/sonification.js';
import { formatDate } from '../lib/gistemp.js';

/** Controles de sonificación del rango seleccionado */
export default function SoundPanel({ range, onPlayIndex, hoverSound, setHoverSound }) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(20);
  const [volume, setVolume] = useState(0.6);
  const [current, setCurrent] = useState(null);

  // Si hay muchos meses, sonificamos la media móvil mes a mes con submuestreo
  const maxNotes = Math.round(duration * 12);
  const stride = Math.max(1, Math.ceil(range.length / maxNotes));
  const indices = [];
  for (let i = 0; i < range.length; i += stride) indices.push(i);

  useEffect(() => () => sonifier.stop(), []);
  useEffect(() => {
    sonifier.stop();
    setPlaying(false);
    onPlayIndex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const play = () => {
    if (playing) {
      sonifier.stop();
      setPlaying(false);
      onPlayIndex(null);
      return;
    }
    const values = indices.map((i) => {
      const d = range[i];
      return stride > 1 && Number.isFinite(d.rolling12) ? d.rolling12 : d.anomalyPreindustrial;
    });
    setPlaying(true);
    sonifier.setVolume(volume);
    sonifier.playSeries(values, {
      duration,
      onStep: (k) => {
        onPlayIndex(indices[k]);
        setCurrent(range[indices[k]]);
      },
      onEnd: () => {
        setPlaying(false);
        onPlayIndex(null);
      },
    });
  };

  return (
    <div className="sound">
      <button type="button" className={`play ${playing ? 'is-playing' : ''}`} onClick={play}
        aria-label={playing ? 'Detener sonificación' : 'Escuchar el período seleccionado'}>
        <span className="play-icon" aria-hidden="true">{playing ? '■' : '▶'}</span>
        <span>{playing ? 'Detener' : 'Escuchar el período'}</span>
      </button>
      <div className="sound-now mono" aria-live="polite">
        {playing && current ? formatDate(current.date) : `${range.length} meses · ${duration} s`}
      </div>
      <label className="mini">
        Duración
        <input type="range" min="8" max="60" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
      </label>
      <label className="mini">
        Volumen
        <input type="range" min="0" max="1" step="0.05" value={volume}
          onChange={(e) => { const v = Number(e.target.value); setVolume(v); sonifier.setVolume(v); }} />
      </label>
      <label className="check">
        <input type="checkbox" checked={hoverSound} onChange={(e) => setHoverSound(e.target.checked)} />
        Sonar al recorrer la gráfica
      </label>
      <details className="legend-sound">
        <summary>¿Cómo se escucha el calor?</summary>
        <ul>
          <li><b>Más agudo</b> = mayor anomalía (notas de una escala pentatónica).</li>
          <li><b>Timbre</b>: suave (senoidal) bajo +1.0 °C, más brillante hasta +1.5 °C y áspero por encima.</li>
          <li><b>Crepitar de brasas</b>: aparece y crece a medida que el planeta se calienta.</li>
          <li><b>Campana</b> la primera vez que se supera +1.5 °C; <b>alarma</b> al superar +2.0 °C.</li>
          <li>Un bajo continuo sube lentamente con la temperatura.</li>
        </ul>
      </details>
    </div>
  );
}
