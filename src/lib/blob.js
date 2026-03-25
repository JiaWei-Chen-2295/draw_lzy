import { get, put } from "@vercel/blob";

const CANVAS_BACKGROUND = "#fff9f0";
const ANALYSIS_SCHEMA_VERSION = 1;
const ARCHIVE_INDEX_PATH = "analysis/archive-index.json";

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

async function uploadJsonAsset({ pathname, data }) {
  const serialized = JSON.stringify(data, null, 2);

  return uploadDrawingAsset({
    pathname,
    contentType: "application/json",
    body: serialized,
    inlineFallback: buildInlineAsset({
      contentType: "application/json",
      data: serialized,
      isBase64: false,
    }),
  });
}

async function readJsonAsset(pathname) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return null;
  }

  try {
    const access = getBlobAccess();
    const result = await get(pathname, { access });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return null;
    }

    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch {
    return null;
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

function buildRoomArchiveEntry({ room, exportedAt, snapshot }) {
  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    roomCode: room.roomCode,
    status: room.status,
    players: (room.players ?? []).map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      joinedAt: player.joinedAt,
    })),
    createdAt: room.createdAt ?? null,
    updatedAt: room.updatedAt ?? null,
    finishedAt: room.status === "finished" ? exportedAt : null,
    totalRounds: room.totalRounds ?? 0,
    roundCount: room.roundIds?.length ?? 0,
    snapshotUrl: snapshot?.url ?? null,
    snapshotPathname: snapshot?.pathname ?? null,
    snapshotAccess: snapshot?.access ?? null,
    snapshotStorage: snapshot?.storage ?? null,
    snapshotContentType: snapshot?.contentType ?? null,
    exportedAt,
  };
}

export async function uploadRoomAnalysisSnapshot({ room, events = [], snapshotType = "latest" }) {
  if (!room?.roomCode) {
    return null;
  }

  const exportedAt = Date.now();
  const payload = {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    roomCode: room.roomCode,
    snapshotType,
    exportedAt,
    room,
    events,
    stats: {
      playerCount: room.players?.length ?? 0,
      roundCount: room.roundIds?.length ?? 0,
      eventCount: events.length,
    },
  };

  const snapshot = await uploadJsonAsset({
    pathname: `rooms/${room.roomCode}/analysis/${snapshotType}.json`,
    data: payload,
  });

  return {
    exportedAt,
    snapshot,
  };
}

export async function readArchiveIndex() {
  const data = await readJsonAsset(ARCHIVE_INDEX_PATH);
  return Array.isArray(data?.rooms) ? data.rooms : [];
}

export async function upsertArchiveIndexEntry({ room, exportedAt, snapshot }) {
  if (!room?.roomCode) {
    return null;
  }

  const existingRooms = await readArchiveIndex();
  const nextEntry = buildRoomArchiveEntry({ room, exportedAt, snapshot });
  const nextRooms = [nextEntry, ...existingRooms.filter((entry) => entry?.roomCode !== room.roomCode)].sort(
    (left, right) => (right?.updatedAt ?? 0) - (left?.updatedAt ?? 0),
  );

  const indexPayload = {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    exportedAt,
    rooms: nextRooms,
  };

  const asset = await uploadJsonAsset({
    pathname: ARCHIVE_INDEX_PATH,
    data: indexPayload,
  });

  return {
    asset,
    entry: nextEntry,
  };
}

export async function readRoomArchive(roomCode) {
  if (!roomCode) {
    return null;
  }

  const archive = await readJsonAsset(`rooms/${roomCode}/analysis/final.json`);
  return archive ?? null;
}
