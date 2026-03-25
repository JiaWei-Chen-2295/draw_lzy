import { put } from "@vercel/blob";

const CANVAS_BACKGROUND = "#fff9f0";

function fallbackDataUrl(contentType, data) {
  return `data:${contentType};base64,${data}`;
}

function getBlobAccess() {
  const access = process.env.BLOB_ACCESS;
  return access === "private" ? "private" : "public";
}

function buildInlineAsset({ contentType, data, isBase64 = true }) {
  if (isBase64) {
    return {
      url: fallbackDataUrl(contentType, data),
      pathname: null,
      access: null,
      storage: "inline",
      contentType,
    };
  }

  return {
    url: `data:${contentType};charset=utf-8,${encodeURIComponent(data)}`,
    pathname: null,
    access: null,
    storage: "inline",
    contentType,
  };
}

async function uploadDrawingAsset({ pathname, contentType, body, inlineFallback }) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return inlineFallback;
  }

  try {
    const access = getBlobAccess();
    const blob = await put(pathname, body, {
      access,
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return {
      url: blob.url,
      pathname: blob.pathname ?? pathname,
      access,
      storage: "blob",
      contentType,
    };
  } catch {
    return inlineFallback;
  }
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return Number(value.toFixed(2)).toString();
}

function buildStrokeMarkup(stroke) {
  const points = Array.isArray(stroke?.points) ? stroke.points : [];
  const color = stroke?.tool === "eraser" ? CANVAS_BACKGROUND : stroke?.color || "#22313f";
  const size = Math.max(1, Number(stroke?.size) || 1);

  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    const point = points[0];
    return `<circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="${formatNumber(size / 2)}" fill="${color}" />`;
  }

  const polylinePoints = points.map((point) => `${formatNumber(point.x)},${formatNumber(point.y)}`).join(" ");
  return `<polyline points="${polylinePoints}" fill="none" stroke="${color}" stroke-width="${formatNumber(size)}" stroke-linecap="round" stroke-linejoin="round" />`;
}

export function buildDrawingSvg({ strokes = [], width = 1024, height = 1024 }) {
  const safeWidth = Math.max(1, Number(width) || 1024);
  const safeHeight = Math.max(1, Number(height) || 1024);
  const strokeMarkup = strokes.map((stroke) => buildStrokeMarkup(stroke)).filter(Boolean).join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}" fill="none">`,
    `  <rect width="${safeWidth}" height="${safeHeight}" fill="${CANVAS_BACKGROUND}" />`,
    `  ${strokeMarkup}`,
    "</svg>",
  ].join("\n");
}

export async function uploadDrawingAssets({
  roomCode,
  roundId,
  pngBase64Data,
  pngContentType = "image/png",
  svgMarkup,
}) {
  const pngAsset = pngBase64Data
    ? await uploadDrawingAsset({
        pathname: `rooms/${roomCode}/rounds/${roundId}/drawing.png`,
        contentType: pngContentType,
        body: Buffer.from(pngBase64Data, "base64"),
        inlineFallback: buildInlineAsset({
          contentType: pngContentType,
          data: pngBase64Data,
          isBase64: true,
        }),
      })
    : null;

  const svgAsset = svgMarkup
    ? await uploadDrawingAsset({
        pathname: `rooms/${roomCode}/rounds/${roundId}/drawing.svg`,
        contentType: "image/svg+xml",
        body: svgMarkup,
        inlineFallback: buildInlineAsset({
          contentType: "image/svg+xml",
          data: svgMarkup,
          isBase64: false,
        }),
      })
    : null;

  return {
    png: pngAsset,
    svg: svgAsset,
    primary: pngAsset ?? svgAsset,
  };
}
