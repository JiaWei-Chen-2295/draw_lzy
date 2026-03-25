"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const COLORS = ["#22313f", "#f07f6a", "#7ea79b", "#d7a34d", "#7b8cb8"];

function drawStroke(context, stroke) {
  if (!stroke?.points?.length) {
    return;
  }

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = stroke.size;
  context.strokeStyle = stroke.tool === "eraser" ? "#fff9f0" : stroke.color;
  context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  context.beginPath();
  const [firstPoint, ...restPoints] = stroke.points;
  context.moveTo(firstPoint.x, firstPoint.y);
  restPoints.forEach((point) => context.lineTo(point.x, point.y));
  if (stroke.points.length === 1) {
    context.lineTo(firstPoint.x + 0.01, firstPoint.y + 0.01);
  }
  context.stroke();
  context.restore();
}

function redrawCanvas(canvas, strokes) {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fff9f0";
  context.fillRect(0, 0, canvas.width, canvas.height);
  strokes.forEach((stroke) => drawStroke(context, stroke));
}

export function DrawingCanvas({
  round,
  strokes,
  readOnly = false,
  onStrokeCommitted,
  onReplaceAllStrokes,
  onSubmitDrawing,
  isSubmitting,
}) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const pointsRef = useRef([]);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(8);

  const preparedStrokes = useMemo(() => strokes ?? [], [strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const scale = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width * scale));
    const height = Math.max(320, Math.floor(rect.width * scale));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    redrawCanvas(canvas, preparedStrokes);
  }, [preparedStrokes]);

  function pointFromEvent(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
      t: Date.now(),
    };
  }

  function handlePointerDown(event) {
    if (readOnly) {
      return;
    }

    drawingRef.current = true;
    pointsRef.current = [pointFromEvent(event)];
  }

  function handlePointerMove(event) {
    if (readOnly || !drawingRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const nextPoint = pointFromEvent(event);
    const previousPoint = pointsRef.current.at(-1);
    pointsRef.current.push(nextPoint);

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = size;
    context.strokeStyle = tool === "eraser" ? "#fff9f0" : color;
    context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    context.beginPath();
    context.moveTo(previousPoint.x, previousPoint.y);
    context.lineTo(nextPoint.x, nextPoint.y);
    context.stroke();
    context.restore();
  }

  function handlePointerUp() {
    if (readOnly || !drawingRef.current) {
      return;
    }

    drawingRef.current = false;
    if (pointsRef.current.length === 0) {
      return;
    }

    onStrokeCommitted?.({
      strokeId: `stroke-${crypto.randomUUID()}`,
      roomCode: round.roomCode,
      roundId: round.roundId,
      playerId: round.drawerPlayerId,
      color,
      size,
      tool,
      points: [...pointsRef.current],
      createdAt: Date.now(),
    });
    pointsRef.current = [];
  }

  async function handleSubmitDrawing() {
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL("image/png");
    const imageBase64 = dataUrl.split(",")[1];

    await onSubmitDrawing?.({
      imageBase64,
      contentType: "image/png",
      width: canvas.width,
      height: canvas.height,
    });
  }

  return (
    <div className="space-y-4">
      <section className="panel p-4 md:p-5">
        {!readOnly ? (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="pill">
              <span className="text-sm text-slate-500">工具</span>
              <button type="button" className={tool === "pen" ? "font-semibold text-slate-900" : "text-slate-500"} onClick={() => setTool("pen")}>
                画笔
              </button>
              <button type="button" className={tool === "eraser" ? "font-semibold text-slate-900" : "text-slate-500"} onClick={() => setTool("eraser")}>
                橡皮
              </button>
            </div>
            <div className="pill gap-2">
              {COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  className="h-7 w-7 rounded-full border-2"
                  style={{ background: swatch, borderColor: color === swatch ? "#1f2937" : "transparent" }}
                />
              ))}
            </div>
            <div className="pill gap-3">
              <span className="text-sm text-slate-500">粗细</span>
              <input type="range" min="2" max="26" value={size} onChange={(event) => setSize(Number(event.target.value))} />
            </div>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#fff9f0]">
          <canvas
            ref={canvasRef}
            className="aspect-square w-full touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>
      </section>

      {!readOnly ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <button type="button" className="btn-secondary" onClick={() => onReplaceAllStrokes?.(preparedStrokes.slice(0, -1))}>
            撤销最近一笔
          </button>
          <button type="button" className="btn-ghost" onClick={() => onReplaceAllStrokes?.([])}>
            清空画布
          </button>
          <button type="button" className="btn-primary" onClick={handleSubmitDrawing} disabled={isSubmitting}>
            {isSubmitting ? "收画中..." : "完成这一轮"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
