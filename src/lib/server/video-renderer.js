/**
 * Server-side video rendering module.
 * Extracted from scripts/export-json-video.mjs for reuse by the export API.
 */

import { spawn } from "node:child_process";
import { once } from "node:events";

const DEFAULT_CANVAS = { width: 1024, height: 1024 };

export function toFiniteNumber(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

  if (!points.length) {
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
  return strokes.map((stroke, index) => normalizeStroke(stroke, index)).sort((left, right) => {
    if (left.startedAt !== right.startedAt) {
      return left.startedAt - right.startedAt;
    }
    return left.createdAt - right.createdAt;
  });
}

export function sortRounds(room) {
  return (room?.roundIds ?? [])
    .map((roundId) => room?.roundsById?.[roundId])
    .filter(Boolean)
    .sort((left, right) => (left?.roundIndex ?? 0) - (right?.roundIndex ?? 0));
}

export function getReplayWindow(strokes) {
  if (!strokes.length) {
    return { startAt: 0, endAt: 0, durationMs: 0 };
  }

  const startAt = Math.min(...strokes.map((stroke) => stroke.startedAt ?? stroke.createdAt ?? 0));
  const endAt = Math.max(...strokes.map((stroke) => stroke.endedAt ?? stroke.createdAt ?? startAt));

  return {
    startAt,
    endAt: Math.max(startAt, endAt),
    durationMs: Math.max(0, endAt - startAt),
  };
}

export function parseColor(color) {
  if (typeof color !== "string") {
    return { r: 34, g: 49, b: 63, a: 255 };
  }

  const normalized = color.trim().toLowerCase();

  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return {
      r: Number.parseInt(normalized[1] + normalized[1], 16),
      g: Number.parseInt(normalized[2] + normalized[2], 16),
      b: Number.parseInt(normalized[3] + normalized[3], 16),
      a: 255,
    };
  }

  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16),
      a: 255,
    };
  }

  const rgbaMatch = normalized.match(/^rgba?\(([^)]+)\)$/);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(",").map((item) => item.trim());
    const alpha = parts[3] == null ? 1 : clamp(Number(parts[3]), 0, 1);
    return {
      r: clamp(Math.round(Number(parts[0]) || 0), 0, 255),
      g: clamp(Math.round(Number(parts[1]) || 0), 0, 255),
      b: clamp(Math.round(Number(parts[2]) || 0), 0, 255),
      a: Math.round(alpha * 255),
    };
  }

  return { r: 34, g: 49, b: 63, a: 255 };
}

function getSegmentWidth(baseSize, fromPoint, toPoint) {
  const distance = Math.hypot(toPoint.x - fromPoint.x, toPoint.y - fromPoint.y);
  const deltaTime = Math.max(1, toPoint.t - fromPoint.t);
  const speed = distance / deltaTime;
  const speedFactor = clamp(1.18 - speed * 1.6, 0.72, 1.16);
  const pressure = clamp(((fromPoint.pressure ?? 0.55) + (toPoint.pressure ?? 0.55)) / 2, 0.12, 1);
  return Math.max(1, baseSize * (0.45 + pressure * 0.55) * speedFactor);
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

function getVisiblePoints(stroke, absoluteTime) {
  const points = stroke.points;

  if (!points.length || absoluteTime <= stroke.startedAt) {
    return [];
  }

  if (absoluteTime >= stroke.endedAt || points.length === 1) {
    return points;
  }

  const visiblePoints = [points[0]];

  for (let index = 1; index < points.length; index += 1) {
    const fromPoint = points[index - 1];
    const toPoint = points[index];

    if (absoluteTime >= toPoint.t) {
      visiblePoints.push(toPoint);
      continue;
    }

    if (absoluteTime > fromPoint.t) {
      visiblePoints.push(interpolatePoint(fromPoint, toPoint, (absoluteTime - fromPoint.t) / Math.max(1, toPoint.t - fromPoint.t)));
    }

    break;
  }

  return visiblePoints;
}

function blendSourceOver(buffer, index, color, coverage = 1) {
  const sourceAlpha = (color.a / 255) * coverage;

  if (sourceAlpha <= 0) {
    return;
  }

  const destinationAlpha = buffer[index + 3] / 255;
  const outAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);

  if (outAlpha <= 0) {
    buffer[index] = 0;
    buffer[index + 1] = 0;
    buffer[index + 2] = 0;
    buffer[index + 3] = 0;
    return;
  }

  const nextRed = ((color.r * sourceAlpha) + (buffer[index] * destinationAlpha * (1 - sourceAlpha))) / outAlpha;
  const nextGreen = ((color.g * sourceAlpha) + (buffer[index + 1] * destinationAlpha * (1 - sourceAlpha))) / outAlpha;
  const nextBlue = ((color.b * sourceAlpha) + (buffer[index + 2] * destinationAlpha * (1 - sourceAlpha))) / outAlpha;

  buffer[index] = Math.round(nextRed);
  buffer[index + 1] = Math.round(nextGreen);
  buffer[index + 2] = Math.round(nextBlue);
  buffer[index + 3] = Math.round(outAlpha * 255);
}

function erasePixel(buffer, index, coverage = 1) {
  const nextAlpha = (buffer[index + 3] / 255) * (1 - coverage);

  if (nextAlpha <= 0.0001) {
    buffer[index] = 0;
    buffer[index + 1] = 0;
    buffer[index + 2] = 0;
    buffer[index + 3] = 0;
    return;
  }

  // Keep the straight-alpha colour so a later source-over stays correct.
  buffer[index + 3] = Math.round(nextAlpha * 255);
}

// ─── Anti-aliased coverage rasterization ────────────────────
//
// The previous renderer stamped hard-edged circles along each segment: every
// pixel was either fully painted or untouched, which produced staircase edges
// (and a beaded outline where consecutive stamps met). Each stroke is now
// rasterized into a coverage mask using the analytic signed distance of a
// capsule (segment + round caps) and composited exactly once. Coverage
// accumulates with max() so overlapping stamps can neither darken seams nor
// harden the anti-aliased band.

const COVERAGE_FEATHER = 1; // width of the anti-aliasing band, in output pixels
const SPLINE_SAMPLE_STEP = 0.75; // canvas px between spline samples
const MAX_SAMPLES_PER_STROKE = 6000;
const WIDTH_SMOOTH_PASSES = 2;

const fullPathCache = new WeakMap();

/** Reusable scratch buffers so per-frame allocation stays small. */
export function createRenderState(width, height) {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  return {
    width: safeWidth,
    height: safeHeight,
    mask: new Uint8Array(safeWidth * safeHeight),
  };
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = (dx * dx) + (dy * dy);
  let t = 0;

  if (lengthSquared > 1e-9) {
    t = ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }

  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Exact horizontal extent of a capsule at one scanline. A capsule is convex, so
 * its row slice is a single interval; the extremes lie on the two end caps or on
 * the two offset lines. Clipping each row to that interval avoids touching the
 * empty corners of the bounding box (a long diagonal capsule wastes most of its
 * box otherwise).
 */
function capsuleRowRange(ax, ay, bx, by, radius, centerY) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  let minX = Infinity;
  let maxX = -Infinity;

  for (let endpoint = 0; endpoint < 2; endpoint += 1) {
    const cx = endpoint === 0 ? ax : bx;
    const cy = endpoint === 0 ? ay : by;
    const delta = centerY - cy;

    if (Math.abs(delta) > radius) {
      continue;
    }

    const half = Math.sqrt(Math.max(0, (radius * radius) - (delta * delta)));
    if (cx - half < minX) minX = cx - half;
    if (cx + half > maxX) maxX = cx + half;
  }

  if (length > 1e-9 && Math.abs(dy) > 1e-9) {
    const nx = -dy / length;
    const ny = dx / length;

    for (let side = -1; side <= 1; side += 2) {
      const t = (centerY - ay - (side * radius * ny)) / dy;

      if (t < 0 || t > 1) {
        continue;
      }

      const x = ax + (t * dx) + (side * radius * nx);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }

  return { minX, maxX };
}

/**
 * Accumulate one constant-radius capsule into the coverage mask.
 * `coverage = clamp(0.5 - (distance - radius), 0, 1)` is the box-filter
 * approximation of pixel area coverage, i.e. a 1px anti-aliased edge.
 */
function accumulateCapsule(mask, frameWidth, frameHeight, ax, ay, bx, by, radius) {
  const pad = radius + COVERAGE_FEATHER;
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - pad));
  const maxY = Math.min(frameHeight - 1, Math.ceil(Math.max(ay, by) + pad));

  for (let y = minY; y <= maxY; y += 1) {
    const py = y + 0.5;
    // Inflate by the feather so rows that only the anti-aliased band reaches
    // (pixel centre outside the shape, but within half a pixel of it) are still
    // visited instead of being clipped away.
    const range = capsuleRowRange(ax, ay, bx, by, radius + COVERAGE_FEATHER, py);

    if (!Number.isFinite(range.minX)) {
      continue;
    }

    const rowOffset = y * frameWidth;
    const startX = Math.max(0, Math.floor(range.minX - COVERAGE_FEATHER));
    const endX = Math.min(frameWidth - 1, Math.ceil(range.maxX + COVERAGE_FEATHER));

    for (let x = startX; x <= endX; x += 1) {
      const distance = distanceToSegment(x + 0.5, py, ax, ay, bx, by) - radius;
      const coverage = 0.5 - distance;

      if (coverage <= 0) {
        continue;
      }

      const value = coverage >= 1 ? 255 : Math.round(coverage * 255);
      const maskIndex = rowOffset + x;

      if (value > mask[maskIndex]) {
        mask[maskIndex] = value;
      }
    }
  }
}

/**
 * A capsule whose radius changes along its length is approximated by a chain of
 * short constant-radius capsules. Radius steps stay below half a pixel so the
 * taper is visually continuous (the old code changed width abruptly at every
 * joint, which showed up as steps on the outline).
 */
function accumulateTaperedSegment(mask, frameWidth, frameHeight, ax, ay, bx, by, radiusA, radiusB) {
  const radiusDelta = Math.abs(radiusB - radiusA);
  const steps = Math.max(1, Math.min(64, Math.ceil(radiusDelta / 0.35)));

  if (steps === 1) {
    accumulateCapsule(mask, frameWidth, frameHeight, ax, ay, bx, by, (radiusA + radiusB) / 2);
    return;
  }

  let previousX = ax;
  let previousY = ay;
  let previousRadius = radiusA;

  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    const x = ax + (bx - ax) * progress;
    const y = ay + (by - ay) * progress;
    const radius = radiusA + (radiusB - radiusA) * progress;

    accumulateCapsule(
      mask,
      frameWidth,
      frameHeight,
      previousX,
      previousY,
      x,
      y,
      (previousRadius + radius) / 2,
    );

    previousX = x;
    previousY = y;
    previousRadius = radius;
  }
}

/** Per-vertex stroke width, smoothed so width changes stay gradual. */
function computeStrokeWidths(baseSize, points) {
  const count = points.length;

  if (count === 0) {
    return [];
  }

  if (count === 1) {
    return [Math.max(1, baseSize)];
  }

  const segmentWidths = new Array(count - 1);
  for (let index = 0; index < count - 1; index += 1) {
    segmentWidths[index] = getSegmentWidth(baseSize, points[index], points[index + 1]);
  }

  let widths = new Array(count);
  widths[0] = segmentWidths[0];
  widths[count - 1] = segmentWidths[count - 2];

  for (let index = 1; index < count - 1; index += 1) {
    widths[index] = (segmentWidths[index - 1] + segmentWidths[index]) / 2;
  }

  for (let pass = 0; pass < WIDTH_SMOOTH_PASSES && count > 2; pass += 1) {
    const next = widths.slice();
    for (let index = 1; index < count - 1; index += 1) {
      next[index] = (widths[index - 1] * 0.25) + (widths[index] * 0.5) + (widths[index + 1] * 0.25);
    }
    widths = next;
  }

  return widths;
}

/**
 * Centripetal Catmull-Rom through p0..p3, evaluated for t in [0, 1] between p1
 * and p2. Centripetal parameterisation avoids the cusps and overshoot that a
 * uniform Catmull-Rom produces on unevenly spaced pointer samples.
 */
function catmullRomSample(scratch, p0, p1, p2, p3, t) {
  const knot0 = 0;
  const knot1 = knot0 + Math.max(1e-3, Math.sqrt(Math.hypot(p1.x - p0.x, p1.y - p0.y)));
  const knot2 = knot1 + Math.max(1e-3, Math.sqrt(Math.hypot(p2.x - p1.x, p2.y - p1.y)));
  const knot3 = knot2 + Math.max(1e-3, Math.sqrt(Math.hypot(p3.x - p2.x, p3.y - p2.y)));
  const knot = knot1 + (knot2 - knot1) * clamp(t, 0, 1);

  const a1x = (((knot1 - knot) * p0.x) + ((knot - knot0) * p1.x)) / (knot1 - knot0);
  const a1y = (((knot1 - knot) * p0.y) + ((knot - knot0) * p1.y)) / (knot1 - knot0);
  const a2x = (((knot2 - knot) * p1.x) + ((knot - knot1) * p2.x)) / (knot2 - knot1);
  const a2y = (((knot2 - knot) * p1.y) + ((knot - knot1) * p2.y)) / (knot2 - knot1);
  const a3x = (((knot3 - knot) * p2.x) + ((knot - knot2) * p3.x)) / (knot3 - knot2);
  const a3y = (((knot3 - knot) * p2.y) + ((knot - knot2) * p3.y)) / (knot3 - knot2);

  const b1x = (((knot2 - knot) * a1x) + ((knot - knot0) * a2x)) / (knot2 - knot0);
  const b1y = (((knot2 - knot) * a1y) + ((knot - knot0) * a2y)) / (knot2 - knot0);
  const b2x = (((knot3 - knot) * a2x) + ((knot - knot1) * a3x)) / (knot3 - knot1);
  const b2y = (((knot3 - knot) * a2y) + ((knot - knot1) * a3y)) / (knot3 - knot1);

  scratch.x = (((knot2 - knot) * b1x) + ((knot - knot1) * b2x)) / (knot2 - knot1);
  scratch.y = (((knot2 - knot) * b1y) + ((knot - knot1) * b2y)) / (knot2 - knot1);
  return scratch;
}

/**
 * Turn the raw pointer samples into a polyline in canvas space. With `smooth`
 * enabled the polyline follows a Catmull-Rom spline, which removes the visible
 * corners a straight-segment polyline shows once the export is upscaled.
 */
function buildStrokePolyline(points, widths, smooth) {
  const count = points.length;
  const xs = [];
  const ys = [];
  const ws = [];

  if (count === 0) {
    return { xs, ys, ws };
  }

  if (count === 1 || count === 2 || !smooth) {
    for (let index = 0; index < count; index += 1) {
      xs.push(points[index].x);
      ys.push(points[index].y);
      ws.push(widths[index]);
    }
    return { xs, ys, ws };
  }

  const scratch = { x: 0, y: 0 };

  for (let index = 0; index < count - 1 && xs.length < MAX_SAMPLES_PER_STROKE; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(count - 1, index + 2)];
    const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.max(1, Math.min(64, Math.ceil(chord / SPLINE_SAMPLE_STEP)));
    const widthFrom = widths[index];
    const widthTo = widths[index + 1];

    for (let step = 0; step < steps; step += 1) {
      const progress = step / steps;
      catmullRomSample(scratch, p0, p1, p2, p3, progress);
      xs.push(scratch.x);
      ys.push(scratch.y);
      ws.push(widthFrom + (widthTo - widthFrom) * progress);
    }
  }

  xs.push(points[count - 1].x);
  ys.push(points[count - 1].y);
  ws.push(widths[count - 1]);

  return { xs, ys, ws };
}

function buildBrush(stroke) {
  return stroke?.tool === "eraser"
    ? { mode: "erase", color: null }
    : { mode: "paint", color: parseColor(stroke?.color) };
}

function buildVisiblePath(stroke, visiblePoints, smooth) {
  const baseSize = Math.max(1, Number(stroke?.size) || 1);
  return buildStrokePolyline(visiblePoints, computeStrokeWidths(baseSize, visiblePoints), smooth);
}

/** Fully drawn strokes keep the same geometry every frame, so cache it. */
function getStrokePath(stroke, smooth) {
  const cached = fullPathCache.get(stroke);

  if (cached && cached.smooth === smooth) {
    return cached.path;
  }

  const path = buildVisiblePath(stroke, stroke.points ?? [], smooth);
  fullPathCache.set(stroke, { smooth, path });
  return path;
}

/**
 * Rasterize one stroke into the coverage mask (canvas space -> output pixels)
 * and return the touched bounding box, or null when it lands outside the frame.
 */
function rasterizeStroke(mask, frameWidth, frameHeight, stroke, visiblePoints, crop, scaleX, scaleY, smooth) {
  const path = visiblePoints === stroke.points
    ? getStrokePath(stroke, smooth)
    : buildVisiblePath(stroke, visiblePoints, smooth);

  const count = path.xs.length;

  if (!count) {
    return null;
  }

  const radiusScale = (scaleX + scaleY) / 2;
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  const rs = new Float64Array(count);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let index = 0; index < count; index += 1) {
    const x = (path.xs[index] - crop.x) * scaleX;
    const y = (path.ys[index] - crop.y) * scaleY;
    const radius = Math.max(0.35, (path.ws[index] * radiusScale) / 2);

    xs[index] = x;
    ys[index] = y;
    rs[index] = radius;

    if (x - radius < minX) minX = x - radius;
    if (x + radius > maxX) maxX = x + radius;
    if (y - radius < minY) minY = y - radius;
    if (y + radius > maxY) maxY = y + radius;
  }

  const pad = COVERAGE_FEATHER + 1;
  const boxMinX = Math.max(0, Math.floor(minX - pad));
  const boxMinY = Math.max(0, Math.floor(minY - pad));
  const boxMaxX = Math.min(frameWidth - 1, Math.ceil(maxX + pad));
  const boxMaxY = Math.min(frameHeight - 1, Math.ceil(maxY + pad));

  if (boxMaxX < boxMinX || boxMaxY < boxMinY) {
    return null;
  }

  // Only the stroke's own bounding box needs clearing: the mask is read
  // exclusively inside this box.
  for (let y = boxMinY; y <= boxMaxY; y += 1) {
    const rowOffset = y * frameWidth;
    mask.fill(0, rowOffset + boxMinX, rowOffset + boxMaxX + 1);
  }

  accumulateCapsule(mask, frameWidth, frameHeight, xs[0], ys[0], xs[0], ys[0], rs[0]);

  // Consecutive spline samples are merged into one capsule of roughly the
  // stroke radius, so the round caps are not rasterized thousands of times.
  const chunkLength = Math.max(2, Math.min(8, rs[0] * 0.75));
  let chunkStart = 0;
  let travelled = 0;

  for (let index = 1; index < count; index += 1) {
    travelled += Math.hypot(xs[index] - xs[index - 1], ys[index] - ys[index - 1]);

    if (travelled < chunkLength && index !== count - 1) {
      continue;
    }

    accumulateTaperedSegment(
      mask,
      frameWidth,
      frameHeight,
      xs[chunkStart],
      ys[chunkStart],
      xs[index],
      ys[index],
      rs[chunkStart],
      rs[index],
    );

    chunkStart = index;
    travelled = 0;
  }

  return { minX: boxMinX, minY: boxMinY, maxX: boxMaxX, maxY: boxMaxY };
}

/** Composite the coverage mask onto the frame exactly once per stroke. */
function compositeMask(frame, mask, frameWidth, bounds, stroke) {
  const brush = buildBrush(stroke);

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    const rowOffset = y * frameWidth;

    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const maskIndex = rowOffset + x;
      const coverage = mask[maskIndex];

      if (coverage === 0) {
        continue;
      }

      const pixelIndex = maskIndex * 4;

      if (brush.mode === "erase") {
        erasePixel(frame, pixelIndex, coverage / 255);
      } else {
        blendSourceOver(frame, pixelIndex, brush.color, coverage / 255);
      }
    }
  }
}

export function renderFrame({
  strokes,
  absoluteTime,
  crop,
  outputWidth,
  outputHeight,
  smoothPath = true,
  state,
}) {
  const frameWidth = Math.max(1, Math.floor(outputWidth));
  const frameHeight = Math.max(1, Math.floor(outputHeight));
  const frame = Buffer.alloc(frameWidth * frameHeight * 4);
  const mask = state && state.width === frameWidth && state.height === frameHeight
    ? state.mask
    : new Uint8Array(frameWidth * frameHeight);

  // The output is not necessarily 1:1 with the crop: `outputWidth/Height` may
  // be an upscaled (or downscaled) version of the crop rectangle.
  const scaleX = frameWidth / crop.width;
  const scaleY = frameHeight / crop.height;

  for (const stroke of strokes) {
    const visiblePoints = getVisiblePoints(stroke, absoluteTime);

    if (!visiblePoints.length) {
      continue;
    }

    const bounds = rasterizeStroke(
      mask,
      frameWidth,
      frameHeight,
      stroke,
      visiblePoints,
      crop,
      scaleX,
      scaleY,
      smoothPath,
    );

    if (!bounds) {
      continue;
    }

    compositeMask(frame, mask, frameWidth, bounds, stroke);
  }

  return frame;
}

export function parseCrop(cropValue, canvasWidth, canvasHeight) {
  if (!cropValue) {
    return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
  }

  const parts = typeof cropValue === "string"
    ? cropValue.split(",").map((item) => Number(item.trim()))
    : [cropValue.x, cropValue.y, cropValue.width, cropValue.height];

  const [x, y, width, height] = parts;

  if (![x, y, width, height].every(Number.isFinite)) {
    throw new Error("crop 需要传入 x,y,width,height");
  }

  if (width <= 0 || height <= 0) {
    throw new Error("crop 的 width 和 height 必须大于 0");
  }

  const safeX = clamp(Math.floor(x), 0, canvasWidth - 1);
  const safeY = clamp(Math.floor(y), 0, canvasHeight - 1);

  return {
    x: safeX,
    y: safeY,
    width: Math.max(1, Math.min(Math.floor(width), canvasWidth - safeX)),
    height: Math.max(1, Math.min(Math.floor(height), canvasHeight - safeY)),
  };
}

export function getOutputConfig(format) {
  if (format === "mp4") {
    return {
      format: "mp4",
      ffmpegArgs: ["-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0:color=white", "-preset", "fast", "-crf", "18"],
      // mp4 muxer needs movflags for non-seekable pipe output
      pipeArgs: ["-movflags", "frag_keyframe+empty_moov", "-f", "mp4"],
      fileArgs: ["-f", "mp4"],
      contentType: "video/mp4",
      extension: "mp4",
    };
  }

  if (format === "webm") {
    return {
      format: "webm",
      ffmpegArgs: ["-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-lossless", "1"],
      pipeArgs: ["-f", "webm"],
      fileArgs: ["-f", "webm"],
      contentType: "video/webm",
      extension: "webm",
    };
  }

  if (format === "mov") {
    return {
      format: "mov",
      ffmpegArgs: ["-an", "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", "-vendor", "apl0"],
      // mov muxer does NOT support non-seekable output; only usable for file output
      pipeArgs: null,
      fileArgs: [],
      contentType: "video/quicktime",
      extension: "mov",
    };
  }

  throw new Error("输出格式仅支持 mp4、webm 或 mov");
}

export function resolveRoomPayload(payload) {
  if (payload?.room?.roundsById) {
    return payload.room;
  }

  if (payload?.roundsById) {
    return payload;
  }

  if (Array.isArray(payload?.strokes)) {
    return {
      roomCode: payload.roomCode ?? "imported-room",
      currentRoundId: payload.roundId ?? "imported-round",
      roundIds: [payload.roundId ?? "imported-round"],
      roundsById: {
        [payload.roundId ?? "imported-round"]: {
          roundId: payload.roundId ?? "imported-round",
          roundIndex: 1,
          promptText: payload.promptText ?? "Imported Round",
          strokes: payload.strokes,
          drawing: payload.drawing ?? {},
        },
      },
    };
  }

  throw new Error("JSON 结构无法识别，期望 latest.json / final.json / room 快照 / round 快照");
}

export async function encodeVideo({
  ffmpegPath,
  outputPath,
  outputWidth,
  outputHeight,
  fps,
  formatArgs,
  frameGenerator,
  frameCount,
}) {
  const ffmpegArgs = [
    "-y",
    "-f", "rawvideo",
    "-pixel_format", "rgba",
    "-video_size", `${outputWidth}x${outputHeight}`,
    "-framerate", String(fps),
    "-i", "-",
    ...formatArgs,
    outputPath,
  ];

  const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, {
    stdio: ["pipe", "ignore", "pipe"],
    windowsHide: true,
  });

  let stderrText = "";

  ffmpegProcess.stderr.on("data", (chunk) => {
    stderrText += chunk.toString();
  });

  await new Promise((resolve, reject) => {
    ffmpegProcess.stdin.on("error", reject);
    ffmpegProcess.on("error", (error) => {
      reject(error);
    });

    ffmpegProcess.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderrText || `ffmpeg 退出码 ${code}`));
    });

    (async () => {
      try {
        for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
          const frame = frameGenerator(frameIndex);
          const isWritable = ffmpegProcess.stdin.write(frame);

          if (!isWritable) {
            await once(ffmpegProcess.stdin, "drain");
          }
        }

        ffmpegProcess.stdin.end();
      } catch (error) {
        ffmpegProcess.stdin.destroy(error);
      }
    })();
  });
}

export async function encodeVideoToStream({
  ffmpegPath,
  outputWidth,
  outputHeight,
  fps,
  formatArgs,
  pipeArgs,
  frameGenerator,
  frameCount,
}) {
  if (!pipeArgs) {
    throw new Error("该格式不支持流式输出（pipe），请使用 mp4 或 webm");
  }

  const ffmpegArgs = [
    "-y",
    "-f", "rawvideo",
    "-pixel_format", "rgba",
    "-video_size", `${outputWidth}x${outputHeight}`,
    "-framerate", String(fps),
    "-i", "-",
    ...formatArgs,
    ...pipeArgs,
    "pipe:1",
  ];

  const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderrText = "";

  ffmpegProcess.stderr.on("data", (chunk) => {
    stderrText += chunk.toString();
  });

  // Feed frames in background
  (async () => {
    try {
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        const frame = frameGenerator(frameIndex);
        const isWritable = ffmpegProcess.stdin.write(frame);

        if (!isWritable) {
          await once(ffmpegProcess.stdin, "drain");
        }
      }

      ffmpegProcess.stdin.end();
    } catch (error) {
      ffmpegProcess.stdin.destroy(error);
    }
  })();

  return { stdout: ffmpegProcess.stdout, process: ffmpegProcess, getStderr: () => stderrText };
}

export { DEFAULT_CANVAS };
