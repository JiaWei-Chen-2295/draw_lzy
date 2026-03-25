import { addStroke, clearStrokes, replaceStrokes, readRoom } from "@/lib/server/room-service";
import { failure, success } from "@/lib/server/api";

export async function POST(request) {
  try {
    const body = await request.json();

    if (body.eventType === "stroke.created") {
      await addStroke(body.roomCode, body.payload.roundId, body.payload.stroke);
    }

    if (body.eventType === "canvas.cleared") {
      await clearStrokes(body.roomCode, body.payload.roundId);
    }

    if (body.eventType === "canvas.replaceAllStrokes") {
      await replaceStrokes(body.roomCode, body.payload.roundId, body.payload.strokes);
    }

    const room = await readRoom(body.roomCode);
    return success({ ok: true, room });
  } catch (error) {
    return failure(error);
  }
}
