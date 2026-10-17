# iPad 本地 MP3：Web / PWA

目标设备为 iPad 11（A16）。沿用 Folia 的资料库、播放器、封面解析和歌词动画，不需要常开的电脑、音乐服务器或付费 API，音频不上传。

## 原版限制与本分支

原 Web 本地曲库使用 `showDirectoryPicker`，Safari 不提供该接口。Safari 虽然有站点私有文件系统（OPFS），但它不会直接授权访问「文件」App 的目录。本分支在没有目录选择器时，通过系统文件多选将用户明确选择的文件复制到 OPFS，再用原目录扫描器导入。支持目录选择器的浏览器保留原行为。音乐与封面的私有存储写入在缺少 `createWritable` 时使用专用 Worker 的 `createSyncAccessHandle`，不依赖外部服务。

导入副本只在当前设备、当前网站的存储内，刷新后可恢复；不是上传或云端备份。会多占一份本机空间。浏览器配额不足可能导致导入失败；清除网站数据、删除 PWA 或系统回收存储可能丢失副本，请保留原文件。Safari 与主屏幕 PWA、不同域名之间的曲库不应假定共享。

## iPad 使用步骤

1. 用 Safari 打开部署后的 HTTPS 站点。需要 PWA 时，先「分享 → 添加到主屏幕」，然后在主屏幕应用内导入。
2. 进入本地音乐（文件夹）页，点击现有的「导入文件夹」。在 Safari，此按钮打开的是「文件」App 的文件多选器。
3. 选择自己的 MP3；可以同时选择同名 `.lrc`（如 `one.mp3` 与 `one.lrc`）和 `cover.jpg` / `cover.png`。也保留 MP3 内嵌歌词、内嵌封面的原解析能力。
4. 等待扫描完成，在「全部歌曲」中播放。播放、切歌、歌词模式沿用原界面。首次出声需要用户手势。
5. 同一次选择内避免两个同名文件。后续导入建立独立的本地集合；不会实时跟踪「文件」App 中原文件的变更。重新扫描的是站点内副本。

没有内嵌或配套歌词时，离线无法凭空生成歌词；可以使用原版歌词文件导入功能。在线歌词匹配需要对应平台服务和网络，它不属于本地播放的必要条件。

## Vercel 免费个人使用部署

本任务只保存本地分支，不自动推送或部署。准备部署时先手动运行 `git push -u origin fix/ipad-local-mp3`。在 Vercel 新建项目导入 **yangye702/folia-ipad**，将 Production Branch 设为 `fix/ipad-local-mp3`（也可在审核合并后使用 main），不修改上游或其他项目。不要选择现有网站作为部署目标。

- Framework：Vite；Root Directory：仓库根目录。
- Node.js：24.x；Install Command：`npm ci`。
- Build Command：`npm run build`；Output Directory：`dist`。
- 纯本地 MP3、内嵌/配套歌词与封面不需要环境变量，也不需要网易云、QQ、酷狗、同步服务器或 AI API。
- 不要复制 `.env.example` 的假密钥。`GEMINI_API_KEY`、`OPENAI_API_KEY`、`QQ_SESSION_SECRET` 等均非本工作流必需。
- 仓库保留原 API 路由。没有对应密钥/后端时，在线与 AI 功能不保证可用；本地音乐文件通过浏览器直接读取站点本机存储，不经过这些路由。
- Vercel 提供 HTTPS，适合 Safari 的安全上下文和 PWA。Hobby 的配额、用途限制及当前 Node 支持应以创建项目时的官方设置为准；本任务未创建、发布或验证远端部署。

部署完成后访问其 HTTPS 地址并按上面的步骤导入。静态页面托管不要求电脑持续运行。更换域名或预览部署地址意味着不同的本地存储来源，建议确定正式域名后再导入曲库。

## 自动化与真机边界

`npm run test:ui -- --project=e2e test/ui/ipadLocalFiles.spec.ts --workers=1` 使用真实合成 MP3、LRC、OPFS、IndexedDB 和原播放器；在线接口沿用仓库 mock。合成音频由 FFmpeg 生成，无用户音乐或版权音源。

云端 Chromium 不等同于 iPad Safari。仍需真机确认：系统文件多选、Safari 的 OPFS/IndexedDB 持久化、添加主屏幕后再次导入、锁屏/后台连续播放、触摸手势、歌词动画性能、空间不足提示，以及外接 U 盘是否由「文件」选择器提供可读文件。U 盘目录实时访问、整目录同步和后台永久运行均未承诺。

## 本分支的验证结果

- `npm run typecheck`：通过。
- `npm run build`：通过，生成 Web、PWA service worker 和 OPFS 写入 Worker；构建后本地 HTTP 请求确认首页和两个 Worker 资产可读取。
- `npm run test:unit -- --maxWorkers=4 --testTimeout=15000`：9533 通过、2 跳过（838 个测试文件通过、1 个跳过）。首次默认 5 秒限制下 `foliumHelpers.test.ts` 的 teardown 注册拒绝测试超时；没有改动该测试，单独复测及 15 秒限制下的全量复测均通过。
- `npm run test:ui -- --project=e2e test/ui/ipadLocalFiles.spec.ts --workers=1`：1 个端到端测试通过。移除目录选择器及主线程 `createWritable`，用实际 MP3/LRC/PNG 导入，验证封面资产、刷新后恢复、两首歌实际音频时钟前进、原应用快捷键切歌，以及两首的歌词文本显示。
- 最终代码的本地音乐、封面、存储相关定向回归：127 项通过。

以上是云端 Chromium 及本地构建验证，不等同于 iPad Safari 真机或 Vercel 远端部署验证。未自动推送、部署或发布。
