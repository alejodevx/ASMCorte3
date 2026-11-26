/*
 * Motor de sonificación "a lo caleño" (Web Audio API, sin archivos externos: todo se sintetiza).
 *
 * El calor del planeta se toca como una salsa:
 *  - Melodía: cada dato es una nota de piano en octavas (como un montuno), cuantizada a la escala
 *    menor armónica de La, típica de la salsa. Más calor → nota más aguda.
 *  - Timbre: < +1.0 °C piano; +1.0…+1.5 °C entra el trombón; > +1.5 °C lidera la trompeta (más áspera).
 *  - Ritmo: clave 3-2 siempre; conga (tumbao) desde +0.3 °C; güiro cuyo volumen crece con la anomalía;
 *    campana desde +1.0 °C; timbal desde +1.5 °C. A más calor, más "candela" en la percusión.
 *  - Bajo tumbao: notas anticipadas ("2 y" y "4") que suben de tono con la temperatura.
 *  - Alertas: golpe de metales y timbal al cruzar +1.5 °C; "mambo" de trompetas al cruzar +2.0 °C.
 */

const SCALE = [0, 2, 3, 5, 7, 8, 11]; // La menor armónica
const MIN_A = -0.5;
const MAX_A = 2.2;
const BPM = 184; // tempo de salsa caleña (rápida, para bailar)
const EIGHTH = 60 / BPM / 2;
// Clave de son 3-2 en corcheas sobre dos compases (16 corcheas)
const CLAVE = new Set([0, 3, 6, 10, 12]);

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

function anomalyToMidi(value) {
  const t = clamp((value - MIN_A) / (MAX_A - MIN_A), 0, 1);
  const steps = Math.round(t * 18); // ~2.5 octavas de escala
  const octave = Math.floor(steps / SCALE.length);
  return 57 + octave * 12 + SCALE[steps % SCALE.length]; // desde A3
}

/** Convierte una anomalía en frecuencia cuantizada (Hz) */
export function anomalyToFrequency(value) {
  return midiToHz(anomalyToMidi(value));
}

export class ClimateSonifier {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.6;
    this.playing = false;
    this.raf = null;
    this.nodes = [];
    this.noise = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = this.noise.getChannelData(0);
      for (let i = 0; i < len; i += 1) ch[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  track(n) {
    this.nodes.push(n);
    return n;
  }

  out(dest, pan) {
    if (pan === undefined || !this.ctx.createStereoPanner) return dest ?? this.master;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(dest ?? this.master);
    return p;
  }

  /* ───────── Instrumentos ───────── */

  /** Piano de salsa: la nota doblada a la octava, ataque percutido y caída rápida */
  piano(freq, when, dur, gain, { pan, keep = false } = {}) {
    const ctx = this.ctx;
    const dest = this.out(this.master, pan);
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5200, when);
    lp.frequency.exponentialRampToValueAtTime(1400, when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.006);
    g.gain.exponentialRampToValueAtTime(gain * 0.35, when + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    lp.connect(g).connect(dest);
    [[1, 'triangle', 1], [2, 'triangle', 0.55], [4, 'sine', 0.12]].forEach(([mult, type, level]) => {
      const o = ctx.createOscillator();
      const lg = ctx.createGain();
      o.type = type;
      o.frequency.value = freq * mult;
      o.detune.value = (Math.random() - 0.5) * 6;
      lg.gain.value = level;
      o.connect(lg).connect(lp);
      o.start(when);
      o.stop(when + dur + 0.05);
      if (!keep) this.track(o);
    });
  }

  /** Metal (trompeta o trombón): diente de sierra con filtro que "abre" y vibrato */
  brass(freq, when, dur, gain, { bright = 1, pan, keep = false } = {}) {
    const ctx = this.ctx;
    const dest = this.out(this.master, pan);
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const vib = ctx.createOscillator();
    const vibG = ctx.createGain();
    o.type = 'sawtooth';
    o2.type = 'sawtooth';
    o.frequency.value = freq;
    o2.frequency.value = freq;
    o2.detune.value = 9;
    vib.frequency.value = 5.5;
    vibG.gain.value = freq * 0.006;
    vib.connect(vibG);
    vibG.connect(o.frequency);
    vibG.connect(o2.frequency);
    lp.type = 'lowpass';
    lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(freq * 1.2, when);
    lp.frequency.exponentialRampToValueAtTime(freq * (3 + 4 * bright), when + 0.05);
    lp.frequency.exponentialRampToValueAtTime(freq * (2 + 2 * bright), when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.03);
    g.gain.setValueAtTime(gain * 0.8, when + Math.max(0.04, dur - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(dest);
    [o, o2, vib].forEach((n) => {
      n.start(when);
      n.stop(when + dur + 0.05);
      if (!keep) this.track(n);
    });
    return o;
  }

  /** Claves de madera */
  clave(when, gain = 0.16) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 2500;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
    o.connect(g).connect(this.out(this.master, 0.25));
    o.start(when);
    o.stop(when + 0.09);
    this.track(o);
  }

  /** Campana de mano (cencerro): dos cuadradas inarmónicas filtradas */
  cowbell(when, gain = 0.07, open = true) {
    const ctx = this.ctx;
    const bp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 2;
    const len = open ? 0.28 : 0.09;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + len);
    bp.connect(g).connect(this.out(this.master, -0.3));
    [562, 845].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(bp);
      o.start(when);
      o.stop(when + len + 0.02);
      this.track(o);
    });
  }

  /** Conga: tono abierto (con caída de afinación) o golpe apagado */
  conga(when, open, gain = 0.2, high = false) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = high ? 330 : 240;
    o.frequency.setValueAtTime(f * 1.35, when);
    o.frequency.exponentialRampToValueAtTime(f, when + 0.03);
    const len = open ? 0.3 : 0.07;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + len);
    o.connect(g).connect(this.out(this.master, 0.4));
    o.start(when);
    o.stop(when + len + 0.02);
    this.track(o);
  }

  /** Güiro / maracas: ráfaga de ruido filtrado */
  scrape(when, gain, long = false) {
    if (gain < 0.004) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 5200;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    const len = long ? 0.13 : 0.045;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + len * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, when + len);
    src.connect(bp).connect(g).connect(this.out(this.master, -0.5));
    src.start(when, Math.random() * 0.8);
    src.stop(when + len + 0.02);
    this.track(src);
  }

  /** Timbal: golpe metálico con cuerpo y ruido */
  timbal(when, gain = 0.14, high = true) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(high ? 520 : 390, when);
    o.frequency.exponentialRampToValueAtTime(high ? 470 : 350, when + 0.1);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    o.connect(g).connect(this.out(this.master, 0.1));
    o.start(when);
    o.stop(when + 0.25);
    this.track(o);
    this.scrape(when, gain * 0.8);
  }

  /** Bajo tumbao */
  bass(freq, when, dur, gain = 0.2) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    o.type = 'sine';
    o2.type = 'triangle';
    o.frequency.value = freq;
    o2.frequency.value = freq * 2;
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.015);
    g.gain.exponentialRampToValueAtTime(gain * 0.5, when + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(lp).connect(this.master);
    [o, o2].forEach((n) => {
      n.start(when);
      n.stop(when + dur + 0.05);
      this.track(n);
    });
  }

  /** Nota corta individual (al pasar el cursor, etc.): piano, y metales cuando hace mucho calor */
  playTone(value, { duration = 0.25, gain = 0.22, when = 0 } = {}) {
    const ctx = this.ensure();
    const t0 = ctx.currentTime + when;
    const f = anomalyToFrequency(value);
    const dur = Math.max(0.18, duration * 1.4);
    if (value >= 1.5) this.brass(f, t0, dur, gain * 0.7, { bright: clamp(value - 1.5, 0, 1), keep: true });
    else this.piano(f, t0, dur, gain * 0.9, { keep: true });
    if (value >= 1.0 && value < 1.5) this.brass(f / 2, t0, dur, gain * 0.35, { bright: 0, keep: true });
  }

  /** Golpe de metales + timbal (umbral +1.5 °C): un "¡Azúcar!" de la orquesta */
  bell(when, intensity = 1) {
    [57, 60, 64, 69].forEach((m, i) => this.brass(midiToHz(m + 12), when, 0.45, (0.07 - i * 0.008) * intensity, { bright: 0.7, pan: -0.3 + i * 0.2 }));
    this.timbal(when, 0.2);
    this.timbal(when + EIGHTH, 0.16, false);
    this.cowbell(when, 0.1);
  }

  /** "Mambo" de trompetas que sube como sirena (umbral +2.0 °C) */
  alarm(when) {
    [0, EIGHTH * 3].forEach((off) => {
      [69, 72, 76].forEach((m) => {
        const o = this.brass(midiToHz(m), when + off, 0.34, 0.06, { bright: 1 });
        o.frequency.setValueAtTime(midiToHz(m - 5), when + off);
        o.frequency.exponentialRampToValueAtTime(midiToHz(m), when + off + 0.12);
      });
    });
    for (let k = 0; k < 6; k += 1) this.timbal(when + k * EIGHTH * 0.5, 0.13, k % 2 === 0);
  }

  /** Un paso de la base rítmica (una corchea): clave, conga, güiro, campana, timbal y bajo */
  grooveStep(k, t, v, embers) {
    const pos = k % 16;
    const beat = pos % 8;
    if (CLAVE.has(pos)) this.clave(t);
    if (v >= 0.3) {
      // Tumbao de conga: tapado en 1 y 3, abiertos en "4" y "4 y"
      if (beat === 0 || beat === 4) this.conga(t, false, 0.12);
      if (beat === 6) this.conga(t, true, 0.18, false);
      if (beat === 7) this.conga(t, true, 0.16, true);
    }
    if (embers) {
      const level = clamp((v - 0.2) / 1.6, 0, 1);
      this.scrape(t, 0.01 + level * 0.06, beat % 2 === 0);
    }
    if (v >= 1.0 && beat % 2 === 0) this.cowbell(t, 0.05, beat === 0 || beat === 4);
    if (v >= 1.5 && (beat === 1 || beat === 3 || beat === 7)) this.timbal(t, 0.07, beat !== 7);
    // Bajo anticipado en "2 y" y "4"; raíz I – V alternando por compás y transportada con el calor
    if (beat === 3 || beat === 6) {
      const bar = Math.floor(k / 8);
      const lift = Math.round(clamp((v - MIN_A) / (MAX_A - MIN_A), 0, 1) * 7);
      const midi = 33 + SCALE[lift % SCALE.length] + (bar % 2 === 1 ? 7 : 0);
      this.bass(midiToHz(midi), t, EIGHTH * (beat === 3 ? 3 : 2) * 0.95, 0.22);
    }
  }

  /** Una nota de la melodía según la anomalía */
  melodyNote(v, when, noteDur) {
    const f = anomalyToFrequency(v);
    const peak = 0.06 + clamp(v, 0, 2) * 0.03;
    if (v >= 1.5) {
      this.brass(f, when, noteDur, peak * 0.8, { bright: clamp((v - 1.5) / 0.7, 0, 1) });
    } else {
      this.piano(f, when, noteDur, peak);
      if (v >= 1.0) this.brass(f / 2, when, noteDur, peak * 0.4, { bright: 0 });
    }
  }

  /**
   * Reproduce una serie de valores como una salsa. Las notas se programan sobre la marcha
   * (con medio segundo de anticipación) para no crear miles de nodos de golpe.
   * @param {number[]} values anomalías (preindustrial)
   * @param {{duration:number, onStep:(i:number)=>void, onEnd:()=>void, embers:boolean}} opts
   */
  playSeries(values, { duration = 20, onStep, onEnd, embers = true } = {}) {
    this.stop();
    const ctx = this.ensure();
    this.playing = true;
    const stepDur = duration / values.length;
    const t0 = ctx.currentTime + 0.12;
    const tEnd = t0 + values.length * stepDur;
    const noteDur = Math.max(0.12, Math.min(0.55, stepDur * 1.8));
    const valueAt = (t) => values[clamp(Math.floor((t - t0) / stepDur), 0, values.length - 1)];

    let nextNote = 0;
    let nextEighth = 0;
    let crossed15 = false;
    let crossed20 = false;
    const schedule = () => {
      if (!this.playing) return;
      const horizon = ctx.currentTime + 0.5;
      // Limpia la lista de nodos ya terminados
      if (this.nodes.length > 400) this.nodes = this.nodes.slice(-200);
      while (nextNote < values.length && t0 + nextNote * stepDur < horizon) {
        const v = values[nextNote];
        const when = t0 + nextNote * stepDur;
        this.melodyNote(v, when, noteDur);
        if (!crossed15 && v >= 1.5) { crossed15 = true; this.bell(when); }
        if (!crossed20 && v >= 2.0) { crossed20 = true; this.alarm(when); }
        nextNote += 1;
      }
      while (t0 + nextEighth * EIGHTH < Math.min(horizon, tEnd)) {
        const t = t0 + nextEighth * EIGHTH;
        this.grooveStep(nextEighth, t, valueAt(t), embers);
        nextEighth += 1;
      }
    };
    schedule();
    this.timer = setInterval(schedule, 120);

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
        clearInterval(this.timer);
        onEnd?.();
        return;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Acorde de bandas de latitud: cada banda es una voz de piano, con un toque de clave */
  playChord(values, duration = 0.5) {
    const ctx = this.ensure();
    const t0 = ctx.currentTime + 0.01;
    values.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      // Norte a la izquierda, sur a la derecha
      const pan = -1 + (2 * i) / Math.max(1, values.length - 1);
      const f = anomalyToFrequency(v * 0.7);
      if (v >= 2.5) this.brass(f, t0, duration, 0.03, { bright: 0.5, pan, keep: true });
      else this.piano(f, t0, duration * 1.3, 0.04, { pan, keep: true });
    });
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 2500;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.08);
  }

  stop() {
    this.playing = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    clearInterval(this.timer);
    this.timer = null;
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
