export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

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
    const row = Object.fromEntries(
      headers.map((header, index) => [header, values[index]]),
    );

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

  return { baseline1880_1900, visualizationData };
}

export function filterDateRange(data, startDate, endDate) {
  return data.filter((item) => item.date >= startDate && item.date <= endDate);
}

export function compareEdges(rangeData, windowSize = 12) {
  if (rangeData.length < windowSize * 2) return null;

  const firstWindow = rangeData.slice(0, windowSize);
  const lastWindow = rangeData.slice(-windowSize);

  const initialAverage = average(
    firstWindow.map((item) => item.anomalyPreindustrial),
  );
  const finalAverage = average(
    lastWindow.map((item) => item.anomalyPreindustrial),
  );

  return {
    windowSize,
    initialAverage,
    finalAverage,
    difference: finalAverage - initialAverage,
    initialRange: [firstWindow[0].date, firstWindow.at(-1).date],
    finalRange: [lastWindow[0].date, lastWindow.at(-1).date],
  };
}

export function formatTemperature(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} °C`;
}

