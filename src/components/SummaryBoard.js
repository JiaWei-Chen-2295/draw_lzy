import Image from "next/image";

export function SummaryBoard({ room }) {
  const rounds = room.roundIds.map((roundId) => room.roundsById[roundId]);
  const summary = room.summary;

  return (
    <div className="space-y-6">
      <section className="panel p-5 md:p-6">
        <span className="pill text-xs text-slate-600">回顾</span>
        <h1 className="mt-4 text-3xl font-semibold text-slate-900">六轮走完了，来回头看一眼</h1>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="stat-card">
            <div className="text-sm text-slate-500">总轮数</div>
            <div className="mt-2 text-3xl font-semibold">{summary?.totalRounds ?? rounds.length}</div>
          </div>
          <div className="stat-card">
            <div className="text-sm text-slate-500">第一题对上的次数</div>
            <div className="mt-2 text-3xl font-semibold">{summary?.focusHits ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="text-sm text-slate-500">第二题对上的次数</div>
            <div className="mt-2 text-3xl font-semibold">{summary?.vibeHits ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="text-sm text-slate-500">最接近的一轮</div>
            <div className="mt-2 text-xl font-semibold">
              {rounds.find((item) => item.roundId === summary?.closestRoundId)?.roundIndex ?? "-"}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {rounds.map((round) => (
          <article key={round.roundId} className="panel p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500">第 {round.roundIndex} 轮</div>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">{round.promptText}</h2>
              </div>
              <span className="pill text-xs text-slate-600">分数 {round.result?.score ?? 0}/2</span>
            </div>

            {round.drawing?.imageUrl ? (
              <div className="relative mt-5 aspect-square w-full overflow-hidden rounded-3xl border border-slate-200">
                <Image
                  src={round.drawing.imageUrl}
                  alt={`第 ${round.roundIndex} 轮画作`}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="mt-5 aspect-square w-full rounded-3xl border border-dashed border-slate-300 bg-white/50" />
            )}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="stat-card">
                <div className="text-sm text-slate-500">原本想的是</div>
                <div className="mt-2 text-base font-semibold">{round.drawerIntent?.focusChoice || "-"}</div>
                <div className="text-sm text-slate-600">{round.drawerIntent?.vibeChoice || "-"}</div>
              </div>
              <div className="stat-card">
                <div className="text-sm text-slate-500">后来猜的是</div>
                <div className="mt-2 text-base font-semibold">{round.guesserAnswer?.focusChoice || "-"}</div>
                <div className="text-sm text-slate-600">{round.guesserAnswer?.vibeChoice || "-"}</div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
