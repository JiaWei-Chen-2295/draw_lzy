export function RevealCard({ round, isGameFinished, onContinue, disabled }) {
  const resultLabel =
    round.result?.score === 2 ? "想到一块去了" : round.result?.score === 1 ? "差一点点就全中" : "这轮偏差挺有意思";

  return (
    <section className="panel p-5 md:p-6">
      <span className="pill text-xs text-slate-600">揭晓</span>
      <h2 className="mt-4 text-2xl font-semibold text-slate-900">{resultLabel}</h2>
      <p className="mt-2 text-sm leading-7 text-slate-600">{round.promptText}</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="stat-card">
          <div className="text-sm text-slate-500">对方一开始选的是</div>
          <div className="mt-2 text-base font-semibold text-slate-900">{round.drawerIntent?.focusChoice || "-"}</div>
          <div className="mt-1 text-sm text-slate-600">{round.drawerIntent?.vibeChoice || "-"}</div>
        </div>
        <div className="stat-card">
          <div className="text-sm text-slate-500">你猜的是</div>
          <div className="mt-2 text-base font-semibold text-slate-900">{round.guesserAnswer?.focusChoice || "-"}</div>
          <div className="mt-1 text-sm text-slate-600">{round.guesserAnswer?.vibeChoice || "-"}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="pill justify-between">
          <span className="text-sm text-slate-600">第一题</span>
          <span className={round.result?.focusMatched ? "text-emerald-700" : "text-slate-500"}>
            {round.result?.focusMatched ? "对上了" : "没对上"}
          </span>
        </div>
        <div className="pill justify-between">
          <span className="text-sm text-slate-600">第二题</span>
          <span className={round.result?.vibeMatched ? "text-emerald-700" : "text-slate-500"}>
            {round.result?.vibeMatched ? "对上了" : "有偏差"}
          </span>
        </div>
      </div>

      <button type="button" className="btn-primary mt-6 w-full" onClick={onContinue} disabled={disabled}>
        {isGameFinished ? "去看回顾页" : "下一轮"}
      </button>
    </section>
  );
}
