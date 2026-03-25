import { readRooms } from "@/lib/server/room-service";
import { failure, success } from "@/lib/server/api";

export async function GET() {
  try {
    const rooms = await readRooms();
    return success({ ok: true, rooms });
  } catch (error) {
    return failure(error);
  }
}
