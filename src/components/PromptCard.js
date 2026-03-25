export function PromptCard({ round }) {
  return (
    <section className="panel p-5 md:p-6">
      <div className="flex items-center gap-3">
        <span className="pill text-xs text-slate-600">第 {round.roundIndex} 轮</span>
      </div>
      <h2 className="mt-5 text-2xl font-semibold text-slate-900">{round.promptText}</h2>
      <p className="mt-3 text-sm leading-7 text-slate-600">不用画具体东西，抓住一个感觉画出来就行。</p>
    </section>
  );
}
