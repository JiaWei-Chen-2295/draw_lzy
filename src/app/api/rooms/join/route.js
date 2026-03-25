import { joinRoom } from "@/lib/server/room-service";
import { failure, success } from "@/lib/server/api";
import { validateNickname, validateRoomCode } from "@/lib/validators";

export async function POST(request) {
  try {
    const body = await request.json();
    const roomCodeError = validateRoomCode(body.roomCode);
    if (roomCodeError) {
      return failure(roomCodeError);
    }

    const nicknameError = validateNickname(body.nickname);
    if (nicknameError) {
      return failure(nicknameError);
    }

    const result = await joinRoom(body.roomCode.trim().toUpperCase(), body.nickname);

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
