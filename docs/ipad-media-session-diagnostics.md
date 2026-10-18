# iPad 媒体控制诊断（临时功能，不是修复）

基线：`feat/ipad-lyrics-visual-touch-v1`，`ca440cb48fff4d273a7d34f8e42c7f0447a623fe`。本次只加观察记录，不改变处理器注册方式、禁用条件、队列算法、播放时序或触屏播放按钮。

## 开启、操作和复制

1. 使用这个分支的 **Vercel Preview** 地址，在地址末尾加 `?mediaSessionDebug=1`（已有查询参数时加 `&mediaSessionDebug=1`）。普通地址不显示入口，也不记录。不要使用 Production。
2. 打开右上角「媒体诊断」，确认日志有四种动作的 `handler.registered`，且 `bound: true`。标题和音频文件名不会进入诊断日志。
3. 播放自己的本地歌单，在队列中间选一首，确保前后都有歌。打开诊断面板，点击「标记：控制中心」，关闭面板；拉出 iPad 控制中心，分别点上一首、下一首、暂停、继续。每次间隔约 5 秒。返回网页，打开诊断面板查看记录。
4. 点击「标记：锁屏」，关闭面板，锁屏，重复同样动作；解锁后返回网页打开诊断面板。不要刷新页面后再做第一次查看。浏览器可能暂停后台执行，时间间隔不能单独证明失败。
5. 点击「复制日志」。若 Safari 不允许剪贴板写入，点击「选择日志」，在文本区长按后使用 iPad 的「拷贝」菜单。文本区可触屏滚动；不需要键盘或开发者工具。
6. 记下测试时看到的系统标题/封面是否变化、声音是否切换，以及发生在哪一个场景。分享时只需粘贴 JSON 与这些观察，不需要音乐文件。
7. 完成后点击「停用并清除诊断」，并移除地址中的调试参数，避免刷新后重新开启。只清除本功能自己的 sessionStorage 键，不清除正常设置、IndexedDB、OPFS 或音频。

最多保存 200 条记录。只有启用时写专用 sessionStorage，刷新同一标签页可保留；关闭标签页或系统丢弃会话可能丢失，不作永久保存。不上传。日志只含时间、阶段、手动场景、命令序号、运行序号、匿名 track-N 标识、布尔状态、计数和错误类别，不含歌曲名、文件名、歌曲 ID、URL、音频、账号、错误消息或堆栈。`track-N` 仅在同一 `run` 内比较。

## 阶段与解释

| 阶段 | 说明及边界 |
| --- | --- |
| `handler.registered` | 原 `setActionHandler` 返回；`bound:false` 是清理，不是成功绑定 |
| `handler.registration-error.*` | 浏览器注册时抛错，只记录错误类别 |
| `callback.received` | 相应 JS 回调已到达，含动作和页面可见性；来源场景是用户手动标记，浏览器不提供“锁屏/控制中心”的可靠来源标识 |
| `callback.blocked` | 原禁用条件或 play/pause 缺少 audio 的检查拦截 |
| `transport.invoke` | 即将调用原 ref；不代表异步播放完成 |
| `transport.sync-error` | 原 ref 同步抛错；仍按原逻辑抛出，未吞掉异常 |
| `queue.enter` / `queue.blocked` / `queue.target` | 原上一首/下一首函数进入、原早退原因，以及是否找到前后目标；available:false 可为正常队列边界 |
| `playSong.request` | 实际发起播放请求，含原请求序号和匿名目标；上一首内部的异步播放不会被外层返回伪装成成功 |
| `playback.observed` | React 观察到的歌曲标识、播放状态、音源是否存在；歌曲变化本身不证明音频已出声 |
| `audio.playing` / `audio.error` 等 | 原 audio 元素的低频事件、就绪状态和媒体错误码；effectTrack 是监听器绑定时的歌曲，expectedSourceReady 标记该时刻元素是否仍对应预期音源，不能把旧监听器事件直接算作新歌已开始；不采集时间轴或音频内容 |
| `playback.failure` | 原本已有的播放失败通知，包括文件访问失败等已处理失败；没有把失败改成抛异常 |
| `playSong.*-error` | 现有 catch 的错误类别；lyrics/theme 错误不应直接解释为音频播放失败 |
| `window.unhandledrejection` / `window.error` | 包括 detached playSong 在内的未处理异常；不阻止默认错误处理 |
| `metadata.skipped` / `metadata.published` / `metadata.error` | 原发布入口未就绪、已调用发布或抛错。published:true 只证明 JS 完成设置，不证明系统界面已刷新 |
| `session.playback-state*` | 原媒体状态设置成功或失败 |

判断时按同一 `run`、时间、`command` 顺序追踪。命令序号仅代表最近一次媒体回调，并非完整异步 trace；快速连续点击和其他来源的切歌可能重叠，所以每次间隔约 5 秒。

- 注册有证据，系统点击却没有对应 `callback.received`：仅能确认本次 JS 日志中未观察到到达；结合暂停/继续作为对照，不能直接归因于 WebKit。
- 有回调但 `callback.blocked` 或 `queue.blocked`：检查日志标出的原条件，不应绕过它。
- 有 `transport.invoke` 但没有 `queue.enter`：检查 ref 调用、同步异常或观察窗口，不应先改队列。
- 有 `playSong.request` 后错误/失败通知或 audio.error：定位实际失败类别；promise 返回不是成功证据。
- 匿名歌曲变化且 audio.playing，但系统仍显示旧标题/封面：对照 metadata 日志和人工系统界面观察；只能在有记录时区分发布跳过、发布异常和 JS 已设置但系统仍旧显示。

## 云端验证边界

自动化可以模拟动作注册、回调投递、禁用拦截、错误和触屏日志 UI。无法在云端代替 iPad 的真实锁屏、控制中心、后台挂起或系统媒体界面。没有真机日志前，不给出故障根因或修复结论。

现有 `.github/workflows/pr-unit-tests.yml` 对 Draft PR 使用 `draft == false` 条件，会跳过 Draft PR 测试 job。本轮不改 CI 配置，也不将 Draft 转为正式 PR。

## 本轮本地验证

- `npm run typecheck`：通过。
- `npm run build`：通过；生产包本地冒烟检查确认真实 Chromium 的四种动作注册被记录，面板可打开并停用。
- `npm run test:unit -- --maxWorkers=4`：9542 通过、2 跳过，`fumeLineFit.test.ts` 的随机布局测试超过默认 5 秒限制。没有修改该测试或布局代码。
- `npm run test:unit -- --maxWorkers=4 --testTimeout=15000`：9543 通过、2 跳过；断言未变。
- 新增诊断单测 5 项通过；触屏诊断面板 Playwright 测试 1 项通过。模拟回调不等于真机锁屏事件。
- 最初全量测试暴露了部分 window 测试桩没有 location 的初始化问题，已修正；Electron lazyJsdom 的首次失败在定向及最终全量复测中未复现。上述最终结果来自修正后代码。

原 Draft PR：[#3](https://github.com/yangye702/folia-ipad/pull/3)。分支 Preview 别名（须确认部署已更新到本次提交后再测）：

https://folia-ipad-preview-git-feat-ipad-lyr-3ee6e8-yangye702s-projects.vercel.app/?mediaSessionDebug=1

当前云端网络代理拒绝直接访问该 Preview 域名，也拒绝 GitHub API；可以通过 GitHub 网页查看 PR/检查状态，但不能据此声称完成了远端 Preview 功能实测。真机根因待本轮日志确认。
