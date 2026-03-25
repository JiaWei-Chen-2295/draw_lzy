import { DEFAULT_CANVAS, ROOM_EVENT_TYPES, ROOM_STATUS, TOTAL_ROUNDS } from "@/lib/constants";
import { buildDrawingSvg, uploadDrawingAssets } from "@/lib/blob";
import { buildSummary, scoreRound } from "@/lib/scoring";
import { generateRoomCode } from "@/lib/room-code";
import { createRound } from "@/lib/round-engine";
import { getRoom, saveRoom, appendRoomEvent, getRoomEvents, findRoomCodeByRoundId } from "@/lib/server/room-store";
import { validateGuessPayload, validateIntentPayload } from "@/lib/validators";

function now() {
  return Date.now();
}

function buildPlayer(nickname) {
  return {
    playerId: `player-${crypto.randomUUID()}`,
    nickname: nickname.trim(),
    joinedAt: now(),
    lastSeenAt: now(),
    status: "online",
  };
}

function createEmptyRoom(hostNickname) {
  const hostPlayer = buildPlayer(hostNickname);

  return {
    roomCode: generateRoomCode(),
    status: ROOM_STATUS.WAITING,
    hostPlayerId: hostPlayer.playerId,
    players: [hostPlayer],
    currentRoundIndex: 0,
    currentRoundId: null,
    totalRounds: TOTAL_ROUNDS,
    roundIds: [],
    roundsById: {},
    summary: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

function cloneRoom(room) {
  return structuredClone(room);
}

function roundForRoom(room, roundId) {
  const round = room.roundsById[roundId];

  if (!round) {
    throw new Error("ROUND_NOT_FOUND");
  }

  return round;
}

async function persistAndBroadcast(room, eventType, payload) {
  room.updatedAt = now();
  await saveRoom(room);
  await appendRoomEvent(room.roomCode, {
    id: crypto.randomUUID(),
    type: eventType,
    payload,
    createdAt: now(),
  });
  return cloneRoom(room);
}

export async function createRoom(nickname) {
  const room = createEmptyRoom(nickname);
  await saveRoom(room);
  return {
    room: cloneRoom(room),
    playerId: room.players[0].playerId,
  };
}

export async function joinRoom(roomCode, nickname) {
  const room = await getRoom(roomCode);

  if (!room) {
    throw new Error("ROOM_NOT_FOUND");
  }

  if (room.players.length >= 2) {
    throw new Error("ROOM_FULL");
  }

  if (room.status !== ROOM_STATUS.WAITING) {
    throw new Error("ROOM_ALREADY_STARTED");
  }

  const player = buildPlayer(nickname);
  room.players.push(player);
  const nextRoom = await persistAndBroadcast(room, ROOM_EVENT_TYPES.PRESENCE_JOIN, {
    playerId: player.playerId,
    nickname: player.nickname,
  });

  return {
    room: nextRoom,
    playerId: player.playerId,
  };
}

export async function readRoom(roomCode) {
  const room = await getRoom(roomCode);
  return room ? cloneRoom(room) : null;
}

export async function startRoom(roomCode, playerId) {
  const room = await getRoom(roomCode);

  if (!room) {
    throw new Error("ROOM_NOT_FOUND");
  }

  if (room.hostPlayerId !== playerId) {
    throw new Error("ONLY_HOST_CAN_START");
  }

  if (room.players.length < 2) {
    throw new Error("PLAYER_NOT_READY");
  }

  if (room.status === ROOM_STATUS.FINISHED) {
    throw new Error("ROOM_FINISHED");
  }

  room.status = ROOM_STATUS.PLAYING;
  return startNextRound(room.roomCode);
}

export async function startNextRound(roomCode) {
  const room = await getRoom(roomCode);

  if (!room) {
    throw new Error("ROOM_NOT_FOUND");
  }

  if (room.currentRoundIndex >= room.totalRounds) {
    throw new Error("GAME_COMPLETE");
  }

  const round = createRound({ room, roundIndex: room.currentRoundIndex });
  room.currentRoundIndex += 1;
  room.currentRoundId = round.roundId;
  room.roundIds.push(round.roundId);
  room.roundsById[round.roundId] = round;
  room.status = ROOM_STATUS.PLAYING;

  return persistAndBroadcast(room, ROOM_EVENT_TYPES.ROUND_STARTED, {
    roundId: round.roundId,
    roundIndex: round.roundIndex,
  });
}

export async function submitIntent(roundId, playerId, payload) {
  const room = await getRoomByRoundId(roundId);
  const round = roundForRoom(room, roundId);

  if (round.drawerPlayerId !== playerId) {
    throw new Error("ONLY_DRAWER_CAN_SET_INTENT");
  }

  const validationError = validateIntentPayload(payload, round.vibeOptions);
  if (validationError) {
    throw new Error("INVALID_INTENT_PAYLOAD");
  }

  round.drawerIntent = payload;
  round.phase = "drawing";

  return persistAndBroadcast(room, ROOM_EVENT_TYPES.ROOM_UPDATED, {
    roundId,
    phase: round.phase,
  });
}

export async function addStroke(roomCode, roundId, stroke) {
  const room = await getRoom(roomCode);
  if (!room) {
    throw new Error("ROOM_NOT_FOUND");
  }

  const round = roundForRoom(room, roundId);
  round.strokes.push(stroke);
  round.drawing.strokeCount = round.strokes.length;

  return persistAndBroadcast(room, ROOM_EVENT_TYPES.STROKE_CREATED, {
    roundId,
    stroke,
  });
}

export async function replaceStrokes(roomCode, roundId, strokes) {
  const room = await getRoom(roomCode);
  if (!room) {
    throw new Error("ROOM_NOT_FOUND");
  }

  const round = roundForRoom(room, roundId);
  round.strokes = strokes;
  round.drawing.strokeCount = strokes.length;

  return persistAndBroadcast(room, ROOM_EVENT_TYPES.CANVAS_REPLACED, {
    roundId,
    strokes,
  });
}

export async function clearStrokes(roomCode, roundId) {
  return replaceStrokes(roomCode, roundId, []);
}

export async function submitDrawing(roundId, playerId, payload) {
  const room = await getRoomByRoundId(roundId);
  const round = roundForRoom(room, roundId);

  if (round.drawerPlayerId !== playerId) {
    throw new Error("ONLY_DRAWER_CAN_SUBMIT_DRAWING");
  }

  if (Array.isArray(payload.strokes)) {
    round.strokes = payload.strokes;
    round.drawing.strokeCount = payload.strokes.length;
  }

  const width = payload.width ?? DEFAULT_CANVAS.width;
  const height = payload.height ?? DEFAULT_CANVAS.height;
  const svgMarkup = buildDrawingSvg({
    strokes: round.strokes,
    width,
    height,
  });
  const uploadedDrawing = await uploadDrawingAssets({
    roomCode: room.roomCode,
    roundId,
    pngBase64Data: payload.imageBase64,
    pngContentType: payload.contentType || "image/png",
    svgMarkup,
  });

  round.drawing = {
    ...round.drawing,
    imageUrl: uploadedDrawing?.primary?.url ?? null,
    imagePathname: uploadedDrawing?.primary?.pathname ?? null,
    imageAccess: uploadedDrawing?.primary?.access ?? null,
    imageStorage: uploadedDrawing?.primary?.storage ?? null,
    pngUrl: uploadedDrawing?.png?.url ?? null,
    pngPathname: uploadedDrawing?.png?.pathname ?? null,
    pngAccess: uploadedDrawing?.png?.access ?? null,
    pngStorage: uploadedDrawing?.png?.storage ?? null,
    svgUrl: uploadedDrawing?.svg?.url ?? null,
    svgPathname: uploadedDrawing?.svg?.pathname ?? null,
    svgAccess: uploadedDrawing?.svg?.access ?? null,
    svgStorage: uploadedDrawing?.svg?.storage ?? null,
    width,
    height,
    submittedAt: now(),
  };
  round.phase = "guessing";

  return persistAndBroadcast(room, ROOM_EVENT_TYPES.ROUND_SUBMITTED, {
    roundId,
    phase: round.phase,
    imageUrl: round.drawing.imageUrl,
    imagePathname: round.drawing.imagePathname,
    imageAccess: round.drawing.imageAccess,
    imageStorage: round.drawing.imageStorage,
    pngUrl: round.drawing.pngUrl,
    pngPathname: round.drawing.pngPathname,
    pngAccess: round.drawing.pngAccess,
    pngStorage: round.drawing.pngStorage,
    svgUrl: round.drawing.svgUrl,
    svgPathname: round.drawing.svgPathname,
    svgAccess: round.drawing.svgAccess,
    svgStorage: round.drawing.svgStorage,
  });
}

export async function submitGuess(roundId, playerId, payload) {
  const room = await getRoomByRoundId(roundId);
  const round = roundForRoom(room, roundId);

  if (round.guesserPlayerId !== playerId) {
    throw new Error("ONLY_GUESSER_CAN_SUBMIT");
  }

  const validationError = validateGuessPayload(payload, round.vibeOptions);
  if (validationError) {
    throw new Error("INVALID_GUESS_PAYLOAD");
  }

  round.guesserAnswer = payload;

  return persistAndBroadcast(room, ROOM_EVENT_TYPES.GUESS_SUBMITTED, {
    roundId,
  });
}

export async function revealRound(roundId) {
  const room = await getRoomByRoundId(roundId);
  const round = roundForRoom(room, roundId);

  round.result = scoreRound(round.drawerIntent, round.guesserAnswer);
  round.phase = "revealed";
  round.revealedAt = now();

  const isGameFinished = room.currentRoundIndex >= room.totalRounds;
  if (isGameFinished) {
    room.status = ROOM_STATUS.FINISHED;
    room.summary = buildSummary(room, room.roundIds.map((item) => room.roundsById[item]));
  }

  return persistAndBroadcast(room, isGameFinished ? ROOM_EVENT_TYPES.GAME_FINISHED : ROOM_EVENT_TYPES.ROUND_REVEALED, {
    roundId,
    result: round.result,
    summary: room.summary,
  });
}

export async function updatePresence(roomCode, playerId, payload) {
  const room = await getRoom(roomCode);

  if (!room) {
    throw new Error("ROOM_NOT_FOUND");
  }

  const player = room.players.find((item) => item.playerId === playerId);
  if (!player) {
    throw new Error("PLAYER_NOT_FOUND");
  }

  player.status = payload.status ?? "online";
  player.lastSeenAt = payload.lastSeenAt ?? now();

  await saveRoom(room);
  await appendRoomEvent(roomCode, {
    id: crypto.randomUUID(),
    type: player.status === "offline" ? ROOM_EVENT_TYPES.PRESENCE_LEAVE : ROOM_EVENT_TYPES.PRESENCE_JOIN,
    payload: {
      playerId,
      status: player.status,
      lastSeenAt: player.lastSeenAt,
    },
    createdAt: now(),
  });

  return cloneRoom(room);
}

export async function getEvents(roomCode, cursor) {
  return getRoomEvents(roomCode, cursor);
}

async function getRoomByRoundId(roundId) {
  const roomCode = await findRoomCodeByRoundId(roundId);
  if (!roomCode) {
    throw new Error("ROUND_NOT_FOUND");
  }

  const room = await getRoom(roomCode);
  if (!room) {
    throw new Error("ROUND_NOT_FOUND");
  }

  return cloneRoom(room);
}
