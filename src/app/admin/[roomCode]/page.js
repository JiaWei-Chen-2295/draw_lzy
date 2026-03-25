import { AdminReplayClient } from "@/components/AdminReplayClient";

export default async function AdminRoomPage({ params }) {
  const { roomCode } = await params;

  return (
    <main className="app-shell page-screen flex-1">
      <AdminReplayClient initialRoomCode={roomCode} />
    </main>
  );
}
