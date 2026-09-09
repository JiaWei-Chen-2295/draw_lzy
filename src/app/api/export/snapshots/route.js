import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

function sortRounds(room) {
  return (room?.roundIds ?? [])
    .map((roundId) => room?.roundsById?.[roundId])
    .filter(Boolean)
    .sort((left, right) => (left?.roundIndex ?? 0) - (right?.roundIndex ?? 0));
}

function collectSnapshots() {
  const dataDir = path.resolve(process.cwd(), "data");
  const roomRoot = path.join(dataDir, "rooms");

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

      try {
        const payload = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
        const room = payload?.room;
        const rounds = sortRounds(room);

        rooms.push({
          roomCode,
          snapshotType: snapshotName.replace(".json", ""),
          rounds: rounds.map((round) => ({
            roundId: round.roundId,
            roundIndex: round.roundIndex,
            promptText: round.promptText ?? "-",
            strokeCount: round.strokes?.length ?? 0,
          })),
          players: (room?.players ?? []).map((p) => p?.nickname).filter(Boolean),
          updatedAt: room?.updatedAt ?? payload?.exportedAt ?? 0,
        });
      } catch {
        // skip malformed JSON
      }
    }
  }

  return rooms.sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
}

export async function GET() {
  try {
    const snapshots = collectSnapshots();
    return NextResponse.json({ ok: true, snapshots });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error?.message ?? "读取快照失败" }, { status: 500 });
  }
}
