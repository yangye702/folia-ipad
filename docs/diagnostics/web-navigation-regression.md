# Folia iPad：Web 收尾与导航回归

本轮基线：`21c90350de2df7d405cfe956cb3d768ec60bd49a`；分支：`feat/ipad-lyrics-visual-touch-v1`；沿用 Draft PR #3 和原 Preview。P0 在线匹配继续暂停。此报告的浏览器证据来自隔离 Chromium，不能代替 iPad Safari 验收。

## Back / Forward 与设置

已证实根因：`useSettingsModalStore.openSettings` 原先只改变弹层状态，没有写入浏览器历史；`useAppNavigation` 的 popstate 只恢复底层 view/search/collection。因此播放器打开设置后 Back 会返回首页，而设置仍显示。

修复：在既有 `NavigationHistoryState` 上增加可选设置快照，保留同一底层页面、搜索和集合。设置打开与内部页面变化写入相应历史；popstate 恢复时抑制重复写入；关闭设置退到打开前的位置，内部面板的触屏返回与浏览器 Back 共用已有历史。设置页状态只在内存和当前页面历史中存在，不改变音乐数据或设置持久化格式，不拦截所有 Back。

代码：

- `src/hooks/settingsNavigationHistory.ts`：设置历史写入、恢复、关闭与内部返回。
- `src/hooks/useAppNavigation.ts`、`navigationHistoryJournal.ts`：接入既有路由和历史日志。
- `src/stores/useSettingsModalStore.ts`：临时设置页快照。
- `src/components/modal/settings/navigation/useSettingsPageNavigation.ts`、`SettingsModal.tsx`：复用原有设置控制与内部面板。

新增浏览器回归 **6/6 通过**：播放器→设置→Back→Forward→关闭；内部歌词时间偏移面板 Back/Forward/触屏 Cancel；横屏转竖屏；连续 Back；设置在集合之上关闭后，原搜索与集合历史完全恢复；带命名锚点打开设置后，Forward 保留后来访问的页面。最后一项先稳定复现初始页面提前记录造成的入口丢失，再最小修正初始 tab/section；没有靠其他测试通过推定导航完成。桥接逻辑 **5/5 单测通过**，覆盖初始页原地补齐、同一操作合并写入、恢复不新增记录、重复关闭与重复内部返回。

证据：[红绿记录](navigation-regression-evidence/settings-history-red-green.txt)、[锚点初始化红绿记录](navigation-regression-evidence/settings-anchor-red-green.txt)、[竖屏恢复截图](navigation-regression-evidence/restored-settings-portrait.png)。

## 原105项失败：分类范围

先读取原 JSON 与基线对照，没有先重跑1081项寻找线索。原105项当前均有通过的定向证据，见[105项逐例分类JSON](navigation-regression-original-105.json)；集中浏览器运行另发现8项，结果单独列在下文。旧对照的实际基线为 `65226b86`，不能把其中12项代表性复测扩张成105项全部基线复测。

| 分组 | 原失败数 | 详细证据 |
|---|---:|---|
| 账户与资料库 | 55 | [逐项清单与根因](navigation-regression-account-library.md) |
| 旧入口、探针、控件契约 | 32 | [逐项清单与根因](navigation-regression-test-contracts.md) |
| 视觉、动画与渲染环境 | 17 | [逐项根因与环境证据](navigation-regression-visual.md) |
| 整页集合返回动画旧标记 | 1 | `libraryNavigation.spec.ts:369` 已复现并修正为当前反向 cover 的 `direction="out"`；仍验证实际出现和结束，已通过 |
| 合计 | **105** | 无删除、批量跳过或放宽阈值 |

按原失败的**主要根因**互斥归类：**3项产品缺陷**（保留完整列表的定位判断、Bravais星标换行、不透明交接误挂载）；**90项测试契约、fixture或等待条件修正**；**12项在清洁环境复测通过、原始原因未全部证实**（11项视觉/时序，1项面板尺寸超时）。截图包含多个环境与已有UI差异，按主要的基线/fixture问题归类；审图额外发现的坏封面占位缺失单独修复，不借此扩大原产品缺陷计数。最终全量新增问题也单独记录，不反写原105项范围。

其他已证实产品缺陷：完整歌曲列表重新读取失败后，原有曲目仍保留，却被定位器误判为不完整。资源快照现在将读取完整性与保留曲目一起传递，失败不会抹去旧快照的完整性，初次或部分读取失败仍保持“不完整”。这是临时资源状态，无数据库迁移。独立审查还以缓存往返复现了“上游仍有后续页、但按总数停止时被缓存为已读完”的边界；补齐既有 hasMore 字段的正确语义，22项资源单测已通过。Bravais 的“播放全部 / 加入队列 / 星标”动作在窄缝中会换行，星标落到第二行，已用原布局的最小 flex 约束修正。另有不透明墙交接期间过早重挂 visualizer 的问题，修复尊重现有交接状态，保留透明墙所需渲染，不降低画质。

首页坏封面现保留原 Disc 占位，两种布局的坏图→有效URL→坏图真实浏览器回归2/2通过，URL与size变化可重新加载，不修改原封面数据。截图只有3个指定基线更新，保留原600px阈值。媒体查询 fixture 修复与已有 UI/字体差异的证据见[视觉分类报告](navigation-regression-visual.md)；可对照[本地首页旧基线](navigation-regression-evidence/local-home-before.png)与[本地首页当前基线](../../test/ui/app.screenshot.spec.ts-snapshots/local-library-linux.png)。

## 中断后恢复与剩余8项

恢复时先核对 status、diff 和最近提交：锚点初始化、共享 React 测试入口、设置历史桥接及既有分类修改全部仍在。未 reset、clean 或覆盖未提交修改；没有重新开始整轮审查。

| 失败项 | 根因与影响 | 修正及最终证据 |
|---|---|---|
| 播放入口设置 1 项 | 本轮设置历史新回归：命名锚点目标尚未初始化，就被记作已恢复页面，真实用户入口受影响 | 初始快照直接解析锚点 tab/section；稳定 RED→GREEN，6项设置历史与原入口用例通过 |
| 直接挂载诊断弹窗 3 项 | 测试硬编码默认 Vite React 缓存，与隔离缓存不一致，挂载前 Invalid hook call；无生产 provider 改动 | dev-only 正常模块导入共享 React/createRoot；3项通过 |
| Navidrome 定位 1 项 | 测试未真正离开后重开集合，且全局定位器同时命中背景首页；不是已证实的线上服务故障 | 真实离开/重开、核对 store 身份及唯一集合内定位，保留两条精确状态断言；最终1/1通过 |
| 艺术家打开专辑 1 项 | 资源快照先于侧栏条目渲染，测试调用仍受保护的 open 动作过早 | 等待动作可用，保留 provider、历史栈和不重复获取断言；3种 renderer 均通过 |
| Bravais 艺术家折返 1 项 | 本轮测试等待 helper 错用 collection 目标，实际处于 artist 页 | 3处调用显式声明 artist；普通 Back 与折返仍各验证一次反向翻转，最终1/1通过 |
| 原生平滑滚动采样 1 项 | **根因未证实**：独占3次仍有1次仅采到最终位置120，不能归咎并发、CPU或 WebKit | 不改生产滚动；保留中间采样与居中严格断言，加测试诊断后3/3通过。此前失败仍保留，列为间歇测试风险 |

## 集中验证与交付

类型检查和 Production Build 已通过；本地 Production 产物的触屏 Back/Forward/关闭设置检查通过，0个 pageerror，见[生产构建导航检查](navigation-regression-evidence/production-navigation-smoke.json)。这不是远程 Preview 或 iPad 证明。

最终全量单测：**9721通过、2项既有跳过、0失败**（857文件），216.39秒；使用默认测试超时，只限定2个worker，没有新增跳过。前一轮278.67秒使用过 CLI 超时覆盖，因此保留为历史、不作为最终超时验证。详见[单测记录](navigation-regression-evidence/full-unit-result.txt)。jsdom 对既有 Folium `@layer` CSS 输出解析警告，没有导致测试失败。新增资源缓存往返回归已包含在本次全量结果中。

严格动画/性能组：**7文件72/72通过**（675.68秒，0跳过、0失败、0重试）；原断言与阈值保留。500与5000首墙首屏均77个tile，峰值动画35、屏外动画0，独占最大mount block为65.8/57.2ms。主线程阻塞250ms时仍记录5个有效动画采样、90px移动。此为云端独占 Chromium 证据，不是iPad帧率证明。详见[17项视觉分类与最终结果](navigation-regression-visual.md)。

其余97个功能文件的既有集中运行：**1007通过、8失败、2项既有跳过**（6126.06秒），与上述7个严格动画文件互斥，并集覆盖全部104个浏览器文件、1089项。未因会话恢复再跑全集。后续 UI 定向运行28通过/1失败，其中设置历史6项全部通过；该失败的 Navidrome 定位后来1/1通过。探针定向运行4通过/1失败，后者 Bravais 艺术家 helper 修正后1/1通过。滚动独占复测2通过/1失败，加入诊断后3/3通过，保留未定根因风险。新锚点用例使当前总用例数为1090；这些分次结果不包装为“一次全绿”。逐例结果、时间与原始报告校验值见[最终浏览器证据](navigation-regression-final-browser.json)。未删除用例、增加跳过、延长测试超时或放宽断言。

全部测试只使用独立合成数据或模拟平台响应，不访问用户实际曲库，不证明第三方在线匹配成功率。最终 `npm run typecheck` 通过，`npm run build` 通过（Vite 6.22秒，203项预缓存）。测试诊断 wrapper 的可选参数类型在最终类型检查中一并校正，未改变已测调用行为。构建保留既有分包大小提示，生成的 API 文件无差异。提交与 Preview 状态另在 PR 及交付报告核对。

## iPad 最小验收

仅在原 Preview 上确认：播放器打开设置，Safari Back 先关闭设置，Forward 恢复；进入歌词设置的全局时间偏移面板，Back 与触屏取消都返回设置；在专辑/歌单上打开再关闭设置后仍留在原集合。无需重测已验收的导入、基础播放、触屏切歌、M3U 或普通歌词同步。

## 证据边界

账户与诊断测试使用注入的合成平台服务，只证明当前 Web 登录入口、取消、键盘可达、错误反馈和激活流程，不证明真实账号或 Electron 内嵌后端可用。网易云/QQ/酷狗 P0 的已知在线可用性问题仍未通过，本轮未更改相应 provider、评分或调度，也没有以模拟结果宣称在线服务恢复。
