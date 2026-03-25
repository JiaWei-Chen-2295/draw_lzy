import { Redis } from "@upstash/redis";

function createMemoryState() {
  return {
    rooms: new Map(),
    events: new Map(),
  };
}

function getMemoryState() {
  if (!globalThis.__ANY_DOOR_MEMORY__) {
    globalThis.__ANY_DOOR_MEMORY__ = createMemoryState();
  }

  return globalThis.__ANY_DOOR_MEMORY__;
}

function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export async function getRoom(roomCode) {
  const redis = getRedis();
  if (redis) {
    return redis.get(`room:${roomCode}`);
  }

  return structuredClone(getMemoryState().rooms.get(roomCode) ?? null);
}

export async function saveRoom(room) {
  const redis = getRedis();
  if (redis) {
    await redis.set(`room:${room.roomCode}`, room, { ex: 60 * 60 * 24 });
    room.roundIds?.forEach(async (roundId) => {
      await redis.set(`round:${roundId}:roomCode`, room.roomCode, { ex: 60 * 60 * 24 });
    });
    return room;
  }

  getMemoryState().rooms.set(room.roomCode, structuredClone(room));
  return room;
}

export async function appendRoomEvent(roomCode, event) {
  const redis = getRedis();
  if (redis) {
    const key = `room:${roomCode}:events`;
    await redis.rpush(key, JSON.stringify(event));
    await redis.expire(key, 60 * 60 * 24);
    return;
  }

  const state = getMemoryState();
  const events = state.events.get(roomCode) ?? [];
  events.push(structuredClone(event));
  state.events.set(roomCode, events.slice(-300));
}

export async function getRoomEvents(roomCode, cursor = 0) {
  const redis = getRedis();
  if (redis) {
    const rawEvents = (await redis.lrange(`room:${roomCode}:events`, 0, -1)) ?? [];
    const parsed = rawEvents.map((item) => (typeof item === "string" ? JSON.parse(item) : item));
    return {
      events: parsed.slice(cursor),
      cursor: parsed.length,
    };
  }

  const events = getMemoryState().events.get(roomCode) ?? [];
  return {
    events: structuredClone(events.slice(cursor)),
    cursor: events.length,
  };
}

export async function findRoomCodeByRoundId(roundId) {
  const redis = getRedis();
  if (redis) {
    return redis.get(`round:${roundId}:roomCode`);
  }

  const rooms = getMemoryState().rooms.values();
  for (const room of rooms) {
    if (room.roundsById?.[roundId]) {
      return room.roomCode;
    }
  }

  return null;
}
