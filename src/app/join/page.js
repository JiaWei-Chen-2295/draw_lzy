"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveSession } from "@/lib/storage";

export default function JoinPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: roomCode.toUpperCase(), nickname }),
      });
      const data = await response.json();

      if (!response.ok || data.ok === false) {
        throw new Error(data.message || "加入房间失败");
      }

      saveSession({
        roomCode: data.roomCode,
        playerId: data.playerId,
        nickname,
      });
      router.push(`/room/${data.roomCode}`);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell flex flex-1 items-center justify-center">
      <form onSubmit={handleSubmit} className="panel w-full max-w-xl p-6 md:p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">JOIN ROOM</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">带上房间码进来</h1>
        <div className="mt-6 grid gap-4">
          <input
            className="field uppercase"
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            placeholder="AB12CD"
            maxLength={6}
          />
          <input className="field" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="你的昵称" maxLength={24} />
        </div>

        {error ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        <button type="submit" className="btn-primary mt-6 w-full" disabled={isSubmitting}>
          {isSubmitting ? "连线中..." : "加入房间"}
        </button>

        <Link href="/" className="btn-ghost mt-3 w-full">
          回首页
        </Link>
      </form>
    </main>
  );
}
