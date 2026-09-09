import { Suspense } from "react";
import { ExportClient } from "@/components/ExportClient";

export const metadata = {
  title: "剪辑导出 | 任意门",
  description: "可视化笔画视频剪辑导出工具",
};

export default function ExportPage() {
  return (
    <main className="app-shell page-screen flex flex-1 flex-col">
      <Suspense fallback={<div className="p-6 text-slate-500">加载中…</div>}>
        <ExportClient />
      </Suspense>
    </main>
  );
}
