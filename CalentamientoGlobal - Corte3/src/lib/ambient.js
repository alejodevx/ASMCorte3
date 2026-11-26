/*
 * Paisaje sonoro del diorama, sintetizado con Web Audio (sin archivos):
 * río Pance (ruido grave), viento seco, chicharras, cantos de aves y, a lo lejos, una salsa que suena
 * desde una ventana del barrio (clave 3-2 y bajo tumbao, apagados por la distancia).
 * Todo sigue al "estrés térmico" 0 → 1.
 */
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export function createAmbient(ctx) {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(ctx.destination);

  const len = ctx.sampleRate * 3;
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) ch[i] = Math.random() * 2 - 1;
  const noise = () => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start();
    return src;
  };

  // Río
  const riverSrc = noise();
  const riverLp = ctx.createBiquadFilter();
  riverLp.type = 'lowpass'; riverLp.frequency.value = 850;
  const riverHp = ctx.createBiquadFilter();
  riverHp.type = 'highpass'; riverHp.frequency.value = 180;
  const riverGain = ctx.createGain();
  riverSrc.connect(riverLp).connect(riverHp).connect(riverGain).connect(out);

  // Viento seco
  const windSrc = noise();
  const windBp = ctx.createBiquadFilter();
  windBp.type = 'bandpass'; windBp.frequency.value = 320; windBp.Q.value = 0.5;
  const windGain = ctx.createGain();
  const windLfo = ctx.createOscillator();
  windLfo.frequency.value = 0.13;
  const windLfoGain = ctx.createGain();
  windLfoGain.gain.value = 140;
  windLfo.connect(windLfoGain).connect(windBp.frequency);
  windLfo.start();
  windSrc.connect(windBp).connect(windGain).connect(out);

  // Chicharras: portadora aguda con trémolo rápido
  const cicada = ctx.createOscillator();
  cicada.type = 'sawtooth'; cicada.frequency.value = 4300;
  const cicadaBp = ctx.createBiquadFilter();
  cicadaBp.type = 'bandpass'; cicadaBp.frequency.value = 4300; cicadaBp.Q.value = 6;
  const trem = ctx.createGain();
  trem.gain.value = 0.5;
  const tremLfo = ctx.createOscillator();
  tremLfo.type = 'square'; tremLfo.frequency.value = 46;
  const tremDepth = ctx.createGain();
  tremDepth.gain.value = 0.5;
  tremLfo.connect(tremDepth).connect(trem.gain);
  const cicadaGain = ctx.createGain();
  cicadaGain.gain.value = 0;
  cicada.connect(cicadaBp).connect(trem).connect(cicadaGain).connect(out);
  cicada.start(); tremLfo.start();

  let stress = 0;
  let timer = null;

  // Salsa lejana: pasa por un filtro paso bajo para que suene "del otro lado de la calle"
  const farLp = ctx.createBiquadFilter();
  farLp.type = 'lowpass'; farLp.frequency.value = 1100;
  const farGain = ctx.createGain();
  farGain.gain.value = 0.5;
  farLp.connect(farGain).connect(out);
  const EIGHTH = 60 / 180 / 2;
  const CLAVE = [0, 3, 6, 10, 12];
  const BASS = [[3, 45], [6, 45], [11, 40], [14, 40]];
  let barTimer = null;
  let nextBar = 0;
  function hit(t, freq, len, gain, type = 'sine') {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(farLp);
    o.start(t); o.stop(t + len + 0.03);
  }
  function scheduleSalsa() {
    const now = ctx.currentTime;
    if (nextBar < now) nextBar = now + 0.1;
    while (nextBar < now + 1.2) {
      CLAVE.forEach((p) => hit(nextBar + p * EIGHTH, 2500, 0.06, 0.03));
      BASS.forEach(([p, m]) => hit(nextBar + p * EIGHTH, 440 * 2 ** ((m - 69) / 12), EIGHTH * 2.6, 0.09, 'triangle'));
      [6, 7, 14, 15].forEach((p) => hit(nextBar + p * EIGHTH, p % 2 ? 330 : 240, 0.2, 0.05));
      nextBar += 16 * EIGHTH;
    }
  }

  function chirp() {
    const t0 = ctx.currentTime;
    const base = 2100 + Math.random() * 1500;
    const notes = 1 + Math.floor(Math.random() * 3);
    for (let n = 0; n < notes; n += 1) {
      const t = t0 + n * 0.13;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.45, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(base * 1.1, t + 0.1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + 0.13);
    }
  }

  function setStress(s) {
    stress = clamp(s);
    const t = ctx.currentTime;
    riverGain.gain.setTargetAtTime(0.012 + 0.2 * (1 - stress) ** 1.4, t, 0.4);
    riverLp.frequency.setTargetAtTime(500 + 500 * (1 - stress), t, 0.4);
    windGain.gain.setTargetAtTime(0.02 + 0.16 * stress, t, 0.5);
    cicadaGain.gain.setTargetAtTime(0.03 * clamp((stress - 0.4) / 0.6), t, 0.6);
    farGain.gain.setTargetAtTime(0.55 - 0.25 * stress, t, 0.6);
  }

  return {
    setStress,
    start() {
      out.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
      if (!timer) timer = setInterval(() => { if (Math.random() < 0.55 * (1 - stress * 0.92)) chirp(); }, 700);
      if (!barTimer) { scheduleSalsa(); barTimer = setInterval(scheduleSalsa, 400); }
    },
    stop() {
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      clearInterval(timer); timer = null;
      clearInterval(barTimer); barTimer = null;
    },
    dispose() {
      clearInterval(timer);
      clearInterval(barTimer);
      out.gain.value = 0;
      [riverSrc, windSrc, cicada, tremLfo, windLfo].forEach((n) => { try { n.stop(); } catch { /* ya detenido */ } });
      out.disconnect();
    },
  };
}
