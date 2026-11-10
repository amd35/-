"use strict";

function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 170;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function autoRedraw(canvas, draw) {
  if (canvas._ro) canvas._ro.disconnect();
  let lastWidth = canvas.clientWidth;
  canvas._ro = new ResizeObserver(() => {
    const width = canvas.clientWidth;
    if (width && Math.abs(width - lastWidth) > 2) {
      lastWidth = width;
      draw();
    }
  });
  canvas._ro.observe(canvas);
}

export function barChart(canvas, items) {
  if (!canvas) return;

  const draw = () => {
    const { ctx, width, height } = setup(canvas);
    const pad = { top: 22, bottom: 26, left: 8, right: 8 };
    const max = Math.max(1, ...items.map((item) => item.value));
    const slot = (width - pad.left - pad.right) / Math.max(1, items.length);
    const barWidth = slot * 0.62;

    ctx.strokeStyle = "rgba(255,255,255,.09)";
    ctx.beginPath();
    ctx.moveTo(pad.left, height - pad.bottom + 0.5);
    ctx.lineTo(width - pad.right, height - pad.bottom + 0.5);
    ctx.stroke();

    items.forEach((item, index) => {
      const x = pad.left + index * slot + (slot - barWidth) / 2;
      const usable = height - pad.top - pad.bottom;
      const barHeight = Math.max(item.value ? 4 : 0, usable * (item.value / max));
      const y = height - pad.bottom - barHeight;

      if (barHeight > 0) {
        const gradient = ctx.createLinearGradient(0, y, 0, height - pad.bottom);
        gradient.addColorStop(0, "#f6e7b0");
        gradient.addColorStop(1, "#a8842a");
        ctx.fillStyle = gradient;
        roundRect(ctx, x, y, barWidth, barHeight, 7);
        ctx.fill();
      }

      ctx.textAlign = "center";
      ctx.fillStyle = "#a49d8d";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(item.label, x + barWidth / 2, height - 8);

      if (item.value) {
        ctx.fillStyle = "#f3e2a4";
        ctx.font = "600 11px system-ui, sans-serif";
        ctx.fillText(String(item.value), x + barWidth / 2, y - 7);
      }
    });
  };

  draw();
  autoRedraw(canvas, draw);
}

export function donutChart(canvas, segments, centerText) {
  if (!canvas) return;

  const draw = () => {
    const { ctx, width, height } = setup(canvas);
    const size = Math.min(width, height);
    const cx = width / 2;
    const cy = height / 2;
    const lineWidth = Math.max(14, size * 0.13);
    const radius = size / 2 - lineWidth / 2 - 4;
    const total = segments.reduce((sum, item) => sum + item.value, 0) || 1;

    ctx.lineWidth = lineWidth;
    ctx.lineCap = "butt";
    let start = -Math.PI / 2;

    segments.forEach((item) => {
      const angle = (item.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.strokeStyle = item.color;
      ctx.arc(cx, cy, radius, start + 0.02, start + Math.max(angle, 0.02));
      ctx.stroke();
      start += angle;
    });

    ctx.textAlign = "center";
    ctx.fillStyle = "#f3e2a4";
    ctx.font = "700 20px system-ui, sans-serif";
    ctx.fillText(String(total), cx, cy + 2);
    ctx.fillStyle = "#a49d8d";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(centerText || "الإجمالي", cx, cy + 20);
  };

  draw();
  autoRedraw(canvas, draw);
}
