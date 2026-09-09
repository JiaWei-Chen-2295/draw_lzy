# 任意门（Dokodemo Door）架构与实现说明

## 1. 项目目标

任意门的产品定义不是“你画我猜”，而是一个双人面对面的轻量情绪交换游戏。

MVP 要解决的是：

- 两个人可以用房间码进入同一局
- 在 6 轮里轮流作画与猜测
- 比较“我本来想表达什么”和“你以为我在表达什么”
- 在不做关系定义的前提下，保留有趣的偏差

当前实现严格围绕这件事，不扩展到账户、礼物页、长图导出、聊天等功能。

## 2. 业务流程

一局游戏分为以下阶段：

1. 玩家 A 创建房间并获得 `roomCode`
2. 玩家 B 使用 `roomCode` 加入
3. 房主开始游戏
4. 系统创建当前轮次并分配角色
5. 作画者先提交隐藏答案 `drawerIntent`
6. 作画者绘制抽象画，按 stroke 同步
7. 作画者提交最终画面 PNG
8. 猜测者提交两道选择题答案 `guesserAnswer`
9. 服务端揭晓并计算结果
10. 如果未满 6 轮，进入下一轮；否则生成 summary

回合阶段在代码中以 `phase` 表示，当前实现使用：

- `intent`
- `drawing`
- `guessing`
- `revealed`

## 3. 题目与回合规则

题目定义在 [prompts.js](/D:/a_my_project/draw_lzy/src/lib/prompts.js)。

当前规则：

- 总轮数固定 6 轮
- 题型顺序固定 `A-C-A-C-A-D`
- 同一局内 prompt 不重复
- A/C/D 的语义边界遵循规格文档，不引入 B 类“关系感”

回合创建逻辑位于 [round-engine.js](/D:/a_my_project/draw_lzy/src/lib/round-engine.js)，由 [room-service.js](/D:/a_my_project/draw_lzy/src/lib/server/room-service.js) 调用。

当前实现的角色切换策略：

- 第 1、3、5 轮由第一个加入的玩家作画
- 第 2、4、6 轮由第二个加入的玩家作画

## 4. 数据模型

核心数据都挂在 Room 对象下。

### 4.1 Room

Room 是当前实现的聚合根，包含：

- `roomCode`
- `status`
- `hostPlayerId`
- `players`
- `currentRoundIndex`
- `currentRoundId`
- `totalRounds`
- `roundIds`
- `roundsById`
- `summary`
- `analysis`

### 4.2 Round

Round 记录一轮完整上下文：

- 轮次索引
- 作画者与猜测者
- prompt 与 vibeOptions
- `drawerIntent`
- `guesserAnswer`
- `strokes`
- `drawing`
- `result`
- `phase`

### 4.3 Stroke

Stroke 是实时同步的最小单位，不逐点发送。

每个 stroke 包含：

- `strokeId`
- `roomCode`
- `roundId`
- `playerId`
- `tool`
- `color`
- `size`
- `points`
- `createdAt`
- `startedAt`
- `endedAt`
- `durationMs`

其中 `points[]` 内的每个点除了 `x/y` 外，还会记录：

- `t`
- `pressure`

## 5. 服务端实现

服务端核心入口在 [room-service.js](/D:/a_my_project/draw_lzy/src/lib/server/room-service.js)。

它负责：

- 创建与加入房间
- 开始游戏与开始下一轮
- 提交 intent
- 记录 stroke / 清空 / 替换 strokes
- 提交 drawing
- 提交 guess
- 揭晓并生成 summary
- presence 更新

### 5.1 服务边界

`room-service` 是当前业务事实来源，前端不直接改业务状态，只通过 API 调它。

### 5.2 状态推进

状态推进是顺序式的：

- `startRoom` 把房间从 `waiting` 推到 `playing`
- `startNextRound` 创建新 round
- `submitIntent` 把 round 从 `intent` 推到 `drawing`
- `submitDrawing` 把 round 推到 `guessing`
- `revealRound` 把 round 推到 `revealed`

当前实现没有严格防重/幂等控制，也没有复杂状态机库，优先保证 MVP 跑通。

### 5.3 分析归档

服务端会在关键状态变更后同步维护分析快照：

- 过程态持续刷新 `latest.json`
- 房间结束时固化 `final.json`
- 同步更新 Blob 中的 `analysis/archive-index.json`

这层归档的目的不是替代实时 room store，而是为：

- 后台房间列表
- 历史回放
- 离线分析
- 后续派生能力

提供长期可读的数据底座。

## 6. API 设计

API 基本对应规格中的业务动作。

### 房间相关

- `POST /api/rooms/create`
- `POST /api/rooms/join`
- `POST /api/rooms/start`
- `GET /api/rooms/[roomCode]`
- `GET /api/admin/rooms`

### 回合相关

- `POST /api/rounds/start`
- `POST /api/rounds/[roundId]/intent`
- `POST /api/rounds/[roundId]/submit-drawing`
- `POST /api/rounds/[roundId]/guess`
- `POST /api/rounds/[roundId]/reveal`

### 实时相关

- `GET /api/realtime/events`
- `POST /api/realtime/publish`
- `POST /api/realtime/presence`

错误映射集中在 [api.js](/D:/a_my_project/draw_lzy/src/lib/server/api.js)。

## 7. 前端流程实现

房间主流程集中在 [RoomExperience.js](/D:/a_my_project/draw_lzy/src/components/RoomExperience.js)。

当前设计有两个关键取舍：

- 房间内所有阶段都在 `/room/[roomCode]` 一个路由里切换
- 页面逻辑优先看当前 round 的 `phase` 和当前用户角色

这样做的原因：

- 减少多页面切换带来的状态同步复杂度
- MVP 更容易打通双端联调
- 用户刷新后可以只靠房间状态恢复，不必恢复多个子路由

### 7.1 前端状态来源

前端房间状态主要来自两部分：

- 服务端 room 快照
- 当前作画端的本地草稿 `localDraft`

本地草稿的存在是为了解决网络往返期间“自己刚画的那一笔被旧状态覆盖”的问题。

### 7.2 角色判断

`RoomExperience` 基于：

- `currentRound.drawerPlayerId`
- `currentRound.guesserPlayerId`
- 当前 `session.playerId`

来决定渲染：

- Lobby
- IntentPicker
- DrawingCanvas
- GuessPicker
- RevealCard

### 7.3 Admin 后台

当前新增了两层后台页面：

- `/admin`：展示所有房间、玩家、状态、创建时间、更新时间与当前轮次
- `/admin/[roomCode]`：查看该房间完整历史与逐轮回放

后台详情页优先读取实时 room；如果实时存储已过期，则退回 Blob 中的 `final.json` 归档。

## 8. Canvas 实现

画布逻辑在 [DrawingCanvas.js](/D:/a_my_project/draw_lzy/src/components/DrawingCanvas.js)。

### 8.1 绘制策略

当前采用“本地优先绘制”：

- `pointerdown` 开始缓存 points
- `pointermove` 直接在本地 canvas 上画线
- `pointerup` 生成完整 stroke 并通知上层提交

为了支持手写感回放，当前会在本地录制：

- 落笔时间 `startedAt`
- 抬笔时间 `endedAt`
- 每个采样点的时间 `t`
- 可用时记录 pointer pressure

这样仍然保持“按 stroke 同步”，但一笔内部已经带完整运笔轨迹。

这样用户不会感觉每一笔都依赖网络确认。

### 8.2 同步粒度

同步单位是 stroke，不是 point。

原因：

- 结构简单
- 网络包更稳定
- 足够满足“一笔一同步”的业务需求

### 8.3 增量重绘

这是当前实现里专门做过优化的一点。

早期版本会在 `strokes` 每次变化时全量清空并重画，导致：

- 网络慢时，旧状态可能把画布短暂“刷回去”
- 一些历史笔画会延迟重新冒出来

现在的策略是：

- 新增 stroke 时只做增量绘制
- 只有在这些情况下才全量重绘：
  - 切回合
  - 撤销或清空导致笔画数减少
  - stroke 顺序前缀变化
  - canvas 尺寸变化

### 8.4 撤销策略

当前撤销不是“命令式撤销事件”，而是：

- 维护当前回合的 `strokes[]`
- 撤销时生成新的 stroke 列表
- 通过 `canvas.replaceAllStrokes` 同步整份列表

这是 MVP 下实现最稳妥、最容易对齐双端画面的方案。

### 8.5 录制与重放

揭晓阶段新增了手写回放画布：

- 读取 stroke 内部的时间序列
- 按落笔先后和每个点的 `t` 逐步重绘
- 保留从起笔、运笔到收笔的完整过程
- 支持暂停、继续、重新播放和拖动进度条

这层能力不改变服务端实时同步粒度，只扩展 stroke 的表现力。

## 9. 实时同步实现

当前实时层是一个“事件流轮询适配器”，实现位于 [realtime-adapter.js](/D:/a_my_project/draw_lzy/src/lib/realtime-adapter.js)。

### 9.1 为什么不是 WebSocket

MVP 阶段优先做了更轻的方案：

- 前端轮询 `GET /api/realtime/events`
- 服务端把房间事件追加到 room event list
- 前端收到事件后刷新房间快照

优点：

- 实现轻
- 易部署
- 不需要额外连接层基础设施

缺点：

- 实时性一般
- 仍然会有“事件到了，但房间快照尚未完全一致”的窗口
- 不适合高并发或更复杂协作场景

### 9.2 事件类型

当前用到的事件类型定义在 [constants.js](/D:/a_my_project/draw_lzy/src/lib/constants.js)：

- `presence.join`
- `presence.leave`
- `round.started`
- `stroke.created`
- `canvas.cleared`
- `canvas.replaceAllStrokes`
- `round.submitted`
- `guess.submitted`
- `round.revealed`
- `game.finished`
- `room.updated`

## 10. 存储实现

### 10.1 Room / Event 存储

存储实现在 [room-store.js](/D:/a_my_project/draw_lzy/src/lib/server/room-store.js)。

它支持两种模式：

1. Upstash Redis REST
2. 进程内 memory fallback

触发 Redis 模式的条件：

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

没有这两个变量时，退回内存模式。

### 10.2 Memory fallback 的边界

memory fallback 只适合本地单实例开发，因为：

- 进程重启会丢数据
- 多实例之间不能共享房间状态
- 不适合 Vercel 线上真实联机

### 10.3 Blob 存储

Blob 上传在 [blob.js](/D:/a_my_project/draw_lzy/src/lib/blob.js)。

当前策略：

- 配置了 `BLOB_READ_WRITE_TOKEN` 时尝试上传
- 可通过 `BLOB_ACCESS` 指定 `public` 或 `private`
- 上传失败时退回 data URL，保证流程不中断

这是故意做的稳定性兜底，因为 MVP 的目标是先保证一局能完整走完。

目前 Blob 中有三类主要归档：

1. 画作资产
   - `drawing.png`
   - `drawing.svg`
2. 分析快照
   - `rooms/{roomCode}/analysis/latest.json`
   - `rooms/{roomCode}/analysis/final.json`
3. 全局归档索引
   - `analysis/archive-index.json`

分析快照内会写入：

- `schemaVersion`
- `snapshotType`
- `room`
- `events`
- `stats`

### 10.4 Private Blob 的边界

如果 Blob store 是 private：

- 上传本身可以成功
- 但 `blob.url` 不一定适合直接在前端长期展示

所以当前实现更偏“先保证有归档载体”，而不是“完整的私有访问控制设计”。
后续如果要正式使用 private store，建议补：

- 服务端代理读取
- 管理员鉴权
- 或带签名的临时访问 URL

## 11. 会话恢复

浏览器本地会话保存在 [storage.js](/D:/a_my_project/draw_lzy/src/lib/storage.js)。

保存内容：

- `roomCode`
- `playerId`
- `nickname`

恢复方式：

- 进入房间页时读取 localStorage
- 如果 `roomCode` 匹配当前路径，则恢复 session
- 然后重新请求当前房间状态

这个机制解决的是：

- 用户刷新页面
- 用户误关页面后重新打开
- 同一设备短时间回到房间

## 12. 结果计算与 summary

结果计算在 [scoring.js](/D:/a_my_project/draw_lzy/src/lib/scoring.js)。

规则很简单：

- focus 相同记 1
- vibe 相同记 1
- 总分 `0 ~ 2`

summary 当前包含：

- `totalRounds`
- `focusHits`
- `vibeHits`
- `closestRoundId`
- `biggestDriftRoundId`
- `giftPageReserved`

`giftPageReserved` 是为后续礼物页预留的扩展位。

## 13. 错误边界

当前系统已覆盖一批基础错误：

- 房间不存在
- 房间已满
- 房间已开始
- 非房主开始游戏
- 玩家未准备齐
- round 不存在
- 非作画者提交 intent / drawing
- 非猜测者提交 guess
- playerId 找不到

但还没有完全覆盖的边界包括：

- 更强的并发提交保护
- round phase 的严格一致性校验
- 一方断线太久后的强制收尾策略
- Private Blob 归档的正式可读方案
- `REDIS_URL` 直连模式

## 14. 当前已知问题与技术债

### 14.1 实时层仍偏粗粒度

虽然已经通过：

- 本地草稿
- Canvas 增量绘制

改善了体验，但房间状态刷新仍然是“事件 + 全量 room 快照”的组合，理论上仍有同步窗口。

### 14.2 `saveRoom` 中 round 索引写入方式较粗糙

这项问题已处理，当前 Redis round 索引写入已改成显式 `Promise.all`。

当前剩余风险更多在于：

- room 数据与 archive-index 之间还不是事务式提交
- Blob 归档更新失败时没有单独重试队列

### 14.3 Redis 事件流没有裁剪策略细化

当前只做了简单保留最近 300 条 memory event，Redis 侧也只是挂 TTL，没有更精细的裁剪和消费确认。

### 14.4 `tmp-app/` 目录残留

这是早期脚手架目录，目前已被 `.gitignore` 忽略，但建议后续手动清理。

## 15. 推荐后续演进

如果继续迭代，建议优先级如下：

1. 把实时层升级为真正的推送通道
2. 强化服务端 phase 校验和幂等保护
3. 给 Blob 归档补重试 / 校验 / 管理员鉴权
4. 把 Redis 与 Blob 写路径整理为更稳定的事务式风格
5. 把 summary 结构扩展成礼物页与分析层可复用的数据源

## 16. 关键文件索引

- 页面入口：[src/app/page.js](/D:/a_my_project/draw_lzy/src/app/page.js)
- 后台列表：[src/components/AdminRoomsClient.js](/D:/a_my_project/draw_lzy/src/components/AdminRoomsClient.js)
- 后台详情：[src/components/AdminReplayClient.js](/D:/a_my_project/draw_lzy/src/components/AdminReplayClient.js)
- 房间流程：[src/components/RoomExperience.js](/D:/a_my_project/draw_lzy/src/components/RoomExperience.js)
- 画布实现：[src/components/DrawingCanvas.js](/D:/a_my_project/draw_lzy/src/components/DrawingCanvas.js)
- 回放实现：[src/components/StrokeReplayCanvas.js](/D:/a_my_project/draw_lzy/src/components/StrokeReplayCanvas.js)
- 笔迹播放器：[src/lib/stroke-player.js](/D:/a_my_project/draw_lzy/src/lib/stroke-player.js)
- 回合服务：[src/lib/server/room-service.js](/D:/a_my_project/draw_lzy/src/lib/server/room-service.js)
- 房间存储：[src/lib/server/room-store.js](/D:/a_my_project/draw_lzy/src/lib/server/room-store.js)
- 实时适配器：[src/lib/realtime-adapter.js](/D:/a_my_project/draw_lzy/src/lib/realtime-adapter.js)
- Blob 上传：[src/lib/blob.js](/D:/a_my_project/draw_lzy/src/lib/blob.js)
- 题库定义：[src/lib/prompts.js](/D:/a_my_project/draw_lzy/src/lib/prompts.js)
- 回合规则：[src/lib/round-engine.js](/D:/a_my_project/draw_lzy/src/lib/round-engine.js)
- 结果计算：[src/lib/scoring.js](/D:/a_my_project/draw_lzy/src/lib/scoring.js)
