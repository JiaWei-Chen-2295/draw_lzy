import { PROMPTS, PROMPTS_BY_ID } from "@/lib/prompts";
import { ROUND_SEQUENCE } from "@/lib/constants";

function uniqueByCategory(category, excludedIds) {
  return PROMPTS.filter((prompt) => prompt.category === category && !excludedIds.has(prompt.id));
}

export function choosePromptForRound(roundIndex, usedPromptIds) {
  const category = ROUND_SEQUENCE[roundIndex];
  const pool = uniqueByCategory(category, new Set(usedPromptIds));

  if (pool.length === 0) {
    throw new Error(`No prompt available for round ${roundIndex + 1}`);
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

export function createRound({ room, roundIndex }) {
  const prompt = choosePromptForRound(roundIndex, room.roundIds.map((roundId) => room.roundsById[roundId].promptId));
  const drawerPlayerId = roundIndex % 2 === 0 ? room.players[0]?.playerId : room.players[1]?.playerId;
  const guesserPlayerId = room.players.find((player) => player.playerId !== drawerPlayerId)?.playerId;

  return {
    roundId: `round-${crypto.randomUUID()}`,
    roomCode: room.roomCode,
    roundIndex: roundIndex + 1,
    drawerPlayerId,
    guesserPlayerId,
    promptId: prompt.id,
    promptCategory: prompt.category,
    promptText: prompt.text,
    vibeOptions: prompt.vibeOptions,
    drawerIntent: null,
    guesserAnswer: null,
    strokes: [],
    drawing: {
      strokeCount: 0,
      imageUrl: null,
      imagePathname: null,
      imageAccess: null,
      imageStorage: null,
      pngUrl: null,
      pngPathname: null,
      pngAccess: null,
      pngStorage: null,
      svgUrl: null,
      svgPathname: null,
      svgAccess: null,
      svgStorage: null,
      width: 1024,
      height: 1024,
      submittedAt: null,
    },
    result: null,
    phase: "intent",
    createdAt: Date.now(),
    revealedAt: null,
  };
}

export function getPromptById(promptId) {
  return PROMPTS_BY_ID[promptId] ?? null;
}
