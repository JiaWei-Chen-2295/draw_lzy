import { updatePresence } from "@/lib/server/room-service";
import { failure, success } from "@/lib/server/api";

export async function POST(request) {
  try {
    const body = await request.json();
    const room = await updatePresence(body.roomCode, body.playerId, body.payload || {});

    return success({ ok: true, room });
  } catch (error) {
    return failure(error);
  }
}
