import { readRoom } from "@/lib/server/room-service";
import { failure, success } from "@/lib/server/api";

export async function GET(_, { params }) {
  try {
    const { roomCode } = await params;
    const room = await readRoom(roomCode);

    if (!room) {
      return failure("ROOM_NOT_FOUND", 404);
    }

    return success({ ok: true, room });
  } catch (error) {
    return failure(error);
  }
}
