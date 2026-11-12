// Escala divergente: frío (azules) → neutro → calor (rojos profundos).
// Dominio expresado en °C de anomalía respecto a 1880–1900.
const STOPS = [
  [-0.6, [16, 54, 110]],
  [-0.2, [44, 110, 175]],
  [0.15, [120, 170, 214]],
  [0.45, [230, 226, 214]],
  [0.8, [246, 178, 107]],
  [1.15, [232, 106, 62]],
  [1.5, [200, 34, 40]],
  [2.0, [140, 10, 40]],
  [3.0, [80, 4, 30]],
  [4.0, [40, 0, 18]],
];

export function anomalyRgb(value) {
  if (!Number.isFinite(value)) return [90, 90, 90];
  if (value <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i += 1) {
    const [v1, c1] = STOPS[i];
    const [v0, c0] = STOPS[i - 1];
    if (value <= v1) {
      const t = (value - v0) / (v1 - v0);
      return c0.map((c, k) => Math.round(c + (c1[k] - c) * t));
    }
  }
  return STOPS.at(-1)[1];
}

export function anomalyColor(value, alpha = 1) {
  const [r, g, b] = anomalyRgb(value);
  return alpha === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

/** Color de texto legible sobre el color de anomalía */
export function textOn(value) {
  const [r, g, b] = anomalyRgb(value);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 150 ? '#1a1410' : '#fff8f0';
}

export const LEGEND_STOPS = STOPS.slice(0, 9).map(([v]) => v);
