# Folia iPad Phase 1：视觉连续性与触屏兼容

## 固定比较与保护边界

- 分支：`feat/ipad-lyrics-visual-touch-v1`，实施基线 `04f039c10057defa97696bc4d5589dab3a3e4503`。
- 上游审查基线：`ced47852c64c2709faebe0190d430c3ab75ca2a4`。
- 恢复环境后上游 main 已前进至 `62c35156b01e165201dc999e0961f2e0e6dff68c`，本轮没有同步它。
- 未修改本地 MP3/OPFS/数据库、歌单、M3U、播放队列、锁屏控制、歌词匹配接口或已验收的歌曲触屏切换。
- 浏览器验证使用全新隔离测试上下文及仓库内合成音频/歌词/封面，不访问真实用户站点数据。

## 差异分析与取舍（先审查再实施）

| 上游实现及依赖 | 本分支情况 | Phase 1 处理 |
| --- | --- | --- |
| `monet/VisualizerMonet.tsx` 同一 render 更新 intro key；封面框主题 CSS 过渡 | 原版在 passive effect 内更新，首个新歌 commit 仍复用旧文字节点；封面框色彩直接改变 | 移植同提交更新与原版 1 秒色彩/阴影过渡。没有更换歌词轨或封面解码策略 |
| `styleTransition/layerTransition.ts` 快速返回时复用仍在屏幕上的层；`VisualizerBackgroundTransition.tsx` 根据实际前后层顺序选择淡出 | 原分支会挂第三个新实例并丢掉仍可复用的原层 | 移植有界两层反向切换；保留首帧等待、超时清理与 reduced-motion 路径 |
| `monet/monetSongHandoff.ts`、`useVisualizerSongHandoff.ts`、`VisualizerRenderer.tsx` 新 handoff 契约 | 分支没有新的 handoff props / MotionValue / 双轨行号等契约 | 不整包移植。它们需要 `usePlaybackVisualizerBridge`、`motionSignals`、store 与 automix 的同步更改，超出低风险视觉补丁 |
| `app/playback/bridges/useLyricReadHead.ts` | 本分支对应逻辑仍在 `App.tsx`，已经以 **displaySong** 为键恢复偏移；并非完全缺失 | 未重复增加 read-head reset。上游新增“成功 handover 保留时钟”依赖 `transitionEnd` 与 incoming clock 的同步提交，暂缓，避免改变已验收歌词时间轴 |
| Sonnet/Pendolo/Monet/Latent registry quick controls + 现有 tuning setter | 四种模式已有相同 tuning 与完整设置面板，缺快捷入口 | 只接入现有参数，沿原 tuning registry 保存；不迁移上游新的控件主题或设置体系 |
| 上游 Smart Beat / Sonnet beat FX / Pendolo drumhead 等 | 新鲜分析依赖 Electron 模型桥与权重分发；算法的一部分虽运行在浏览器 Worker/WebGPU，但普通 Web 无模型入口 | 不引入。缓存节拍网格可在 gate 前返回，不能笼统称全部视觉效果桌面专属；也不假定 iPad 有这些缓存 |
| 上游 `FluidBackground` 较大重构与 shader/geometry 扩展 | 与既有 renderer 和效果输入交织 | 不为统一版本整体替换。保留原版几何、音频响应与背景引擎 |

原 SHA 的 GitHub 源码可审查：

- [Monet 同提交更新](https://github.com/chthollyphile/folia-major/blob/ced47852c64c2709faebe0190d430c3ab75ca2a4/src/components/visualizer/monet/VisualizerMonet.tsx#L121)
- [上游歌词 read-head 与 handover 依赖](https://github.com/chthollyphile/folia-major/blob/ced47852c64c2709faebe0190d430c3ab75ca2a4/src/components/app/playback/bridges/useLyricReadHead.ts#L45)
- [完整 Monet handoff](https://github.com/chthollyphile/folia-major/blob/ced47852c64c2709faebe0190d430c3ab75ca2a4/src/components/visualizer/monet/monetSongHandoff.ts)
- [原层复用](https://github.com/chthollyphile/folia-major/blob/ced47852c64c2709faebe0190d430c3ab75ca2a4/src/components/visualizer/styleTransition/layerTransition.ts#L105)

## 功能完整性与平台边界

`src/types/visualizerModes.ts` 与 registry 保持 14 种歌词模式：Cadenza、Cappella、Claddagh、Classic、Diorama、Fume、Lumiere、Monet、Partita、Pendolo、Sonnet、Still、Tempera、Tilt；6 种背景：Common、Latent、Monet、Nomand、Sora、URL。没有移除入口、降低默认质量或隐藏模式。

| 分类 | 可用范围 / 证据 |
| --- | --- |
| 普通 Web 原版能力 | 14/6 注册与设置、已有 CSS/Canvas/Pixi/Three/Paper 渲染、Monet 拖动挂钩 pointer handler、Latent 原频段脉冲。WebGL 能力及成本仍取决于设备 |
| 本轮 iPad 适配 | 24px 快捷 chip/toggle 扩至至少 44px，仅 coarse pointer；模式行触屏参数换行，不挤占名称与左右箭头。原有 pan-y/swipe、点击选择及完整设置入口保留 |
| 本轮新增的原版快捷入口 | Sonnet 外框/后处理；Pendolo 表盘封面/齿轮；Monet 描述/挂钩/音频可视化；Latent 色源。用现有翻译与设置字段，不新增存储键 |
| 模型/桌面依赖，不移植 | `analysis/beatThis.ts` 的 `window.electron.runBeatThis` 与 `modelCanRun` gate；`beatThisGpu.ts` 的权重桥；`drumHits.ts` 的 htdemucs 权重/模型能力；`useSmartBeatAvailability.ts` 的 desktopOnly。没有新增模型、付费服务或替代引擎 |

设置窗口基线在 1180×820、820×1180、1024×600、600×400 下均在可见视口内，没有据猜测修改其布局。iPad Safari 地址栏动态高度、键盘及 PWA 安全区域仍需真机观察。没有添加 `viewport-fit=cover`，避免在没有完整安全区域验证时把已有内容扩到遮挡区。

## 已复现问题与证据

- Monet 首次新歌 commit：修复前复用旧 title 容器，修复后立即使用新容器；由真实组件的 React Profiler 在 passive effect 前记录，不依赖稳态截图猜测。
- A→B→A 快速切换：修复前原 A DOM 断开，修复后保留；最多两层，最终只余一层。
- 额外审查发现 A→B→C→B：enter 的 `commitStyles()` 会把半透明/模糊写进 B 的内联样式，恢复 B 后永久残留（浏览器复现 opacity 约 0.04）。本轮改为从计算样式构造 leave 动画关键帧，不把中间态写回节点；恢复后应为 opacity 1 / filter none / transform none。
- 快捷目标：隔离 touch Chromium 实测 24px → 44px；真实 AppearanceSection 340px 窄面板测试验证新快捷入口更新原 store 并且不横向溢出。

截图及 JSON 放在同目录 `phase1-evidence/`。稳态 Monet 外观前后应保持一致，瞬时提交差异以 JSON/组件回归为证；不是另做一种视觉风格。

| 证据 | 修改前 | 修改后 |
| --- | --- | --- |
| 触屏快捷目标 | ![24px 控件](phase1-evidence/before-touch-controls.png) | ![44px 控件](phase1-evidence/after-touch-controls.png) |
| 原层返回（真实动画机制探针，右上测试色块） | [截图](phase1-evidence/before-returning-layer.png) / [节点记录](phase1-evidence/before-continuity.json) | [截图](phase1-evidence/after-returning-layer.png) / [节点记录](phase1-evidence/after-continuity.json) |
| Monet 新歌稳态 | [原版](phase1-evidence/before-monet-song-b.png) | [修改后](phase1-evidence/after-monet-song-b.png) |

真实窄侧栏：[Sonnet](phase1-evidence/after-sonnet-touch-panel.png)、[Pendolo](phase1-evidence/after-pendolo-touch-panel.png)、[Monet](phase1-evidence/after-monet-touch-panel.png)。设置窗口：[横屏](phase1-evidence/after-settings-1180x820.png)、[竖屏](phase1-evidence/after-settings-820x1180.png)。

## 自动化回归

- `npm run typecheck`：通过。
- `npm run build`：通过；保留已有 chunk 大小/混合导入警告，没有通过禁用校验规避构建。
- `npm run test:unit -- --maxWorkers=4 --testTimeout=15000`：9587 通过、2 跳过，844 个文件通过、1 跳过。包含原播放/歌词/存储/歌单/M3U 等测试；已有 jsdom `@layer` CSS 解析警告不等于断言失败。
- 最终 Playwright：12 通过。包含两首本地 MP3 导入、刷新恢复、播放/切换与歌词，QQ 搜索错误/回退，异步/失效封面，双行歌词布局，以及新增触屏面板与连续切换回归。
- 早期 harness 问题：fixture 的假 Electron 缺 Settings API、手工开发服务器缺测试启动参数、测试探针语法，以及编辑期间 gallery 首次加载竞态。均修正测试启动/探针后重跑；没有为此改产品逻辑或放宽保护功能断言。
- 独立审查发现的中间态残留问题先由浏览器复现失败，再实施动画关键帧修复；最终回归检查恢复层完全不透明、无模糊/位移。

## 可复现浏览器性能方法

使用仓库现有 `dev/perf` 的合成音频、歌词、封面、真实 renderer model 和音频 bridge，新增 `web.mjs` 便携 runner。原 Windows GPU/进程采样器没有在 Linux 上冒充运行。

测量页独立构建补齐原来缺失的 ICU 词典插件；重复采样前取消旧 RAF，避免把同一帧重复计作 0ms；测量页启用与 App 相同的样式过渡。两侧用同一测量代码，基线产品代码取自固定 SHA 的归档，最终代码单独构建。每次只运行一项测量，不与测试/构建并行。

```sh
node dev/perf/song.mjs
npx vite build --config dev/perf/vite.config.ts
# 将 .build/dist 与 .build/public 合成独立服务根目录，public 内容位于根目录的 perf-song/
node dev/perf/web.mjs <服务根目录> <证据目录> <before或after>
# 同时检查全部模式/背景挂载：FOLIA_PERF_SMOKE=1
```

固定视口 1180×820、DPR 1、touch、Chromium/SwiftShader，Monet/Common、Sonnet/Common、Pendolo/Common、Classic/Latent 各 3 个 4 秒窗口，第 3 窗口包含歌曲切换。报告 RAF p50/p95、长帧及错误；不把 RAF 调度当物理呈现帧率，不把软件 GPU 结果等同 iPad A16。

## 真机集中验收（无需重新导入音乐）

1. 两首已有本地歌之间切换，观察 Monet 标题、封面与歌词是否连续，是否有闪黑或错歌。
2. 快速切换模式后返回，包括 A→B→C→B，观察是否残留暗淡/模糊，试两三种背景。
3. 在 Sonnet/Pendolo/Monet 的触屏快捷项改一个参数，再开完整设置确认值一致；试 Latent 色源。
4. 横竖屏各看一次侧栏与设置，确认模式名称、箭头与参数可点、无裁切，连续播放时没有明显更热或更卡。

若失败，保留当前歌曲与设置并反馈场景，不清除站点数据。没有合并 PR、建立新站点或发布 Production。
