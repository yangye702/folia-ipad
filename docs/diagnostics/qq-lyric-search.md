# QQ 歌词搜索专项诊断

## 基线和改动边界

开始时本地与远程 `feat/ipad-lyrics-visual-touch-v1` 均为 `db13895e3f434355a2de35cb3f87b10597c5d1c3`，无新增上游差异。

本轮只新增特征测试与本报告。不改变生产代码、搜索架构、锁屏、队列、触屏操作、代理、安全规则或登录路径；不读写用户 MP3、封面、歌词、IndexedDB、OPFS、曲库索引。不添加诊断界面或调试日志，不收集凭据。本轮不合并 PR、不部署 Production。

## 可复现证据

### 标签到请求

- `src/components/modal/lyric-match/LyricMatchWindow.tsx` 的来源标签调用 `search.setSource(id)`。
- `useLyricMatchSearch.ts` 的来源变化 effect 调用 `runSearch(query, source, true)`，QQ 不走 AMLL/LRCLIB 并行分支。
- `src/utils/lyrics/lyricMatchSources.ts` 的 `OWN_ACCESS.qq.search` 直接调用 `searchQQLyrics`，非公共歌词库不走这里的搜索缓存。
- `qqLyricProvider.ts` 经 `searchQQSongs`、`requestQQ` 对 `/api/lyric-proxy?url=https%3A%2F%2Fu.y.qq.com%2Fcgi-bin%2Fmusicu.fcg` 发起 POST，RPC 为 `music.search.SearchCgiService.DoSearchForQQMusicLite`，每页最多 20 条。
- 新测试用实际 hook 及 QQ provider、受控网络响应复现：切换 QQ 标签后只有一次 QQ POST，关键词为 `幸福不远 - 郭书瑶`。模拟 QQ 方法码 2001 后，界面状态 `results=[]`、`searchError=false`、`isSearching=false`。

这是调用链和受控回调证据，不是用户 iPad 上那一次点击已成功发出请求或已到达 Vercel 的证据。实际 query 可能由歌曲标签和专辑一起拼接；不能仅凭文件名推断真实请求关键词。

### POST 转发

- `api-ts/lyric-proxy.ts` 保留 POST 方法，对对象 body 序列化、对已序列化 body 原样传递，保留上游状态码和 JSON 响应。
- 受控测试验证对象和字符串两种正文，以及上游 HTTP 200、403、502。HTTP 200 内的 QQ 方法码 2001 未被代理改成零。
- Vercel 对 `u.y.qq.com` 设定固定匿名身份请求头；不会转发用户登录凭据。这里不记录这些请求头的值。
- `vite.config.ts` 开发代理同样保留 POST/原始正文，但没有 Vercel 那段 QQ 专用请求头设置；浏览器端还受到禁止请求头规则影响。因此开发代理的上游响应不应当作 Vercel 的等价实测结果。本轮没有为了统一行为而修改代理。

上述仅证实代理代码契约，不证明当前 Vercel 部署和 QQ 之间的真实通信成功。

### 异常与空结果混淆

`requestQQ` 在 HTTP 非成功、顶层码或方法码非零时抛错；JSON 无法解析也抛错。`searchQQLyrics` 捕获这些错误并返回空数组。因此上层匹配窗口的 catch 不会运行，错误提示状态仍为 false。

`searchQQSongs` 使用 `data?.body?.item_song || []`：

- body/item_song 缺失或 item_song 为 null：静默成为空数组，甚至不经过错误日志。
- item_song 为非数组对象：`.map` 抛错，再由 `searchQQLyrics` 捕获成空数组。
- 成功且 item_song=[]：同样为空数组；无法从返回值区分上面情况。
- 当前预期结构内含 2 个受控条目时，能得到 2 个结果；这不是 QQ 对目标歌曲实际返回了 2 条。

### 三组关键词的真实网络尝试

用与源码相同的匿名 RPC 结构，分别尝试 QQ 直连及现有 Preview 的 `/api/lyric-proxy`。

| 关键词 | QQ 直连 | Preview 代理 | QQ 响应码 | 实际歌曲数量 |
| --- | --- | --- | --- | --- |
| 幸福不远 - 郭书瑶 | 云环境 CONNECT 403 | 云环境 CONNECT 403 | 未取得 | 未取得 |
| 幸福不远 | 云环境 CONNECT 403 | 云环境 CONNECT 403 | 未取得 | 未取得 |
| 幸福不遠 | 云环境 CONNECT 403 | 云环境 CONNECT 403 | 未取得 | 未取得 |

六次 curl 均退出 56、应用 HTTP 状态为 000：TLS 隧道尚未建立，拒绝来自云环境出站代理。不能将这个 403 记为 Vercel 或 QQ 的 HTTP 状态，也不能把未取得的结果数量记为 0。故本轮尚不能区分真实关键词零匹配和 QQ 接口拒绝，更不能宣称 QQ 没有这首歌。

三组关键词的受控测试均验证完整原样发送、只发一次，没有自动仅歌名回退。这说明当前逻辑，不证明简体或繁体哪种实搜有效。

## 与已登录搜歌的对照

`qqSearch.ts` 的普通搜歌在 `hasQqSession()` 时先走 `requestQq('search')`，由已配置后端带会话搜索；旧后端、会话失效等情况可回退匿名，明确的 `search.rejected` 则向 UI 报错。其响应 `items` 有数组校验，匿名回退也保留搜索异常。

歌词源通过独立 `OWN_ACCESS.qq` 路径访问 QQ，用于跨平台匹配，不要求用户选择 QQ 为主平台、登录 QQ 或配置普通 QQ 后端。现有注释和测试明确保留匿名身份。这是当前架构意图，不是匿名搜索可靠、上游必须匿名、或登录路径必然适合歌词匹配的实测证据。普通搜歌能够成功也不能证明匿名歌词 RPC 成功。

## 最小修复方案（未实施）

1. 先消除“错误等于无结果”的歧义：仅让手动 QQ 歌词匹配调用现有会抛异常的匿名搜索入口，使现有 `useLyricMatchSearch.searchError` 路径显示失败；不要改为已登录搜索，也不要增加网络请求。实施前核对自动匹配等调用方，保留其原有容错语义。
2. 对成功码下的歌曲列表执行结构校验：合法空数组才表示零匹配；缺失或非数组应作为响应结构异常。保留 HTTP 状态、顶层码、方法码作为结构化失败依据，而非从一条字符串猜原因。
3. 在同一线上环境取得三组关键词的真实 HTTP、QQ 双层码、列表结构和数量后，才评估“成功但完整关键词为 0、仅歌名有结果”的条件回退。不在 HTTP 失败或上游拒绝时盲目重试关键词，不自动切换认证架构。

第 1、2 项的混淆有受控测试证据，但不是对本次真机根因的定论；依照本轮先报告要求，没有改生产实现。

## 线上真机待验证

在同一个 Preview、同一次 Safari 会话内比较三组关键词：记录标签点击是否进入搜索、是否实际发出 POST、代理 HTTP 状态、QQ 顶层和方法码、item_song 是否数组及数量。只需要这些摘要，不需要凭据、Cookie、令牌、完整请求头、音乐文件或曲库导出。

当前普通匹配界面不会提供上述网络摘要；若继续真机取证，需要另做显式开启、触屏可查看/复制的 QQ 专属诊断入口。不要把现有媒体控制诊断日志当作 QQ 请求证据。本轮未添加入口，也没有凭推测修复。

## 验证结果

- 相关 6 个测试文件共 88 项通过，包含新增的标签触发/请求契约/空结果混淆特征测试，以及原 QQ 歌词、QQ 搜索、QQ transport、歌词代理测试。
- `npm run typecheck`：通过。
- `npm run build`：通过，生成生产 Web/PWA 产物；未部署。
- 未重跑无关的全量测试。没有修改生产源文件、依赖或锁文件。
- 真实三组关键词的 QQ/Vercel 网络验证受云端出站代理阻塞，状态码和数量均未取得，不能算成功或零匹配。
