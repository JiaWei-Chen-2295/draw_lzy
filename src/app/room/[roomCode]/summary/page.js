import { SummaryClient } from "@/components/SummaryClient";

export default async function SummaryPage({ params }) {
  const { roomCode } = await params;

  return (
    <main className="app-shell page-screen flex-1">
      <SummaryClient roomCode={roomCode} />
    </main>
  );
}
