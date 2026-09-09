#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";

const DATA_DIR = path.resolve(process.cwd(), "data");
const EXPORT_SCRIPT = path.resolve(process.cwd(), "scripts", "export-json-video.mjs");

function sortRounds(room) {
  return (room?.roundIds ?? [])
    .map((roundId) => room?.roundsById?.[roundId])
    .filter(Boolean)
    .sort((left, right) => (left?.roundIndex ?? 0) - (right?.roundIndex ?? 0));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function collectSnapshots() {
  if (!fs.existsSync(DATA_DIR)) {
    throw new Error(`未找到 data 目录: ${DATA_DIR}`);
  }

  const roomRoot = path.join(DATA_DIR, "rooms");
  if (!fs.existsSync(roomRoot)) {
    return [];
  }

  const rooms = [];

  for (const roomDir of fs.readdirSync(roomRoot, { withFileTypes: true })) {
    if (!roomDir.isDirectory()) {
      continue;
    }

    const roomCode = roomDir.name;
    const analysisDir = path.join(roomRoot, roomCode, "analysis");
    if (!fs.existsSync(analysisDir)) {
      continue;
    }

    for (const snapshotName of ["final.json", "latest.json"]) {
      const snapshotPath = path.join(analysisDir, snapshotName);
      if (!fs.existsSync(snapshotPath)) {
        continue;
      }

      const payload = readJson(snapshotPath);
      const room = payload?.room;
      const rounds = sortRounds(room);

      rooms.push({
        roomCode,
        snapshotType: snapshotName.replace(".json", ""),
        snapshotPath,
        payload,
        room,
        rounds,
        updatedAt: room?.updatedAt ?? payload?.exportedAt ?? 0,
      });
    }
  }

  return rooms.sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
}

function formatDate(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "-";
  }

  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function buildDefaultOutputPath(roomCode, roundIndex, format) {
  return path.resolve(process.cwd(), "exports", `${roomCode}-round-${roundIndex}.${format}`);
}

function normalizeNumberInput(value, fallback) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function askChoice(rl, title, items, getLabel) {
  if (!items.length) {
    throw new Error(`${title} 没有可选项`);
  }

  console.log(`\n${title}`);
  items.forEach((item, index) => {
    console.log(`  ${index + 1}. ${getLabel(item, index)}`);
  });

  while (true) {
    const answer = (await rl.question("请输入编号: ")).trim();
    const selectedIndex = Number(answer);

    if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= items.length) {
      return items[selectedIndex - 1];
    }

    console.log("编号无效，请重新输入。");
  }
}

async function askText(rl, label, defaultValue = "") {
  const suffix = defaultValue ? ` [默认: ${defaultValue}]` : "";
  const answer = await rl.question(`${label}${suffix}: `);
  const trimmed = answer.trim();
  return trimmed || defaultValue;
}

function summarizeRound(round) {
  return `第 ${round.roundIndex} 轮 | ${round.roundId} | ${round.strokes?.length ?? 0} 笔 | ${round.promptText ?? "-"}`;
}

function buildExportArgs(options) {
  const args = [
    EXPORT_SCRIPT,
    "--input",
    options.inputPath,
    "--round-id",
    options.roundId,
    "--output",
    options.outputPath,
    "--fps",
    String(options.fps),
  ];

  if (options.startMs > 0) {
    args.push("--start-ms", String(options.startMs));
  }

  if (Number.isFinite(options.endMs)) {
    args.push("--end-ms", String(options.endMs));
  }

  if (options.crop) {
    args.push("--crop", options.crop);
  }

  if (options.width) {
    args.push("--width", String(options.width));
  }

  if (options.height) {
    args.push("--height", String(options.height));
  }

  return args;
}

async function runExport(options) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, buildExportArgs(options), {
      cwd: process.cwd(),
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`导出失败，退出码 ${code}`));
    });
  });
}

async function main() {
  const snapshots = collectSnapshots();
  if (!snapshots.length) {
    throw new Error("data 目录下没有找到可用的房间分析 JSON");
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log("JSON 透明视频交互导出");
    console.log(`data 目录: ${DATA_DIR}`);

    let keepRunning = true;

    while (keepRunning) {
      const snapshot = await askChoice(
        rl,
        "选择房间快照",
        snapshots,
        (item) =>
          `${item.roomCode} | ${item.snapshotType} | ${item.rounds.length} 轮 | 更新时间 ${formatDate(item.updatedAt)}`,
      );

      const round = await askChoice(rl, "选择轮次", snapshot.rounds, (item) => summarizeRound(item));
      const format = await askChoice(rl, "选择输出格式", ["webm", "mov"], (item) => item);
      const defaultOutput = buildDefaultOutputPath(snapshot.roomCode, round.roundIndex, format);
      const outputPath = path.resolve(await askText(rl, "输出文件路径", defaultOutput));
      const fps = Math.max(1, Math.floor(normalizeNumberInput(await askText(rl, "帧率", "30"), 30)));
      const startMs = Math.max(0, Math.floor(normalizeNumberInput(await askText(rl, "开始时间 ms", "0"), 0)));
      const endInput = await askText(rl, "结束时间 ms，留空表示到该轮结束", "");
      const endMs = endInput ? Math.max(startMs, Math.floor(normalizeNumberInput(endInput, startMs))) : Number.NaN;
      const cropInput = await askText(rl, "裁剪区域 x,y,width,height，留空表示整张画布", "");
      const sizeInput = await askText(rl, "输出尺寸 width,height，留空表示使用裁剪尺寸", "");

      let width;
      let height;

      if (sizeInput) {
        const [nextWidth, nextHeight] = sizeInput.split(",").map((item) => Number(item.trim()));
        if (Number.isFinite(nextWidth) && Number.isFinite(nextHeight) && nextWidth > 0 && nextHeight > 0) {
          width = Math.floor(nextWidth);
          height = Math.floor(nextHeight);
        } else {
          console.log("输出尺寸无效，将使用默认裁剪尺寸。");
        }
      }

      console.log("\n本次任务");
      console.log(`  输入: ${path.relative(process.cwd(), snapshot.snapshotPath)}`);
      console.log(`  轮次: ${summarizeRound(round)}`);
      console.log(`  输出: ${outputPath}`);
      console.log(`  帧率: ${fps}`);
      console.log(`  时间: ${startMs}ms -> ${Number.isFinite(endMs) ? `${endMs}ms` : "结束"}`);
      console.log(`  裁剪: ${cropInput || "整张画布"}`);
      console.log(`  尺寸: ${width && height ? `${width}x${height}` : "跟随裁剪"}`);

      const confirm = (await askText(rl, "确认导出？输入 y 继续", "y")).toLowerCase();
      if (confirm !== "y" && confirm !== "yes") {
        console.log("已取消本次导出。");
      } else {
        await runExport({
          inputPath: snapshot.snapshotPath,
          roundId: round.roundId,
          outputPath,
          fps,
          startMs,
          endMs,
          crop: cropInput || "",
          width,
          height,
        });
      }

      const nextAction = (await askText(rl, "继续导出下一条？输入 y 继续，其他任意键退出", "")).toLowerCase();
      keepRunning = nextAction === "y" || nextAction === "yes";
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`[interactive-json-video] ${error.message}`);
  process.exit(1);
});
