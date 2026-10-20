# Phase 1 / P0：在线服务架构与针对性修复

日期：2026-10-20。工作分支 `feat/ipad-lyrics-visual-touch-v1`，现有 Draft PR #3。

比较固定为本仓库 `e3abacb4fdfdfe43f9bd9b7213fc8a53d2159820` 与已审查上游 `ced47852c64c2709faebe0190d430c3ab75ca2a4`。没有同步上游 main。QQ 单点补丁依据上游 `82ca394ec6f5ce4a6fb8f1c15e303572899a1424`。

## 真实验收基线

用户在原 Preview 的最新一次 iPad 测试为 22 首成功 10、失败 12，91,939ms，自动恢复 2 轮，诊断 version 2。网易云 1 次缺后端、45 次跳过；QQ 22 次 provider-search 中 11 次成功、11 次 2001，24 次命中缓存；酷狗 7 次 network、29 次跳过。平台成功次数不是正确匹配并保存的歌曲数。此记录仍是改动前的最新真机结果，不能用下面的模拟成功率替换。

## 原版依赖与当前部署矩阵

| 能力 | 原版 Electron | 原版 Web / Docker | 本 Preview 基线及本轮变化 |
| --- | --- | --- | --- |
| 网易云搜索、详情、歌词 | `electron/netease/neteaseBackend.cjs` → Host/Worker → SDK 4.41.1，本机临时端口；启动维护公钥及可选匿名 token | `netease.ts` 要求 `VITE_NETEASE_API_BASE`；Docker 单独 `netease-api` 容器并由 gateway 转发 `/netease` | 基线没有服务端入口，构建没有可用 API base，客户端发请求之前即抛 `NETEASE_API_BASE_MISSING`。新增同项目四路只读 Node 函数，复用同版 SDK；不需要常驻服务器 |
| 网易云登录、云盘、歌单、在线音频 | 原版完整内嵌后端 | 需要完整兼容 API 实例、HTTPS/CORS 与会话配置 | 新只读函数不提供这些能力。配置完整 API 的用户继续走原地址；未配置时仍明确报缺完整后端，不伪称全部恢复 |
| QQ 匿名匹配、未登录在线搜索 | `qqLyricProvider.ts` 匿名 Lite RPC，不要求账号；普通已登录在线搜索另走会话后端 | 匿名请求经歌词代理；登录/歌单可由原 `api/qq` + SDK serverless 及服务端会话密钥提供 | 匿名架构未变。遗漏了上游歌曲类型 `0 → 7` 的兼容修复，本轮单点补齐 |
| 酷狗匿名搜索 | `requestKugouAnonymousSearch` 原签名参数、HTTP complexsearch 地址 | 同一签名请求经 `/api/lyric-proxy`；并非依赖 `VITE_KUGOU_API_BASE` | 路由、方法、参数、签名、上游地址与固定上游一致。修复代理/客户端超时顺序，补充安全错误跳点；未证实上游恢复 |
| 酷狗完整登录服务 | 内置 KuGouMusicApi / IPC | `VITE_KUGOU_API_BASE` 对应完整服务；Docker 有独立容器 | 本轮不替换服务，不移植桌面会话，不新增后端服务器 |
| 本地歌词、歌曲资料、封面 | Omni/既有跨来源匹配边界 → 搜索/评分 → 按意图应用 | 同一匹配与缓存代码 | 保留独立补全、严格准入、原缓存持久化与第二轮调度机制 |

源码入口还包括 `README.md:一键部署`、`src/services/onlineMusic/UPSTREAMS.md`、`deploy/docker/compose.yaml`、`deploy/docker/images/netease-api.Dockerfile`、`src/services/onlineMusic/{qq/qqSearch,kugou/kugouTransport,netease/netease}.ts`。Web 一键部署前端不等于三个完整后端都已存在。缺网易云服务主要是原 Web 部署依赖差异；不能归因于 iPad 视觉改动。

## 已证实的问题与实施

### QQ：移植已存在的接口兼容补丁

上游 `82ca394e` 的提交记录包含三组同请求体对照：旧 `search_type=0` 返回 2001，`7` 返回歌曲；固定上游基线源码已为 7。本分支基线仍为 0。

- `src/services/onlineMusic/qq/qqLyricProvider.ts` 仅改歌曲类型为 7，并保留匿名 RPC、原 comm、原响应正规化及最多 6 个唯一的简繁体/标题变体。
- 调试日志增加实际 `searchType`；继续独立记录 HTTP、顶层 code、request.code、结果数量和代理阶段。
- 不替换已登录搜索，不改变候选准入；已被 accept 接受的结果立即保留。没有证据要求改写候选回退架构。
- 单测先观察旧值 0 的断言失败，再实施补丁。浏览器验证 7 下的“2001 → 繁体成功”受控序列。

**证据边界**：上游作者的对照记录是源码/提交证据。本云环境没有取得 QQ 新参数的真实响应。真机曾经有成功也有 2001，因此不能说所有 2001 都由旧参数引起，也不能保证修正参数后上游不再拒绝。

### 网易云：同项目只读函数，复用既有 SDK

- `api-ts/netease.ts` 为路径发现入口，编译到 `api/netease.js`；`vercel.json` 将 `/api/netease/:path*` 转发到此入口。没有创建项目、域名、常驻服务器或新付费服务。
- 平台规则在 `shared/netease/readOnlyBackend.cjs`，仅允许 GET 的 `/cloudsearch`、`/song/detail`、`/lyric/new`、`/song/chorus`，严格限制字段、数字、数量、关键词长度。调用原 SDK 的四个 module，原加密请求器及固定上游域名；不接受 URL、domain、proxy、cookie、token、IP 等输入。
- `shared/netease/sdkTransport.cjs` 对**已钉版本的可信 SDK 源文件**使用局部 CommonJS 工厂：不改 SDK 文件、不改全局 console/axios，屏蔽 SDK 原请求器会输出原始 answer/cookie 的日志。只截取 HTTP 状态、数字上游码、经验证的 Retry-After、安全连接错误码。原请求器所需匿名 token 文件通过局部只读适配返回空字符串，不写磁盘或维护用户会话；显式关闭随机 IP。未启用登录、反作弊注册或访问控制绕过功能。
- SDK 把 axios HTTP 错误折叠成 502 的行为已用真实代码隔离复现；新适配在折叠前保留实际 403/429/5xx 与 Retry-After，不把合成 502 冒充上游响应码。原始异常、headers、Cookie 和响应全文不出诊断边界。
- `src/services/onlineMusic/netease/netease.ts` 只在没有完整 API 配置、没有 Electron 桥、且调用这四条读取路由时使用只读入口。跳过账号/匿名注册及任何凭据读取，`credentials:omit`。配置的完整后端、登录、云盘、在线音频等原调用路径不改。
- `vite.config.ts` 在 Vercel 构建自动启用 `/api/netease`，开发验证可显式设置 `VITE_NETEASE_READONLY_API_BASE`。其他普通静态托管不会误认为存在此函数。无需用户新增 Vercel 环境变量。
- 未修改 Vercel 控制台的 Production 环境变量或生产部署设置；仅在原分支提供函数与路由代码，由原 Git 集成更新 Preview。

**真实第三方响应**：[脱敏记录](evidence/p0-services-live.json)。通过环境规定的网络代理运行同一处理器与 SDK，四条读取均为实际 HTTP 200 / code 200：搜索 5 条且 5 个封面候选，歌词正文存在，详情 1 条，副歌请求成功。未下载音频、未应用任何结果到用户曲库。此证据不是部署后 Vercel 或 iPad 的响应。

**打包**：`@vercel/nft` 追踪约 1,057 个文件 / 9 MB；仅复制追踪文件到独立目录，原 SDK 搜索受控响应可执行。可选 canvas / bufferutil / utf-8-validate 提示未安装；这些是上游可选依赖，不是运行所需。Node SDK 使用原包，无新增项目依赖、无 Express 常驻监听；函数 15 秒上限，SDK 请求 8 秒超时、禁用重定向、最大响应 4 MB。原项目函数总数 6，未升级付费方案。SDK 内部路径依赖仍以版本锁定和路由测试保护，升级 SDK 时需重新验证。

### 酷狗与代理：已修正超时边界，根因仍部分未知

- 已确认原客户端超时 12 秒，但 Vercel 代理等 15 秒。慢上游时客户端可能先放弃，收不到代理的 504 和错误阶段。这是可复现的诊断缺陷，不能证明它解释了全部 iPad network。
- `api-ts/lyric-proxy.ts` 上游截止改为 8 秒，为原 12 秒客户端留出返回诊断的时间；单测验证 12 秒前可以得到 504。包括读取响应正文在内共用同一 AbortSignal。
- 新 `X-Folia-Proxy-Error` 只返回白名单 DNS/TLS/socket 错误码；继续保留代理阶段、上游真实 HTTP 和 Retry-After，不复制原异常文字。
- `src/services/lyricProxy.ts`、`kugouTransport.ts`、`qqLyricSearchStatus.ts`、`matchingDiagnostics.ts` 传递这些安全字段；浏览器没有 HTTP 时仅记录白名单异常名称，能辨认 TypeError、SecurityError、NotSupportedError、TimeoutError 等类别。未对未知原因进行关键词猜测或接口替换。
- 仍保留原主机白名单、协议/凭据/端口校验及跳转防护。没有把任意 URL 开放给 NetEase 新函数，也没有放宽原歌词代理。

**仍未知**：真机酷狗失败是否发生于浏览器策略、连接代理、Vercel 运行时或上游连接。当前无 Vercel runtime 日志权限，且环境网络白名单不允许 QQ、酷狗、Preview 或 Vercel API；不能把本环境 CONNECT 403/HTTP000 记为它们真实拒绝。基线 e3abacb4 的原 Preview 已成功部署，只是元数据证据，无法替代新增函数的实际响应。

## 第二轮机制及数据保护

没有改写 `MatchingSearchSession` 或批量任务生命周期：来源串行、最多两歌曲并发、400ms 来源间隔、同查询去重、缺服务整批跳过、有限退避/恢复、成功保留、失败续跑及取消后禁止写入均保留。

没有降低评分或放宽版本、歌手、专辑、时长准入。模拟中 10% 故意低置信候选继续被拒绝，而不是算成成功。来源统计仍明确 `requestUnit:provider-search`；QQ 一次 provider-search 可能包含多个有界关键词 HTTP 请求。

歌词、资料、封面独立补全沿用 P0 前轮实现：正确歌词/人工信息不被补图覆盖，成功封面不重复处理，关闭在线图与实际保存一致，新图失败保留旧图。独立浏览器验证补图后原人工资料与歌词保留、刷新后图片恢复；本地 MP3 导入/两曲播放/歌词/刷新恢复通过。

没有数据库版本、键名、数据迁移、站点来源、音频文件、歌单/M3U、播放队列、锁屏、触屏、视觉系统修改。新增文件为函数/平台适配、诊断和测试；路径发现的两个 NetEase 入口仅在架构清单登记各 1 行 import，规则留在平台目录。

## 验证结果

- 定向回归：首组 10 文件 131 项通过；最终含新诊断和架构边界的 6 文件 49 项通过。
- 全量单测：855 文件通过、1 文件跳过；9,711 项通过、2 项跳过，最终一轮 154 秒。
- `npm run typecheck`：通过。
- `VERCEL=1 npm run build`（包含 `build:vercel-api`）：通过，验证自动打包同源只读后端配置。
- Chromium 浏览器已有 P0 与本地双 MP3：5/5 通过。新增服务调用链：4/4 通过（含 3 种酷狗代理失败分段）；由真实前端 + 实际服务器处理器/SDK 对接受控上游，不是在线平台可用性证明。
- 独立代码审查：无 Critical/Important；补测并修正了非 JSON 错误丢失代理事实的 Minor 问题。
- 构建有原有无效动态 import 警告；单测有原有 jsdom 不支持 CSS `@layer` 警告，未将这些提示隐藏或当作新服务失败。

[32 个规模场景完整记录](evidence/p0-services-scale.json)：50、100、250、1000 首，每种正常、缺后端、临时中断恢复、缺图/低置信、重复查询、取消续跑、全来源拒绝、QQ 成功/2001 混合。**均为 Mock 平台及内存保存边界；耗时是虚拟时钟和每请求 10ms 的受控延迟。** 真正 OPFS/IndexedDB 的保存与刷新恢复另由隔离浏览器验证。

| 合成场景 | 歌曲数 | 正确匹配 / 封面到保存边界 | provider-search 数 | 同查询再次请求数 | 错配 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 全正常 | 50 / 100 / 1000 | 50 / 100 / 1000 | 50 / 100 / 1000 | 0 | 0 |
| 临时中断后自动恢复 | 50 / 100 / 1000 | 50 / 100 / 1000 | 55 / 105 / 1003 | 3 / 3 / 1 | 0 |
| 网易缺后端，QQ 20% 拒绝，酷狗可用 | 50 / 100 / 1000 | 50 / 100 / 1000 | 61 / 121 / 1201 | 0 | 0 |
| 正常响应但 10% 候选不可信 | 50 / 100 / 1000 | 45 / 90 / 900 | 115 / 230 / 2300 | 0 | 0 |
| 每两个文件同查询 | 50 / 100 / 1000 | 50 / 100 / 1000 | 25 / 50 / 500 | 0 | 0 |
| 所有来源持续失败 | 50 / 100 / 1000 | 0 | 58 / 109 / 1021 | 2 | 0 |

正常查询去重节省 50% 请求是**保留的第二轮机制**。本轮主要恢复服务接入，不声称重新优化了调度或改善了某个未经对照的真实成功率。持续拒绝时依然正确失败、保留成功项并允许安全续跑，不能承诺所有曲目一次成功。自动恢复与上游可用性改善用于减少人工循环，真实 22 首是否改善仍待真机确认。

## 原 Preview 交付与一次验收

原地址保持：

`https://folia-ipad-preview-git-feat-ipad-lyr-3ee6e8-yangye702s-projects.vercel.app/?matchDebug=1&qqLyricDebug=1`

1. 在**原地址**刷新到最新提交，不清除站点数据、不重新导入。针对仍缺封面的少量歌曲（含《几分之几》如仍缺）只启动一次批量任务，等有限自动恢复结束。
2. 在同次验收中检查《幸福不远》的 QQ 候选/歌词；QQ 调试记录应有 `searchType:7`。检查一首原已有正确封面的歌曲保持原样，然后刷新看本轮成功图片是否恢复。无需重复验收切歌、M3U 或基础播放。
3. 展开现有“匹配诊断”并点“复制诊断”；剪贴板不可用时点“选择诊断文本”后用 iPad 系统拷贝。复制批量汇总及失败阶段即可，不需大量重复请求。关注是否还有 `NETEASE_API_BASE_MISSING`、网易真实 HTTP/结果、QQ 7 下的 code，以及酷狗 `proxyPhase` / `transportCode` / `browserErrorName`。

部署状态和最终提交见 PR #3 与本次交付消息。只推送原分支、由原 Git 集成更新 Preview；没有合并、发布 Production 或改变原站点来源。

**额外决策**：本轮 P0 的匿名只读能力不要求新增服务器或密钥。若以后需要完整网易云账户、云盘、播放地址等原 Web 能力，仍需一个完整兼容后端；其基础设施/费用方案届时单独审核，本轮没有擅自部署。当前 P0 与 Phase 1 均不宣称已完成真机最终验收。
