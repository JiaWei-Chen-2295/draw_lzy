/**
 * Shared export size policy.
 *
 * Used by both the client (/export page) and the render API so the size shown in
 * the UI always matches what the server actually encodes.
 */

export const EXPORT_SCALE_OPTIONS = [
  { value: 1, label: "跟随裁剪 (1×)" },
  { value: 1.5, label: "1.5×" },
  { value: 2, label: "2× (推荐)" },
  { value: 3, label: "3×" },
];

export const DEFAULT_EXPORT_SCALE = 2;

/** Hard cap on the longest output edge, to bound memory and encode time. */
export const MAX_OUTPUT_EDGE = 4096;

function toEvenEdge(value) {
  const clamped = Math.max(2, Math.min(MAX_OUTPUT_EDGE, Math.floor(value)));
  return clamped % 2 === 0 ? clamped : clamped - 1;
}

/**
 * Resolve the final encoder dimensions for a crop rectangle.
 *
 * libx264/ProRes need even dimensions, and the old code padded odd sizes with a
 * white border, which left a visible 1px white line on the right/bottom edge.
 * Rounding to even here removes that.
 */
export function resolveOutputSize(crop, requestedScale) {
  const cropWidth = Math.max(1, Math.floor(Number(crop?.width) || 0));
  const cropHeight = Math.max(1, Math.floor(Number(crop?.height) || 0));
  const requested = Number.isFinite(requestedScale) && requestedScale > 0
    ? requestedScale
    : DEFAULT_EXPORT_SCALE;

  const maxScale = MAX_OUTPUT_EDGE / Math.max(cropWidth, cropHeight);
  const scale = Math.max(0.05, Math.min(requested, maxScale));

  return {
    scale,
    clamped: scale < requested - 1e-6,
    width: toEvenEdge(cropWidth * scale),
    height: toEvenEdge(cropHeight * scale),
  };
}

export function formatOutputSize(size) {
  return `${size.width}×${size.height}`;
}
