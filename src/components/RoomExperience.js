"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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

function getStrokeIds(strokes = []) {
  return strokes.map((stroke) => stroke?.strokeId).filter(Boolean);
}

function areStrokeListsEqual(left = [], right = []) {
  const leftIds = getStrokeIds(left);
  const rightIds = getStrokeIds(right);

  if (leftIds.length !== rightIds.length) {
    return false;
  }

  return leftIds.every((strokeId, index) => strokeId === rightIds[index]);
}

export function RoomExperience({ roomCode }) {
  const router = useRouter();
  const {
    room,
    session,
    isLoading,
    error,
    hydrateSession,
    setSession,
    refreshRoom,
    initRealtime,
    cleanupRealtime,
    postAndApply,
    clearError,
  } = useRoomStore();
  const [intent, setIntent] = useState({ vibeChoice: "" });
  const [guess, setGuess] = useState({ vibeChoice: "" });
  const [localDraft, setLocalDraft] = useState(null);
  const pendingCanvasSyncRef = useRef(Promise.resolve());

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

    return () => {
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
  const isImmersiveDrawingPhase = currentRound?.phase === "drawing" && isDrawer;
  const activeLocalDraft = useMemo(() => {
    if (!currentRound || !localDraft || localDraft.roundId !== currentRound.roundId) {
      return null;
    }

    if (areStrokeListsEqual(currentRound.strokes ?? [], localDraft.strokes ?? [])) {
      return null;
    }

    return localDraft;
  }, [currentRound, localDraft]);

  const displayedStrokes = useMemo(() => {
    if (!currentRound) {
      return [];
    }

    if (!isDrawer || !activeLocalDraft) {
      return currentRound.strokes ?? [];
    }

    return activeLocalDraft.strokes ?? [];
  }, [activeLocalDraft, currentRound, isDrawer]);

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

  function applyOptimisticStrokes(updater) {
    if (!currentRound) {
      return [];
    }

    const baseStrokes = activeLocalDraft?.strokes ?? currentRound.strokes ?? [];
    const nextStrokes = typeof updater === "function" ? updater(baseStrokes) : updater;

    setLocalDraft({
      roundId: currentRound.roundId,
      strokes: nextStrokes,
    });

    return nextStrokes;
  }

  function enqueueCanvasSync(task) {
    const nextSync = pendingCanvasSyncRef.current
      .catch(() => null)
      .then(task);

    pendingCanvasSyncRef.current = nextSync.catch(() => null);
    return nextSync;
  }

  async function handleStrokeCommitted(stroke) {
    applyOptimisticStrokes((currentStrokes) => [...currentStrokes, stroke]);

    await enqueueCanvasSync(async () => {
      const response = await fetch("/api/realtime/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode,
          eventType: "stroke.created",
          payload: { roundId: currentRound.roundId, stroke },
        }),
      });

      if (!response.ok) {
        await refreshRoom(roomCode);
      }
    });
  }

  async function handleReplaceStrokes(strokes) {
    applyOptimisticStrokes(strokes);

    await enqueueCanvasSync(async () => {
      const response = await fetch("/api/realtime/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode,
          eventType: strokes.length === 0 ? "canvas.cleared" : "canvas.replaceAllStrokes",
          payload: { roundId: currentRound.roundId, strokes },
        }),
      });

      if (!response.ok) {
        await refreshRoom(roomCode);
      }
    });
  }

  async function handleSubmitDrawing(payload) {
    await pendingCanvasSyncRef.current.catch(() => null);

    await postAndApply(`/api/rounds/${currentRound.roundId}/submit-drawing`, {
      playerId: session.playerId,
      strokes: displayedStrokes,
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
    setLocalDraft(null);
    setIntent({ vibeChoice: "" });
    setGuess({ vibeChoice: "" });
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
    <div className={isImmersiveDrawingPhase ? "room-experience-fullscreen flex h-full min-h-0 flex-col gap-4 overflow-hidden" : "space-y-5"}>
      {!isImmersiveDrawingPhase ? (
        <section className="panel grain overflow-hidden p-5 md:p-6">
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">DOKODEMO DOOR</p>
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
      ) : null}

      {room.status === "waiting" ? <RoomLobby room={room} session={session} onStart={handleStartGame} isLoading={isLoading} /> : null}

      {currentRound ? (
        <>
          {isImmersiveDrawingPhase ? (
            <section className="min-h-0 flex-1 overflow-hidden">
              <DrawingCanvas
                round={currentRound}
                strokes={displayedStrokes}
                onStrokeCommitted={handleStrokeCommitted}
                onReplaceAllStrokes={handleReplaceStrokes}
                onSubmitDrawing={handleSubmitDrawing}
                isSubmitting={isLoading}
                fullViewport
              />
            </section>
          ) : (
            <PromptCard round={currentRound} />
          )}

          {!isImmersiveDrawingPhase && currentRound.phase === "intent" ? (
            isDrawer ? (
              <IntentPicker round={currentRound} value={intent} onChange={setIntent} onSubmit={handleIntentSubmit} isSubmitting={isLoading} />
            ) : (
              <WaitingCard title="对方先选一下这轮想画什么感觉" body="这一步只有作画的人看得到，等他选好就会开始画。" />
            )
          ) : null}

          {!isImmersiveDrawingPhase && currentRound.phase === "drawing" ? (
            isDrawer ? (
              <DrawingCanvas
                round={currentRound}
                strokes={displayedStrokes}
                onStrokeCommitted={handleStrokeCommitted}
                onReplaceAllStrokes={handleReplaceStrokes}
                onSubmitDrawing={handleSubmitDrawing}
                isSubmitting={isLoading}
              />
            ) : (
              <div className="space-y-4">
                <WaitingCard title="先看着这张画慢慢长出来" body="等对方画完，这一轮就轮到你来选答案。" />
                <DrawingCanvas round={currentRound} strokes={displayedStrokes} readOnly />
              </div>
            )
          ) : null}

          {currentRound.phase === "guessing" ? (
            isGuesser ? (
              <div className="space-y-4">
                <DrawingCanvas round={currentRound} strokes={displayedStrokes} readOnly />
                <GuessPicker round={currentRound} value={guess} onChange={setGuess} onSubmit={handleGuessSubmit} isSubmitting={isLoading} />
              </div>
            ) : (
              <WaitingCard title="轮到对方来选了" body="等他选完，这一轮就会马上揭晓。" />
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
