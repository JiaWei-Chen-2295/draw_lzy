"use client";

import Link from "next/link";
import { useEffect } from "react";
import { SummaryBoard } from "@/components/SummaryBoard";
import { useRoomStore } from "@/store/useRoomStore";

export function SummaryClient({ roomCode }) {
  const { room, hydrateSession, setSession, refreshRoom } = useRoomStore();

  useEffect(() => {
    const session = hydrateSession();
    if (session?.roomCode === roomCode) {
      setSession(session);
    }

    refreshRoom(roomCode).catch(() => null);
  }, [hydrateSession, refreshRoom, roomCode, setSession]);

  if (!room) {
    return <section className="panel p-6 text-center text-slate-600">回顾页正在翻出来。</section>;
  }

  return (
    <div className="space-y-5">
      <SummaryBoard room={room} />
      <Link href="/" className="btn-primary w-full">
        再开一局
      </Link>
    </div>
  );
}
