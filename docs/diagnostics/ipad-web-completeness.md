# Folia Phase 1：原版 Web 完整性与 iPad 集中适配

## 范围、基线与证据

- 项目 `yangye702/folia-ipad`，原分支 `feat/ipad-lyrics-visual-touch-v1`，Draft PR #3。
- 本轮开始确认 HEAD 为 `65226b866648148f46206a9f8170cfd1e12e42a8`，工作区干净。
- 固定原版比较对象 `chthollyphile/folia-major@ced47852c64c2709faebe0190d430c3ab75ca2a4`；不全量同步上游 main。
- **P0 在线匹配：用户真机未通过，正式暂停开发。** 本轮不修改 provider、代理、重试、候选评分、匹配持久化或特定歌曲逻辑；全量测试中既有相关用例仅用于回归。
- 证据分为源码确认、隔离 Chromium 自动化、既往用户 iPad 验收。三者不相互替代；本轮没有连接用户的浏览器配置或真实曲库。
- A：已有实现与明确验收/回归证据（逐行写明证据种类）；B：继承的触屏/操作障碍；C：当前分支相对固定上游的功能缺失/回归；D：配置/账号/服务/浏览器能力条件；E：实际 Electron 专属依赖。源码存在但未获足够运行证据的项目另标“存在、待验收”，不冒充 A 或功能缺失。

完整源码对照、入口和条件分别见 [资料库矩阵](phase1-web-library.md)、[14/6 视觉及全部设置类别矩阵](phase1-web-visual.md)、[导航/集成矩阵](phase1-web-navigation.md)。下表是集中索引；“保留”表示无需另建服务或重写功能。

## 本地音乐与资料库

| 功能及分类 | 原版 / 当前入口与代码 | 真实问题、处理与证据 |
| --- | --- | --- |
| A：本地导入、播放、刷新恢复 | 原版 `localMusicService.ts` 扫描器；当前 `localFilesImport.ts` / `utils/writeOpfsFile.ts` Files→OPFS 回退；Grid 文件夹页、Bravais More | 已有 iPad 验收；本轮保留。隔离两首 MP3 浏览器回归另验证音频时钟、歌词及刷新恢复，不操作真实文件 |
| 存在、待设备：重新扫描、根目录管理 | `localMusicService.ts`、`localLibraryDirectoryTree.ts`；两套目录面板 | 重新扫描 OPFS 副本，不是同步原 Files 文件夹；原目录观察依赖 FileSystemObserver。未证实入口缺失，不重写 |
| A（隔离回归）：全部歌曲与排序 | `library/suites/grid/home/LocalGrid3DView.tsx`、Bravais 本地首页、`localHomeModel.ts` | 两套原生入口；已有排序/播放顺序和设置恢复测试。物理触屏舒适度不由桌面回归证明 |
| 存在、待设备：艺术家/专辑、资料编辑与归组 | `localLibraryCatalogService.ts`、`EntityEditorWorkspace.tsx`，Grid Entity Info / Bravais seam 信息入口 | 重命名、合并、拆分有原生编辑器与显式提交按钮；无证据支持另造编辑系统 |
| A：歌单、M3U/M3U8 | `localPlaylistService.ts`、`localPlaylistFileService.ts`，Grid home actions / Bravais More / collection Export | 用户既往验收；本轮保留，相关自动化随全量回归运行。不要求重新导入 |
| 存在、待设备：新建/加入/改名/删除/收藏 | 两套首页批量目录面板、播放歌曲星标→`AddToPlaylistHost.tsx`、播放命令、collection More/Edit | 并非只有某个卡片菜单一种入口。Grid/Bravais 删除条目及刷新已有隔离回归。收藏是受保护虚拟歌单，取消收藏走歌曲心形按钮 |
| 存在、待设备：队列存为本地歌单 | 共享 `QueueTab.tsx` 显式 Save 对话框；wall queue island 也有命名输入 | 仅本地队列可存；混合来源拒绝是原版规则。岛内 Enter 之外已有共享原生可触屏回退，不新增平行业务 |
| D/E：浏览器格式和目录能力 | `localLibraryAvailability.ts`、`localMusicService.ts`；浏览器格式由设备解码器决定 | HTTPS+OPFS；Files 副本不等于原目录实时访问。额外 ALAC/APE/WV 等转码依赖 Electron 桥，不强行移植 |

## 播放器、队列与歌词

| 功能及分类 | 原版 / 当前入口与代码 | 真实问题、处理与证据 |
| --- | --- | --- |
| A：基础播放、暂停、页内上下首 | 共享播放面板、浮动控制；`FloatingPlayerControls.tsx`、现有播放 controller | 用户既往验收；本轮不改播放内核、队列状态机或触屏切歌回调 |
| 存在、待设备：进度、播放顺序、随机、循环、音量 | `panelTab/controls`、`ProgressBar.tsx`、播放命令；`VolumeRow.tsx` 使用原 `PanelSlider` | 指针拖动与提交/取消已有实现；iOS 系统音量/后台调度属于实际平台边界，不承诺绕过 |
| **B→已修复：面板与命令队列编辑** | `panelTab/QueueTab.tsx`、`command-palette/CommandPaletteQueueRow.tsx` | 原悬停/焦点才出现的“下一首播放/移到末尾/移除”，触屏首触可能先播歌。仅 hover:none / coarse 下常显并扩大为44px；不改任何队列回调 |
| 存在、待设备：wall 队列拖动/管理 | `WallToolsQueueIsland`、`useQueueDragReorder.ts` | 原 `pointercapture`、`touch-action:none`、hover:none handle 已存在；不因另一队列问题重写它 |
| D：后台播放、Media Session | `useMediaSessionBridge.ts`、现有 transport refs / playback controller | 保留现有桥与诊断。锁屏按钮形态、后台存活由 iPadOS 决定；没有以旧截图宣称锁屏上一首/下一首全部通过 |
| A：普通歌词同步 | 原 parser / renderer / `LocalTab.tsx`、现有歌词 store | 用户既往验收；本轮不改解析、歌词时间轴或人工匹配结果 |
| 存在、待设备：外置/内嵌歌词、文件导入导出 | `LyricFileButton.tsx`、`LyricFileDialog.tsx`、`lyricExport`；Local/Online source tab 同一文件入口 | 真实文件 input、显式导入/导出对话框；LRC/TTML 等继续原 parser。按钮不是仅快捷键功能；未扩展格式或改本地数据 |
| 存在、待设备：来源优先级、逐字、滚动、时间偏移/过滤 | `LyricsPage.tsx`、`LyricTimelineOffsetControl.tsx`、`AppearanceSection.tsx`、`useLyricSettingsStore.ts` | 原设置、±步进/数值/重置、全局与歌曲偏移保留；完整设置/分词预览存在，不把在线成功率混入 UI 完整性 |
| D：在线歌词及资料匹配 | 原匹配弹窗和设置入口均保留 | **P0 尚未通过且暂停**。网易云后端、QQ 2001、酷狗网络问题沿用既有诊断，不实施新接口或推测修复 |

## 原版视觉与设置

14 种歌词模式完整：Cadenza、Cappella、Claddagh、Classic、Diorama、Fume、Lumiere、Monet、Partita、Pendolo、Sonnet、Still、Tempera、Tilt。
6 种背景完整：Common、Latent、Monet、Nomand、Sora、URL。逐模式 renderer、参数入口、资源清理、WebGL/素材条件见 [视觉矩阵](phase1-web-visual.md)。Still 无调参面板/不绘共享背景、Fume 自带背景是原版设计，不是假缺失。

| 功能及分类 | 原版 / 当前入口与代码 | 真实问题、处理与证据 |
| --- | --- | --- |
| A（自动化）：14/6 注册、模式切换与完整参数 | 各 mode/background `entry.tsx`、registry、原 tuning stores、完整视觉编辑器 | 不删模式、不隐藏效果、不改默认画质；本轮独立生产测量页再作全模式挂载/切换，详见证据与限制 |
| A（既有回归）：Sonnet/Monet/Pendolo/Latent 快捷参数 | `AppearanceSection.tsx` 与各 entry quickControls | 已有44px触屏 chip、Stepper 换行与原 setter；不重复移植。全量浏览器回归保护既有入口 |
| A（既有回归）：Monet 换歌和快速返回层 | `VisualizerMonet.tsx`、`styleTransition/layerTransition.ts` | 既有同commit标题、有界层复用/去除残留模糊保留；不整包移植耦合 automix/双轨时钟的上游 handoff |
| **B→已修复：Nomand 资源释放** | `backgrounds/nomand/NomandBackgroundLayer.tsx`、既有 `paperShaderContext.ts` | 原 Paper dispose 删除 canvas/program，但旧 GL 缓冲等 GC；复用 Latent 的释放 ref。保持首帧判断、shader/参数/质量不变；证据只证明主动释放，不宣称量化 iPad 内存或 FPS 提升 |
| 存在、待设备：完整设置、参数保存/恢复/导入导出 | `SettingsModal.tsx`、所有 tuning registry、`ConfigTransferRows.tsx`、设置各页 | 11 类普通 Web 设置均保留；有条件的子项不是缺失。设置存储单测、现有浏览器回归与本轮刷新测试相互补充 |
| D：自定义本地素材/URL 背景 | 原本上传、清除、预览/选择入口 | 原已有功能保留，本轮不新开发背景。配置短码不含本地素材，URL iframe 受CSP/CORS/sandbox/网络限制，默认空URL挂载测试不等于任意站点可嵌入 |
| E：BeatThis/分离鼓点/桌面模型增强 | `analysis`、`useSmartBeatAvailability.ts` 等模型桥 | 原 Web 基础动效与频段响应不因此被删；新模型计算依赖 Electron/权重条件，不造替代引擎 |

普通 Web 设置类别全部检查：外观（含完整视觉编辑器）、播放器、首页（Grid/Bravais 条件项）、播放、歌词、通用、交互、集成、存储、图形、开发者。硬件快捷键的 KeyCapture 依赖键盘输入，并不等于命令或设置只有键盘入口。Grid full-bleed/square/falloff、Bravais 透明度/窗口几何不随外观短码导出是源码注明的刻意边界；不擅自扩展持久化格式。

## 导航、集成与平台条件

| 功能及分类 | 原版 / 当前入口与代码 | 真实问题、处理与证据 |
| --- | --- | --- |
| 存在、自动化/设备证据分列：命令面板、搜索 | player handle/wall tools 左滑；Grid 列表按钮按设置滑动；Bravais tools；`SlideActionButton.tsx` | 已有真实 pointer 手势/设置入口，不是仅键盘。保留原版 palette touch-blur 的 iOS 滚动兼容措施 |
| **B→已修复：弹层触屏目标** | `CommandPalette.tsx` help/close；`PageHeader.tsx` close；`Sheet.tsx` close | 原33/32px→仅coarse或hover:none时至少44px；实际边缘tap可用，600×400/横/竖屏内，桌面保持33/32px |
| **B→未完成：浏览器后退与设置弹层** | `useAppNavigation.ts`、`useSettingsModalStore.ts` | 实际浏览器Back改变底层视图而设置仍开。与固定上游相同；一致弹层history契约还要覆盖Forward、嵌套、重复Back。未加临时route blocker；显式关闭已改善。不能宣称本项完成 |
| 存在、待设备：软键盘、动态工具栏、安全区域 | palette现有vh、settings90/86vh；原viewport | 自动化静态视口可测，不能模拟真实键盘/地址栏/PWA安全区。没有证据时不随意加viewport-fit或替换dvh；仍需真机观察 |
| A（隔离回归）/D：PWA与持久化 | `vite.config.ts` manifest/Workbox、`localFilesImport.ts` persistence request | 保留已有离线缓存与来源。Safari/PWA/不同域名不保证共享存储；配额/系统回收仍是平台条件。生产SW/离线覆盖与本轮证据分开说明 |
| D：在线音乐库、账户、云盘/在线播放 | 原统一provider/omni与资料库来源入口；既有 [服务架构审查](p0-service-architecture.md) | UI与原配置入口保留。当前网易云四路匿名只读函数不是完整登录/云盘/音频后端；QQ/酷狗可用性和登录会话亦受原服务条件约束。本轮P0暂停，不新增服务，也不把这些条件项算成已恢复 |
| D：Navidrome / sync / scrobble / NowPlaying / PlayerCap / Web stage | 原集成设置及地址/token入口；`StageModeRows.tsx`、对应provider | 保留原配置入口。需要可达HTTPS/CORS/WS后端或账号；iPad localhost是iPad，并非电脑。不新增服务器、账号或费用 |
| E：Desktop/Mods、Discord、桌面OBS server、歌词HTTP API、桌面转码/窗口功能 | `settingsNavModel.ts`、`IntegrationPage.tsx`、Electron桥 | 真实Electron gate，只记录限制。Web stage/OBS链接另有入口，不笼统删掉所有集成 |

**C 类结论：本次审查范围内未确认当前分支删除了固定上游的普通 Web 业务功能。** 本轮修复的触屏和 Nomand 清理问题在固定上游也存在。未整包移植的上游Monet handoff/双轨read-head增强仍是明确差异，依赖配套播放/automix状态契约；本轮没有其失效复现，不把文件级重构缺席伪称为功能已丢失，也不声称与上游逐行等价。原版源码存在不等于 iPad 已逐项通过；源代码一致也不能排除尚未覆盖的运行问题。

## 复现、修改与审查证据

- 队列红测：原按钮宽28px，未达到44px；修复后820×1180及1180×820均实际命中并执行既有编辑回调，无误播；桌面仍需悬停且保持小尺寸。
- 弹层红测：palette help33px，其余三个close32px；绿测检查44px、边缘tap、实际关闭/帮助状态、三种视口及原桌面几何。
- Nomand红测：替换后旧canvas已断开，context仍未lost；绿测覆盖两次效果替换和最终卸载，旧context lost，当前context保持live。React模拟detach仍由既有helper的connected guard保护。
- 首次全量浏览器运行复用了编辑后的Vite服务，App的时间戳模块与测试直接导入形成重复store实例。捕获到真实click且界面已变，测试store却不变；[证据](phase1-web-evidence/hmr-validation-environment.json)。该轮已中止并排除，重启干净服务后重跑。没有据此修改模式/播放逻辑。
- [早期失败源码初查](phase1-web-evidence/browser-failure-source-audit.md)仅保留源码契约证据；其中运行时判断已由上述环境发现及最终干净运行取代，不能算正式失败统计。
- 独立源码审查无Critical/Important产品问题；发现测试截图写死`/workspace`，已改用Playwright `testInfo.outputPath`，可选环境变量仍可指定证据目录。

| 证据 | 修复前 | 修复后 |
| --- | --- | --- |
| 播放面板队列 | [截图](phase1-web-evidence/queue-panel-before.png) | [截图](phase1-web-evidence/queue-panel-after.png) |
| 命令队列 | [截图](phase1-web-evidence/queue-palette-before.png) | [截图](phase1-web-evidence/queue-palette-after.png) |
| 整页触屏与刷新 | — | [竖屏](phase1-web-evidence/native-portrait.png) / [横屏](phase1-web-evidence/native-landscape.png) |
| Nomand context | [真实GL状态](phase1-web-evidence/nomand-before.json) | [真实GL状态](phase1-web-evidence/nomand-after.json) |
| 未修浏览器Back | [复现截图](phase1-web-evidence/browser-back.png) | 未修改history契约 |

所有截图/GL探针均为隔离Chromium、合成歌曲/图片，不含用户音乐。测试文件：`ipadQueueTouch.spec.ts`、`ipadModalTargets.spec.ts`、`nomandContextCleanup.spec.ts`；对应 `dev/probes` 只在开发探针入口使用。

## 集中验证与发布状态

最终执行结果见本节收尾记录。全量日志位于本次执行环境 `/workspace/scratch/phase1-*.log`；摘要和可移植证据随仓库保存。不得把旧轮次通过数字当本轮结果。

- `npm run typecheck`：通过。
- `npm run test:unit -- --maxWorkers=2 --testTimeout=15000`：855文件通过、1文件跳过；9,711项通过、2项跳过，895.99秒。既有jsdom `@layer`样式解析警告未导致断言失败。
- 新增三份组件spec集中执行：8项通过（39.2秒），包含触屏横/竖/紧凑视口、桌面回归和真实Paper GL生命周期。

- 整页原生触屏入口：新增 `test/ui/ipadNativeVisualNavigation.spec.ts`，横/竖屏2项通过（37.2秒）。通过真实面板tap验证箭头、14/6选择列表，选择Monet与显式Common后刷新恢复；未通过store注入代替操作。
- `npm run build`：通过，Vite 1分5秒，PWA precache 203项；既有chunk/混合导入警告保留，生成API没有额外差异。

- **全量Playwright未通过**：干净服务、3 workers、全部1,081项执行完毕，974通过、105失败、2跳过，6336.23秒。[完整失败摘要](phase1-web-evidence/browser-results.json)。本轮新增10项全部通过；两首MP3导入/OPFS与索引刷新恢复/真实播放/歌词、已有连续层、快捷设置与Nomand完整效果设置用例均通过。
- 失败集中在账号35项、资料库13项、旧playerLayout探针13项、Help社区5项，以及其他界面/动画/测试期望。没有更新截图、跳过失败或放宽阈值；不能把所有105项未经逐一定位地称为旧问题，也不能宣称原Web/iPad功能已经全部验收。

- Diorama完整设置在当前代码低并发单独复测也通过（46.6秒），与基线单独通过一致；全量中的超时保留在105项失败统计内，没有据此修改renderer。
- 基线隔离对照：`git archive 65226b86`，独立Vite缓存/4182端口、未改原测试、单worker。12个代表用例中11项同样失败、Diorama1项通过（249.26秒）。复现首页相同2916像素差异、队列fixture、Help入口期望、Bravais设置期望、账号2例、资料库3例、旧Pixi动态导入和playerLayout探针。[对照逐项结果](phase1-web-evidence/baseline-comparison.json)。这是代表证据，未逐一证明全部105项均为基线问题。

- 独立生产视觉测量页：四组短时采样与换歌均0页面异常；14种歌词/6种背景顺序切换完成，0页面异常，各歌词切换静置canvas为0–2，最终过渡层均收敛为一层。[原始数据](phase1-web-evidence/performance.json)、[Monet画面](phase1-web-evidence/phase1-web-monet-common.png)、[竖屏](phase1-web-evidence/phase1-web-portrait.png)。URL仅空默认值，外部地址没有被验收。与其他测试/构建分开运行。

短时RAF间隔p95的三窗口中位数如下（ms，不是物理FPS；云端Chromium/SwiftShader、DPR1、1180×820，非iPad/GPU实测，也不是前后提速比较）：

| 场景 | p95中位数 ms | 页面异常 |
| --- | ---: | ---: |
| monet / common | 16.8 | 0 |
| sonnet / common | 449.9 | 0 |
| pendolo / common | 50.1 | 0 |
| classic / latent | 416.6 | 0 |

使用已存在的 `dev/perf/web.mjs`、合成audio/lyrics/cover和原renderer；没有降低质量。Sonnet/Latent在软件GPU上的长帧不证明A16表现。Nomand清理的直接证据是旧context主动释放，不是这些帧数值的改善。长时间热量/电池/实际Safari资源回收仍待设备。

- Production静态站的隔离PWA smoke通过：新浏览器context等待SW接管及预缓存后断网刷新，应用壳再次挂载，0页面异常。[记录](phase1-web-evidence/pwa-offline.json)。未运行第三方后端、未导入用户音乐；不代表Safari/PWA跨来源共享或长期存储已经证明。
- 推送后沿用原Draft PR #3和原Preview别名；远端状态由最终回复及对应SHA的GitHub/Vercel检查给出。Draft的GitHub单测按现有规则跳过，不冒称CI单测通过。云环境直连Preview的CONNECT403属于出口限制，直接HTTP页面验证未取得；不能据此判断Vercel页面失败。


## 保护结果与剩余风险

生产代码只触及两处队列的显示/命中区域、四个弹层按钮与Nomand ref。不修改音频文件、DB schema、OPFS来源、索引/歌单/收藏/歌词/人工资料/封面存储或设置字段；不执行任何真实站点清理操作。独立测试上下文内的数据重置和合成曲库属于测试隔离，不是用户操作步骤。

仍未证明：Safari/PWA软键盘与安全区域、长期后台存活、A16真实GPU/热量/电池/长时间内存。部分设置仍有24–32px原版控件，是触控舒适度风险，不能把本轮四个目标改进描述成“全站所有目标都44px”。Bravais窄spine36px/dock40px与Monet细挂钩有原生替代设置入口，未取得实际无法操作证据，未盲目放大布局。

## 最少量真机集中验收

使用原Preview、原Safari/PWA来源和已有歌曲，不清站点数据、不重新导入：

1. 打开播放面板队列（如使用命令队列也检查一次），无需长按或悬停，试“移到末尾”和“下一首播放”，确认不会误触开始播放该行。
2. 打开命令面板、设置或歌词文件弹层，横竖屏试帮助/关闭按钮；若呼出软键盘后有裁切，记录界面与方向即可。
3. 已有歌曲播放时切到Nomand，切换两种效果后返回其他背景，确认画面仍正常；不要求重复基础播放、导入、M3U或普通歌词同步。

Phase 1 尚不能宣布整体完成：P0已知未通过/暂停、Back弹层契约以及上述设备边界仍明确保留，最终由用户确认。
