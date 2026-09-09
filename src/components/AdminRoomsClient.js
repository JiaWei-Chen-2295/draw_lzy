"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildRoomSummary(room) {
  const currentRound = room?.currentRoundId ? room.roundsById?.[room.currentRoundId] : null;

  return {
    roomCode: room?.roomCode ?? "-",
    status: room?.status ?? "-",
    players: (room?.players ?? []).map((player) => player?.nickname).filter(Boolean),
    createdAt: room?.createdAt ?? null,
    updatedAt: room?.updatedAt ?? null,
    currentRoundLabel: currentRound ? `第 ${currentRound.roundIndex} 轮 / ${currentRound.phase}` : "尚未开始",
    totalRounds: room?.totalRounds ?? 0,
    completedRounds: room?.roundIds?.length ?? 0,
  };
}

export function AdminRoomsClient() {
  const [rooms, setRooms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const roomSummaries = useMemo(() => rooms.map((room) => buildRoomSummary(room)), [rooms]);

  useEffect(() => {
    let isCancelled = false;

    async function loadRooms() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch("/api/admin/rooms", { cache: "no-store" });
        const data = await response.json();

        if (!response.ok || data?.ok === false) {
          throw new Error(data?.message || "房间列表读取失败");
        }

        if (!isCancelled) {
          setRooms(Array.isArray(data.rooms) ? data.rooms : []);
        }
      } catch (loadError) {
        if (!isCancelled) {
          setRooms([]);
          setError(loadError.message || "房间列表读取失败");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadRooms();

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <section className="panel grain p-5 md:p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Admin</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">房间后台</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">这里可以看到所有房间的基础信息，包括有哪些玩家、什么时候创建、最近什么时候有更新，以及当前进行到哪一轮。点进某个房间后，可以查看完整历史记录与逐轮回放。</p>
      </section>

      {error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="stat-card">
          <div className="text-sm text-slate-500">房间总数</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{roomSummaries.length}</div>
        </div>
        <div className="stat-card">
          <div className="text-sm text-slate-500">进行中</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{roomSummaries.filter((room) => room.status === "playing").length}</div>
        </div>
        <div className="stat-card">
          <div className="text-sm text-slate-500">已结束</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{roomSummaries.filter((room) => room.status === "finished").length}</div>
        </div>
      </section>

      {isLoading ? (
        <section className="panel p-6 text-center text-slate-600">正在读取房间列表。</section>
      ) : roomSummaries.length === 0 ? (
        <section className="panel p-6 text-center text-slate-600">当前还没有可展示的房间。</section>
      ) : (
        <section className="space-y-4">
          {roomSummaries.map((room) => (
            <article key={room.roomCode} className="panel p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-slate-500">房间码</div>
                  <h2 className="mt-1 text-2xl font-semibold text-slate-900">{room.roomCode}</h2>
                  <p className="mt-2 text-sm text-slate-600">{room.players.length ? room.players.join(" / ") : "暂无玩家信息"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="pill text-xs text-slate-600">{room.status}</span>
                  <span className="pill text-xs text-slate-600">{room.currentRoundLabel}</span>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-4">
                <div className="stat-card">
                  <div className="text-sm text-slate-500">创建时间</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(room.createdAt)}</div>
                </div>
                <div className="stat-card">
                  <div className="text-sm text-slate-500">最近更新</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(room.updatedAt)}</div>
                </div>
                <div className="stat-card">
                  <div className="text-sm text-slate-500">完成轮次</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {room.completedRounds} / {room.totalRounds}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="text-sm text-slate-500">玩家数</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{room.players.length}</div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={`/admin/${room.roomCode}`} className="btn-primary">
                  查看历史记录
                </Link>
                <Link href={`/export?room=${room.roomCode}`} className="btn-secondary">
                  导出视频
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
