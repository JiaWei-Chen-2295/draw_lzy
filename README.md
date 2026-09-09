# 任意门 / Dokodemo Door

一个双人、双设备、面对面的抽象绘画小游戏。它不做“关系测试”，而是借由 6 轮抽象表达，让两个人交换“最近、现在，和一点点接下来”的理解偏差。

## 文档导航

- 规格原文：[specs/project-spec.md](/D:/a_my_project/draw_lzy/specs/project-spec.md)
- 架构与实现说明：[docs/architecture.md](/D:/a_my_project/draw_lzy/docs/architecture.md)
- JSON 透明视频导出：[docs/json-video-export.md](/D:/a_my_project/draw_lzy/docs/json-video-export.md)

## 当前实现范围

当前仓库已实现 MVP 主链路：

- 创建房间 / 加入房间
- 房主开始游戏
- 固定 6 轮流程
- 作画者先做隐藏选择
- Canvas 作画、逐笔同步、撤销、清空
- 手写轨迹录制与揭晓阶段重放
- Admin 后台查看房间列表、时间信息与历史回放
- 房间历史与事件流自动导出 JSON 到 Vercel Blob
- 房间结束后会固化 `final.json`，并写入 Blob 归档索引
- 猜测者双选择题作答
- 揭晓结果与基础 summary
- localStorage 会话恢复
- Redis / Blob 可选接入，本地 fallback 可运行

## 技术栈

- Next.js 16 App Router
- React 19
- JavaScript
- Tailwind CSS 4
- Zustand
- Upstash Redis REST
- Vercel Blob

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 准备环境变量

编辑 [.env.local](/D:/a_my_project/draw_lzy/.env.local)：

```env
BLOB_READ_WRITE_TOKEN=
BLOB_ACCESS=private

KV_REST_API_READ_ONLY_TOKEN=
KV_REST_API_TOKEN=
KV_REST_API_URL=
KV_URL=
REDIS_URL=

UPSTASH_REDIS_REST_URL=$KV_REST_API_URL
UPSTASH_REDIS_REST_TOKEN=$KV_REST_API_TOKEN
```

说明：

- 不填 Redis / Blob 也能本地跑通基本流程，但只适合单实例开发测试
- 要测试真实双端同步与持久化，建议配置 `KV_REST_API_URL`、`KV_REST_API_TOKEN`、`BLOB_READ_WRITE_TOKEN`
- 如果 Blob store 是 private，建议显式加 `BLOB_ACCESS=private`

3. 启动开发环境

```bash
npm run dev
```

默认访问 [http://localhost:3000](http://localhost:3000)。

如需查看整局所有画作的回放管理页，可访问：

```txt
/admin
/admin/房间码
```

如果云端 Redis / Blob 不可用，但项目根目录保留了 `data/` 备份，后台会优先读取本地分析快照。要提取笔触动画和选区视频，打开：

```txt
/export
```

在页面中选择房间和轮次后，可以点击笔触进行保留/排除，或拖拽矩形选择输出区域，再按时间轴截取并导出视频。`data/` 目录只作为只读输入，不会被页面或导出流程改写。

## 常用命令

```bash
npm run dev
npm run lint
npm run build
npm run start
npm run export:json-video -- --input ./room-final.json --round-index 1 --output ./exports/round-1.webm
```

## 目录概览

```txt
src/
  app/                 页面与 API 路由
  components/          UI 与流程组件
  lib/                 常量、题库、纯逻辑、适配器
  lib/server/          房间服务与服务端存储
  store/               Zustand 房间状态
docs/
  architecture.md      业务逻辑与实现说明
specs/
  project-spec.md      原始规格
```

## 关键业务约束

- 固定双人，不支持观战
- 固定 6 轮，顺序为 `A-C-A-C-A-D`
- 不做关系定义类题目，不引导“我们之间是什么”
- 猜测者只做选择题，不做自由输入
- 实时同步粒度是 stroke，不是 point
- 每个 stroke 内部会记录从落笔到抬笔的轨迹时间序列，用于手写回放
- Blob 只做归档、分析快照和后台长期索引，不负责实时同步

## 当前实现取舍

- 实时层目前是“轮询事件流 + 房间刷新”的轻量实现，不是 WebSocket
- 房间内主流程集中在一个路由 `/room/[roomCode]`
- Canvas 优先本地绘制，再异步同步到服务端
- Blob 上传失败时会退回 data URL，保证流程不中断
- 长期历史优先依赖 Blob 归档，实时协作优先依赖 Redis / memory room store

## 已知限制

- `tmp-app/` 是早期脚手架残留目录，已被 `.gitignore` 忽略，但最好后续手动清理
- private Blob store 下虽然已补服务端代理读取，但如果后续要做更细粒度权限控制，建议补管理员鉴权
- 目前 Redis 读写使用 Upstash REST 变量，`REDIS_URL` 还未直接接入业务逻辑

## 验证状态

当前仓库最近一次改动后已通过：

- `npm run lint`
- `npm run build`
