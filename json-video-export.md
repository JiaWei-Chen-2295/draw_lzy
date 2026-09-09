
这个项目的回放数据已经在持久化 JSON 里保存了完整的笔画时间信息，所以可以直接离线导出为透明背景视频，方便后续继续剪辑。

## 数据来源

脚本兼容以下输入：

- `rooms/{roomCode}/analysis/latest.json`
- `rooms/{roomCode}/analysis/final.json`
- 直接导出的 `room` 快照
- 单轮 `round` 快照

导出时会复用项目当前的 stroke 回放数据结构：

- `stroke.startedAt`
- `stroke.endedAt`
- `stroke.points[].t`
- `stroke.points[].pressure`

也就是说，导出效果和项目里后台回放看到的书写节奏是一致的。

## 脚本位置

脚本文件：

- [export-json-video.mjs](/d:/a_my_project/draw_lzy/scripts/export-json-video.mjs)

项目文档：

- [json-video-export.md](/d:/a_my_project/draw_lzy/docs/json-video-export.md)

## 运行方式

先确保机器安装了 `ffmpeg`，然后执行：

```bash
npm run export:json-video -- --input ./room-final.json --round-index 1 --output ./exports/round-1.webm
```

## 常见用法

查看 JSON 里有哪些轮次：

```bash
npm run export:json-video -- --input ./room-final.json --list-rounds
```

导出指定轮次：

```bash
npm run export:json-video -- --input ./room-final.json --round-index 2 --output ./exports/round-2.webm
```

按时间裁剪：

```bash
npm run export:json-video -- --input ./room-final.json --round-index 2 --start-ms 1000 --end-ms 4200 --output ./exports/round-2-clip.webm
```

按区域裁剪：

```bash
npm run export:json-video -- --input ./room-final.json --round-index 2 --crop 160,240,512,512 --output ./exports/round-2-crop.webm
```

同时按时间和区域裁剪，并导出为适合后续剪辑的 `.mov`：

```bash
npm run export:json-video -- --input ./room-final.json --round-index 2 --start-ms 1000 --end-ms 4200 --crop 160,240,512,512 --output ./exports/round-2-clip.mov
```

## 参数说明

- `--input`：输入 JSON 文件路径
- `--output`：输出视频路径，仅支持 `.webm` 和 `.mov`
- `--round-id`：按 `roundId` 选择轮次
- `--round-index`：按第几轮选择，1 开始
- `--list-rounds`：只列出轮次，不真正导出
- `--fps`：输出帧率，默认 `30`
- `--start-ms`：从该轮开始后的多少毫秒开始导出
- `--end-ms`：导出到该轮开始后的多少毫秒结束
- `--crop`：裁剪区域，格式为 `x,y,width,height`
- `--width`：输出宽度，默认等于裁剪宽度
- `--height`：输出高度，默认等于裁剪高度
- `--ffmpeg`：如果系统 PATH 没有 `ffmpeg`，可手动指定可执行文件路径

## 输出格式建议

- `.webm`：体积更小，适合预览、传输、网页使用
- `.mov`：默认使用 ProRes 4444，更适合继续丢进剪辑软件处理 alpha 透明通道

## 注意事项

- 背景是透明的，不会导出项目画布里的米白底色
- 橡皮擦会被当作透明擦除处理
- 如果 JSON 里有多轮但没有显式指定，默认优先导出 `currentRoundId`
- 如果导出失败，先检查 `ffmpeg -version` 是否可运行
