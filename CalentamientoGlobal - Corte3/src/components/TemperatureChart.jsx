import { useEffect, useRef } from 'react';

export default function TemperatureChart({ data }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const padding = { left: 70, right: 28, top: 28, bottom: 54 };

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#07101d';
    ctx.fillRect(0, 0, width, height);

    if (!data.length) {
      ctx.fillStyle = '#3ca314';
      ctx.font = '18px system-ui';
      ctx.fillText('No hay datos para el rango seleccionado.', 40, 70);
      return;
    }

    const values = data.map((item) => item.anomalyPreindustrial);
    const minY = Math.min(-0.8, ...values);
    const maxY = Math.max(2.2, ...values);

    const x = (index) =>
      padding.left +
      (index / Math.max(1, data.length - 1)) *
        (width - padding.left - padding.right);

    const y = (value) =>
      padding.top +
      ((maxY - value) / (maxY - minY)) *
        (height - padding.top - padding.bottom);

    ctx.font = '14px system-ui';
    ctx.lineWidth = 1;

    for (let value = Math.ceil(minY * 2) / 2; value <= maxY; value += 0.5) {
      ctx.strokeStyle = '#5be0e4';
      ctx.beginPath();
      ctx.moveTo(padding.left, y(value));
      ctx.lineTo(width - padding.right, y(value));
      ctx.stroke();

      ctx.fillStyle = '#a9bad4';
      ctx.fillText(`${value.toFixed(1)}°`, 20, y(value) + 5);
    }

    [1.5, 2.0].forEach((threshold) => {
      ctx.save();
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = '#eef4ff';
      ctx.beginPath();
      ctx.moveTo(padding.left, y(threshold));
      ctx.lineTo(width - padding.right, y(threshold));
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#eef4ff';
      ctx.fillText(`+${threshold.toFixed(1)} °C`, width - 100, y(threshold) - 8);
    });

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    data.forEach((item, index) => {
      const px = x(index);
      const py = y(item.anomalyPreindustrial);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    ctx.fillStyle = '#4f5e22';
    ctx.fillText(data[0].date, padding.left, height - 18);
    const lastDate = data.at(-1).date;
    ctx.fillText(
      lastDate,
      width - padding.right - ctx.measureText(lastDate).width,
      height - 18,
    );
  }, [data]);

  return (
    <canvas
      ref={canvasRef}
      width="1200"
      height="500"
      className="chart"
      aria-label="Gráfica de anomalías de temperatura"
    />
  );
}
