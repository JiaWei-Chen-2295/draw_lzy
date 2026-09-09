import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  DEFAULT_CANVAS,
  normalizeStrokes,
  getReplayWindow,
  parseCrop,
  getOutputConfig,
  encodeVideo,
  createRenderState,
  renderFrame,
  toFiniteNumber,
} from "@/lib/server/video-renderer";
import { DEFAULT_EXPORT_SCALE, resolveOutputSize } from "@/lib/export-options";

const MAX_STROKES = 5000;
const MAX_DURATION_MS = 600_000; // 10 minutes

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "请求体不是合法的 JSON" }, { status: 400 });
  }

  const {
    strokes: rawStrokes,
    crop: rawCrop,
    startMs: rawStartMs,
    endMs: rawEndMs,
    fps: rawFps,
    format: rawFormat,
    canvasWidth: rawCanvasWidth,
    canvasHeight: rawCanvasHeight,
    outputScale: rawOutputScale,
    timelineStartAt,
    timelineDurationMs,
  } = body;

  if (!Array.isArray(rawStrokes) || rawStrokes.length === 0) {
    return NextResponse.json({ ok: false, message: "strokes 不能为空" }, { status: 400 });
  }

  if (rawStrokes.length > MAX_STROKES) {
    return NextResponse.json({ ok: false, message: `笔画数量超过上限 ${MAX_STROKES}` }, { status: 400 });
  }

  const format = rawFormat === "webm" ? "webm" : rawFormat === "mov" ? "mov" : "mp4";
  const strokes = normalizeStrokes(rawStrokes);
  const canvasWidth = Math.max(1, Math.floor(toFiniteNumber(rawCanvasWidth, DEFAULT_CANVAS.width)));
  const canvasHeight = Math.max(1, Math.floor(toFiniteNumber(rawCanvasHeight, DEFAULT_CANVAS.height)));

  let crop;
  try {
    crop = rawCrop ? parseCrop(rawCrop, canvasWidth, canvasHeight) : parseCrop(null, canvasWidth, canvasHeight);
  } catch (err) {
    return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
  }

  const fps = Math.max(1, Math.min(60, Math.floor(toFiniteNumber(rawFps, 30))));
  const replayWindow = getReplayWindow(strokes);
  // Keep the original round timeline even when early/late strokes are excluded.
  const origin = toFiniteNumber(timelineStartAt, replayWindow.startAt);
  const duration = toFiniteNumber(timelineDurationMs, replayWindow.durationMs);
  const relativeStartMs = Math.max(0, Math.floor(toFiniteNumber(rawStartMs, 0)));
  const relativeEndMs = Math.min(duration, Math.floor(toFiniteNumber(rawEndMs, duration)));
  const clipStartAt = origin + relativeStartMs;
  const clipDurationMs = relativeEndMs - relativeStartMs;
  if (!Number.isFinite(clipDurationMs) || clipDurationMs <= 0) {
    return NextResponse.json({ ok: false, message: "导出时间范围为空，请重新设置开始与结束时间。" }, { status: 400 });
  }

  if (clipDurationMs > MAX_DURATION_MS) {
    return NextResponse.json({ ok: false, message: `视频时长超过上限 ${MAX_DURATION_MS / 1000}s` }, { status: 400 });
  }

  const frameDurationMs = 1000 / fps;
  const frameCount = Math.max(1, Math.ceil(clipDurationMs / frameDurationMs) + 1);
  const smoothPath = body.smoothPath !== false;
  const requestedScale = toFiniteNumber(rawOutputScale, DEFAULT_EXPORT_SCALE);
  const outputSize = resolveOutputSize(crop, requestedScale);
  const outputWidth = outputSize.width;
  const outputHeight = outputSize.height;
  const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";

  let outputConfig;
  try {
    outputConfig = getOutputConfig(format);
  } catch (err) {
    return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
  }

  let temporaryDirectory;
  try {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "stroke-video-"));
    const outputPath = path.join(temporaryDirectory, `video.${outputConfig.extension}`);
    const renderState = createRenderState(outputWidth, outputHeight);
    await encodeVideo({
      outputPath,
      ffmpegPath,
      outputWidth,
      outputHeight,
      fps,
      formatArgs: outputConfig.ffmpegArgs,
      frameCount,
      frameGenerator(frameIndex) {
        const elapsedMs = Math.min(clipDurationMs, frameIndex * frameDurationMs);
        const absoluteTime = clipStartAt + elapsedMs;
        const frame = renderFrame({
          strokes,
          absoluteTime,
          crop,
          outputWidth,
          outputHeight,
          smoothPath,
          state: renderState,
        });
        if (format === "mp4") {
          for (let i = 0; i < frame.length; i += 4) {
            const alpha = frame[i + 3] / 255;
            for (let channel = 0; channel < 3; channel++) frame[i + channel] = Math.round(frame[i + channel] * alpha + 255 * (1 - alpha));
            frame[i + 3] = 255;
          }
        }
        return frame;
      },
    });

    const videoBuffer = await readFile(outputPath);
    if (!videoBuffer.length) throw new Error("FFmpeg 输出为空");

    const contentType = outputConfig.contentType;
    const extension = outputConfig.extension;

    return new Response(videoBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(videoBuffer.length),
        "Content-Disposition": `attachment; filename="export-${Date.now()}.${extension}"`,
        "Cache-Control": "no-store",
        "X-Export-Size": `${outputWidth}x${outputHeight}`,
        "X-Export-Scale": outputSize.scale.toFixed(3),
        "X-Export-Smooth": smoothPath ? "1" : "0",
      },
    });
  } catch (err) {
    const message = err?.code === "ENOENT"
      ? "服务器未安装 ffmpeg，请配置 FFMPEG_PATH 环境变量"
      : err?.code === "EPERM"
        ? "系统阻止启动 FFmpeg。请从普通本地终端启动开发服务器，并检查 FFMPEG_PATH 指向可执行的 ffmpeg.exe。"
        : (err?.message || "视频渲染失败");
    return NextResponse.json({ ok: false, message }, { status: 500 });
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
