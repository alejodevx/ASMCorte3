export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const MONTH_NAMES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const PARIS_THRESHOLDS = [1.5, 2.0];

export function average(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : Number.NaN;
}

export function parseGistempCsv(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headerIndex = lines.findIndex((line) => line.startsWith('Year,'));
  if (headerIndex === -1) {
    throw new Error('No se encontró la cabecera Year,Jan,Feb,… en el CSV.');
  }

  const headers = lines[headerIndex].split(',').map((value) => value.trim());
  const monthlyData = [];

  for (const line of lines.slice(headerIndex + 1)) {
    const values = line.split(',').map((value) => value.trim());
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    const year = Number(row.Year);
    if (!Number.isInteger(year)) continue;

    MONTHS.forEach((monthName, monthIndex) => {
      const original = row[monthName];
      // *** significa dato faltante. No debe transformarse en 0.
      if (!original || original.includes('*')) return;
      const anomaly1951_1980 = Number(original);
      if (!Number.isFinite(anomaly1951_1980)) return;
      monthlyData.push({
        year,
        month: monthIndex + 1,
        date: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
        anomaly1951_1980,
      });
    });
  }
  return monthlyData;
}

export function prepareGistempData(rawData) {
  const baselineValues = rawData
    .filter((item) => item.year >= 1880 && item.year <= 1900)
    .map((item) => item.anomaly1951_1980);

  if (baselineValues.length === 0) {
    throw new Error('No hay observaciones entre 1880 y 1900 para calcular la línea base.');
  }

  const baseline1880_1900 = average(baselineValues);

  const visualizationData = rawData
    .filter((item) => item.year >= 1926)
    .map((item) => ({
      ...item,
      anomalyPreindustrial: item.anomaly1951_1980 - baseline1880_1900,
    }));

  // Media móvil de 12 meses (ventana que termina en cada mes)
  visualizationData.forEach((item, index) => {
    if (index < 11) {
      item.rolling12 = Number.NaN;
      return;
    }
    item.rolling12 = average(
      visualizationData.slice(index - 11, index + 1).map((d) => d.anomalyPreindustrial),
    );
  });

  return { baseline1880_1900, visualizationData };
}

/** Promedios anuales (sólo años completos) */
export function yearlyAverages(data) {
  const byYear = new Map();
  data.forEach((d) => {
    if (!byYear.has(d.year)) byYear.set(d.year, []);
    byYear.get(d.year).push(d.anomalyPreindustrial);
  });
  return [...byYear.entries()].map(([year, values]) => ({
    year,
    value: average(values),
    complete: values.length === 12,
    months: values.length,
  }));
}

export function filterDateRange(data, startDate, endDate) {
  return data.filter((item) => item.date >= startDate && item.date <= endDate);
}

export function compareEdges(rangeData, windowSize = 12) {
  if (rangeData.length < windowSize * 2) return null;
  const firstWindow = rangeData.slice(0, windowSize);
  const lastWindow = rangeData.slice(-windowSize);
  const initialAverage = average(firstWindow.map((item) => item.anomalyPreindustrial));
  const finalAverage = average(lastWindow.map((item) => item.anomalyPreindustrial));
  return {
    windowSize,
    initialAverage,
    finalAverage,
    difference: finalAverage - initialAverage,
    initialRange: [firstWindow[0].date, firstWindow.at(-1).date],
    finalRange: [lastWindow[0].date, lastWindow.at(-1).date],
  };
}

export function formatTemperature(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)} °C`;
}

export function formatDate(date) {
  if (!date) return '—';
  const [y, m] = date.split('-').map(Number);
  const name = MONTH_NAMES_ES[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${y}`;
}

export function shortDate(date) {
  if (!date) return '—';
  const [y, m] = date.split('-').map(Number);
  const name = MONTH_NAMES_ES[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1, 3)} ${y}`;
}

/* ───────── Datos zonales (bandas de latitud, anuales) ───────── */

export const ZONES = [
  { key: '64N-90N', label: 'Ártico', range: '64°N – 90°N', lat: [64, 90] },
  { key: '44N-64N', label: 'Norte subpolar', range: '44°N – 64°N', lat: [44, 64] },
  { key: '24N-44N', label: 'Norte templado', range: '24°N – 44°N', lat: [24, 44] },
  { key: 'EQU-24N', label: 'Trópico norte', range: '0° – 24°N', lat: [0, 24] },
  { key: '24S-EQU', label: 'Trópico sur', range: '24°S – 0°', lat: [-24, 0] },
  { key: '44S-24S', label: 'Sur templado', range: '44°S – 24°S', lat: [-44, -24] },
  { key: '64S-44S', label: 'Océano Austral', range: '64°S – 44°S', lat: [-64, -44] },
  { key: '90S-64S', label: 'Antártida', range: '90°S – 64°S', lat: [-90, -64] },
];

export function parseZonalCsv(csvText) {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((l) => l.startsWith('Year,'));
  const headers = lines[headerIndex].split(',');
  const rows = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const values = line.split(',');
    const year = Number(values[0]);
    if (!Number.isInteger(year)) continue;
    const row = { year };
    headers.forEach((h, i) => {
      if (i === 0) return;
      const v = values[i];
      row[h] = v && !v.includes('*') ? Number(v) : Number.NaN;
    });
    rows.push(row);
  }

  // Línea base 1880–1900 de cada banda (misma lógica que la serie global)
  const baselines = {};
  ['Glob', ...ZONES.map((z) => z.key)].forEach((key) => {
    baselines[key] = average(
      rows.filter((r) => r.year >= 1880 && r.year <= 1900 && Number.isFinite(r[key])).map((r) => r[key]),
    );
  });

  const data = rows
    .filter((r) => r.year >= 1926)
    .map((r) => {
      const zones = {};
      ZONES.forEach((z) => {
        zones[z.key] = {
          anomaly1951_1980: r[z.key],
          anomalyPreindustrial: r[z.key] - baselines[z.key],
        };
      });
      return {
        year: r.year,
        global: { anomaly1951_1980: r.Glob, anomalyPreindustrial: r.Glob - baselines.Glob },
        zones,
      };
    });

  return { data, baselines };
}
