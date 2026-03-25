import { createRoom } from "@/lib/server/room-service";
import { failure, success } from "@/lib/server/api";
import { validateNickname } from "@/lib/validators";

export async function POST(request) {
  try {
    const body = await request.json();
    const message = validateNickname(body.nickname);

    if (message) {
      return failure(message);
    }

    const result = await createRoom(body.nickname);

    return success({
      ok: true,
      roomCode: result.room.roomCode,
      playerId: result.playerId,
      room: result.room,
    });
  } catch (error) {
    return failure(error);
  }
}
