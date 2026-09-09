import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

function sortRounds(room) {
  return (room?.roundIds ?? [])
    .map((roundId) => room?.roundsById?.[roundId])
    .filter(Boolean)
    .sort((left, right) => (left?.roundIndex ?? 0) - (right?.roundIndex ?? 0));
}

export async function GET(_request, { params }) {
  const { roomCode } = await params;

  if (!roomCode || !/^[A-Z0-9]{4,10}$/i.test(roomCode)) {
    return NextResponse.json({ ok: false, message: "无效的房间码" }, { status: 400 });
  }

  const dataDir = path.resolve(process.cwd(), "data");
  const analysisDir = path.join(dataDir, "rooms", roomCode, "analysis");

  if (!fs.existsSync(analysisDir)) {
    return NextResponse.json({ ok: false, message: "未找到该房间的分析数据" }, { status: 404 });
  }

  for (const snapshotName of ["final.json", "latest.json"]) {
    const snapshotPath = path.join(analysisDir, snapshotName);

    if (!fs.existsSync(snapshotPath)) {
      continue;
    }

    try {
      const payload = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
      const room = payload?.room;
      const rounds = sortRounds(room);

      return NextResponse.json({
        ok: true,
        roomCode,
        snapshotType: snapshotName.replace(".json", ""),
        rounds: rounds.map((round) => ({
          roundId: round.roundId,
          roundIndex: round.roundIndex,
          promptText: round.promptText ?? "-",
          strokes: round.strokes ?? [],
          drawing: round.drawing ?? {},
        })),
      });
    } catch {
      // try next snapshot
    }
  }

  return NextResponse.json({ ok: false, message: "未找到可用的快照文件" }, { status: 404 });
}
