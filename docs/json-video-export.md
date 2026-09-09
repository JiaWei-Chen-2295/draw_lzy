# JSON 透明视频导出

这个脚本复用了项目当前持久化 JSON 的 stroke 结构：

- 输入可直接使用 `rooms/{roomCode}/analysis/latest.json`
- 也可使用 `rooms/{roomCode}/analysis/final.json`
- 或者直接传 `room` 快照 / 单轮 `round` 快照

导出时会按项目里已有的时间字段重建回放：

- `stroke.startedAt`
- `stroke.endedAt`
- `stroke.points[].t`
- `stroke.points[].pressure`

背景默认透明，适合后续丢进剪映、Premiere、Final Cut 继续剪。

## 前置条件

机器上需要有 `ffmpeg`。

- 如果 `ffmpeg` 已在 PATH 里，直接运行即可
- 如果不在 PATH，可通过 `--ffmpeg <path>` 或环境变量 `FFMPEG_PATH` 指定

## 命令

```bash
npm run export:json-video -- --input ./room-final.json --list-rounds
```

```bash
npm run export:json-video -- --input ./room-final.json --round-index 2 --output ./exports/round-2.webm
```

```bash
npm run export:json-video -- --input ./room-final.json --round-id round-123 --start-ms 1200 --end-ms 4200 --crop 160,240,512,512 --output ./exports/clip.mov
```

如果已经把 Blob 数据同步到项目根目录 `data/`，也可以直接用交互式脚本：

```bash
npm run export:json-video:interactive
```

它会一步步让你选择：

- 房间
- `final` / `latest` 快照
- 轮次
- 输出格式
- 时间裁剪
- 区域裁剪
- 输出路径

## 参数

- `--input`：输入 JSON 路径
- `--output`：输出视频路径，仅支持 `.webm` 和 `.mov`
- `--round-id`：按 `roundId` 选择轮次
- `--round-index`：按第几轮选择，1 开始
- `--list-rounds`：只打印轮次，不导出
- `--fps`：帧率，默认 `30`
- `--start-ms`：相对该轮回放起点的开始时间，默认 `0`
- `--end-ms`：相对该轮回放起点的结束时间，默认到该轮结束
- `--crop`：裁剪区域，格式 `x,y,width,height`
- `--width`：输出宽度，默认等于裁剪宽度
- `--height`：输出高度，默认等于裁剪高度
- `--ffmpeg`：ffmpeg 路径

## 输出格式建议

- `.webm`：默认走 VP9 + alpha，体积更小，适合预览和网页使用
- `.mov`：默认走 ProRes 4444，适合后续专业软件继续编辑

## 说明

- 如果 JSON 里有多轮，默认优先导出 `currentRoundId`，否则导出第 1 轮
- 橡皮擦会按透明擦除处理，导出结果不会带项目里的米白色底色
- 这是离线导出脚本，不依赖浏览器页面和 Blob 在线访问
