export function PromptCard({ round }) {
  return (
    <section className="panel p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="pill text-xs text-slate-600">第 {round.roundIndex} 轮</span>
        <span className="pill text-xs text-slate-600">题型 {round.promptCategory}</span>
      </div>
      <h2 className="mt-5 text-2xl font-semibold text-slate-900">{round.promptText}</h2>
      <p className="mt-3 text-sm leading-7 text-slate-600">先别画得太具体，先定一个你心里的答案，再用抽象一点的方式表达。</p>
    </section>
  );
}
