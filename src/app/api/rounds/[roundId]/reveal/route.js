import { revealRound } from "@/lib/server/room-service";
import { failure, success } from "@/lib/server/api";

export async function POST(_, { params }) {
  try {
    const { roundId } = await params;
    const room = await revealRound(roundId);

    return success({ ok: true, room });
  } catch (error) {
    return failure(error);
  }
}
