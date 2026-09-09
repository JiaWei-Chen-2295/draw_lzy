"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { StrokeReplayCanvas } from "@/components/StrokeReplayCanvas";
import { DEFAULT_CANVAS } from "@/lib/constants";
import { drawStroke, normalizeStrokes, redrawCanvas } from "@/lib/stroke-player";

const COLORS = ["#22313f", "#f07f6a", "#7ea79b", "#d7a34d", "#7b8cb8"];

export function DrawingCanvas({
  round,
  strokes,
  readOnly = false,
  onStrokeCommitted,
  onReplaceAllStrokes,
  onSubmitDrawing,
  isSubmitting,
  fullViewport = false,
}) {
  const canvasRef = useRef(null);
  const boardViewportRef = useRef(null);
  const drawingRef = useRef(false);
  const pointsRef = useRef([]);
  const strokeStartRef = useRef(null);
  const renderedStrokeIdsRef = useRef([]);
  const renderedRoundIdRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(8);
  const [displayMode, setDisplayMode] = useState("canvas");
  const [canvasViewport, setCanvasViewport] = useState({ width: 0, height: 0 });

  const preparedStrokes = useMemo(() => normalizeStrokes(strokes ?? []), [strokes]);
  const canReplay = readOnly && preparedStrokes.length > 0;

  useEffect(() => {
    const viewport = boardViewportRef.current;
    if (!viewport) {
      return undefined;
    }

    const updateViewport = () => {
      const rect = viewport.getBoundingClientRect();
      const boundedHeight = fullViewport ? rect.height : rect.width;
      const nextSize = Math.max(320, Math.floor(Math.min(rect.width, boundedHeight)));

      setCanvasViewport((currentValue) => {
        if (currentValue.width === nextSize && currentValue.height === nextSize) {
          return currentValue;
        }

        return { width: nextSize, height: nextSize };
      });
    };

    updateViewport();

    const resizeObserver = new ResizeObserver(() => updateViewport());
    resizeObserver.observe(viewport);

    return () => {
      resizeObserver.disconnect();
    };
  }, [fullViewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const width = DEFAULT_CANVAS.width;
    const height = DEFAULT_CANVAS.height;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      renderedStrokeIdsRef.current = [];
    }

    const nextStrokeIds = preparedStrokes.map((stroke) => stroke.strokeId);
    const previousStrokeIds = renderedStrokeIdsRef.current;
    const roundChanged = renderedRoundIdRef.current !== round?.roundId;
    const lengthShrank = nextStrokeIds.length < previousStrokeIds.length;
    const prefixChanged = previousStrokeIds.some((strokeId, index) => nextStrokeIds[index] !== strokeId);

    if (roundChanged || lengthShrank || prefixChanged) {
      redrawCanvas(canvas, preparedStrokes);
      renderedStrokeIdsRef.current = nextStrokeIds;
      renderedRoundIdRef.current = round?.roundId ?? null;
      return;
    }

    const context = canvas.getContext("2d");
    const previousCount = previousStrokeIds.length;
    preparedStrokes.slice(previousCount).forEach((stroke) => drawStroke(context, stroke));
    renderedStrokeIdsRef.current = nextStrokeIds;
    renderedRoundIdRef.current = round?.roundId ?? null;
  }, [canvasViewport.height, canvasViewport.width, preparedStrokes, round?.roundId]);

  function pointFromEvent(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const fallbackPressure = event.pointerType === "mouse" ? 0.52 : 0.72;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
      t: Date.now(),
      pressure: Number.isFinite(event.pressure) && event.pressure > 0 ? event.pressure : fallbackPressure,
    };
  }

  function handlePointerDown(event) {
    if (readOnly) {
      return;
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    const firstPoint = pointFromEvent(event);
    strokeStartRef.current = firstPoint.t;
    pointsRef.current = [firstPoint];
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

    const startedAt = strokeStartRef.current ?? pointsRef.current[0]?.t ?? Date.now();
    const endedAt = pointsRef.current.at(-1)?.t ?? startedAt;

    onStrokeCommitted?.({
      strokeId: `stroke-${crypto.randomUUID()}`,
      roomCode: round.roomCode,
      roundId: round.roundId,
      playerId: round.drawerPlayerId,
      color,
      size,
      tool,
      points: [...pointsRef.current],
      startedAt,
      endedAt,
      durationMs: Math.max(0, endedAt - startedAt),
      createdAt: startedAt,
    });
    pointsRef.current = [];
    strokeStartRef.current = null;
  }

  async function handleSubmitDrawing() {
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL("image/png");
    const imageBase64 = dataUrl.split(",")[1];

    await onSubmitDrawing?.({
      imageBase64,
      contentType: "image/png",
      width: DEFAULT_CANVAS.width,
      height: DEFAULT_CANVAS.height,
    });
  }

  const canvasClassName = "drawing-canvas-surface touch-none";

  const boardClassName = fullViewport
    ? "drawing-board-shell flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[32px] border border-slate-200 bg-[#fff9f0] p-3 md:p-4"
    : "flex min-h-0 w-full items-center justify-center overflow-hidden rounded-[28px] border border-slate-200 bg-[#fff9f0]";

  const tools = !readOnly ? (
    <>
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
    </>
  ) : null;

  const replayToggle = canReplay ? (
    <div className="pill">
      <button
        type="button"
        className={displayMode === "canvas" ? "font-semibold text-slate-900" : "text-slate-500"}
        onClick={() => setDisplayMode("canvas")}
      >
        画面
      </button>
      <button
        type="button"
        className={displayMode === "replay" ? "font-semibold text-slate-900" : "text-slate-500"}
        onClick={() => setDisplayMode("replay")}
      >
        回放
      </button>
    </div>
  ) : null;

  const actionButtons = !readOnly ? (
    <>
      <button type="button" className="btn-secondary" onClick={() => onReplaceAllStrokes?.(preparedStrokes.slice(0, -1))}>
        撤销最近一笔
      </button>
      <button type="button" className="btn-ghost" onClick={() => onReplaceAllStrokes?.([])}>
        清空画布
      </button>
      <button type="button" className="btn-primary" onClick={handleSubmitDrawing} disabled={isSubmitting}>
        {isSubmitting ? "收画中..." : "完成这一轮"}
      </button>
    </>
  ) : null;

  return (
    <div className={fullViewport ? "drawing-workspace flex min-h-0 flex-1 flex-col gap-4 overflow-hidden" : "space-y-4"}>
      {fullViewport ? (
        <>
          <div className="grid gap-3 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
            <section className="panel p-4 md:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="pill text-xs text-slate-600">第 {round.roundIndex} 轮</span>
                <span className="pill text-xs text-slate-600">房间 {round.roomCode}</span>
              </div>
              <h2 className="mt-4 text-xl font-semibold text-slate-900">{round.promptText}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">不用画具体东西，抓住一个感觉画出来就行。</p>
            </section>

            <section className="panel p-4 md:p-5">
              <div className="flex flex-wrap items-center gap-3">
                {tools}
                {replayToggle}
              </div>
            </section>
          </div>

          <div className="flex min-h-0 flex-1">
            {displayMode === "replay" && canReplay ? (
              <StrokeReplayCanvas key={`replay-${round?.roundId}`} strokes={preparedStrokes} className={canvasClassName} />
            ) : (
              <div className={boardClassName}>
                <div ref={boardViewportRef} className="drawing-board-viewport flex h-full w-full items-center justify-center">
                  <canvas
                    ref={canvasRef}
                    className={canvasClassName}
                    style={
                      fullViewport && canvasViewport.width && canvasViewport.height
                        ? { width: `${canvasViewport.width}px`, height: `${canvasViewport.height}px` }
                        : undefined
                    }
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                  />
                </div>
              </div>
            )}
          </div>

          {!readOnly ? <div className="grid gap-3 sm:grid-cols-3">{actionButtons}</div> : null}
        </>
      ) : (
        <>
          <section className="panel p-4 md:p-5">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              {tools}
              {replayToggle}
            </div>

            {displayMode === "replay" && canReplay ? (
              <StrokeReplayCanvas key={`replay-${round?.roundId}`} strokes={preparedStrokes} />
            ) : (
              <div className={boardClassName}>
                <div ref={boardViewportRef} className="drawing-board-viewport flex w-full items-center justify-center">
                  <canvas
                    ref={canvasRef}
                    className={canvasClassName}
                    style={
                      canvasViewport.width && canvasViewport.height
                        ? { width: `${canvasViewport.width}px`, height: `${canvasViewport.height}px` }
                        : undefined
                    }
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                  />
                </div>
              </div>
            )}
          </section>

          {!readOnly ? <div className="grid gap-3 sm:grid-cols-3">{actionButtons}</div> : null}
        </>
      )}
    </div>
  );
}
