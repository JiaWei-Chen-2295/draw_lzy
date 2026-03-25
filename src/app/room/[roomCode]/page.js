import { RoomExperience } from "@/components/RoomExperience";

export default async function RoomPage({ params }) {
  const { roomCode } = await params;

  return (
    <main className="app-shell page-screen flex-1">
      <RoomExperience roomCode={roomCode} />
    </main>
  );
}
