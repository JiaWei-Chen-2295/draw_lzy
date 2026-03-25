import { startRoom } from "@/lib/server/room-service";
import { failure, success } from "@/lib/server/api";

export async function POST(request) {
  try {
    const body = await request.json();
    const room = await startRoom(body.roomCode, body.playerId);

    return success({ ok: true, room });
  } catch (error) {
    return failure(error);
  }
}
