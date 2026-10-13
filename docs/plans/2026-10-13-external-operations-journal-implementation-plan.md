# dsh-m 外部操作记录（外部通道直落日志）实施计划

## 目标

- 让非面板通道（`dshm` CLI、Agent 工具）发起的 Profile 变更以**终态直落记录**进入市场面板「已结束」列表（带渠道徽标），消除操作审计面与真实系统状态的脱节（实例：0.1.28 经 Agent 工具升级后面板无任何记录）。
- 一期不做 UI 操作的服务端镜像（跨浏览器历史），不改动操作泵的七态/重放语义。

## 架构快照

- 三条变更通道已收敛到 core 同一批公共入口（`src/core/market.ts`、`src/core/toggle.ts`、`src/core/profile-ops.ts`，均经 `withMutationSession`）：面板 API（`src/core/host-api.ts`）、`dshm` CLI（`src/cli.ts`）、Agent 工具（`src/tools.ts`）。
- 新增**机器本地**的外部操作日志文件 `$DSH_HOME/dshm/external-operations.json`（`DSHM_EXTERNAL_JOURNAL_FILE` 可覆盖以便测试；与 `dshm/cache` 同基址、但不带 profile 维度、不被缓存清理波及）。core 变更入口按调用通道决定是否直落一条终态记录：**成功与失败都记**，滚动上限 200 条，原子写（沿用 community.ts 的 tmp+rename 惯例）。
- 面板「已结束」列表改为并读两类记录：本地操作泵（浏览器 localStorage `dshm-operations`，现状不动）+ 外部日志（host-api 新增 method 读取/清除）。外部记录**仅存服务端**，面板以**内存 overlay** 并读（不写 localStorage，R1-3）。外部记录带渠道徽标（**Agent 工具**/**命令行**），终态直落语义——不入操作泵、永不 queued/running、不参与恢复重放、宿主重启后原样保留。
- 与直落先例同构：community-toggle/registry-url 已是"创建即终态、不入泵"的记录（operations.js 2026-10-10 修订），本计划新增一类同构 record + 服务端存储，不碰操作泵状态机。

## 全局约束（逐字继承自 grilling 共识，2026-10-13）

- 记录**机器本地、不跨机同步**（用户 Q5 确认）；每台主机独立一份，Windows desktop 机的 dsh-m 与本机互不相干。
- 终态直落：不入操作泵、永不 queued/running、不参与恢复重放；宿主重启后原样保留（Q7）。
- 记录不含凭据与原始命令输出（Q3）；`reason` 字段截断至 **≤300 字符**（R1-8）。
- 失败的外部记录点亮红点（Q4）。
- **直落写入绝不反噬操作终态**（R1-1）：日志 append 的任何失败（磁盘满、权限、损坏）必须被钩子吞掉（至多 stderr 一行），操作结果与返回值不变；panel 通道在钩子层**跳过** append——append 侧对 panel 抛错仅为防御性不变量。
- 渠道徽标文案：**Agent 工具** / **命令行**（Q2b）。
- 版本 bump 至 **0.9.79**（Q8）；npm 发版与 dsh-m 自升级（selfUpgrade/重启）**另行经用户确认**，不属于本计划执行范围。
- 测试对照 know-how 028 本机既有失败清单防误判（本机 Linux 基线干净）。
- 无额外全局约束（其余沿用仓库既有惯例：原子写 tmp+rename、`node --test`、`npm run typecheck`）。

## 输入工件

- grilling 共识：本会话 2026-10-13 设计树（Q1–Q8、Q2b、Q5 机器本地确认）
- docs/DESIGN.md §2.6「全局操作记录」（外部记录为增量，不修改泵语义）
- GLOSSARY.md 工作树新增词条：外部通道（External Channel）/ 外部操作记录（External Operation Record）
- know-how 028（dsh-m 本机测试既有失败清单）、018（发版 staged 现象）

## 文件结构与职责

| 动作 | 路径 | 职责 |
|---|---|---|
| Create | `docs/adr/0018-external-operations-journal.md` | 记录「外部审计日志与操作泵分离」的取舍（存储位置、通道判定、与泵的关系） |
| 已改待提交 | `GLOSSARY.md` | 外部通道 / 外部操作记录两条术语（工作树已改，随 Task 1 入库） |
| Create | `src/core/external-journal.ts` | 机器本地日志存储：append/list/clear、滚动 200、原子写、路径可注入 |
| Create | `tests/external-journal.test.mjs` | 存储单测（append/list/滚动/清除/损坏容错/路径隔离） |
| Modify | `src/core/market.ts` | `installFromRegistry`/`uninstallPlugin`/`upgradePlugin`/`selfUpgrade` 增 `channel` 参数与直落挂钩；`installEntry` 为内部入口**不插桩** |
| Modify | `src/core/toggle.ts` | `togglePlugin` 增 `channel` 参数与直落挂钩 |
| Modify | `src/core/profile-ops.ts` | desktop 四入口：desktopToggle **透传**给 togglePlugin（唯一嵌套对）；desktopInstall/desktopUninstall/desktopUpgrade **自记**（内部委派 service.installBundle/removeBundle，不经 market.ts 已插桩入口）；channel 注入按各入口实际签名（install/upgrade 走 opts，toggle/uninstall 扩展 deps） |
| Modify | `src/core/host-api.ts` | 面板调用点（install/uninstall/set-enabled/upgrade/**self-upgrade**）标 `'panel'`；新增 method `external-operations`（list）与 `external-operations-clear` |
| Modify | `src/cli.ts` | 调用点标 `'cli'` |
| Modify | `src/tools.ts` | 调用点标 `'host-tool'` |
| Modify | `src/client/operations.js` | 操作模型并入外部记录（终态直落类型 + channel 字段 + 清除联动） |
| Modify | `src/client/operations-view.js` | 「已结束」渲染：渠道徽标（Agent 工具/命令行）、失败红点样式沿用 |
| Modify | `src/client/main.jsx` | 启动与操作完成后 `api('external-operations')` 拉取并入模型；清除时连带 `api('external-operations-clear')` |
| Modify | `tests/client-operations.test.mjs`、`tests/client-operations-view.test.mjs` | 外部记录的合并/徽标/清除/计数用例 |
| Create | `tests/external-journal-channels.test.mjs` | 通道插桩单测（panel 零记录、cli/host-tool 各一条、嵌套 desktopToggle 单条、失败记录 failed） |
| Modify | `package.json`、`CHANGELOG.md` | 版本 0.9.79 + 变更条目 |

## 全局类型契约（先于任务定义，各任务共用）

- `type OperationChannel = 'panel' | 'cli' | 'host-tool' | 'external'`（`external` 仅为缺省兜底，三个已知调用点必须显式传值）
- `ExternalOperationRecord = { id: string, at: number, channel: 'cli' | 'host-tool' | 'external', kind: 'install' | 'uninstall' | 'upgrade' | 'self-upgrade' | 'toggle' | 'desktop-install' | 'desktop-uninstall' | 'desktop-upgrade' | 'desktop-toggle', target: string, fromVersion?: string, toVersion?: string, result: 'ok' | 'failed', reason?: string }`
  - `channel` 不含 `'panel'`（append 层拒绝，R1-4 放宽为可记录 `'external'` 兜底，客户端给兜底徽标「外部」）；`reason` ≤300 字符截断（R1-8）。
- core 新导出（`src/core/external-journal.ts`）：`appendExternalOperation(record: ExternalOperationRecord): Promise<void>`、`listExternalOperations(): Promise<ExternalOperationRecord[]>`、`clearExternalOperations(): Promise<void>`
- 环境变量：`DSHM_EXTERNAL_JOURNAL_FILE`（整文件路径覆盖，测试隔离用）；缺省 `$DSH_HOME/dshm/external-operations.json`
- 公共入口 `opts` 增 `channel?: OperationChannel`（缺省 `'external'`）；**记录发生在操作终态之后**（成功/失败都记）

## 任务清单

### Task 1: ADR 0018 + GLOSSARY 入库

- 目标：把「外部审计日志与操作泵分离」的取舍存档，并把已改的 GLOSSARY 词条一并入库。
- Files：Create `docs/adr/0018-external-operations-journal.md`；Commit `GLOSSARY.md`（工作树已改）。
- 接口契约：
  - Consumes：GLOSSARY.md 工作树改动（外部通道/外部操作记录两词条，已在 grilling 阶段写入）；docs/adr/0001–0017 的格式惯例。
  - Produces：ADR 0018（后续任务的取舍依据，被 README/CHANGELOG 引用）。
- 验证范围：ADR 存在且结构对齐既有 0017；GLOSSARY 两词条在 git 已跟踪状态。
- [ ] Step 1: 写 `docs/adr/0018-external-operations-journal.md`：决策=外部通道变更以机器本地直落日志记录、与操作泵分离；备选=并入操作泵（否：localStorage 浏览器本地、CLI 进程写不到）、不入账（否：审计面脱节，本次 0.1.28 升级无记录为实证）；范围说明=本机挂载/web-desktop 不跨机。
- [ ] Step 2: `git add GLOSSARY.md docs/adr/0018-external-operations-journal.md && git commit -m "docs(adr): external operations journal decision; glossary terms"`
- Run: `git log --oneline -1 && ls docs/adr/0018*`
- Expected: 提交存在；ADR 文件在位。

### Task 2: core 外部日志存储 `src/core/external-journal.ts`

- 目标：机器本地的 append/list/clear 存储，滚动 200 条，原子写，损坏容错。
- Files：Create `src/core/external-journal.ts`；Test `tests/external-journal.test.mjs`。
- 接口契约：
  - Consumes：全局类型契约（OperationChannel/ExternalOperationRecord）；env.ts 的 `dshHome()` 惯例；community.ts 的 tmp+rename 原子写模式。
  - Produces：`appendExternalOperation` / `listExternalOperations` / `clearExternalOperations`（Task 3 挂钩、Task 4 host-api、Task 5 client 消费）。
- 验证范围：`npm run build && node --test tests/external-journal.test.mjs`。
- [ ] Step 1: 写失败测试 `tests/external-journal.test.mjs`（每例经 `DSHM_EXTERNAL_JOURNAL_FILE` 指到临时文件）：①append→list 返回同记录且按 at 降序；②第 201 条 append 后最旧一条被滚出（总数恒 ≤200）；③clear 后 list 为空且文件仍存在（空数组）；④损坏文件（写入 `not-json`）后 list 不抛、改名保留为 `<file>.corrupt-<ts>` 并从空开始；⑤channel='panel' 的记录被 append 拒绝（抛错，面板通道不走外部日志）；⑥记录序列化后不含 `token|key|secret` 字样（无凭据断言）；⑦`DSHM_EXTERNAL_JOURNAL_FILE` 指向不可创建的路径（如 `/proc/.../x.json`）→ append 抛错（存储契约：错误上抛，由上层钩子吞）；⑧`reason` 超 300 字符被截断。
- Run: `npm run build && node --test tests/external-journal.test.mjs`
- Expected: 模块不存在 → 测试文件加载失败（红）。
- [ ] Step 2: 确认红（运行并粘贴失败输出）。
- [ ] Step 3: 最小实现 `src/core/external-journal.ts`：`journalFile()` = `process.env.DSHM_EXTERNAL_JOURNAL_FILE || join(dshHome(), 'dshm', 'external-operations.json')`；**append 前 `mkdir(dirname, { recursive: true })`（已存在忽略；R2-4——全新机器上 `dshm/` 目录可能尚不存在，首条审计记录恰是最有价值的一条，不能静默丢失）**；append 走 tmp+rename 原子替换（community.ts 的 `atomicWrite` 是模块内私有函数，本模块自带同款实现：`${path}.tmp-${pid}-${Date.now()}` 写入后 rename）+ 200 条滚动；channel==='panel' 抛错；损坏容错按 ④；`reason` 截断至 300 字符（⑧）。
- [ ] Step 4: 重跑确认绿；`npm run typecheck` 通过。
- Run: `node --test tests/external-journal.test.mjs && npm run typecheck`
- Expected: 全绿。

### Task 3: `channel` 参数 + 九入口插桩 + 嵌套单记录

- 目标：三条通道的变更按通道直落一条记录；面板通道零记录；**desktopToggle 透传 togglePlugin（唯一嵌套对），desktopInstall/desktopUninstall/desktopUpgrade 自记**（内部委派 service.installBundle/removeBundle，不经 market.ts 已插桩入口）——单笔事务只产生一条记录。
- Files：Modify `src/core/market.ts`（installFromRegistry/uninstallPlugin/upgradePlugin/selfUpgrade）、`src/core/toggle.ts`（togglePlugin）、`src/core/profile-ops.ts`（desktop 四入口：toggle 透传，install/uninstall/upgrade 自记）、`src/core/host-api.ts`（调用点标 panel）、`src/cli.ts`（标 cli）、`src/tools.ts`（标 host-tool）；Test `tests/external-journal-channels.test.mjs`。
- 接口契约：
  - Consumes：Task 2 的 appendExternalOperation；全局类型契约；既有公共入口签名（market.ts:956/1556/1603/1669、toggle.ts:100、profile-ops.ts:168/309/517/578）。
  - Produces：九入口的 `opts.channel` 契约；`fromVersion/toVersion` 提取规则（InstallResult.version / UpgradeResult.fromVersion+version；缺失省略）。
  - 可测性落点（R3-1）：钩子经 deps 取 append——`deps.appendExternalOperation ?? appendExternalOperation`（缺省真实现），用例⑦由此注入抛错。
- 验证范围：`npm run build && node --test tests/external-journal-channels.test.mjs`。
- [ ] Step 1: 写失败测试 `tests/external-journal-channels.test.mjs`（deps 注入 mock 安装/升级执行 + `DSHM_EXTERNAL_JOURNAL_FILE` 指临时）：①cli 通道 upgrade 成功 → 恰一条 `{channel:'cli', kind:'upgrade', result:'ok', toVersion}`；②host-tool 通道 → channel:'host-tool'；③panel 通道 → 零记录；④upgrade 抛错（守卫/网络）→ 恰一条 result:'failed' 带原因（**reason ≤300 断言**）；⑤desktopToggle 嵌套 togglePlugin → 恰一条（不双记）；⑥desktopInstall/desktopUninstall/desktopUpgrade 三入口**各自记**单条（channel 按 caller 各验一，kind 用 desktop-*）；⑦append 注入抛错 → 操作仍 ok 返回、journal 保持原样、调用方无感；⑧selfUpgrade 经 panel 通道 → 零记录（契约就绪断言）。
- Run: `npm run build && node --test tests/external-journal-channels.test.mjs`
- Expected: 红（channel 参数与挂钩尚不存在）。
- [ ] Step 2: 确认红。
- [ ] Step 3: **call-graph audit**（源码实读，不改代码）：对 desktopInstallFromRegistry / desktopUninstall / desktopUpgradeFromRegistry / selfUpgrade 逐个记录其内部是否调用已插桩公共入口，结论写入本任务 PR 描述；据此定每个入口"自记"或"透传"。
- [ ] Step 4: 最小实现：九入口增 `channel` 参数（缺省 'external'）+ 终态后钩子。**钩子约束（R1-1）**：channel='panel' 时跳过 append（append 侧抛错仅为防御性不变量）；append 任何失败被吞（至多 stderr 一行），操作终态与返回值不变；`reason` 截断 ≤300。**desktop 口径（R1-2）**：desktopToggle 透传 togglePlugin；desktopInstall/desktopUninstall/desktopUpgrade 自记（签名按实况：install/upgrade 走 opts、toggle/uninstall 扩展 deps）。**调用点标 panel/cli/host-tool（R2-2）：host-api 的五个 mutation case（install/uninstall/set-enabled/upgrade/self-upgrade）全标 'panel'**——self-upgrade 漏标将使面板自升级以 'external' 直落，违反面板零记录不变量。
- [ ] Step 5: 重跑确认绿；`npm run typecheck` 通过。
- Run: `node --test tests/external-journal-channels.test.mjs && npm run typecheck`
- Expected: 全绿。

### Task 4: host-api 读取与清除方法

- 目标：面板能读到外部记录并能连带清除。
- Files：Modify `src/core/host-api.ts`（method 分发 switch，:316 起的既有模式）；Test Create `tests/host-api-external.test.mjs`（import 既有导出 `createApiDispatcher`（host-api.ts:273），按 `HostApiContext`/`HostApiOverrides` 接口（:91/:53）构造最小 ctx 与注入的 market deps，直接以 `{method:...}` body 驱动分发，断言响应——不 mock HTTP 层）。
- 接口契约：
  - Consumes：Task 2 的 list/clear；既有 method switch 模式（'installedUpdates' 同形）。
  - Produces：`method:'external-operations'` → `{ok:true, records:[...]}`；`method:'external-operations-clear'` → `{ok:true}`。
- 验证范围：`npm run build && node --test tests/host-api-external.test.mjs`。
- [ ] Step 1: 写失败测试：external-operations 返回 journal 内容；external-operations-clear 后 journal 为空且再次 list 为空；两 method 均要求面板会话（沿既有 host-api 鉴权，不新增特例）。
- Run: `npm run build && node --test tests/host-api-external.test.mjs`
- Expected: 红（method 未实现）。
- [ ] Step 2: 确认红。
- [ ] Step 3: 最小实现两个 case（list 直通 listExternalOperations；clear 直通 clearExternalOperations）。
- [ ] Step 4: 重跑确认绿。
- Run: `node --test tests/host-api-external.test.mjs && npm run typecheck`
- Expected: 全绿。

### Task 5: client「已结束」并读渲染 + 清除联动（内存 overlay，不写 localStorage）

- 目标：外部记录以渠道徽标混入「已结束」按日分组列表，计入计数，失败红点，「清除已结束」连带清除服务端日志。**外部记录只进内存 overlay**（fetch 后并入渲染 state），不写 localStorage——否则服务端滚动淘汰/清除后会被本地副本"复活"，且每浏览器各留一份（R1-3）。
- Files：Modify `src/client/operations.js`、`src/client/operations-view.js`、`src/client/main.jsx`；Test Modify `tests/client-operations.test.mjs`、`tests/client-operations-view.test.mjs`。
- 接口契约：
  - Consumes：Task 4 的两个 method；client `api(method, params)` 封装（main.jsx:685）；operations.js 的直落记录先例（community-toggle 模式）；外部记录 id 由 core 生成、跨 fetch 稳定（合并按 id 幂等）。
  - Produces：操作模型中的外部记录 overlay 渲染契约（交付即终点）。
- 验证范围：`npm run build && node --test tests/client-operations.test.mjs tests/client-operations-view.test.mjs`。
- [ ] Step 1: 写失败测试：①模型：外部记录并入后与本地记录按 createdAt **升序**统一喂 `groupOpsByDay`（operations-view.js:70-72 假定升序输入，合并方向必须定义）；②清除 = clearFinished + `external-operations-clear` + overlay 同步清空，persist 序列化**不含外部记录**（localStorage 纯净性断言，R1-3）；③按 id 幂等：重复 fetch 同 id 不产生双条；④failed 外部记录点亮红点；⑤view：徽标文案 **Agent 工具** / **命令行** / 兜底**外部**（R1-4），按日分组不破；⑥**channel 非空的行不渲染单条 ✕**（R2-3）。
- Run: `npm run build && node --test tests/client-operations.test.mjs tests/client-operations-view.test.mjs`
- Expected: 红。
- [ ] Step 2: 确认红。
- [ ] Step 3: 最小实现：operations.js 增外部记录 overlay（内存数组 + 按 id 幂等合并 + 清除联动，**不进入 persist 路径**）；operations-view.js 增渠道徽标渲染；**可移除判定下沉为 operations-view.js 纯函数**（如 `opRowVm` 增 `canRemove`：`!rec.channel && (input|failed|superseded)`，R3-1——main.jsx:3135 的内联判定改为消费该字段，用例⑥即落入纯函数验证范围）；**channel 非空的行不渲染单条 ✕**（移除出口仅「清除已结束」——否则 ✕ 移除后下次 fetch 按 id 复活，R2-3）；main.jsx 拉取时机 = 面板初始化 + 每次操作完成后 + **打开操作记录卡（settings tab）时**各 fetch 一次（R1-6：常驻期间他终端变更不做轮询，一期明示），清除时调用 external-operations-clear。
- [ ] Step 4: 重跑确认绿。
- Run: `node --test tests/client-operations.test.mjs tests/client-operations-view.test.mjs && npm run typecheck`
- Expected: 全绿。
- [ ] Step 5: 已结束计数取舍（R1-7，写入验收）：标题计数改用**合并后总数**（main.jsx:3110 现状 `slice(-50)` 只影响渲染截断——最近 50 条照旧显示，计数不再失真）；该取舍写入本任务验收标准。

### Task 6: 版本 0.9.79 + CHANGELOG + 终验

- 目标：版本与变更记录就绪，全量验证通过，达到"可请求发布"状态。
- Files：Modify `package.json`、`CHANGELOG.md`。
- 接口契约：
  - Consumes：Tasks 1–5 全部产物。
  - Produces：0.9.79 就绪树（发布与 dsh-m 自升级**另经用户确认**，不属于本计划）。
- 验证范围：`npm run typecheck && npm test && git diff --check`；对照 know-how 028 本机既有失败清单确认无新增失败。
- [ ] Step 1: `package.json` version → 0.9.79；CHANGELOG.md 增 0.9.79 条目（外部操作记录、双通道徽标、清除联动）。
- [ ] Step 2: 全量终验。
- Run: `npm run typecheck && npm test && git diff --check`
- Expected: 全绿且失败计数与 028 清单一致（无新增）。
- [ ] Step 3: checkpoint commit（版本+CHANGELOG）；输出修改摘要，等待用户发布指令。

## 执行纪律

- 开工前：批判性复查本计划；发现缺项/矛盾/命令无效 → 先修计划再动代码；**在 main 直接实施前与用户确认一次**（沿用 quota-watch 先例）。
- 按任务顺序执行；每任务完成即跑该任务验证；不做无声跳步/合并步。
- 遇阻塞、连续失败或计划与仓库现实不符，立即停下说明，不猜路径。
- Task 3 的 call-graph audit 是事实工作：以源码实读为准，结论写入提交描述。
- 发布（npm OIDC，注意 know-how 018 staged 现象）与 dsh-m 自升级（selfUpgrade/重启）不在本计划内，另行经用户确认。

## 最终验证

- `npm run typecheck && npm test && git diff --check` 全绿；失败计数与 know-how 028 本机清单一致（无新增）。
- 手工冒烟（本机）：`dshm upgrade` 任一已装插件 → 面板「已结束」出现「命令行」徽标记录；面板内开关一次 → 只有一条面板本地记录、无外部双记；「清除已结束」后两类记录同清。
- 输出修改摘要（文件清单 + 测试计数），交用户复审。
