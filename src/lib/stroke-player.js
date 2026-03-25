"use client";

export const CANVAS_BACKGROUND = "#fff9f0";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeStroke(stroke, index = 0) {
  const createdAt = toFiniteNumber(stroke?.createdAt, Date.now() + index);
  const rawPoints = Array.isArray(stroke?.points) ? stroke.points : [];
  const points = rawPoints.map((point, pointIndex) => ({
    x: toFiniteNumber(point?.x, 0),
    y: toFiniteNumber(point?.y, 0),
    t: toFiniteNumber(point?.t, createdAt + pointIndex * 16),
    pressure: clamp(toFiniteNumber(point?.pressure, pointIndex === 0 ? 0.65 : 0.55), 0.05, 1),
  }));

  if (points.length === 0) {
    return {
      ...stroke,
      createdAt,
      startedAt: createdAt,
      endedAt: createdAt,
      durationMs: 0,
      points,
    };
  }

  const startedAt = toFiniteNumber(stroke?.startedAt, points[0]?.t ?? createdAt);
  const endedAt = toFiniteNumber(stroke?.endedAt, points.at(-1)?.t ?? startedAt);

  return {
    ...stroke,
    createdAt,
    startedAt,
    endedAt: Math.max(startedAt, endedAt),
    durationMs: Math.max(0, toFiniteNumber(stroke?.durationMs, endedAt - startedAt)),
    points,
  };
}

export function normalizeStrokes(strokes = []) {
  return strokes.map((stroke, index) => normalizeStroke(stroke, index));
}

function getStrokeComposite(stroke) {
  return stroke?.tool === "eraser" ? "destination-out" : "source-over";
}

function getStrokeColor(stroke) {
  return stroke?.tool === "eraser" ? CANVAS_BACKGROUND : stroke?.color || "#22313f";
}

function getSegmentWidth(baseSize, fromPoint, toPoint) {
  const distance = Math.hypot(toPoint.x - fromPoint.x, toPoint.y - fromPoint.y);
  const deltaTime = Math.max(1, toPoint.t - fromPoint.t);
  const speed = distance / deltaTime;
  const speedFactor = clamp(1.18 - speed * 1.6, 0.72, 1.16);
  const pressure = clamp(((fromPoint.pressure ?? 0.55) + (toPoint.pressure ?? 0.55)) / 2, 0.12, 1);
  return Math.max(1, baseSize * (0.45 + pressure * 0.55) * speedFactor);
}

function drawDot(context, point, size, color) {
  context.beginPath();
  context.fillStyle = color;
  context.arc(point.x, point.y, Math.max(0.8, size / 2), 0, Math.PI * 2);
  context.fill();
}

function drawSegment(context, fromPoint, toPoint, size, color) {
  context.beginPath();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = size;
  context.strokeStyle = color;
  context.moveTo(fromPoint.x, fromPoint.y);
  context.lineTo(toPoint.x, toPoint.y);
  context.stroke();
}

function interpolatePoint(fromPoint, toPoint, progress) {
  const ratio = clamp(progress, 0, 1);
  return {
    x: fromPoint.x + (toPoint.x - fromPoint.x) * ratio,
    y: fromPoint.y + (toPoint.y - fromPoint.y) * ratio,
    t: fromPoint.t + (toPoint.t - fromPoint.t) * ratio,
    pressure: (fromPoint.pressure ?? 0.55) + ((toPoint.pressure ?? 0.55) - (fromPoint.pressure ?? 0.55)) * ratio,
  };
}

function drawStrokePoints(context, stroke, points) {
  if (!points.length) {
    return;
  }

  const color = getStrokeColor(stroke);
  const baseSize = Math.max(1, Number(stroke?.size) || 1);

  context.save();
  context.globalCompositeOperation = getStrokeComposite(stroke);

  if (points.length === 1) {
    drawDot(context, points[0], baseSize, color);
    context.restore();
    return;
  }

  drawDot(context, points[0], getSegmentWidth(baseSize, points[0], points[1]), color);

  for (let index = 1; index < points.length; index += 1) {
    const fromPoint = points[index - 1];
    const toPoint = points[index];
    drawSegment(context, fromPoint, toPoint, getSegmentWidth(baseSize, fromPoint, toPoint), color);
  }

  context.restore();
}

export function drawStroke(context, stroke) {
  const normalizedStroke = normalizeStroke(stroke);
  drawStrokePoints(context, normalizedStroke, normalizedStroke.points);
}

export function drawStrokeToElapsed(context, stroke, elapsedMs) {
  const normalizedStroke = normalizeStroke(stroke);
  const points = normalizedStroke.points;

  if (!points.length) {
    return false;
  }

  if (elapsedMs <= normalizedStroke.startedAt) {
    return false;
  }

  if (elapsedMs >= normalizedStroke.endedAt || points.length === 1) {
    drawStrokePoints(context, normalizedStroke, points);
    return true;
  }

  const visiblePoints = [points[0]];

  for (let index = 1; index < points.length; index += 1) {
    const fromPoint = points[index - 1];
    const toPoint = points[index];

    if (elapsedMs >= toPoint.t) {
      visiblePoints.push(toPoint);
      continue;
    }

    if (elapsedMs > fromPoint.t) {
      const partialPoint = interpolatePoint(fromPoint, toPoint, (elapsedMs - fromPoint.t) / Math.max(1, toPoint.t - fromPoint.t));
      visiblePoints.push(partialPoint);
    }

    break;
  }

  drawStrokePoints(context, normalizedStroke, visiblePoints);
  return visiblePoints.length === points.length;
}

export function paintCanvasBackground(canvas) {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = CANVAS_BACKGROUND;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

export function redrawCanvas(canvas, strokes) {
  paintCanvasBackground(canvas);
  const context = canvas.getContext("2d");
  normalizeStrokes(strokes).forEach((stroke) => drawStroke(context, stroke));
}
