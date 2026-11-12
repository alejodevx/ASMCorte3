/*
 * Motor de sonificación (Web Audio API, sin archivos externos: todo se sintetiza).
 *
 * Mapeo sonoro de la anomalía (°C respecto a 1880–1900):
 *  - Altura (pitch): más calor → nota más aguda, cuantizada a una escala pentatónica.
 *  - Timbre: < +1.0 °C onda senoidal (suave); +1.0…+1.5 triangular; > +1.5 diente de sierra (áspero).
 *  - Filtro: la frecuencia de corte del filtro se abre con la anomalía (más brillo = más calor).
 *  - "Crepitar": un ruido filtrado (como brasas) cuyo volumen crece con la anomalía.
 *  - Alertas: campana al cruzar por primera vez +1.5 °C y alarma doble al cruzar +2.0 °C.
 */

const PENTATONIC = [0, 2, 4, 7, 9]; // grados de la escala pentatónica mayor
const MIN_A = -0.5;
const MAX_A = 2.2;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/** Convierte una anomalía en frecuencia cuantizada (Hz) */
export function anomalyToFrequency(value) {
  const t = clamp((value - MIN_A) / (MAX_A - MIN_A), 0, 1);
  const steps = Math.round(t * 17); // ~3.5 octavas de pentatónica
  const octave = Math.floor(steps / PENTATONIC.length);
  const degree = PENTATONIC[steps % PENTATONIC.length];
  const midi = 45 + octave * 12 + degree; // desde A2
  return 440 * 2 ** ((midi - 69) / 12);
}

function waveFor(value) {
  if (value >= 1.5) return 'sawtooth';
  if (value >= 1.0) return 'triangle';
  return 'sine';
}

export class ClimateSonifier {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.6;
    this.playing = false;
    this.raf = null;
    this.nodes = [];
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Nota corta individual (al pasar el cursor, etc.) */
  playTone(value, { duration = 0.25, gain = 0.22, when = 0 } = {}) {
    const ctx = this.ensure();
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = waveFor(value);
    osc.frequency.value = anomalyToFrequency(value);
    filter.type = 'lowpass';
    filter.frequency.value = 600 + clamp(value, 0, 2.5) * 1800;
    filter.Q.value = 2 + clamp(value, 0, 2.5) * 3;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(filter).connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
    return osc;
  }

  /** Campana (umbral +1.5 °C) */
  bell(when, intensity = 1) {
    const ctx = this.ctx;
    [880, 880 * 2.76, 880 * 5.4].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      const peak = (0.18 / (i + 1)) * intensity;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(peak, when + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 1.6 / (i + 1));
      o.connect(g).connect(this.master);
      o.start(when);
      o.stop(when + 1.7);
      this.nodes.push(o);
    });
  }

  /** Alarma doble (umbral +2.0 °C) */
  alarm(when) {
    const ctx = this.ctx;
    [0, 0.22].forEach((offset) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(1040, when + offset);
      o.frequency.linearRampToValueAtTime(760, when + offset + 0.18);
      g.gain.setValueAtTime(0.0001, when + offset);
      g.gain.exponentialRampToValueAtTime(0.12, when + offset + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, when + offset + 0.2);
      o.connect(g).connect(this.master);
      o.start(when + offset);
      o.stop(when + offset + 0.25);
      this.nodes.push(o);
    });
  }

  /** Ruido de "brasas" cuyo volumen sigue la anomalía */
  makeEmbers(t0, values, stepDur) {
    const ctx = this.ctx;
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      // ruido con chasquidos dispersos
      const crackle = Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 6 : 0;
      ch[i] = (Math.random() * 2 - 1) * 0.25 + crackle;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    values.forEach((v, i) => {
      const level = clamp((v - 0.6) / 1.4, 0, 1);
      g.gain.linearRampToValueAtTime(0.0001 + level * 0.16, t0 + i * stepDur);
    });
    const tEnd = t0 + values.length * stepDur;
    g.gain.linearRampToValueAtTime(0.0001, tEnd + 0.3);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t0);
    src.stop(tEnd + 0.4);
    this.nodes.push(src);
  }

  /**
   * Reproduce una serie de valores.
   * @param {number[]} values anomalías (preindustrial)
   * @param {{duration:number, onStep:(i:number)=>void, onEnd:()=>void, embers:boolean}} opts
   */
  playSeries(values, { duration = 20, onStep, onEnd, embers = true } = {}) {
    this.stop();
    const ctx = this.ensure();
    this.playing = true;
    const stepDur = duration / values.length;
    const t0 = ctx.currentTime + 0.12;
    const noteDur = Math.max(0.08, Math.min(0.5, stepDur * 1.6));

    let crossed15 = false;
    let crossed20 = false;
    values.forEach((v, i) => {
      const when = t0 + i * stepDur;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = waveFor(v);
      osc.frequency.value = anomalyToFrequency(v);
      filter.type = 'lowpass';
      filter.frequency.value = 500 + clamp(v, 0, 2.5) * 1700;
      filter.Q.value = 1 + clamp(v, 0, 2.5) * 3;
      const peak = 0.07 + clamp(v, 0, 2) * 0.05;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(peak, when + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, when + noteDur);
      osc.connect(filter).connect(g).connect(this.master);
      osc.start(when);
      osc.stop(when + noteDur + 0.05);
      this.nodes.push(osc);

      if (!crossed15 && v >= 1.5) {
        crossed15 = true;
        this.bell(when);
      }
      if (!crossed20 && v >= 2.0) {
        crossed20 = true;
        this.alarm(when);
      }
    });

    if (embers) this.makeEmbers(t0, values, stepDur);

    // Bajo sostenido (dron) que acompaña: sube de tono con la media acumulada
    const drone = ctx.createOscillator();
    const dg = ctx.createGain();
    drone.type = 'sine';
    drone.frequency.setValueAtTime(55, t0);
    values.forEach((v, i) => {
      drone.frequency.linearRampToValueAtTime(55 + clamp(v, -0.5, 2.5) * 18, t0 + i * stepDur);
    });
    dg.gain.setValueAtTime(0.0001, t0);
    dg.gain.linearRampToValueAtTime(0.09, t0 + 0.6);
    const tEnd = t0 + values.length * stepDur;
    dg.gain.setValueAtTime(0.09, tEnd);
    dg.gain.linearRampToValueAtTime(0.0001, tEnd + 0.8);
    drone.connect(dg).connect(this.master);
    drone.start(t0);
    drone.stop(tEnd + 0.9);
    this.nodes.push(drone);

    let last = -1;
    const tick = () => {
      if (!this.playing) return;
      const i = Math.floor((ctx.currentTime - t0) / stepDur);
      if (i !== last && i >= 0 && i < values.length) {
        last = i;
        onStep?.(i);
      }
      if (ctx.currentTime >= tEnd + 0.2) {
        this.playing = false;
        onEnd?.();
        return;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Acorde de bandas de latitud: cada banda es una voz */
  playChord(values, duration = 0.5) {
    const ctx = this.ensure();
    const t0 = ctx.currentTime + 0.01;
    values.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      o.type = v >= 2.5 ? 'triangle' : 'sine';
      o.frequency.value = anomalyToFrequency(v * 0.7);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.045, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      if (pan) {
        // Norte a la izquierda, sur a la derecha
        pan.pan.value = -1 + (2 * i) / Math.max(1, values.length - 1);
        o.connect(g).connect(pan).connect(this.master);
      } else {
        o.connect(g).connect(this.master);
      }
      o.start(t0);
      o.stop(t0 + duration + 0.05);
    });
  }

  stop() {
    this.playing = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.nodes.forEach((n) => {
      try {
        n.stop();
      } catch {
        /* ya detenido */
      }
    });
    this.nodes = [];
  }
}

export const sonifier = new ClimateSonifier();
