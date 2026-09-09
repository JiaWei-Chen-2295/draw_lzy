"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DEFAULT_CANVAS } from "@/lib/constants";
import { DEFAULT_EXPORT_SCALE, EXPORT_SCALE_OPTIONS, resolveOutputSize } from "@/lib/export-options";
import { drawStrokeToElapsed, normalizeStrokes } from "@/lib/stroke-player";

// ─── Helpers ────────────────────────────────────────────────

function getReplayWindow(strokes) {
  if (!strokes.length) {
    return { startAt: 0, endAt: 0, durationMs: 0 };
  }
  const startAt = Math.min(...strokes.map((s) => s.startedAt ?? s.createdAt ?? 0));
  const endAt = Math.max(...strokes.map((s) => s.endedAt ?? s.createdAt ?? startAt));
  return { startAt, endAt: Math.max(startAt, endAt), durationMs: Math.max(0, endAt - startAt) };
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function hitTestStroke(stroke, canvasX, canvasY, threshold = 12) {
  const points = stroke.points;
  if (!points || points.length === 0) return false;
  if (points.length === 1) {
    return Math.hypot(canvasX - points[0].x, canvasY - points[0].y) <= threshold;
  }
  for (let i = 1; i < points.length; i++) {
    if (distanceToSegment(canvasX, canvasY, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y) <= threshold) {
      return true;
    }
  }
  return false;
}

function resolveRoomPayload(payload) {
  if (payload?.room?.roundsById) return payload.room;
  if (payload?.roundsById) return payload;
  if (Array.isArray(payload?.strokes)) {
    return {
      roomCode: payload.roomCode ?? "imported",
      roundIds: [payload.roundId ?? "imported-round"],
      roundsById: {
        [payload.roundId ?? "imported-round"]: {
          roundId: payload.roundId ?? "imported-round",
          roundIndex: 1,
          promptText: payload.promptText ?? "导入轮次",
          strokes: payload.strokes,
          drawing: payload.drawing ?? {},
        },
      },
    };
  }
  return null;
}

function sortRoundsFromRoom(room) {
  return (room?.roundIds ?? [])
    .map((id) => room?.roundsById?.[id])
    .filter(Boolean)
    .sort((a, b) => (a?.roundIndex ?? 0) - (b?.roundIndex ?? 0));
}

function getCanvasSize(round, strokes) {
  const drawingWidth = Number(round?.drawing?.width);
  const drawingHeight = Number(round?.drawing?.height);
  const points = (strokes ?? []).flatMap((stroke) => stroke?.points ?? []);
  const maxX = points.reduce((current, point) => Math.max(current, Number(point?.x) || 0), 0);
  const maxY = points.reduce((current, point) => Math.max(current, Number(point?.y) || 0), 0);

  return {
    width: Math.max(
      DEFAULT_CANVAS.width,
      Number.isFinite(drawingWidth) && drawingWidth > 0 ? drawingWidth : 0,
      Math.ceil(maxX + 16),
    ),
    height: Math.max(
      DEFAULT_CANVAS.height,
      Number.isFinite(drawingHeight) && drawingHeight > 0 ? drawingHeight : 0,
      Math.ceil(maxY + 16),
    ),
  };
}

// ─── Checkerboard pattern for transparent bg ────────────────

function drawCheckerboard(ctx, w, h, size = 16) {
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? "#e8e8e8" : "#ffffff";
      ctx.fillRect(x, y, size, size);
    }
  }
}

// ─── Crop drawing & interaction ─────────────────────────────

const HANDLE_SIZE = 10;
const EDGE_HIT = 12;
const CORNER_BRACKET = 20;

function getCropHandles(crop, scale) {
  if (!crop) return [];
  const sx = crop.x * scale;
  const sy = crop.y * scale;
  const sw = crop.width * scale;
  const sh = crop.height * scale;
  const mx = sx + sw / 2;
  const my = sy + sh / 2;
  return [
    { id: "nw", cx: sx, cy: sy, cursor: "nwse-resize" },
    { id: "ne", cx: sx + sw, cy: sy, cursor: "nesw-resize" },
    { id: "sw", cx: sx, cy: sy + sh, cursor: "nesw-resize" },
    { id: "se", cx: sx + sw, cy: sy + sh, cursor: "nwse-resize" },
    { id: "n", cx: mx, cy: sy, cursor: "ns-resize" },
    { id: "s", cx: mx, cy: sy + sh, cursor: "ns-resize" },
    { id: "w", cx: sx, cy: my, cursor: "ew-resize" },
    { id: "e", cx: sx + sw, cy: my, cursor: "ew-resize" },
  ];
}

function hitHandle(mx, my, handles) {
  // Check corners first (higher priority)
  for (const h of handles.slice(0, 4)) {
    if (Math.abs(mx - h.cx) <= EDGE_HIT && Math.abs(my - h.cy) <= EDGE_HIT) return h;
  }
  // Then edges
  for (const h of handles.slice(4)) {
    if (Math.abs(mx - h.cx) <= EDGE_HIT && Math.abs(my - h.cy) <= EDGE_HIT) return h;
  }
  return null;
}

function isInsideCrop(mx, my, crop, scale) {
  if (!crop) return false;
  const sx = crop.x * scale;
  const sy = crop.y * scale;
  const sw = crop.width * scale;
  const sh = crop.height * scale;
  return mx >= sx && mx <= sx + sw && my >= sy && my <= sy + sh;
}

function getCropCursor(mx, my, crop, scale) {
  if (!crop) return "crosshair";
  const handles = getCropHandles(crop, scale);
  const hit = hitHandle(mx, my, handles);
  if (hit) return hit.cursor;
  if (isInsideCrop(mx, my, crop, scale)) return "move";
  return "crosshair";
}

function drawCropOverlay(ctx, crop, canvasW, canvasH, scale, totalW, totalH, isActive) {
  if (!crop) return;
  const sx = crop.x * scale;
  const sy = crop.y * scale;
  const sw = crop.width * scale;
  const sh = crop.height * scale;

  // Semi-transparent dark mask outside crop
  ctx.save();
  const maskAlpha = isActive ? 0.55 : 0.3;
  ctx.fillStyle = `rgba(0,0,0,${maskAlpha})`;
  ctx.fillRect(0, 0, totalW, sy);
  ctx.fillRect(0, sy + sh, totalW, totalH - sy - sh);
  ctx.fillRect(0, sy, sx, sh);
  ctx.fillRect(sx + sw, sy, totalW - sx - sw, sh);

  // Double border for contrast (dark shadow + white line)
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 3;
  ctx.strokeRect(sx - 1, sy - 1, sw + 2, sh + 2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sx, sy, sw, sh);

  if (isActive) {
    // Rule-of-thirds grid
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.75;
    for (let i = 1; i <= 2; i++) {
      const gx = sx + (sw * i) / 3;
      const gy = sy + (sh * i) / 3;
      ctx.beginPath();
      ctx.moveTo(gx, sy);
      ctx.lineTo(gx, sy + sh);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx, gy);
      ctx.lineTo(sx + sw, gy);
      ctx.stroke();
    }

    // Corner brackets (L-shaped)
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    const bLen = Math.min(CORNER_BRACKET, sw / 4, sh / 4);
    const corners = [
      [sx, sy, 1, 1],
      [sx + sw, sy, -1, 1],
      [sx, sy + sh, 1, -1],
      [sx + sw, sy + sh, -1, -1],
    ];
    for (const [cx, cy, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * bLen, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * bLen);
      ctx.stroke();
    }

    // 8 square handles
    const handles = getCropHandles(crop, scale);
    const hs = HANDLE_SIZE / 2;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.5;
    for (const h of handles) {
      ctx.fillRect(h.cx - hs, h.cy - hs, HANDLE_SIZE, HANDLE_SIZE);
      ctx.strokeRect(h.cx - hs, h.cy - hs, HANDLE_SIZE, HANDLE_SIZE);
    }
  }

  ctx.restore();
}

// ─── Main component ────────────────────────────────────────

export function ExportClient() {
  const searchParams = useSearchParams();
  const initialRoom = searchParams.get("room") ?? "";

  // Data loading
  const [snapshots, setSnapshots] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(initialRoom);
  const [rounds, setRounds] = useState([]);
  const [selectedRoundId, setSelectedRoundId] = useState("");
  const [allStrokes, setAllStrokes] = useState([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [loadingRound, setLoadingRound] = useState(false);

  // Stroke selection (excluded set)
  const [excludedIndices, setExcludedIndices] = useState(new Set());

  // Mode: "select" | "crop"
  const [mode, setMode] = useState("pan");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panDrag = useRef(null);

  // Crop rectangle (in canvas coordinates 0..1024)
  const [crop, setCrop] = useState(null);

  // Timeline
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState(0);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Export
  const [exportFormat, setExportFormat] = useState("mp4");
  const [exportScale, setExportScale] = useState(DEFAULT_EXPORT_SCALE);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  // Refs
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const animFrameRef = useRef(null);
  const [viewport, setViewport] = useState({ width: 640, height: 480 });

  // Drag state for crop
  const dragRef = useRef(null);

  const normalizedStrokes = useMemo(() => normalizeStrokes(allStrokes), [allStrokes]);
  const selectedRound = useMemo(() => rounds.find((round) => round.roundId === selectedRoundId) ?? null, [rounds, selectedRoundId]);
  const canvasSize = useMemo(() => getCanvasSize(selectedRound, normalizedStrokes), [normalizedStrokes, selectedRound]);
  const activeStrokes = useMemo(
    () => normalizedStrokes.filter((_, i) => !excludedIndices.has(i)),
    [normalizedStrokes, excludedIndices],
  );
  const replayWindow = useMemo(() => getReplayWindow(normalizedStrokes), [normalizedStrokes]);
  const exportCrop = useMemo(
    () => crop ?? { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height },
    [crop, canvasSize],
  );
  const outputSize = useMemo(() => resolveOutputSize(exportCrop, exportScale), [exportCrop, exportScale]);

  const hasStrokes = normalizedStrokes.length > 0;

  // Clamp timeline values to replay window
  useEffect(() => {
    if (replayWindow.durationMs > 0) {
      setStartMs(0);
      setEndMs(replayWindow.durationMs);
      setPlayheadMs(replayWindow.durationMs);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setIsPlaying(false);
      setExcludedIndices(new Set());
      setCrop(null);
    }
  }, [replayWindow.durationMs, replayWindow.startAt]);

  // ─── Load snapshots list ──────────────────────────────────

  useEffect(() => {
    setLoadingSnapshots(true);
    fetch("/api/export/snapshots")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setSnapshots(data.snapshots ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingSnapshots(false));
  }, []);

  // ─── Load room rounds ────────────────────────────────────

  useEffect(() => {
    if (!selectedRoom) {
      setRounds([]);
      setSelectedRoundId("");
      setAllStrokes([]);
      return;
    }
    setLoadingRound(true);
    fetch(`/api/export/snapshots/${encodeURIComponent(selectedRoom)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setRounds(data.rounds ?? []);
          if (data.rounds?.length) {
            setSelectedRoundId(data.rounds[0].roundId);
            setAllStrokes(data.rounds[0].strokes ?? []);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRound(false));
  }, [selectedRoom]);

  // Load strokes when round changes
  useEffect(() => {
    if (!selectedRoundId || !rounds.length) return;
    const round = rounds.find((r) => r.roundId === selectedRoundId);
    if (round) setAllStrokes(round.strokes ?? []);
  }, [selectedRoundId, rounds]);

  // ─── File upload ──────────────────────────────────────────

  function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        const room = resolveRoomPayload(payload);
        if (!room) {
          alert("无法识别 JSON 结构");
          return;
        }
        const roomRounds = sortRoundsFromRoom(room);
        setRounds(
          roomRounds.map((r) => ({
            roundId: r.roundId,
            roundIndex: r.roundIndex,
            promptText: r.promptText ?? "-",
            strokes: r.strokes ?? [],
            drawing: r.drawing ?? {},
          })),
        );
        setSelectedRoom("");
        if (roomRounds.length) {
          setSelectedRoundId(roomRounds[0].roundId);
          setAllStrokes(roomRounds[0].strokes ?? []);
        }
      } catch {
        alert("JSON 解析失败");
      }
    };
    reader.readAsText(file);
  }

  // ─── Responsive container ─────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setViewport({ width: Math.max(1, el.clientWidth), height: Math.max(1, el.clientHeight) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasStrokes]);

  const bounds = useMemo(() => {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const stroke of normalizedStrokes) {
      const padding = Math.max(16, Number(stroke.size) || 1);
      for (const point of stroke.points) {
        left = Math.min(left, point.x - padding); top = Math.min(top, point.y - padding);
        right = Math.max(right, point.x + padding); bottom = Math.max(bottom, point.y + padding);
      }
    }
    return Number.isFinite(left) ? { x: left, y: top, width: right - left, height: bottom - top } : { x: 0, y: 0, ...canvasSize };
  }, [normalizedStrokes, canvasSize]);
  const scale = Math.min(Math.max(1, viewport.width - 64) / bounds.width, Math.max(1, viewport.height - 64) / bounds.height) * zoom;
  const previewWidth = Math.max(1, Math.round(canvasSize.width * scale));
  const previewHeight = Math.max(1, Math.round(canvasSize.height * scale));
  const previewStyle = {
    width: previewWidth,
    height: previewHeight,
    left: viewport.width / 2 - (bounds.x + bounds.width / 2) * scale + pan.x,
    top: viewport.height / 2 - (bounds.y + bounds.height / 2) * scale + pan.y,
  };

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    function wheel(event) {
      event.preventDefault();
      const nextZoom = Math.min(6, Math.max(0.1, zoom * Math.exp(-event.deltaY * 0.002)));
      const ratio = nextZoom / zoom;
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left - viewport.width / 2;
      const y = event.clientY - rect.top - viewport.height / 2;
      setPan((current) => ({ x: x - (x - current.x) * ratio, y: y - (y - current.y) * ratio }));
      setZoom(nextZoom);
    }
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [hasStrokes, viewport, zoom]);

  // ─── Render canvas ────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const absolutePlayhead = replayWindow.startAt + playheadMs;

    // Draw active strokes
    activeStrokes.forEach((stroke) => {
      drawStrokeToElapsed(ctx, stroke, absolutePlayhead);
    });

    // Draw excluded strokes semi-transparent
    normalizedStrokes.forEach((stroke, i) => {
      if (!excludedIndices.has(i)) return;
      ctx.save();
      ctx.globalAlpha = 0.15;
      drawStrokeToElapsed(ctx, stroke, absolutePlayhead);
      ctx.restore();
    });
  }, [activeStrokes, canvasSize.height, canvasSize.width, normalizedStrokes, excludedIndices, playheadMs, replayWindow.startAt]);

  // ─── Render overlay (checkerboard) ─────────────────────────

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.width = viewport.width;
    overlay.height = viewport.height;
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    drawCheckerboard(ctx, viewport.width, viewport.height, 16);
  }, [viewport, hasStrokes]);

  // ─── Render crop overlay on top canvas (always when crop exists) ───

  useEffect(() => {
    const cropCanvas = cropCanvasRef.current;
    if (!cropCanvas) return;
    cropCanvas.width = previewWidth;
    cropCanvas.height = previewHeight;
    const ctx = cropCanvas.getContext("2d");
    ctx.clearRect(0, 0, previewWidth, previewHeight);
    if (crop) {
      drawCropOverlay(ctx, crop, canvasSize.width, canvasSize.height, scale, previewWidth, previewHeight, mode === "crop");
    }
  }, [canvasSize.height, canvasSize.width, crop, mode, previewHeight, previewWidth, scale]);

  // ─── Playback animation ───────────────────────────────────

  useEffect(() => {
    if (!isPlaying || replayWindow.durationMs <= 0) return;

    let startedAt = 0;
    const startOffset = playheadMs;

    const animate = (frameTime) => {
      if (!startedAt) startedAt = frameTime;
      const elapsed = frameTime - startedAt;
      const nextPlayhead = Math.min(endMs, startOffset + elapsed);
      setPlayheadMs(nextPlayhead);
      if (nextPlayhead >= endMs) {
        setIsPlaying(false);
        return;
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  // The animation owns the playhead while playing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, endMs, replayWindow.durationMs]);

  // ─── Canvas pointer events ────────────────────────────────

  const getCanvasCoords = useCallback(
    (event) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { mx: 0, my: 0, cx: 0, cy: 0 };
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      return { mx, my, cx: mx / scale, cy: my / scale };
    },
    [scale],
  );

  function handlePointerDown(event) {
    const { mx, my, cx, cy } = getCanvasCoords(event);

    if (mode === "crop") {
      if (crop) {
        const handles = getCropHandles(crop, scale);
        const hit = hitHandle(mx, my, handles);
        if (hit) {
          dragRef.current = { type: "resize", handleId: hit.id, startCrop: { ...crop }, startX: mx, startY: my };
          event.currentTarget?.setPointerCapture(event.pointerId);
          return;
        }
        if (isInsideCrop(mx, my, crop, scale)) {
          dragRef.current = { type: "move", startCrop: { ...crop }, startX: mx, startY: my };
          event.currentTarget?.setPointerCapture(event.pointerId);
          return;
        }
      }
      // Click outside current crop → start a brand new crop rectangle
      dragRef.current = { type: "new", startCX: cx, startCY: cy };
      event.currentTarget?.setPointerCapture(event.pointerId);
      return;
    }

    // Select mode — hit test strokes (in reverse order for top-most)
    for (let i = normalizedStrokes.length - 1; i >= 0; i--) {
      if (hitTestStroke(normalizedStrokes[i], cx, cy)) {
        setExcludedIndices((prev) => {
          const next = new Set(prev);
          if (next.has(i)) next.delete(i);
          else next.add(i);
          return next;
        });
        return;
      }
    }
  }

  function handlePointerMove(event) {
    const { mx, my, cx, cy } = getCanvasCoords(event);

    // Update cursor when in crop mode
    if (mode === "crop" && !dragRef.current) {
      const el = cropCanvasRef.current;
      if (el) el.style.cursor = getCropCursor(mx, my, crop, scale);
    }

    if (!dragRef.current) return;
    const drag = dragRef.current;
    const cw = canvasSize.width;
    const ch = canvasSize.height;
    const MIN_SIZE = 16;

    if (drag.type === "new") {
      const x = Math.max(0, Math.min(drag.startCX, cx));
      const y = Math.max(0, Math.min(drag.startCY, cy));
      const w = Math.min(cw - x, Math.abs(cx - drag.startCX));
      const h = Math.min(ch - y, Math.abs(cy - drag.startCY));
      if (w > 2 && h > 2) setCrop({ x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });
    } else if (drag.type === "move") {
      const dx = (mx - drag.startX) / scale;
      const dy = (my - drag.startY) / scale;
      const sc = drag.startCrop;
      const nx = Math.round(Math.max(0, Math.min(cw - sc.width, sc.x + dx)));
      const ny = Math.round(Math.max(0, Math.min(ch - sc.height, sc.y + dy)));
      setCrop({ ...sc, x: nx, y: ny });
    } else if (drag.type === "resize") {
      const dx = (mx - drag.startX) / scale;
      const dy = (my - drag.startY) / scale;
      const sc = drag.startCrop;
      let { x, y, width, height } = sc;

      if (drag.handleId.includes("e")) { width = Math.max(MIN_SIZE, Math.min(cw - x, sc.width + dx)); }
      if (drag.handleId.includes("w")) { const nx = Math.min(sc.x + sc.width - MIN_SIZE, Math.max(0, sc.x + dx)); width = sc.width + (sc.x - nx); x = nx; }
      if (drag.handleId.includes("s")) { height = Math.max(MIN_SIZE, Math.min(ch - y, sc.height + dy)); }
      if (drag.handleId.includes("n")) { const ny = Math.min(sc.y + sc.height - MIN_SIZE, Math.max(0, sc.y + dy)); height = sc.height + (sc.y - ny); y = ny; }

      setCrop({ x: Math.round(x), y: Math.round(y), width: Math.round(Math.max(MIN_SIZE, width)), height: Math.round(Math.max(MIN_SIZE, height)) });
    }
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  // ─── Timeline controls ────────────────────────────────────

  function handlePlayPause() {
    if (!normalizedStrokes.length) return;
    if (playheadMs >= endMs) {
      setPlayheadMs(startMs);
      setIsPlaying(true);
      return;
    }
    setIsPlaying((v) => !v);
  }

  // ─── Export ───────────────────────────────────────────────

  async function handleExport() {
    if (!activeStrokes.length) return;
    setExporting(true);
    setExportError("");

    try {
      if (endMs <= startMs) throw new Error("请设置有效的导出开始与结束时间");
      const body = {
        strokes: activeStrokes,
        crop: exportCrop,
        canvasWidth: canvasSize.width,
        canvasHeight: canvasSize.height,
        startMs,
        endMs: Math.min(endMs, replayWindow.durationMs),
        fps: 30,
        format: exportFormat,
        outputScale: exportScale,
        smoothPath: true,
        timelineStartAt: replayWindow.startAt,
        timelineDurationMs: replayWindow.durationMs,
      };

      const response = await fetch("/api/export/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `导出失败 (${response.status})`);
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error("服务器返回了空文件，请检查 ffmpeg 是否正确安装");
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = body.format || "mp4";
      a.download = `export-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      // Delay revoke to ensure browser has time to start the download
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (err) {
      setExportError(err.message || "导出失败");
    } finally {
      setExporting(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────

  const progress = replayWindow.durationMs > 0 ? ((playheadMs - startMs) / Math.max(1, endMs - startMs)) * 100 : 0;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <section className="panel grain p-5 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">EXPORT</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900">剪辑导出</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">选择房间或上传 JSON，预览笔画回放，裁剪区域与时间，导出透明背景视频。</p>
          </div>
          <Link href="/" className="btn-ghost text-sm">← 首页</Link>
        </div>
      </section>

      {/* Data source */}
      <section className="panel p-5 md:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">数据源</h2>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">从服务端选择房间</label>
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              disabled={loadingSnapshots}
            >
              <option value="">{loadingSnapshots ? "加载中…" : "选择房间"}</option>
              {snapshots.map((s) => (
                <option key={`${s.roomCode}-${s.snapshotType}`} value={s.roomCode}>
                  {s.roomCode} ({s.snapshotType}) — {s.rounds?.length ?? 0} 轮
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">或上传 JSON</label>
            <input type="file" accept=".json" onChange={handleFileUpload} className="text-sm text-slate-600" />
          </div>

          {rounds.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">选择轮次</label>
              <select
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                value={selectedRoundId}
                onChange={(e) => setSelectedRoundId(e.target.value)}
                disabled={loadingRound}
              >
                {rounds.map((r) => (
                  <option key={r.roundId} value={r.roundId}>
                    第 {r.roundIndex} 轮 — {r.promptText} ({r.strokes?.length ?? 0} 笔)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      {normalizedStrokes.length > 0 && (
        <>
          {/* Free canvas controls */}
          <section className="flex flex-wrap items-center gap-3">
            <strong>无限画布</strong>
            <button className="btn-secondary" onClick={() => setMode("pan")} aria-pressed={mode === "pan"}>移动画布</button>
            <button className="btn-secondary" onClick={() => setZoom((v) => Math.max(0.1, v / 1.25))}>缩小</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button className="btn-secondary" onClick={() => setZoom((v) => Math.min(4, v * 1.25))}>放大</button>
            <button className="btn-secondary" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setCrop(null); setPlayheadMs(replayWindow.durationMs); setIsPlaying(false); }}>适配全部笔画</button>
            <span className="text-sm text-slate-500">滚轮缩放 · 移动模式拖动画布 · 中键随时平移</span>
          </section>
          {/* Mode toggle */}
          <section className="flex flex-wrap gap-3">
            <button
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${mode === "select" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
              onClick={() => setMode("select")}
            >
              选择笔画
            </button>
            <button
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${mode === "crop" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
              onClick={() => setMode("crop")}
            >
              裁剪区域
            </button>
            {crop && (
              <button
                className="rounded-xl bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                onClick={() => setCrop(null)}
              >
                清除裁剪
              </button>
            )}
          </section>

          {/* Canvas preview */}
          <section className="panel p-4 md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row">
              {/* Canvas */}
              <div
                ref={containerRef}
                className="relative mx-auto h-[min(70vh,720px)] min-h-[480px] w-full min-w-0 max-w-[960px] overflow-hidden rounded-2xl border border-slate-200 bg-[#e8e8e8]"
                style={{ touchAction: "none", cursor: mode === "pan" ? "grab" : undefined }}
                onPointerDownCapture={(event) => {
                  if (mode !== "pan" && event.button !== 1) return;
                  event.preventDefault(); event.stopPropagation();
                  panDrag.current = { x: event.clientX, y: event.clientY, pan };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMoveCapture={(event) => {
                  if (!panDrag.current) return;
                  event.stopPropagation();
                  const drag = panDrag.current;
                  setPan({ x: drag.pan.x + event.clientX - drag.x, y: drag.pan.y + event.clientY - drag.y });
                }}
                onPointerUpCapture={() => { panDrag.current = null; }}
                onPointerCancel={() => { panDrag.current = null; dragRef.current = null; }}
              >
                {/* Checkerboard background */}
                <canvas ref={overlayRef} className="absolute inset-0 z-0" style={{ width: viewport.width, height: viewport.height }} />
                {/* Stroke canvas */}
                <canvas
                  ref={canvasRef}
                  className="absolute z-10"
                  style={{ ...previewStyle, mixBlendMode: "multiply" }}
                  onPointerDown={mode !== "crop" ? handlePointerDown : undefined}
                  onPointerMove={mode !== "crop" ? handlePointerMove : undefined}
                  onPointerUp={mode !== "crop" ? handlePointerUp : undefined}
                />
                {/* Crop overlay canvas (always mounted, interactive in crop mode) */}
                <canvas
                  ref={cropCanvasRef}
                  className="absolute z-20"
                  style={{
                    ...previewStyle,
                    pointerEvents: mode === "crop" ? "auto" : "none",
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                />
              </div>

              {/* Info panel */}
              <div className="flex min-w-50 flex-col gap-4">
                <div className="stat-card">
                  <div className="text-xs text-slate-500">笔画总数</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{normalizedStrokes.length}</div>
                </div>
                <div className="stat-card">
                  <div className="text-xs text-slate-500">已排除</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{excludedIndices.size}</div>
                </div>
                <div className="stat-card">
                  <div className="text-xs text-slate-500">导出笔画</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{activeStrokes.length}</div>
                </div>
                {crop && (
                  <div className="stat-card">
                    <div className="text-xs text-slate-500">裁剪区域</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      x={crop.x} y={crop.y}<br />
                      {crop.width} × {crop.height}
                    </div>
                  </div>
                )}
                <div className="stat-card">
                  <div className="text-xs text-slate-500">时间范围</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {Math.round(startMs)}ms → {Math.round(endMs)}ms
                  </div>
                </div>
                <div className="stat-card">
                  <div className="text-xs text-slate-500">提示</div>
                  <div className="mt-1 text-xs text-slate-600">
                    {mode === "pan" ? "拖动画布自由平移，使用上方按钮缩放" : mode === "select" ? "点击画布上的笔画切换选中/排除" : "在画布上拖拽绘制裁剪矩形，可拖拽移动或拉角调整"}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Timeline */}
          <section className="panel p-5 md:p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">时间轴</h2>

            <div className="space-y-3">
              {/* Dual range — start */}
              <div className="flex items-center gap-3">
                <span className="w-16 text-xs text-slate-500">开始</span>
                <input
                  type="range"
                  min={0}
                  max={replayWindow.durationMs}
                  step={1}
                  value={startMs}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setStartMs(Math.min(v, endMs - 1));
                    if (playheadMs < v) setPlayheadMs(v);
                  }}
                  className="flex-1 accent-slate-900"
                />
                <span className="w-20 text-right text-xs text-slate-600">{Math.round(startMs)} ms</span>
              </div>

              {/* Dual range — end */}
              <div className="flex items-center gap-3">
                <span className="w-16 text-xs text-slate-500">结束</span>
                <input
                  type="range"
                  min={0}
                  max={replayWindow.durationMs}
                  step={1}
                  value={endMs}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setEndMs(Math.max(v, startMs + 1));
                    if (playheadMs > v) setPlayheadMs(v);
                  }}
                  className="flex-1 accent-slate-900"
                />
                <span className="w-20 text-right text-xs text-slate-600">{Math.round(endMs)} ms</span>
              </div>

              {/* Playhead */}
              <div className="flex items-center gap-3">
                <span className="w-16 text-xs text-slate-500">播放头</span>
                <input
                  type="range"
                  min={startMs}
                  max={endMs}
                  step={1}
                  value={Math.min(playheadMs, endMs)}
                  onChange={(e) => {
                    setPlayheadMs(Number(e.target.value));
                    setIsPlaying(false);
                  }}
                  className="flex-1 accent-blue-600"
                />
                <span className="w-20 text-right text-xs text-slate-600">{Math.round(playheadMs)} ms</span>
              </div>

              {/* Progress bar */}
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-slate-900 transition-[width] duration-100"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3">
                <button className="btn-secondary px-4 py-2 text-sm" onClick={handlePlayPause} disabled={!normalizedStrokes.length}>
                  {isPlaying ? "暂停" : playheadMs >= endMs ? "从头播放" : "播放"}
                </button>
                <button
                  className="btn-secondary px-4 py-2 text-sm"
                  onClick={() => { setPlayheadMs(startMs); setIsPlaying(false); }}
                  disabled={!normalizedStrokes.length}
                >
                  回到起点
                </button>
              </div>
            </div>
          </section>

          {/* Export */}
          <section className="panel p-5 md:p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">导出</h2>
            <label className="block text-sm">视频格式
              <select className="field mt-2" value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
                <option value="mp4">MP4 · H.264 · 白底 · 通用剪辑格式</option>
                <option value="mov">MOV · ProRes 4444 · 透明素材</option>
              </select>
            </label>
            <label className="block text-sm">导出分辨率
              <select
                className="field mt-2"
                value={exportScale}
                onChange={(event) => setExportScale(Number(event.target.value))}
              >
                {EXPORT_SCALE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <p className="text-sm">预计时长：{(Math.max(0, endMs - startMs) / 1000).toFixed(2)} 秒（与播放头位置无关）</p>
            <p className="text-sm text-slate-600">
              格式: {exportFormat === "mov" ? "ProRes 4444 (.mov) · 透明背景" : "H.264 (.mp4) · 白色背景"} · 输出 {outputSize.width}×{outputSize.height}
              （裁剪 {exportCrop.width}×{exportCrop.height} × {outputSize.scale.toFixed(2)}） · 30 fps · 边缘抗锯齿
            </p>
            {outputSize.clamped && (
              <p className="text-sm text-amber-700">已按最长边 4096px 上限自动降低倍率，实际输出 {outputSize.width}×{outputSize.height}。</p>
            )}
            {exportFormat === "mov" && exportScale > 1 && (
              <p className="text-xs text-slate-500">ProRes 4444 为无损编码，倍率越高文件越大；体积过大时可改用 1×。</p>
            )}
            {exportError && <p className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{exportError}</p>}
            <button
              className="btn-primary"
              onClick={handleExport}
              disabled={exporting || !activeStrokes.length}
            >
              {exporting ? "导出中…" : "导出视频"}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
