import { submitIntent } from "@/lib/server/room-service";
import { failure, success } from "@/lib/server/api";

export async function POST(request, { params }) {
  try {
    const { roundId } = await params;
    const body = await request.json();
    const room = await submitIntent(roundId, body.playerId, {
      vibeChoice: body.vibeChoice,
    });

    return success({ ok: true, room });
  } catch (error) {
    return failure(error);
  }
}
