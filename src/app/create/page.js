"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveSession } from "@/lib/storage";

export default function CreatePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/rooms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const data = await response.json();

      if (!response.ok || data.ok === false) {
        throw new Error(data.message || "创建房间失败");
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
    <main className="app-shell page-screen flex flex-1 items-center justify-center">
      <form onSubmit={handleSubmit} className="panel w-full max-w-xl p-6 md:p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">CREATE ROOM</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">先起个昵称</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">不用太正式，能认出来就行。房间建好后，你会先在里面等另一个人。</p>

        <input className="field mt-6" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="比如：阿周" maxLength={24} />

        {error ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        <button type="submit" className="btn-primary mt-6 w-full" disabled={isSubmitting}>
          {isSubmitting ? "开门中..." : "创建房间"}
        </button>

        <Link href="/" className="btn-ghost mt-3 w-full">
          回首页
        </Link>
      </form>
    </main>
  );
}
