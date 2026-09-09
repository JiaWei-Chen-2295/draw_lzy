import Link from "next/link";

export default function HomePage() {
  return (
    <main className="app-shell page-screen flex flex-1 items-center">
      <section className="panel grain relative overflow-hidden px-6 py-10 md:px-10 md:py-12">
        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">DOKODEMO DOOR</p>
            <h1 className="mt-4 max-w-xl text-5xl font-semibold tracking-tight text-slate-900 md:text-7xl">任意门</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              画的不是东西，是现在、最近，还有一点点接下来。两个人，两台设备，轮流用颜色和线条猜彼此想表达的感觉。
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/create" className="btn-primary">
                创建房间
              </Link>
              <Link href="/join" className="btn-secondary">
                加入房间
              </Link>
              <Link href="/admin" className="btn-ghost">
                管理回放
              </Link>
              <Link href="/export" className="btn-ghost">
                剪辑导出
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="stat-card">
              <div className="text-sm text-slate-500">一局节奏</div>
              <div className="mt-2 text-xl font-semibold text-slate-900">固定 6 轮，约 20 到 30 分钟</div>
            </div>
            <div className="stat-card">
              <div className="text-sm text-slate-500">玩法感受</div>
              <div className="mt-2 text-xl font-semibold text-slate-900">轻松一点，别画太具体，看看有没有猜中</div>
            </div>
            <div className="stat-card">
              <div className="text-sm text-slate-500">适合现在</div>
              <div className="mt-2 text-xl font-semibold text-slate-900">面对面坐着玩，会更有意思</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
