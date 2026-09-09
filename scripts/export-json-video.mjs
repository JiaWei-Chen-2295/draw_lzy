#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  DEFAULT_CANVAS,
  clamp,
  toFiniteNumber,
  normalizeStrokes,
  sortRounds,
  getReplayWindow,
  parseCrop,
  getOutputConfig,
  resolveRoomPayload,
  encodeVideo,
  renderFrame,
} from "../src/lib/server/video-renderer.js";

const HELP_TEXT = `
用法:
  node scripts/export-json-video.mjs --input <json> --output <video>

说明:
  读取项目持久化导出的 latest.json / final.json / room 快照，导出透明背景视频。
  时间裁剪使用相对回放起点的毫秒数，区域裁剪使用原始 canvas 坐标。

常用参数:
  --input <path>         JSON 文件路径
  --output <path>        输出视频路径，支持 .webm / .mov
  --round-id <id>        指定 roundId
  --round-index <n>      指定第几轮，1 开始
  --list-rounds          只列出可导出的轮次
  --fps <n>              帧率，默认 30
  --start-ms <n>         裁剪开始时间，默认 0
  --end-ms <n>           裁剪结束时间，默认到该轮末尾
  --crop <x,y,w,h>       裁剪区域，默认整张画布
  --width <n>            输出宽度，默认等于裁剪宽度
  --height <n>           输出高度，默认等于裁剪高度
  --ffmpeg <path>        ffmpeg 可执行文件路径，默认读取 PATH 或 FFMPEG_PATH
  --help                 显示帮助

示例:
  node scripts/export-json-video.mjs --input .\\room-final.json --list-rounds
  node scripts/export-json-video.mjs --input .\\room-final.json --round-index 2 --output .\\round-2.webm
  node scripts/export-json-video.mjs --input .\\room-final.json --round-id round-123 --start-ms 1000 --end-ms 4200 --crop 160,240,512,512 --output .\\clip.mov
`.trim();

function exitWithError(message) {
  console.error(`[export-json-video] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      exitWithError(`无法识别的参数: ${token}`);
    }

    const key = token.slice(2);
    const nextValue = argv[index + 1];

    if (["help", "list-rounds"].includes(key)) {
      options[key] = true;
      continue;
    }

    if (!nextValue || nextValue.startsWith("--")) {
      exitWithError(`参数 --${key} 缺少值`);
    }

    options[key] = nextValue;
    index += 1;
  }

  return options;
}

function ensureParentDirectory(filePath) {
  const directoryPath = path.dirname(filePath);
  fs.mkdirSync(directoryPath, { recursive: true });
}

function getOutputConfigFromPath(outputPath) {
  const extension = path.extname(outputPath).toLowerCase();

  if (extension === ".mp4") {
    return getOutputConfig("mp4");
  }

  if (extension === ".webm") {
    return getOutputConfig("webm");
  }

  if (extension === ".mov") {
    return getOutputConfig("mov");
  }

  exitWithError("输出文件仅支持 .mp4、.webm 或 .mov");
}

function pickRound(room, options) {
  const rounds = sortRounds(room);

  if (!rounds.length) {
    exitWithError("当前 JSON 中没有可导出的轮次");
  }

  if (options["list-rounds"]) {
    console.log("可导出的轮次:");
    rounds.forEach((round) => {
      console.log(
        `- roundIndex=${round.roundIndex} roundId=${round.roundId} strokes=${round.strokes?.length ?? 0} prompt=${round.promptText ?? "-"}`,
      );
    });
    process.exit(0);
  }

  if (options["round-id"]) {
    const matchedRound = rounds.find((round) => round.roundId === options["round-id"]);
    if (!matchedRound) {
      exitWithError(`未找到 roundId=${options["round-id"]} 的轮次`);
    }
    return matchedRound;
  }

  if (options["round-index"]) {
    const targetIndex = Number(options["round-index"]);
    if (!Number.isInteger(targetIndex) || targetIndex <= 0) {
      exitWithError("--round-index 需要传入从 1 开始的整数");
    }

    const matchedRound = rounds.find((round) => Number(round.roundIndex) === targetIndex);
    if (!matchedRound) {
      exitWithError(`未找到第 ${targetIndex} 轮`);
    }
    return matchedRound;
  }

  if (room.currentRoundId && room.roundsById?.[room.currentRoundId]) {
    return room.roundsById[room.currentRoundId];
  }

  return rounds[0];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(HELP_TEXT);
    return;
  }

  if (!options.input) {
    exitWithError("缺少 --input");
  }

  if (!options.output && !options["list-rounds"]) {
    exitWithError("缺少 --output");
  }

  const inputPath = path.resolve(process.cwd(), options.input);

  if (!fs.existsSync(inputPath)) {
    exitWithError(`输入文件不存在: ${inputPath}`);
  }

  const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const room = resolveRoomPayload(payload);
  const round = pickRound(room, options);
  const strokes = normalizeStrokes(round.strokes ?? []);
  const canvasWidth = toFiniteNumber(round?.drawing?.width, DEFAULT_CANVAS.width);
  const canvasHeight = toFiniteNumber(round?.drawing?.height, DEFAULT_CANVAS.height);
  const crop = parseCrop(options.crop, canvasWidth, canvasHeight);
  const fps = Math.max(1, Math.floor(toFiniteNumber(options.fps, 30)));
  const outputWidth = Math.max(1, Math.floor(toFiniteNumber(options.width, crop.width)));
  const outputHeight = Math.max(1, Math.floor(toFiniteNumber(options.height, crop.height)));
  const replayWindow = getReplayWindow(strokes);
  const relativeStartMs = Math.max(0, Math.floor(toFiniteNumber(options["start-ms"], 0)));
  const relativeEndMs = Math.max(relativeStartMs, Math.floor(toFiniteNumber(options["end-ms"], replayWindow.durationMs)));
  const clipStartAt = replayWindow.startAt + relativeStartMs;
  const clipEndAt = replayWindow.startAt + Math.min(relativeEndMs, replayWindow.durationMs);
  const clipDurationMs = Math.max(0, clipEndAt - clipStartAt);
  const frameDurationMs = 1000 / fps;
  const frameCount = Math.max(1, Math.ceil(clipDurationMs / frameDurationMs) + 1);
  const ffmpegPath = options.ffmpeg || process.env.FFMPEG_PATH || "ffmpeg";
  const outputPath = path.resolve(process.cwd(), options.output ?? "");
  const { ffmpegArgs, format } = getOutputConfigFromPath(outputPath);

  ensureParentDirectory(outputPath);

  console.log(`[export-json-video] room=${room.roomCode ?? "-"}`);
  console.log(`[export-json-video] roundIndex=${round.roundIndex ?? "-"} roundId=${round.roundId}`);
  console.log(`[export-json-video] strokes=${strokes.length} fps=${fps} frames=${frameCount}`);
  console.log(`[export-json-video] crop=${crop.x},${crop.y},${crop.width},${crop.height} output=${outputWidth}x${outputHeight}`);
  console.log(`[export-json-video] clip=${relativeStartMs}ms -> ${Math.min(relativeEndMs, replayWindow.durationMs)}ms format=${format}`);

  try {
    await encodeVideo({
      ffmpegPath,
      outputPath,
      outputWidth,
      outputHeight,
      fps,
      formatArgs: ffmpegArgs,
      frameCount,
      frameGenerator(frameIndex) {
        const elapsedMs = Math.min(clipDurationMs, frameIndex * frameDurationMs);
        const absoluteTime = clipStartAt + elapsedMs;
        return renderFrame({
          strokes,
          absoluteTime,
          crop,
          outputWidth,
          outputHeight,
        });
      },
    });
  } catch (error) {
    if (error?.code === "ENOENT") {
      exitWithError(`未找到 ffmpeg，可通过 --ffmpeg <path> 或环境变量 FFMPEG_PATH 指定。原始错误: ${error.message}`);
    }

    exitWithError(error?.message || "视频导出失败");
  }

  console.log(`[export-json-video] 导出完成: ${outputPath}`);
}

main().catch((error) => {
  exitWithError(error?.stack || error?.message || "未知错误");
});
