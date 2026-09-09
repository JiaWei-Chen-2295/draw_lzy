"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StrokeReplayCanvas } from "@/components/StrokeReplayCanvas";

function buildAssetSrc(url, pathname, access, storage) {
  if (!url) {
    return null;
  }

  if (storage !== "blob" || !pathname) {
    return url;
  }

  if (access !== "private") {
    return url;
  }

  const encodedPath = pathname
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `/api/blob/${encodedPath}?access=private`;
}

function sortRounds(room) {
  return (room?.roundIds ?? [])
    .map((roundId) => room?.roundsById?.[roundId])
    .filter(Boolean)
    .sort((left, right) => (left?.roundIndex ?? 0) - (right?.roundIndex ?? 0));
}

export function AdminReplayClient({ initialRoomCode = "" }) {
  const [activeRoomCode, setActiveRoomCode] = useState(initialRoomCode);
  const [room, setRoom] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const rounds = useMemo(() => sortRounds(room), [room]);
  const analysisSnapshot = room?.analysis?.final ?? room?.analysis?.latest ?? null;
  const analysisSnapshotHref = useMemo(
    () => buildAssetSrc(analysisSnapshot?.snapshotUrl, analysisSnapshot?.snapshotPathname, analysisSnapshot?.snapshotAccess, analysisSnapshot?.snapshotStorage),
    [analysisSnapshot?.snapshotAccess, analysisSnapshot?.snapshotPathname, analysisSnapshot?.snapshotStorage, analysisSnapshot?.snapshotUrl],
  );

  useEffect(() => {
    if (!activeRoomCode) {
      return;
    }

    let isCancelled = false;

    async function loadRoom() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/rooms/${activeRoomCode}`, { cache: "no-store" });
        const data = await response.json();

        if (!response.ok || data?.ok === false) {
          throw new Error(data?.message || "房间读取失败");
        }

        if (!isCancelled) {
          setRoom(data.room ?? null);
        }
      } catch (loadError) {
        if (!isCancelled) {
          setRoom(null);
          setError(loadError.message || "房间读取失败");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadRoom();

    return () => {
      isCancelled = true;
    };
  }, [activeRoomCode]);

  return (
    <div className="space-y-6">
      <section className="panel grain p-5 md:p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Admin History</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">房间 {activeRoomCode || "-"} 的历史记录</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">这里会展示这个房间完整的轮次历史与手写轨迹回放。你可以逐轮拖动进度条，检查每一笔的起笔、运笔和收笔过程。</p>

        <div className="mt-6">
          <Link href="/admin" className="btn-secondary">
            返回房间列表
          </Link>
        </div>

        {error ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      </section>

      {room ? (
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="stat-card">
            <div className="text-sm text-slate-500">房间</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{room.roomCode}</div>
          </div>
          <div className="stat-card">
            <div className="text-sm text-slate-500">状态</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{room.status}</div>
          </div>
          <div className="stat-card">
            <div className="text-sm text-slate-500">已记录轮次</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{rounds.length}</div>
          </div>
        </section>
      ) : null}

      {analysisSnapshotHref ? (
        <section className="panel p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-slate-500">分析快照</div>
              <div className="mt-2 text-sm text-slate-600">
                当前房间的完整 JSON 快照已经导出到 Blob，可直接拿去做后续分析。{room?.analysis?.final ? "当前显示的是最终归档。" : "当前显示的是最新快照。"}
              </div>
            </div>
            <a className="btn-secondary" href={analysisSnapshotHref} target="_blank" rel="noreferrer">
              打开 JSON
            </a>
          </div>
        </section>
      ) : null}

      {room ? (
        <section className="grid gap-4 2xl:grid-cols-2">
          {rounds.map((round) => (
            <article key={round.roundId} className="panel p-5 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-slate-500">第 {round.roundIndex} 轮</div>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">{round.promptText}</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="pill text-xs text-slate-600">{round.phase}</span>
                  <span className="pill text-xs text-slate-600">{round.strokes?.length ?? 0} 笔</span>
                </div>
              </div>

              <div className="mt-5 mx-auto w-full max-w-[720px]">
                <StrokeReplayCanvas key={`admin-replay-${round.roundId}`} strokes={round.strokes ?? []} autoPlay={false} />
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="stat-card">
                  <div className="text-sm text-slate-500">作画者原本想表达</div>
                  <div className="mt-2 text-base font-semibold text-slate-900">{round.drawerIntent?.vibeChoice || "-"}</div>
                </div>
                <div className="stat-card">
                  <div className="text-sm text-slate-500">猜测者最后选择</div>
                  <div className="mt-2 text-base font-semibold text-slate-900">{round.guesserAnswer?.vibeChoice || "-"}</div>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : activeRoomCode && !isLoading && !error ? (
        <section className="panel p-6 text-center text-slate-600">这个房间还没有可回放的数据。</section>
      ) : null}
    </div>
  );
}
