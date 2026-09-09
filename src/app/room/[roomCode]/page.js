import { RoomExperience } from "@/components/RoomExperience";

export default async function RoomPage({ params }) {
  const { roomCode } = await params;

  return (
    <main className="app-shell room-page-screen flex flex-1 flex-col overflow-hidden">
      <RoomExperience roomCode={roomCode} />
    </main>
  );
}
