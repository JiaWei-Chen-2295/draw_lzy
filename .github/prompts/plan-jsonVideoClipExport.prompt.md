## Plan: JSON 笔画视频剪辑导出界面

在现有 Next.js 项目中新增 `/export` 页面，提供可视化笔画视频剪辑工具。用户导入 JSON 或从 `data/` 目录选择房间数据，在浏览器内预览笔画回放，通过**矩形框选**裁剪区域、**点击选择/排除**笔画、**双滑块时间轴**裁剪时间范围，最终调用服务端 API（ffmpeg + ProRes 4444）导出透明背景 `.mov` 视频。

---

### Phase 1: 数据加载层

**Step 1** — 新增 API 列出本地房间快照
- 新建 `src/app/api/export/snapshots/route.js`
- 扫描 `data/rooms/*/analysis/{final,latest}.json`，返回列表
- 复用 `interactive-json-video.mjs` 中 `collectSnapshots()` 的扫描逻辑

**Step 2** — 新增 API 读取指定快照轮次数据
- 新建 `src/app/api/export/snapshots/[roomCode]/route.js`
- 返回该房间所有轮次信息及完整 strokes 数据

### Phase 2: 前端剪辑界面

**Step 3** — 新建页面入口 `src/app/export/page.js`
- 渲染 `ExportClient` 组件

**Step 4** — 新建核心组件 `src/components/ExportClient.js`
- **数据源面板**：本地上传 JSON + 从已有房间下拉选择 → 选轮次加载 strokes
- **预览画布**：复用 `stroke-player.js` 的 `drawStrokeToElapsed` 渲染，透明底+棋盘格提示

**Step 5** — 笔画选择功能
- 点击画布上的笔画 → hit-test（点到线段距离检测）→ 高亮/排除
- 被排除的笔画半透明灰显，排除后不参与导出

**Step 6** — 矩形区域裁剪
- 切换到"裁剪"模式，拖拽画布绘制矩形
- 虚线+半透明遮罩显示裁剪区域，可拖拽移动/调整大小
- 显示 x, y, w, h 数值

**Step 7** — 时间轴裁剪
- 双滑块 range slider 控制 startMs / endMs
- 播放/暂停/seek，预览回放选中笔画在裁剪区域内的效果

### Phase 3: 服务端导出

**Step 8** — 提取渲染模块 `src/lib/server/video-renderer.js`
- 从 `scripts/export-json-video.mjs` 抽出所有纯渲染函数（`renderFrame`, `encodeVideo`, `parseColor` 等）
- CLI 脚本改为 import 该模块，保持原有 CLI 可用

**Step 9** — 新增导出 API `src/app/api/export/render/route.js`
- 接收 POST：`{ strokes, crop, startMs, endMs, fps, format }`
- 调用 video-renderer 模块 + ffmpeg 编码
- 流式返回 .mov 文件，前端自动下载

**Step 10** — 前端导出触发
- "导出"按钮 POST 配置到 API，显示 spinner，完成后自动下载

### Phase 4: 集成入口

**Step 11** — 首页添加"剪辑导出"链接，`/admin` 房间列表添加"导出视频"快捷入口

---

### Relevant Files

| 文件 | 操作 |
|------|------|
| `scripts/export-json-video.mjs` | 提取核心渲染函数到新模块，CLI 改为 import |
| `src/lib/stroke-player.js` | 复用 `normalizeStrokes`, `drawStrokeToElapsed` 做前端预览 |
| `src/components/StrokeReplayCanvas.js` | 参考时间轴/播放控制模式 |
| `src/lib/constants.js` | 复用 `DEFAULT_CANVAS` |
| `src/app/page.js` | 添加导航入口 |
| `src/components/AdminRoomsClient.js` | 添加导出快捷链接 |
| **新建** `src/app/export/page.js` | 页面入口 |
| **新建** `src/components/ExportClient.js` | 剪辑界面主组件 |
| **新建** `src/lib/server/video-renderer.js` | 从 CLI 提取的渲染模块 |
| **新建** `src/app/api/export/snapshots/route.js` | 列出快照 API |
| **新建** `src/app/api/export/snapshots/[roomCode]/route.js` | 读取快照 API |
| **新建** `src/app/api/export/render/route.js` | 服务端视频渲染 API |

---

### Verification

1. `npm run lint` 通过
2. `npm run build` 通过
3. 上传 final.json → 选轮次 → 预览回放正常
4. 点击笔画选中/排除 → 预览正确反映
5. 拖拽矩形裁剪 → 遮罩和数值正确
6. 调整时间轴 → 回放对应时间段
7. 点击导出 → 服务端生成 .mov → 自动下载
8. 原有 CLI `npm run export:json-video` 仍然可用
9. `/admin` 页面导出链接跳转正确
---

### Decisions

- **格式**：ProRes 4444 (.mov)，专业剪辑软件无损透明
- **分辨率**：默认 1024x1024，裁剪后按裁剪区域尺寸
- **渲染侧**：服务端 Node.js + ffmpeg（需机器安装 ffmpeg）
- **笔画选择**：画布点击 hit-test，非列表勾选
- **不在 scope 内**：批量导出、WebM 支持（仅 ProRes）、AI 识别、分享功能
