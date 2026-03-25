"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { drawStrokeToElapsed, normalizeStrokes, paintCanvasBackground } from "@/lib/stroke-player";

function getReplayWindow(strokes) {
  if (!strokes.length) {
    return { startAt: 0, endAt: 0, durationMs: 0 };
  }

  const startAt = strokes[0]?.startedAt ?? strokes[0]?.createdAt ?? 0;
  const endAt = strokes.at(-1)?.endedAt ?? strokes.at(-1)?.createdAt ?? startAt;

  return {
    startAt,
    endAt: Math.max(startAt, endAt),
    durationMs: Math.max(0, endAt - startAt),
  };
}

export function StrokeReplayCanvas({ strokes, className = "aspect-square w-full touch-none", autoPlay = true }) {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay && (strokes?.length ?? 0) > 0);
  const [playheadMs, setPlayheadMs] = useState(0);
  const normalizedStrokes = useMemo(() => normalizeStrokes(strokes ?? []), [strokes]);
  const replayWindow = useMemo(() => getReplayWindow(normalizedStrokes), [normalizedStrokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const scale = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width * scale));
    const height = Math.max(320, Math.floor(rect.width * scale));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    paintCanvasBackground(canvas);
    const context = canvas.getContext("2d");
    const absolutePlayhead = replayWindow.startAt + playheadMs;

    normalizedStrokes.forEach((stroke) => {
      drawStrokeToElapsed(context, stroke, absolutePlayhead);
    });

    return undefined;
  }, [normalizedStrokes, playheadMs, replayWindow.startAt]);

  useEffect(() => {
    if (!isPlaying || replayWindow.durationMs <= 0) {
      return undefined;
    }

    let startedAt = 0;
    const startOffset = playheadMs;

    const animate = (frameTime) => {
      if (!startedAt) {
        startedAt = frameTime;
      }

      const elapsed = frameTime - startedAt;
      const nextPlayhead = Math.min(replayWindow.durationMs, startOffset + elapsed);
      setPlayheadMs(nextPlayhead);

      if (nextPlayhead >= replayWindow.durationMs) {
        setIsPlaying(false);
        return;
      }

      animationFrameRef.current = window.requestAnimationFrame(animate);
    };

    animationFrameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, playheadMs, replayWindow.durationMs]);

  function handleReplay() {
    setPlayheadMs(0);
    setIsPlaying(normalizedStrokes.length > 0);
  }

  function handlePlayPause() {
    if (!normalizedStrokes.length) {
      return;
    }

    if (playheadMs >= replayWindow.durationMs) {
      setPlayheadMs(0);
      setIsPlaying(true);
      return;
    }

    setIsPlaying((currentValue) => !currentValue);
  }

  function handleSeek(event) {
    const nextValue = Number(event.target.value);
    setPlayheadMs(nextValue);
    setIsPlaying(false);
  }

  const progress = replayWindow.durationMs > 0 ? Math.min(100, (playheadMs / replayWindow.durationMs) * 100) : 100;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#fff9f0]">
        <canvas ref={canvasRef} className={className} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{normalizedStrokes.length} 笔</span>
          <div className="flex items-center gap-3">
            <span>{Math.round(progress)}%</span>
            <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={handlePlayPause} disabled={!normalizedStrokes.length}>
              {isPlaying ? "暂停" : playheadMs >= replayWindow.durationMs ? "从头播放" : "继续播放"}
            </button>
            <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={handleReplay} disabled={!normalizedStrokes.length}>
              重新播放
            </button>
          </div>
        </div>
        <input
          type="range"
          min="0"
          max={Math.max(0, replayWindow.durationMs)}
          step="1"
          value={Math.min(playheadMs, replayWindow.durationMs)}
          onChange={handleSeek}
          disabled={!normalizedStrokes.length}
          className="w-full accent-slate-900"
        />
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-slate-900 transition-[width] duration-150" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
