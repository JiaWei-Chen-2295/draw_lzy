import fs from "node:fs";
import path from "node:path";

const SNAPSHOT_NAMES = ["final.json", "latest.json"];

function getDataRoot() {
  return path.resolve(process.cwd(), "data");
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function sortRounds(room) {
  return (room?.roundIds ?? [])
    .map((roundId) => room?.roundsById?.[roundId])
    .filter(Boolean)
    .sort((left, right) => (left?.roundIndex ?? 0) - (right?.roundIndex ?? 0));
}

function readRoomSnapshot(roomCode) {
  const analysisRoot = path.join(getDataRoot(), "rooms", roomCode, "analysis");

  for (const snapshotName of SNAPSHOT_NAMES) {
    const payload = readJsonFile(path.join(analysisRoot, snapshotName));
    if (payload?.room?.roomCode) {
      return payload;
    }
  }

  return null;
}

export function readLocalRoom(roomCode) {
  if (!roomCode || !/^[A-Z0-9]{4,10}$/i.test(roomCode)) {
    return null;
  }

  return readRoomSnapshot(roomCode)?.room ?? null;
}

export function listLocalRooms() {
  const roomsRoot = path.join(getDataRoot(), "rooms");

  if (!fs.existsSync(roomsRoot)) {
    return [];
  }

  return fs
    .readdirSync(roomsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const payload = readRoomSnapshot(entry.name);
      return payload?.room ?? null;
    })
    .filter(Boolean)
    .sort((left, right) => (right?.updatedAt ?? 0) - (left?.updatedAt ?? 0));
}

export function getLocalRoundSummary(roomCode) {
  const room = readLocalRoom(roomCode);

  return sortRounds(room).map((round) => ({
    roundId: round.roundId,
    roundIndex: round.roundIndex,
    promptText: round.promptText ?? "-",
    strokes: round.strokes ?? [],
    drawing: round.drawing ?? {},
  }));
}
