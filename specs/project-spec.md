# 任意门（Dokodemo Door）— Codex 项目规格文档

## 1. 项目概述

**项目名：** 任意门（Dokodemo Door）

这是一个双人、双设备、面对面的抽象绘画小游戏。

核心目标不是传统“你画我猜”，而是：

* 借游戏外壳做轻量的情绪交流
* 通过抽象表达观察对方如何理解“现在”和“接下来”
* 避免出现明显的“关系定义”或“分别感”
* 首版先做成一个可上线分享、可完整游玩一局的 Web 产品

### 设计原则

1. **不逼关系表态**

   * 不做“我们之间是什么”
   * 不做“以后我们会怎样”
   * 不做明显的告别问卷感

2. **只做 A / C / D 三类题**

   * A = 状态感
   * C = 视角感
   * D = 漂移感
   * 不使用 B（关系感）

3. **猜测环节尽量简单**

   * 猜的人只做选择题
   * 不要求自由输入
   * 重点看“选择偏差”

4. **MVP 不做礼物页**

   * 但数据结构要为后续礼物页兼容

---

## 2. 目标用户与使用场景

### 目标场景

* 两个人面对面
* 各自拿一台手机或电脑
* 通过房间码进入同一局
* 在 20–30 分钟内完成 6 轮游戏

### 首版时长

* 默认 6 轮
* 每轮建议 3–4 分钟
* 总时长约 20–30 分钟

---

## 3. 首版范围（MVP）

### 必做

* 创建房间
* 加入房间
* 输入昵称
* 轮流作画
* 一笔一同步的远端画面更新
* 选择题猜测
* 结果揭晓
* 回合归档
* 全局回顾页
* 可部署到 Vercel
* Blob 持久化
* Redis 实时同步

### 不做

* 账号系统
* 登录/注册
* 礼物页生成
* 长图/PDF 导出
* AI 解读
* 实时语音/聊天
* 复杂社交功能
* 历史房间管理后台

---

## 4. 技术栈

### 前端

* Next.js (App Router)
* React
* JavaScript
* Tailwind CSS

### 画布

* HTML5 Canvas 2D API

### 持久化

* Vercel Blob

  * 存每轮画作 PNG
  * 存房间归档 JSON
  * 存 round-level JSON snapshot

### 实时层

* Redis-compatible realtime layer
* 允许通过增加 Redis 等方式实现
* 推荐设计为 **Realtime Adapter 抽象层**
* 默认适配目标：Redis / PubSub / SSE / WebSocket provider 均可
* 重点是接口抽象，不把实现写死在业务层

### 部署

* Vercel

---

## 5. 核心玩法

## 5.1 一局游戏流程

1. 玩家 A 创建房间
2. 玩家 B 输入房间码加入
3. 双方进入房间等待页
4. 系统开始第 1 轮
5. 本轮指定一名作画者和一名猜测者
6. 作画者收到一个抽象题目
7. 作画者先在题目对应的候选标签里，**私下选择自己的目标答案**
8. 作画者开始绘画
9. 每完成一笔，笔画同步给对方
10. 猜测者看到最终画面后，做两道选择题
11. 揭晓：系统展示

    * 题目
    * 作画者原本选择
    * 猜测者的选择
    * 是否一致 / 偏差位置
12. 存档该轮
13. 双方角色切换，进入下一轮
14. 共 6 轮结束后进入回顾页

---

## 5.2 为什么要让作画者先选“自己的答案”

这是首版的关键机制。

因为猜测者是做选择题，所以为了保证结果有可比较性，必须让作画者在作画前先定下：

* 这张画更像在说什么
* 这张画的感觉更接近哪个候选标签

否则揭晓时没有“标准答案”。

### 因此每轮结构是：

* **题目是开放的**
* **答案是半结构化的**
* **表达方式是抽象画**
* **比较对象是“你以为 vs 我本意”**

---

## 6. 题目体系

只使用三类题：

### A 类：状态感

关注最近、现在、情绪状态、生活节奏

### C 类：视角感

关注“你怎么看我 / 你怎么看自己 / 你理解到的状态”

### D 类：漂移感

关注接下来、变化、方向、还没发生但隐约在来的感觉

### 明确排除

* “我们之间”
* “关系定义”
* “距离”
* “留不留下”
* “失去”
* “舍不得”
* “以后我们会不会”

---

## 7. 回合结构

每轮固定包含以下阶段：

### Phase 1: 发题

系统发给作画者一个 prompt

### Phase 2: 作画者私下定答案

作画者先选择：

#### Q1. 这张画更像在说什么？

固定 4 选 1：

* 你自己
* 现在
* 最近的生活
* 接下来

#### Q2. 这张画的感觉更接近哪一个？

从当前题目绑定的 5–6 个候选标签里选 1 个

### Phase 3: 作画

* 用户可以自由画
* 每一笔完成时同步给另一台设备
* 同步单位是 **stroke**，不是每个 point 都单独发

### Phase 4: 猜测者答题

猜测者看画后，也回答同样两道选择题：

#### Q1. 这张画更像在说什么？

固定 4 选 1：

* 你自己
* 现在
* 最近的生活
* 接下来

#### Q2. 这张画的感觉更接近哪一个？

从同一组 5–6 个候选标签里选 1 个

### Phase 5: 揭晓

系统展示：

* 题目
* 作画者的 focusChoice
* 猜测者的 focusChoice
* 作画者的 vibeChoice
* 猜测者的 vibeChoice
* 匹配情况

### Phase 6: 存档并进入下一轮

---

## 8. 候选项设计规则

## 8.1 固定题：Focus 选项

每轮固定显示：

* 你自己
* 现在
* 最近的生活
* 接下来

说明：

* 不出现“我们”
* 不出现“关系”
* 不出现“我/你之间”
* 不让对方有被迫表态感

---

## 8.2 动态题：Vibe 选项

每个 prompt 绑定一组 5–6 个候选标签。

要求：

* 语义接近，但可区分
* 不要太重
* 不要太抽象到无法选
* 不要太像心理测试术语

### 候选标签风格示例

* 放晴
* 闷着
* 起风
* 慢下来
* 展开
* 还没定

或者：

* 清一点
* 卡一下
* 在转弯
* 往前走
* 收着
* 松一点

### 不建议使用的词

* 爱
* 失去
* 舍不得
* 疏远
* 承诺
* 关系
* 表白感过强的词

---

## 9. 题库初版

## 9.1 A 类：状态感

```json
[
  {
    "id": "A01",
    "category": "A",
    "text": "你觉得自己最近像哪种天气",
    "vibeOptions": ["放晴", "闷着", "起风", "飘着", "转阴", "还没定"]
  },
  {
    "id": "A02",
    "category": "A",
    "text": "把最近这段时间画成一种温度",
    "vibeOptions": ["偏暖", "发烫", "凉一点", "忽冷忽热", "常温", "说不准"]
  },
  {
    "id": "A03",
    "category": "A",
    "text": "如果你最近的状态是一种地形",
    "vibeOptions": ["平一点", "上坡", "下坡", "绕路", "有起伏", "卡在中间"]
  },
  {
    "id": "A04",
    "category": "A",
    "text": "最近更像在赶路，还是在停一停",
    "vibeOptions": ["赶路", "停一下", "边走边看", "绕一下", "被推着走", "还没开始"]
  },
  {
    "id": "A05",
    "category": "A",
    "text": "如果最近的情绪有底色，会是什么样",
    "vibeOptions": ["亮一点", "钝一点", "轻一点", "闷一点", "混在一起", "看不清"]
  },
  {
    "id": "A06",
    "category": "A",
    "text": "最近的生活更像直线、波浪，还是绕圈",
    "vibeOptions": ["直着走", "有波动", "绕圈", "断断续续", "突然转弯", "慢慢成形"]
  },
  {
    "id": "A07",
    "category": "A",
    "text": "如果现在是一种材质，它更像什么感觉",
    "vibeOptions": ["软一点", "硬一点", "脆一点", "黏一点", "轻一点", "不太稳定"]
  },
  {
    "id": "A08",
    "category": "A",
    "text": "把这几天的心情画成一种节奏",
    "vibeOptions": ["平稳", "乱拍", "慢拍", "有起伏", "一下快一下慢", "停住一下"]
  },
  {
    "id": "A09",
    "category": "A",
    "text": "如果最近是一张地图，它哪里最复杂",
    "vibeOptions": ["中间最乱", "边缘最乱", "有岔路", "绕不开", "还在铺开", "看起来简单其实不简单"]
  },
  {
    "id": "A10",
    "category": "A",
    "text": "你觉得这阵子的自己更像风、雾、雨，还是晴",
    "vibeOptions": ["有风", "起雾", "下雨", "放晴", "阴晴不定", "像在转天气"]
  }
]
```

---

## 9.2 C 类：视角感

```json
[
  {
    "id": "C01",
    "category": "C",
    "text": "如果把你眼里的我画出来，但不能画人",
    "vibeOptions": ["清一点", "忙一点", "收着", "展开", "稳住", "在转弯"]
  },
  {
    "id": "C02",
    "category": "C",
    "text": "你觉得我最近最像哪种节奏",
    "vibeOptions": ["加速", "慢一点", "断续", "有规律", "乱拍", "在找拍子"]
  },
  {
    "id": "C03",
    "category": "C",
    "text": "你觉得我最近藏得最好的情绪是什么",
    "vibeOptions": ["紧张", "平静", "在意", "犹豫", "期待", "说不清"]
  },
  {
    "id": "C04",
    "category": "C",
    "text": "如果要用一种颜色解释最近的我",
    "vibeOptions": ["亮色", "浅色", "暗色", "混色", "冷一点", "暖一点"]
  },
  {
    "id": "C05",
    "category": "C",
    "text": "你觉得我现在更像在整理，还是在赶路",
    "vibeOptions": ["在整理", "在赶路", "边整理边走", "先停一下", "被事情推着", "还在选方向"]
  },
  {
    "id": "C06",
    "category": "C",
    "text": "你觉得我最近最明显的一点变化",
    "vibeOptions": ["更稳了", "更急了", "更轻了", "更钝了", "更开了", "更收着了"]
  },
  {
    "id": "C07",
    "category": "C",
    "text": "你觉得我没说出来，但其实很明显的一件事",
    "vibeOptions": ["有点累", "有点赶", "有点在意", "有点期待", "有点躲开", "还不想说"]
  },
  {
    "id": "C08",
    "category": "C",
    "text": "你眼里的我，最近是展开的还是缩起来的",
    "vibeOptions": ["展开", "缩一点", "摇摆", "先观望", "慢慢打开", "说不准"]
  },
  {
    "id": "C09",
    "category": "C",
    "text": "你觉得我现在更像等待，还是决定",
    "vibeOptions": ["在等", "在决定", "先拖一下", "边走边定", "卡在中间", "已经有答案但没说"]
  },
  {
    "id": "C10",
    "category": "C",
    "text": "你第一眼会把最近的我归到哪一种气压里",
    "vibeOptions": ["低气压", "高气压", "平稳", "闷一下", "起风前", "转晴前"]
  }
]
```

---

## 9.3 D 类：漂移感

```json
[
  {
    "id": "D01",
    "category": "D",
    "text": "如果把接下来一小段时间画成一种方向",
    "vibeOptions": ["往前", "拐一下", "分岔", "慢慢开阔", "先停住", "说不准"]
  },
  {
    "id": "D02",
    "category": "D",
    "text": "你觉得很多事情接下来会变快，还是变慢",
    "vibeOptions": ["变快", "变慢", "忽快忽慢", "先缓一下", "慢慢推进", "还没启动"]
  },
  {
    "id": "D03",
    "category": "D",
    "text": "画一个还没发生，但你隐约觉得会来的东西",
    "vibeOptions": ["会靠近", "会展开", "会变清楚", "会有变化", "会绕一下", "还看不清"]
  },
  {
    "id": "D04",
    "category": "D",
    "text": "如果以后是一种颜色，它会先从哪里开始变",
    "vibeOptions": ["慢慢变", "一下就变", "先淡一点", "先亮一点", "先混在一起", "不好说"]
  },
  {
    "id": "D05",
    "category": "D",
    "text": "你觉得接下来更像门、桥，还是路口",
    "vibeOptions": ["像门", "像桥", "像路口", "像岔道", "像台阶", "像一段空白"]
  },
  {
    "id": "D06",
    "category": "D",
    "text": "把还不知道会怎样，但并不讨厌的感觉画出来",
    "vibeOptions": ["松一点", "有点悬", "还不错", "在试探", "慢慢来", "先放着"]
  },
  {
    "id": "D07",
    "category": "D",
    "text": "如果未来一小段时间是一种天气",
    "vibeOptions": ["晴一点", "起风", "有雾", "会下雨", "阴转晴", "阴晴不定"]
  },
  {
    "id": "D08",
    "category": "D",
    "text": "你觉得接下来是展开、分岔，还是慢慢成形",
    "vibeOptions": ["展开", "分岔", "成形", "暂时搁着", "还在转弯", "说不准"]
  },
  {
    "id": "D09",
    "category": "D",
    "text": "画一种可能会变，但不一定是坏事的东西",
    "vibeOptions": ["会松开", "会换方向", "会长出来", "会模糊一下", "会更清楚", "还不能说"]
  },
  {
    "id": "D10",
    "category": "D",
    "text": "画一个先别急着下结论的以后",
    "vibeOptions": ["先等等", "会明朗", "要绕一下", "边走边看", "暂时空白", "有点答案了"]
  }
]
```

---

## 10. 抽题规则

MVP 固定 6 轮，推荐分布：

* A：3 题
* C：2 题
* D：1 题

顺序建议：

1. A
2. C
3. A
4. C
5. A
6. D

### 抽题规则

* 同一局内不重复 prompt
* 不连续出现过于相似的 vibeOptions
* 前 4 轮尽量不出现太强“未来感”
* 第 6 轮才允许最明显的 D 类题

---

## 11. 页面结构

## 11.1 首页 `/`

内容：

* 标题：任意门
* 副标题：画的不是东西，是最近、现在，和一点点接下来
* 按钮：

  * 创建房间
  * 加入房间

---

## 11.2 创建房间页 `/create`

内容：

* 输入昵称
* 创建按钮
* 成功后进入 room

---

## 11.3 加入房间页 `/join`

内容：

* 房间码
* 昵称
* 加入按钮

---

## 11.4 房间等待页 `/room/[roomCode]`

内容：

* 房间码
* 双方昵称
* 当前连接状态
* 开始按钮（房主可见）

---

## 11.5 回合准备页

内容：

* 当前轮数
* 当前作画者
* 当前猜测者
* 作画者私密看到题目
* 作画者先完成两道预设选择

---

## 11.6 作画页

内容：

* Canvas
* 颜色选择
* 笔刷粗细
* 橡皮
* 撤销最近一笔
* 清空画布
* 完成按钮

要求：

* 每一笔结束时发送 stroke event
* 远端同步渲染该 stroke
* 本地和远端都能看到当前累计结果

---

## 11.7 猜测页

内容：

* 展示最终画面
* 两道选择题
* 提交按钮

---

## 11.8 揭晓页

内容：

* 题目
* 作画者原始选择
* 猜测者选择
* 对比结果
* 下一轮按钮

---

## 11.9 回顾页 `/room/[roomCode]/summary`

内容：

* 6 张画作缩略图
* 每轮题目
* 每轮双方选择
* 每轮匹配情况
* 总体统计

### 可展示统计

* focusChoice 命中次数
* vibeChoice 命中次数
* 偏差最大轮次
* 最接近轮次

---

## 12. UI 风格

### 整体感觉

* 轻一点
* 稍微俏皮
* 不文青过头
* 不像心理测试

### 视觉方向

* 移动端优先
* 卡片式布局
* 低饱和配色
* 留白感
* 按钮与提示语轻松

### 文案风格

推荐：

* “先画个大概”
* “别太具体”
* “你先猜一个”
* “这轮先这样”
* “看看你们是不是想到一块去了”

避免：

* “请认真表达你的内心”
* “探索你们之间的关系”
* “揭示真实情感”
* “记录离别前夕”

---

## 13. 实时同步设计

## 13.1 总原则

* 不使用 Blob 做实时同步
* Blob 只做归档和持久化
* 活跃房间状态与逐笔广播由实时层负责

## 13.2 同步粒度

同步单位是 **stroke**，不是 point。

### 一个 stroke 应包含

* strokeId
* roomCode
* roundId
* playerId
* color
* size
* tool
* points: [{x, y, t}, ...]
* createdAt

### 发送时机

* pointerdown 开始缓存
* pointermove 本地绘制并收集 points
* pointerup 后一次性发送整个 stroke

### 这样做的原因

* 实现简单
* 网络包更稳定
* 远端看到的是“一笔一同步”
* 满足需求，不做超高频点同步

---

## 13.3 实时层抽象

必须实现 `RealtimeAdapter` 接口，业务代码不直接依赖某个服务商。

### RealtimeAdapter 接口

```js
connect(roomCode, playerId)
disconnect()
subscribeToRoomEvents(roomCode, handler)
publishStroke(roomCode, payload)
publishPresence(roomCode, payload)
publishRoundState(roomCode, payload)
```

### 房间事件类型

* `presence.join`
* `presence.leave`
* `round.started`
* `stroke.created`
* `canvas.cleared`
* `round.submitted`
* `guess.submitted`
* `round.revealed`
* `game.finished`

---

## 13.4 Redis 责任

活跃局期间，Redis 保存：

* room state
* player presence
* current round metadata
* recent stroke events
* summary counters
* TTL-based cleanup

### 建议 TTL

* 活跃房间：24 小时
* 回合级缓存：24 小时
* presence：短 TTL + heartbeat

---

## 14. Blob 存储设计

Blob 用于 durable artifacts。

### 存储内容

1. 每轮最终画作 PNG
2. 每轮 round JSON
3. 整局 summary JSON

### 建议路径

* `rooms/{roomCode}/rounds/{roundId}/drawing.png`
* `rooms/{roomCode}/rounds/{roundId}/round.json`
* `rooms/{roomCode}/summary.json`

### 上传策略

* 画作完成后，前端将 canvas 导出为 blob/file
* 使用 Blob client upload
* 服务端记录返回 URL 到 round metadata 中
  Blob 支持浏览器直传，适合这里的图片持久化。([Vercel][1])

---

## 15. 数据模型

## 15.1 Room

```js
{
  "roomCode": "AB12CD",
  "status": "waiting | playing | finished",
  "hostPlayerId": "p1",
  "players": [
    { "playerId": "p1", "nickname": "A" },
    { "playerId": "p2", "nickname": "B" }
  ],
  "currentRoundIndex": 0,
  "totalRounds": 6,
  "roundIds": [],
  "createdAt": 0,
  "updatedAt": 0
}
```

## 15.2 Round

```js
{
  "roundId": "r1",
  "roomCode": "AB12CD",
  "roundIndex": 1,
  "drawerPlayerId": "p1",
  "guesserPlayerId": "p2",
  "promptId": "A03",
  "promptCategory": "A",
  "promptText": "如果你最近的状态是一种地形",
  "drawerIntent": {
    "focusChoice": "现在",
    "vibeChoice": "有起伏"
  },
  "guesserAnswer": {
    "focusChoice": "最近的生活",
    "vibeChoice": "绕路"
  },
  "drawing": {
    "strokeCount": 12,
    "imageUrl": "https://...",
    "width": 1024,
    "height": 1024
  },
  "result": {
    "focusMatched": false,
    "vibeMatched": false,
    "score": 0
  },
  "createdAt": 0,
  "revealedAt": 0
}
```

## 15.3 Stroke

```js
{
  "strokeId": "s1",
  "roomCode": "AB12CD",
  "roundId": "r1",
  "playerId": "p1",
  "tool": "pen",
  "color": "#334155",
  "size": 6,
  "points": [
    { "x": 120, "y": 240, "t": 1711111111111 },
    { "x": 125, "y": 248, "t": 1711111111123 }
  ],
  "createdAt": 1711111111133
}
```

---

## 16. API 设计

## 16.1 房间相关

### `POST /api/rooms/create`

输入：

```json
{ "nickname": "Javier" }
```

输出：

```json
{
  "roomCode": "AB12CD",
  "playerId": "p1"
}
```

### `POST /api/rooms/join`

输入：

```json
{
  "roomCode": "AB12CD",
  "nickname": "Friend"
}
```

输出：

```json
{
  "roomCode": "AB12CD",
  "playerId": "p2"
}
```

### `POST /api/rooms/start`

输入：

```json
{ "roomCode": "AB12CD" }
```

输出：

```json
{ "ok": true }
```

---

## 16.2 回合相关

### `POST /api/rounds/start`

生成下一轮 prompt 与角色分配。

### `POST /api/rounds/:roundId/intent`

作画者提交自己的预设选择：

```json
{
  "focusChoice": "现在",
  "vibeChoice": "有起伏"
}
```

### `POST /api/rounds/:roundId/submit-drawing`

* 上传最终 PNG 到 Blob
* 记录 strokeCount / imageUrl

### `POST /api/rounds/:roundId/guess`

猜测者提交答案：

```json
{
  "focusChoice": "最近的生活",
  "vibeChoice": "绕路"
}
```

### `POST /api/rounds/:roundId/reveal`

服务端计算匹配结果并完成归档。

---

## 16.3 实时相关

具体 transport 可按 provider 决定，但前端需要这些能力：

* 订阅房间事件
* 发布笔画事件
* 发布清空画布事件
* 发布 presence 心跳
* 发布 round state 变更

---

## 17. 状态管理

前端建议拆分为：

### 本地 UI State

* 当前颜色
* 当前笔刷大小
* 当前 tool
* 当前 stroke buffer
* 页面 loading 状态

### 远端同步 State

* 房间状态
* 玩家 presence
* 当前 round
* 远端 strokes
* 揭晓结果

建议：

* 用 React Context 或 Zustand 管房间状态
* Canvas 自身状态与 React 状态适当隔离
* 不要把所有 points 都塞进深层 React render 链路

---

## 18. 画布实现要求

### 功能

* 画笔
* 橡皮
* 撤销最近一笔
* 清空画布
* 支持触控与鼠标
* 支持高 DPR 屏幕

### 性能要求

* 本地绘制优先
* 同步时只发送 stroke payload
* 远端重放 stroke 绘制
* 不要求逐点双向毫秒级同步

### 撤销规则

* 仅撤销本轮自己最近一笔
* 撤销需要广播一个事件，或重新广播当前 stroke list 快照

MVP 推荐：

* 直接维护当前 round 的 `strokes[]`
* 撤销时广播 `canvas.replaceAllStrokes`

---

## 19. 回顾页统计逻辑

首版不做礼物页，但需要一个简单回顾页。

### 统计指标

* 总轮数
* focusChoice 命中次数
* vibeChoice 命中次数
* “最接近的一轮”
* “偏差最大的一轮”

### 匹配规则

* focusMatched = drawerIntent.focusChoice === guesserAnswer.focusChoice
* vibeMatched = drawerIntent.vibeChoice === guesserAnswer.vibeChoice
* score:

  * 2 = 全中
  * 1 = 中一个
  * 0 = 都没中

---

## 20. 错误处理与边界条件

必须处理：

* 房间码无效
* 房间已满
* 玩家断线重连
* 刷新页面后恢复当前局
* 实时层短暂不可用
* Blob 上传失败
* 轮次状态不同步
* 一方提前退出

### 断线策略

* Redis 中保存活跃 room state
* 页面刷新后根据 localStorage 的 roomCode/playerId 尝试恢复
* 若实时层重连成功，自动重新订阅房间事件

---

## 21. 本地存储策略

浏览器 localStorage 保存：

```json
{
  "roomCode": "AB12CD",
  "playerId": "p1",
  "nickname": "A"
}
```

用途：

* 刷新恢复
* 短时断线重连
* 防止误退出丢失身份

---

## 22. 目录结构建议

```txt
/app
  /page.js
  /create/page.js
  /join/page.js
  /room/[roomCode]/page.js
  /room/[roomCode]/summary/page.js
  /api
    /rooms/create/route.js
    /rooms/join/route.js
    /rooms/start/route.js
    /rounds/start/route.js
    /rounds/[roundId]/intent/route.js
    /rounds/[roundId]/submit-drawing/route.js
    /rounds/[roundId]/guess/route.js
    /rounds/[roundId]/reveal/route.js

/components
  RoomLobby.js
  PromptCard.js
  IntentPicker.js
  DrawingCanvas.js
  GuessPicker.js
  RevealCard.js
  SummaryBoard.js
  PresenceBadge.js

/lib
  prompts.js
  room-code.js
  blob.js
  redis.js
  realtime-adapter.js
  round-engine.js
  scoring.js
  storage.js
  validators.js

/store
  useRoomStore.js

/styles
  globals.css
```

---

## 23. 实现优先级

### P0

* 创建/加入房间
* 开始游戏
* 轮流发题
* 作画
* 一笔一同步
* 选择题猜测
* 揭晓
* Blob 上传
* 回顾页

### P1

* 刷新恢复
* 更稳的撤销逻辑
* presence 提示
* 异常态兜底
* 更好的移动端适配

### P2

* 更丰富的题库
* 更细致的动画
* 学期末礼物模式（后续版本）

---

## 24. 验收标准

以下全部满足，视为 MVP 完成：

1. 两台设备可以通过房间码进入同一局
2. 一局固定 6 轮，轮流作画
3. 每轮作画者可看到 prompt，并先选择自己的隐藏答案
4. 每一笔结束后，对方设备能看到更新
5. 猜测者只通过选择题完成作答
6. 揭晓时能看到双方选择是否一致
7. 每轮画作会被上传保存
8. 整局结束后可以查看回顾页
9. 无需登录
10. 可部署到 Vercel 正常运行

---

## 25. 对 Codex 的实现要求

1. 使用 **JavaScript**，不要改成 TypeScript
2. 优先保证结构清晰、MVP 能跑通
3. 不要引入重型复杂状态机库
4. 业务逻辑保持模块化
5. Realtime 层必须做成可替换适配器
6. 不要把“关系感/B 类题目”加回去
7. 首版不要实现礼物页
8. UI 以移动端优先
9. 所有中文文案保持轻松、自然，不要像心理测试
10. 代码中为后续礼物页保留 summary 数据结构扩展位

---

## 26. 未来版本预留

虽然首版不做，但数据结构要为后续这些功能兼容：

* 学期末礼物页
* 长图导出
* 更丰富的 summary
* 关键词统计
* 自定义题库
* 私密分享链接

---

## 27. 最后约束

这个项目的本质定义是：

> 一个用抽象图形交换“状态、视角和一点点未来感”的双人小游戏。

不是：

* 关系测试
* 告别问卷
* 心理测验
* 情感表态工具

所有实现细节都必须服从这个定义。
