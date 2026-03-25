import { getEvents } from "@/lib/server/room-service";
import { failure, success } from "@/lib/server/api";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const roomCode = searchParams.get("roomCode");
    const cursor = Number(searchParams.get("cursor") || 0);
    const data = await getEvents(roomCode, cursor);

    return success({
      ok: true,
      events: data.events,
      cursor: data.cursor,
    });
  } catch (error) {
    return failure(error);
  }
}
