"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import { GuessPicker } from "@/components/GuessPicker";
import { IntentPicker } from "@/components/IntentPicker";
import { PromptCard } from "@/components/PromptCard";
import { RevealCard } from "@/components/RevealCard";
import { RoomLobby } from "@/components/RoomLobby";
import { useRoomStore } from "@/store/useRoomStore";

function WaitingCard({ title, body }) {
  return (
    <section className="panel p-6 text-center">
      <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-slate-600">{body}</p>
    </section>
  );
}

export function RoomExperience({ roomCode }) {
  const router = useRouter();
  const { room, session, isLoading, error, hydrateSession, setSession, refreshRoom, initRealtime, cleanupRealtime, postAndApply, clearError } =
    useRoomStore();
  const [intent, setIntent] = useState({ focusChoice: "", vibeChoice: "" });
  const [guess, setGuess] = useState({ focusChoice: "", vibeChoice: "" });

  useEffect(() => {
    const restored = hydrateSession();
    if (restored?.roomCode === roomCode) {
      setSession(restored);
    }

    refreshRoom(roomCode).catch(() => null);
  }, [hydrateSession, refreshRoom, roomCode, setSession]);

  useEffect(() => {
    if (!session?.playerId || session.roomCode !== roomCode) {
      return undefined;
    }

    initRealtime(roomCode, session.playerId).catch(() => null);
    const heartbeat = window.setInterval(() => refreshRoom(roomCode).catch(() => null), 2500);

    return () => {
      window.clearInterval(heartbeat);
      cleanupRealtime();
    };
  }, [cleanupRealtime, initRealtime, refreshRoom, roomCode, session?.playerId, session?.roomCode]);

  const currentRound = useMemo(() => {
    if (!room?.currentRoundId) {
      return null;
    }

    return room.roundsById?.[room.currentRoundId] ?? null;
  }, [room]);

  const me = room?.players?.find((player) => player.playerId === session?.playerId);
  const isDrawer = currentRound?.drawerPlayerId === session?.playerId;
  const isGuesser = currentRound?.guesserPlayerId === session?.playerId;
  const isGameFinished = room?.status === "finished";

  async function handleStartGame() {
    clearError();
    await postAndApply("/api/rooms/start", {
      roomCode,
      playerId: session.playerId,
    });
  }

  async function handleIntentSubmit() {
    await postAndApply(`/api/rounds/${currentRound.roundId}/intent`, {
      playerId: session.playerId,
      ...intent,
    });
  }

  async function handleStrokeCommitted(stroke) {
    await fetch("/api/realtime/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomCode,
        eventType: "stroke.created",
        payload: { roundId: currentRound.roundId, stroke },
      }),
    });
    await refreshRoom(roomCode);
  }

  async function handleReplaceStrokes(strokes) {
    await fetch("/api/realtime/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomCode,
        eventType: strokes.length === 0 ? "canvas.cleared" : "canvas.replaceAllStrokes",
        payload: { roundId: currentRound.roundId, strokes },
      }),
    });
    await refreshRoom(roomCode);
  }

  async function handleSubmitDrawing(payload) {
    await postAndApply(`/api/rounds/${currentRound.roundId}/submit-drawing`, {
      playerId: session.playerId,
      ...payload,
    });
  }

  async function handleGuessSubmit() {
    await postAndApply(`/api/rounds/${currentRound.roundId}/guess`, {
      playerId: session.playerId,
      ...guess,
    });
    await postAndApply(`/api/rounds/${currentRound.roundId}/reveal`, {});
  }

  async function handleContinue() {
    if (isGameFinished) {
      router.push(`/room/${roomCode}/summary`);
      return;
    }

    await postAndApply("/api/rounds/start", { roomCode });
    setIntent({ focusChoice: "", vibeChoice: "" });
    setGuess({ focusChoice: "", vibeChoice: "" });
  }

  if (!session || session.roomCode !== roomCode) {
    return (
      <div className="space-y-5">
        <WaitingCard title="还没认出你是谁" body="先从首页重新创建或加入房间，我们会顺手把身份记下来。" />
        <Link href="/" className="btn-primary w-full">
          去首页
        </Link>
      </div>
    );
  }

  if (!room) {
    return <WaitingCard title="房间加载中" body="正在把这一局接回来。" />;
  }

  return (
    <div className="space-y-5">
      <section className="panel grain overflow-hidden p-5 md:p-6">
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">ANY DOOR</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">任意门</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="pill text-xs text-slate-600">房间 {room.roomCode}</span>
              <span className="pill text-xs text-slate-600">{me?.nickname || "匿名玩家"}</span>
            </div>
          </div>
          {error ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
        </div>
      </section>

      {room.status === "waiting" ? <RoomLobby room={room} session={session} onStart={handleStartGame} isLoading={isLoading} /> : null}

      {currentRound ? (
        <>
          <PromptCard round={currentRound} />

          {currentRound.phase === "intent" ? (
            isDrawer ? (
              <IntentPicker round={currentRound} value={intent} onChange={setIntent} onSubmit={handleIntentSubmit} isSubmitting={isLoading} />
            ) : (
              <WaitingCard title="对方正在先想一个方向" body="这一步只有作画者看得到。你先别急，等他把心里的答案定下来。" />
            )
          ) : null}

          {currentRound.phase === "drawing" ? (
            isDrawer ? (
              <DrawingCanvas
                round={currentRound}
                strokes={currentRound.strokes}
                onStrokeCommitted={handleStrokeCommitted}
                onReplaceAllStrokes={handleReplaceStrokes}
                onSubmitDrawing={handleSubmitDrawing}
                isSubmitting={isLoading}
              />
            ) : (
              <div className="space-y-4">
                <WaitingCard title="你可以看到画面在慢慢长出来" body="这一轮你先当观察者，等对方画完，你再做选择题。" />
                <DrawingCanvas round={currentRound} strokes={currentRound.strokes} readOnly />
              </div>
            )
          ) : null}

          {currentRound.phase === "guessing" ? (
            isGuesser ? (
              <div className="space-y-4">
                <DrawingCanvas round={currentRound} strokes={currentRound.strokes} readOnly />
                <GuessPicker round={currentRound} value={guess} onChange={setGuess} onSubmit={handleGuessSubmit} isSubmitting={isLoading} />
              </div>
            ) : (
              <WaitingCard title="轮到对方来猜了" body="先等他选完，我们马上揭晓这一轮。" />
            )
          ) : null}

          {currentRound.phase === "revealed" ? (
            <RevealCard round={currentRound} isGameFinished={isGameFinished} onContinue={handleContinue} disabled={isLoading} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
