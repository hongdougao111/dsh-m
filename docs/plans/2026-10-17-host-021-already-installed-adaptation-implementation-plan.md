# dsh-m 0.10.0 宿主 0.2.1 already-installed 适配实施计划（第三方两步升级 + 自升级专用通道）

## 目标

- 第三方插件的 desktop 安装/升级在 DSH ≥0.2.1 宿主（`already-installed` 安装守卫）上恢复可用：install-first 错误码自适应转 `removeBundle → installBundle` 两步，add 腿失败自动回装旧版，新增「降级恢复」结局。
- dsh-m 自升级在 desktop 上经 **tarball 直覆盖专用通道**恢复可用（spike 已实证），含确认框、intent ledger 预写与开机对账。
- 发版 0.10.0 并完成本机 E2E 验收。

## §0 背景与根因（验收基线）

DSH 0.2.1-rc.1 的 `dsh-plugin-manager` 给 `installBundle()` 新增守卫（宿主源码 `lib/index.js:1989-1991`）：宿主挂载 HMR 时，spec 解析出的包名已存在于 profile manifest（无论目标版本新旧）→ 在 pnpm 之前抛 `already-installed`；官方语义从「覆盖安装=升级」改为「先 `remove_bundle` 再 `install_bundle`」（README.zh.md:100、lib/types/tools.js:12）。tarball/git 形态 spec 的包名在 pnpm 前不可知 → 不受守卫约束。真机 spike（2026-10-17，官方插件页粘贴 npmjs tarball URL）：覆盖安装已装的 dsh-m 0.9.91→0.9.94 成功、供应链策略对 2 小时新的 URL 依赖未拦截、激活形态 **restart-required**、manifest 中 dsh-m 依赖 spec 落成 URL 形态。影响面：dsh-m 产品内 desktop 升级/自升级全断；卸载（removeBundle）、新装（名字不在 manifest）、web 路径（自编排 pnpm）不受影响。

## §1 决议记录 R1–R15（验收基线）

| # | 决议 | 定案 |
|---|---|---|
| R1 | 范围 | 升级 + 自升级；卸载/开关/新装路径不动（主人实测无恙） |
| R2 | 第三方升级兼容策略 | install-first 错误码自适应：先单步 `installBundle(spec)`，收到 `error.code==='already-installed'` → `removeBundle(pkg)` → `installBundle(spec)` 重试（至多一次，无循环）；不做宿主版本探测 |
| R3 | add 腿失败兜底 | 自动回装 `pkg@previousVersion`（remove 后旧名不在 manifest，守卫不适用）；回装再失败 → 结构化报错明示缺席 + 恢复指引 |
| R4 | 降级恢复态 | 独立结果形态（升级失败、已恢复旧版）；计入设置页红点（与失败同级）；log 允许手动删除（删除不改真实状态） |
| R5 | install 路径撞守卫 | 静默自动两步化（同套机制）；操作记录留痕 `already-installed → 两步化` |
| R6 | 通道分治 | 第三方 = 官方两步；**自升级独享 tarball 直覆盖（D3）**——仅 dsh-m 自身用此通道，且 desktop 上任何「升级 dsh-m 自身」的动作在宿主 API/core 层单点改道，绝不落入通用两步 |
| R7 | 自升级（D3） | 入口全面保留（头部角标 + 已装/市场卡片升级按钮）；确认框；预写 intent + 对账安全网；`WRITE_GUIDANCE['self-upgrade']` 顺带修掉「请回 DSH Web」失配文案 |
| R8 | D1 双投递 | 弃（失败=插件缺席且无兜底执行者） |
| R9 | 版本与交付 | 跳过 0.9.95+ 直接发 0.10.0；首发装机走官方插件页 remove + install 精确版本 |
| R10 | 生效语义 | 忠实透传宿主 `application`（applied→即时生效；restart-required→提示重启）；`classifyUpgradeActivation` 保留、降级为参考 |
| R11 | E2E 验收 | dshmarket→latest（主）+ skip-browser-auth→0.4.0（次）；better-sidebar 0.28.0 与 005① 补丁重打另行安排，不入本计划 |
| R12 | 降级态红点 | 计入 |
| R13 | 降级态删除 | 允许（× 交互，不改真实状态） |
| R14 | 文档 | ADR-0022 立项；GLOSSARY 七词条（两步升级/宿主安装守卫/install-first 自适应/兜底回装/降级恢复/自升级专用通道/开机对账）；know-how 020 增补 §10（交付后） |
| R15 | 自升级路线终审 | D3 tarball 直覆盖（spike 实证后定案）；D1 弃、D2 被需求方否决（「自升级不能更新自己不可接受」） |

## 架构快照

- 宿主守卫（0.2.1 `dsh-plugin-manager`，`lib/index.js:1989-1991`）：HMR 宿主 + spec 名已在 profile manifest → pnpm 前抛 `ManagementFailure("already-installed")`；tarball/git spec 名在 pnpm 前不可知 → 不触发守卫（本机 spike 实证：URL 覆盖安装成功、激活形态 `restart-required`）。
- 第三方路径：`runManagedInstall`（`src/core/profile-ops.ts:429`）在首腿 `ChangeResult.error?.code === 'already-installed'` 时转 `removeBundle(pkg)` + 重试 `installOnce()`；add 腿终态失败（failed/cancelled）→ 兜底回装 `pkg@previousVersion`（此时旧名已不在 manifest，守卫不适用）；回装成功 = **降级恢复**结果，回装失败 = 缺席硬错误。
- 自升级路径：`host-api.ts:349-385 case 'self-upgrade'` 的 desktop 分支现调 `desktopInstall`（必撞守卫）→ 改调新函数 `desktopSelfUpgradeViaTarball`：`npmLatest` 精确版本 → `npmTarballUrl`（生效 registry 的 packument `dist.tarball`）→ 预写 intent → `installBundle(tarballUrl, {enabled:true})` → 终态补记。
- **勘误（相对 grill 版计划）**：ADR-0018 不变量「panel 通道零外部日志」（`host-api.ts:359` 显式 `channel:'panel'`）⇒ 自升级 `delegated` 预写**不进 external journal**，落独立 intent ledger（`$DSH_HOME/dshm/self-upgrade-intent.json`）；对账挂 `self-check`（`main.jsx:3307`；客户端有 localStorage TTL 缓存，TTL 内不触发——**对账定位为崩溃兜底网**：D3 正常路径在本进程内就地 resolve，仅当进程死于 promise 悬垂时由下一次 self-check 收口，TTL 延迟可接受），无需 host 启动装配点。
- 生效语义透传（R10）：`application='restart-required'` → `needsRestart:true`；`'applied'` → false。本机宿主实测两步/直覆盖均为 restart-required。
- **自升级入口路由不变量（R6 落地点，主人定案：入口全面保留）**：desktop 上任何「升级 dsh-m 自身」的用户动作——头部角标、已装列表 dsh-m 行的升级按钮、市场卡片升级按钮、**Agent 工具 `dshm_upgrade`/`dshm_install`**——在 **core 缝单点收敛**：`desktopUpgradeLocked`/`desktopInstallLocked` 检测 `pkg === SELF_PKG('dsh-m')` 即改道 `desktopSelfUpgradeViaTarball`（host-api `case 'upgrade'`/`case 'self-upgrade'` 随所在函数自动获得同语义）。**绝不落入通用两步**——remove+add 对调用者自身是破坏性路径。客户端与工具层零特判。

## 全局约束

- 测试框架：node:test（`node --test tests/*.test.mjs`），测试 import 自 `../lib/**`（先 `npm run build`）；TypeScript ^5.6，ESM 相对导入带 `.js` 后缀。
- 平台：Windows / PowerShell；超过 90 秒的命令一律 `run_in_background`（工作区 AGENTS.md）。
- 环境前提：`tests/profile-ops.test.mjs` 头部以 `DSHM_EXTERNAL_JOURNAL_FILE` 指向临时目录隔离 journal——新增 intent ledger 沿用同款 env 隔离（`DSHM_UPGRADE_INTENT_FILE`）；`lib/` 若重建遇 EPERM 按 know-how 028 §3 修 ACL。
- 不变量：ADR-0018 面板通道零外部日志；ADR-0002/0009 红线（不写 allowBuilds、排除块仅挂点治理）；删包不删数据。
- 文案规则：zh 主文案 + en 对照，双字典同层维护（`main.jsx:52` / `:173` 一带）；术语按 §1 七词条统一（两步升级 / 宿主安装守卫 / install-first 自适应 / 兜底回装 / 降级恢复 / 自升级专用通道 / 开机对账）。
- 版本：本计划交付 `0.10.0`（跳过 0.9.95+）。

## 输入工件

- 设计来源：grill 会话共识（2026-10-17，R1–R15）+ 真机 spike 实证；前版计划（本文件 2026-10-17 早版）由本轮 /writing-plans 重写取代。
- 宿主证据：`.dsh-research/asar-extract-0.2.1-rc.1/dsh/node_modules/@deepseek-ai/dsh-plugin-manager/`（README.zh.md:100、lib/index.js:1989-1991、lib/types/tools.js:12）。
- **宿主 0.2.1-rc.2 复核（2026-10-17，本机 17:20 升级后重提取）**：`asar-extract-0.2.1-rc.2` 与 rc.1 逐文件哈希比对——`dsh-plugin-manager` 全部功能文件（lib/index.js、typert.*、types/*、双 README）、`dsh-hmr/lib`、`dsh-desktop-host/lib`、`dsh-app-boot/lib`、`dsh-cordis-host-runner/lib`、`dsh-host-plugin-inventory/lib`、`dsh-plugin-market/lib` **字节级相同**（仅 package.json 版本号差异）；全树 329 个变更文件均为版本 bump 与无关特性（新增 `web-deepseek-api`、客户端 UI 模型标签条目）；两处 cordis.patch.yml 变更亦为无关插件条目。**本计划对 rc.2 原样成立，锚点零漂移；spike 结论（rc.1 上实证）经字节同一性直接传导至 rc.2。**

## 文件结构与职责

- Modify: `src/core/profile-ops.ts` —— `runManagedInstall` 两步化 + 兜底回装 + 降级结果；新增 `desktopSelfUpgradeViaTarball` 与 `SELF_PKG`（`'dsh-m'`）；**core 缝改道**：`desktopUpgradeLocked` / `desktopInstallLocked` 检测 `pkg === SELF_PKG` 时改道 D3（单点覆盖 tools.ts `dshm_upgrade` :461-462 / `dshm_install` :294-297 与一切经 core 的入口）；`DesktopOpsErrorCode` 增 `'rollback-failed'`；`DesktopInstallResult` 增 `degraded?` / `restoredTo?`。
- Modify: `src/core/packument.ts` —— 新增 `npmTarballUrl(pkg, version, timeoutMs, signal)`（复用 ADR-0012 生效源路由取 packument 读 `dist.tarball`）。
- Modify: `src/core/versions.ts:15-22` —— re-export `npmTarballUrl`。
- Create: `src/core/upgrade-intent.ts` —— intent ledger（write/read/resolve；env `DSHM_UPGRADE_INTENT_FILE` 隔离）。
- Modify: `src/core/host-api.ts` —— `case 'self-upgrade'` desktop 分支改调 D3（:349-373）；`case 'self-check'`（:330-346 一带）挂一次性对账；`case 'upgrade'` / `case 'install'`（同层 switch）响应映射补 `degraded` / `restoredTo`。
- Modify: `src/core/active-profile.ts:50` —— `WRITE_GUIDANCE['self-upgrade']` 文案更新。
- Modify: `src/client/op-outcome.js` —— degraded 结局投影（`createOpOutcome`）。
- Modify: `src/client/main.jsx` —— `DshmVersionChip.doUpgrade`（:3318-3349）确认框 + `needsRestart` 透传；TABS 徽标（:3286-3290）计降级态；文案键 zh/en 双字典。
- Test: `tests/profile-ops.test.mjs`（T2–T9）、`tests/upgrade-intent.test.mjs`（新建）、`tests/packument.test.mjs`（tarball 访问器）、`tests/host-api.test.mjs`（self-upgrade 分支 + 对账）、`tests/active-profile.test.mjs`（指引文案）、`tests/client-op-outcome.test.mjs`（degraded）、`tests/client-self-check.test.mjs`（确认框/needsRestart）、`tests/client-operations.test.mjs`（徽标/删除）。
- Create: `docs/adr/0022-already-installed-two-step-upgrade.md`；Modify: `GLOSSARY.md`。

接口总契约（任务间 Consumes/Produces 的名称以此为准）：`npmTarballUrl`、`writeUpgradeIntent` / `readUpgradeIntent` / `resolveUpgradeIntent`、`desktopSelfUpgradeViaTarball`、`DesktopInstallResult.degraded` / `.restoredTo`、`DesktopOpsErrorCode('rollback-failed')`、env `DSHM_UPGRADE_INTENT_FILE`。

## 任务清单

### Task 1: upgrade-intent.ts + intent ledger

- 目标：自升级委派意图的落盘/读取/对账收口（ADR-0018 合规，不进 external journal）。
- Files: Create `src/core/upgrade-intent.ts`；Test Create `tests/upgrade-intent.test.mjs`
- 接口契约：Consumes 无。Produces：`writeUpgradeIntent({target, version, fromVersion?, at})`、`readUpgradeIntent(): Promise<IntentRecord|undefined>`、`resolveUpgradeIntent({ok, installedVersion?}): Promise<IntentRecord|undefined>`（有悬垂记录时返回被收口的记录并改写 `status:'resolved'` + `resolvedAt` + `outcome`；无悬垂返回 undefined）、env `DSHM_UPGRADE_INTENT_FILE`。记录字段白名单：`{target, version, fromVersion?, at, status:'delegated'|'resolved', outcome?, resolvedAt?, installedVersion?}`，原子写（tmp+rename，同 external-journal.ts:74-78 模式）。
- 验证范围：`npm run build; node --test tests/upgrade-intent.test.mjs`

- [ ] Step 1: 写失败测试——`tests/upgrade-intent.test.mjs`：①env 隔离下 write→read 回读相等；②resolve 后 status=outcome 落盘且返回记录；③无文件时 read 返回 undefined、resolve 返回 undefined；④损坏 JSON 容错（隔离改名后按空处理，对齐 external-journal.ts:93 纪律）。
- Run: `npm run build; node --test tests/upgrade-intent.test.mjs`
- Expected: 模块不存在，import 报错 / 全红
- [ ] Step 2: 写最小实现（`src/core/upgrade-intent.ts`，结构对照 external-journal.ts 的 atomicWrite/readAll 容错）
- [ ] Step 3: 运行并确认通过
- Run: `node --test tests/upgrade-intent.test.mjs`
- Expected: 全绿

### Task 2: npmTarballUrl 访问器（npmVersion 薄封装）

- 目标：精确版本的 tarball URL，复用 ADR-0012 履约阶梯（含镜像 sync 腿）——**不新增 packument 面**：`npmVersion`（`packument.ts:307-357`）已按阶梯取精确版本并携带 `dist.tarball`（:337），本访问器只是薄封装。
- Files: Modify `src/core/packument.ts`（npmVersion 同族新增薄封装）；Modify `src/core/versions.ts:15-22`（re-export）；Test Modify `tests/packument.test.mjs`
- 接口契约：Consumes `npmVersion` 现有路由层。Produces：`npmTarballUrl(pkg: string, version: string, timeoutMs?: number, signal?: AbortSignal): Promise<string>` = `npmVersion(...).tarball`；tarball 缺失/版本不存在 → 抛可读错误（`{pkg}@{version} packument 缺 dist.tarball`）。
- 验证范围：`npm run build; node --test tests/packument.test.mjs`

- [ ] Step 1: 失败测试——三钉：正常返回 tarball；响应缺 `dist.tarball` → 可读错误；版本不存在 → 错误（均经 mock npmVersion 阶梯响应，不联网）。
- Run: `npm run build; node --test tests/packument.test.mjs`
- Expected: `npmTarballUrl is not a function` 全红
- [ ] Step 2: 薄封装实现 + `versions.ts` re-export
- [ ] Step 3: 通过
- Run: `node --test tests/packument.test.mjs; node --test tests/versions.test.mjs`
- Expected: 两文件全绿

### Task 3: runManagedInstall 两步化 + 兜底回装 + 降级恢复（升级路径）

- 目标：R2/R3 核心——already-installed → remove+add 重试；add 腿终态失败 → 回装旧版；回装成功 = 降级恢复，失败 = 缺席硬错误。
- Files: Modify `src/core/profile-ops.ts`（`runManagedInstall` :429、`mapFailure` :441 前插 already-installed 分支、`DesktopOpsErrorCode` :53 增 `'rollback-failed'`）；Test Modify `tests/profile-ops.test.mjs`
- 接口契约：Consumes `managerStub`（tests:45-66，`overrides.change`/`removeBundle` 编排）。Produces：`runManagedInstall` 返回增 `degraded?: boolean` / `restoredTo?: string`（经 `desktopUpgradeLocked` 透传至 `DesktopInstallResult`）；错误码 `'rollback-failed'`（details 携带 `{pkg, previousVersion, addDiagnostic}`）。
- 验证范围：`npm run build; node --test tests/profile-ops.test.mjs`

- [ ] Step 1: 失败测试（T2/T3/T4 三钉）——
  T2：首腿 `change={application:'failed', error:{code:'already-installed'}}` → 断言 `calls.removeBundle` 恰含 `'pkg-a'`、`installBundle` 共 2 次（第二次 spec 仍 `pkg-a@1.2.3`）、终态成功且 `output` 含 `two-step`；
  T3：第二腿失败（packageResult exitCode 1 + error）→ 第三次调用 spec 为 `pkg-a@0.9.0`（回装旧版，`depsFor` 的 listInstalled 返回 `previousVersion:'0.9.0'`）→ 结果 `degraded===true`、`restoredTo==='0.9.0'`；
  T4：回装也失败 → rejects 且 `err.code==='rollback-failed'`。
- Run: `npm run build; node --test tests/profile-ops.test.mjs`
- Expected: 三钉全红（现实现单步失败直接走 install-refused）
- [ ] Step 2: 最小实现——`installOnce` 外包裹层：首腿 already-installed 且 ctx 有 `previousVersion` → `service.removeBundle(ctx.pkg)`（changeOf 失败 → `remove-failed` 短路，不回装）→ `installOnce()`；再失败/取消 → `installOnce()` 换 spec `\`${pkg}@${previousVersion}\``；回装成功 → 返回 `{...verified, degraded:true, restoredTo:previousVersion}`；回装失败 → `DesktopOpsError('rollback-failed', …缺席文案…)`。release-age/build-blocked 分支保持先于 already-installed 判定（等待期语义优先）。（注：`ctx 有 previousVersion` 前置是 R3 兜底网的存在前提——无旧版即无回装能力，非决议范围收窄）
- [ ] Step 3: 通过
- Run: `node --test tests/profile-ops.test.mjs`
- Expected: 全绿（含既有 800 行用例零回归）

### Task 4: remove 腿失败 / build-blocked 先回装 / cancelled 语义

- 目标：T5/T8/T9 边界钉例，防止两步化破坏既有失败形态。
- Files: Modify `src/core/profile-ops.ts`；Test Modify `tests/profile-ops.test.mjs`
- 接口契约：Consumes Task 3 的两步分支。Produces：无新接口（行为钉）。
- 验证范围：`node --test tests/profile-ops.test.mjs`

- [ ] Step 1: 失败测试——T5 `removeBundle` 返回 `{application:'failed', error:{code:'bundle-in-use'}}` → rejects `remove-failed` 且 `installBundle` 仅 1 次调用（无回装）；T8（定形）第二腿 `application:'cancelled'` → 兜底回装旧版 → 回装成功 → rejects `DesktopOpsError('install-refused')` 且 message 含「已恢复旧版 0.9.0」「未做升级」（取消不冒充降级成功态，不产 degraded 结果）；T9 第二腿 `packageResult.kind==='build-blocked'` + pendingBuilds → 先回装（旧版大概率放行）再抛 `DesktopBuildApprovalNeeded`；**T9b 回装腿自身 build-blocked** → rejects `'rollback-failed'` 且 `details.pendingBuilds` 非空（降级失败真相优先，不伪装成待审批）。
- Run: `npm run build; node --test tests/profile-ops.test.mjs`
- Expected: 四钉红
- [ ] Step 2: 实现补齐（第二腿 build-blocked 先回装再抛审批；cancelled 走同一兜底入口、回装成功后抛取消文案；回装腿自身 build-blocked → rollback-failed + pendingBuilds）
- [ ] Step 3: 通过
- Run: `node --test tests/profile-ops.test.mjs`
- Expected: 全绿

### Task 5: install 路径静默两步化 + 全新安装单步回归

- 目标：R5——`desktopInstallFromRegistry` 目标已装（listInstalled 命中）时为 ctx 补 `previousVersion`，守卫命中即静默两步；全新包零行为变化（R1「新装路径不动」与 R5 的张力由 T6 钉消解：全新安装 `removeBundle` 恒零调用）。
- Files: Modify `src/core/profile-ops.ts`（`desktopInstallLocked` :206-326，runManagedInstall 调用 :290-294 一带）；Test Modify `tests/profile-ops.test.mjs`
- 接口契约：Consumes Task 3。Produces：install 结果同样可携带 `degraded`/`restoredTo`。
- 验证范围：`node --test tests/profile-ops.test.mjs`

- [ ] Step 1: 失败测试——T6：全新安装（listInstalled 空）断言 `removeBundle` 零调用；T7：listInstalled 含 `pkg-a@0.5.0` 且首腿 already-installed → 断言两步发生、结果 output 含 `already-installed → two-step`。
- Run: `npm run build; node --test tests/profile-ops.test.mjs`
- Expected: T7 红（install 路径未两步）
- [ ] Step 2: install 路径补 `previousVersion` 透传
- [ ] Step 3: 通过
- Run: `node --test tests/profile-ops.test.mjs`
- Expected: 全绿

### Task 6: host-api 响应映射 + self-upgrade 分支改调 D3 + self-check 挂对账

- 目标：把 core 能力接进宿主 API 面：降级字段透传、desktop 自升级改走 tarball 通道、对账在 self-check 每进程一次。
- Files: Modify `src/core/host-api.ts`（`case 'self-upgrade'` :349-385、`case 'self-check'` :330-346、`case 'upgrade'`/`case 'install'` 同层 switch 的响应映射；deps 注入对照 :284 `ctx.deps?.x ?? x` 模式）
- 接口契约：Consumes `desktopSelfUpgradeViaTarball`（Task 7）、`resolveUpgradeIntent`（Task 1）。Produces：self-check payload 增可选 `intentResolved?: {ok:boolean; target:string; installedVersion?:string}`；dispatcher deps 增 `desktopSelfUpgradeViaTarball` / `resolveUpgradeIntent` 注入位（测试用）；**改道唯一执行点在 core 缝（Task 7）**——host-api `case 'upgrade'` 不设特判，经 `desktopUpgradeFromRegistry` → core 缝自动获得 D3 语义（防御性冗余不设：单点强制优先）。
- 验证范围：`npm run build; node --test tests/host-api.test.mjs tests/host-api-profile.test.mjs`
- 依赖：Task 1、Task 7（本任务 Step 3 前置完成——执行顺序上排在 Task 7 后）。

- [ ] Step 1: 失败测试——①desktop self-upgrade 桩：dispatcher deps 注入 `desktopSelfUpgradeViaTarball` 假件，断言被调用且 payload 透传 `needsRestart`；②deps 预置悬垂 intent + installedVersion 相符 → self-check 响应含 `intentResolved.ok===true` 且 intent 文件转 resolved；③版本不符 → `intentResolved.ok===false`；④**改道端到端钉**：`case 'upgrade'` 目标 `dsh-m`、desktop profile → managerStub 断言 `installBundle` 恰一次收到 tarball URL 且 `removeBundle` 零调用（`desktopUpgradeFromRegistry` → core 缝 → D3 全链）。
- Run: `npm run build; node --test tests/host-api.test.mjs tests/host-api-profile.test.mjs`
- Expected: 四钉红
- [ ] Step 2: 实现（memoize 对账每进程一次；desktop 分支替换为 D3 调用；upgrade/install 映射补 degraded/restoredTo 透传）
- [ ] Step 3: 通过
- Run: `node --test tests/host-api.test.mjs tests/host-api-profile.test.mjs`
- Expected: 全绿

### Task 7: desktopSelfUpgradeViaTarball（D3 核心）

- 目标：自升级专用通道——精确版本 → tarball URL → intent 预写 → installBundle 直覆盖 → 终态补记。
- Files: Modify `src/core/profile-ops.ts`（新增导出，置于 `desktopUpgradeFromRegistry` 后）；Test Modify `tests/profile-ops.test.mjs`
- 接口契约：Consumes `npmLatest`（:623 deps 已有）、`npmTarballUrl`（Task 2）、`writeUpgradeIntent`/`resolveUpgradeIntent`（Task 1）、`managerStub.installBundle`。Produces：`desktopSelfUpgradeViaTarball(pkgName: string, currentVersion: string, opts?: {timeoutMs?; signal?}, deps?: {getService?; ensureService?; npmLatest?; npmTarballUrl?; writeUpgradeIntent?; resolveUpgradeIntent?; listInstalled?}): Promise<DesktopInstallResult & {needsRestart:boolean}>`——**mutation session 规格**：导出层自包 `withMutationSession`（对齐 desktopInstall :182 / desktopUpgradeFromRegistry :652 / market.selfUpgrade :1893 惯例），内层 `desktopSelfUpgradeViaTarballLocked` 无 session——core 缝改道发生在 `desktopUpgradeLocked` 的 session 之内，**调 Locked 内层避免嵌套**；**无 channel 参数，恒 panel 语义零外部日志**（ADR-0018）；同版本 → 抛 `DesktopOpsError('install-refused', no-op 文案)`；URL 构造失败/install 失败 → 正常 failed（旧版不受影响，spike 实证）+ 失败时 resolve 悬垂 intent（failed）；成功且 application='restart-required'/'applied' → 就地 resolveUpgradeIntent（restart-required 时进程仍活）；promise 悬垂（进程死于活交换）→ intent 留给 self-check 对账（崩溃兜底网）。另 Produces：**core 缝改道（唯一执行点）**——`desktopUpgradeLocked` / `desktopInstallLocked` 入口检测 `pkg === SELF_PKG('dsh-m')` → 委派 `desktopSelfUpgradeViaTarballLocked`（tools.ts `dshm_upgrade` :461-462 / `dshm_install` :294-297 两臂、host-api `case 'upgrade'`/`case 'self-upgrade'` 与一切经 core 的入口自动覆盖；host-api 不设第二改道点）。
- 验证范围：`npm run build; node --test tests/profile-ops.test.mjs`

- [ ] Step 1: 失败测试——T10 同版本 no-op；T11：`npmLatest→{version:'2.0.0'}` + `npmTarballUrl→'https://example.com/dsh-m-2.0.0.tgz'` 断言 installBundle 收到该 URL 且 `enabled:true`、结果 needsRestart 透传（stub 返回 restart-required）、intent 文件落 delegated 后被就地 resolve；T12：`npmTarballUrl` 抛错 → rejects 且零 installBundle 调用、零 intent 残留（写入前失败不落盘）；T17 **core 改道钉**：`desktopUpgradeFromRegistry('dsh-m', …)` → `installBundle` 恰一次收到 tarball URL 且 `removeBundle` 零调用；`desktopInstallFromRegistry('dsh-m', 已装态)` 同。
- Run: `npm run build; node --test tests/profile-ops.test.mjs`
- Expected: 四钉红（导出不存在）
- [ ] Step 2: 最小实现（版本相同短路 → URL → intent → installBundle → changeOf 判定 → 就地 resolveUpgradeIntent；悬垂兜底：promise 未 settle 场景无需显式处理——进程死后 intent 留给 Task 6 的 self-check 对账；`SELF_PKG` 入口改道实现于 desktopUpgradeLocked / desktopInstallLocked）
- [ ] Step 3: 通过
- Run: `node --test tests/profile-ops.test.mjs`
- Expected: 全绿

### Task 8: WRITE_GUIDANCE 自升级文案更新（unknown profile 场景）

- 目标：修掉「请回 DSH Web」失配指引。**语义边界（按代码可达性定形）**：`WRITE_GUIDANCE['self-upgrade']` 唯一可达路径 = 能力表对 unknown/fallback profile 的结构化拒绝（`assertWriteAllowed` :100-103；desktop 在 `DESKTOP_ALLOWED` :41 放行、不走此文案；no-manager 走 `DesktopOpsError` 亦不经此）——本文案描述「当前宿主形态不受支持」的场景，不代表自升级主语义（主语义 = D3 通道正常可用，Task 6/7/11）。
- Files: Modify `src/core/active-profile.ts:50`；Test Modify `tests/active-profile.test.mjs`
- 接口契约：Consumes 无。Produces：`WRITE_GUIDANCE['self-upgrade']` 新文案：「当前宿主形态不支持面板内自更新：请在官方 Settings → Plugins 对 dsh-m 执行 remove + install（精确版本），或完全退出 Desktop 后用 `dsh plugin --profile desktop add dsh-m@<版本>`。」
- 验证范围：`node --test tests/active-profile.test.mjs`

- [ ] Step 1: 失败测试——断言 guidance 含「Settings → Plugins」且不含「DSH Web」。
- Run: `npm run build; node --test tests/active-profile.test.mjs`
- Expected: 红
- [ ] Step 2: 改文案
- [ ] Step 3: 通过
- Run: `node --test tests/active-profile.test.mjs`
- Expected: 全绿

### Task 9: Phase A 收口（typecheck + 全量）

- 目标：core 面回归收口。
- Files: 无新增
- 接口契约：Consumes Task 1–8。Produces：绿基线。
- 验证范围：typecheck + 全量测试

- [ ] Step 1: `npm run typecheck` —— Expected: 零错误
- [ ] Step 2: `npm test`（预计 >90s，`run_in_background` 起跑，完成后取结果）—— Expected: 全绿（028 既有失败清单为零新增失败）
- [ ] Step 3: checkpoint commit：`git add -A; git commit -m "feat(core): host 0.2.1 already-installed 自适应两步升级 + D3 自升级专用通道"`

### Task 10: client op-outcome 降级投影 + 两处升级站点接线

- 目标：降级恢复结局的统一文案投影，**并接入其全部消费方**——否则降级结果（成功形态 + degraded:true）会走既有成功臂渲染成「升级成功」，与回滚事实相反。
- Files: Modify `src/client/op-outcome.js`；Modify `src/client/main.jsx`（两处升级站点：市场卡升级 `main.jsx:2044` 的 `oc.upgradeOkText(res)` 一带、已装列表同构站点 `:2540` 一带）；Test Modify `tests/client-op-outcome.test.mjs`、`tests/client-installed-updates.test.mjs`
- 接口契约：Consumes `createOpOutcome` 现有工厂（`main.jsx:35` 消费）、Task 3/5 的 `degraded`/`restoredTo` 结果字段。Produces：①outcome 分支 `degraded`（输入含 `degraded:true, restoredTo` 时命中），kind=`warn`，文案键 `op.degraded`：`升级失败：新版安装未成功，已自动恢复旧版 {restoredTo}——插件当前可用，可稍后重试。`；②两站点接线——`res.degraded===true` → `notify({kind:'warn', text:oc 降级文案})` 且**不进** `upgradeOkText` 成功臂，`setInstallNote` 同步降级句。
- 验证范围：`npm run build; node --test tests/client-op-outcome.test.mjs tests/client-installed-updates.test.mjs`

- [ ] Step 1: 失败测试——①工厂钉：degraded 输入 → `{kind:'warn', text:含 restoredTo}`；非 degraded 输入不命中新分支；②**站点钉**：升级站点收到 degraded 响应 → notify 为 warn 且零「升级成功 vX→vY」字样、installNote 含降级句。
- Run: `npm run build; node --test tests/client-op-outcome.test.mjs tests/client-installed-updates.test.mjs`
- Expected: 红
- [ ] Step 2: 实现 degraded 分支 + zh/en 文案键（`main.jsx:52`/`:173` 双字典同层加 `op.degraded`）+ 两站点接线（市场卡升级 `:2044` 一带、已装列表同构站点 `:2540` 一带）
- [ ] Step 3: 通过
- Run: `node --test tests/client-op-outcome.test.mjs tests/client-installed-updates.test.mjs`
- Expected: 全绿

### Task 11: 自升级确认框 + needsRestart 透传

- 目标：D3 语义预告（不卸载、失败无损、重启生效）与 R10 生效语义透传。
- Files: Modify `src/client/main.jsx`（`DshmVersionChip.doUpgrade` :3318-3349；文案键 :52/:173 双字典）
- 接口契约：Consumes Task 6/7 的 payload（`needsRestart`、失败时 `error`）。Produces：确认框文案键 `selfupgrade.confirm`：`将通过 tarball 直装通道把 dsh-m 升级到 {version}：不经过卸载，失败时当前版本不受影响；完成后需重启 Desktop 生效。`
- 验证范围：`node --test tests/client-self-check.test.mjs tests/client-render-smoke.test.mjs tests/client-installed-view.test.mjs`

- [ ] Step 1: 失败测试——①doUpgrade 触发先出确认（确认前零 api 调用）；②确认后 api 收到；③成功 notify 的 `needsRestart` 取响应值（applied→false 不出重启横幅；restart-required→true）；④**入口回归钉**：已装列表渲染 dsh-m 行且升级按钮可点（走通用 `upgrade` API——服务端 core 缝改道（Task 7）后自动获得 D3 语义，客户端零特判）。
- Run: `npm run build; node --test tests/client-self-check.test.mjs tests/client-render-smoke.test.mjs tests/client-installed-view.test.mjs`
- Expected: 红
- [ ] Step 2: 实现（受控确认态复用面板 Modal 骨架；`notify.needsRestart: res.needsRestart ?? true`；版本未知时不预填 {version}，确认框退化为无版本句式；顺带更新 `main.jsx:2936` 历史注释——自升级 tarball 通道已恢复，入口为头部角标 + 已装/市场卡片通用升级按钮经服务端改道）
- [ ] Step 3: 通过
- Run: `node --test tests/client-self-check.test.mjs tests/client-render-smoke.test.mjs tests/client-installed-view.test.mjs`
- Expected: 全绿

### Task 12: 操作泵降级落账 + Tab 徽标计降级态 + 删除回归

- 目标：降级恢复落账进操作泵并计入设置页红点（R12）；× 删除可清（R13）。
- Files: Modify `src/client/operations.js`（runOp 落账 :380/:443 一带）；Modify `src/client/main.jsx`（opsAttention :3817 一带 + TABS 徽标派生 :3286-3290 及其消费点）；Test Modify `tests/client-operations.test.mjs`
- 接口契约：Consumes 升级/安装结果新字段 `degraded`/`restoredTo`（Task 3/5）。Produces：**零新状态**——操作泵复用既有 `'warned'` 状态落账降级结果（`operations.js` 现产 `'warned'/'done'`，不新增 'degraded' 状态与状态文案键），记录 `meta` 携带 `{degraded:true, restoredTo}`；徽标计数沿用 `opsAttention` 对 warned 的既有统计（`main.jsx:3817`）→ 降级自动点亮红点；× 删除走既有 `op.remove` 通道零改动（回归钉）。
- 验证范围：`node --test tests/client-operations.test.mjs`

- [ ] Step 1: 失败测试——①runOp 收到 `degraded:true, restoredTo:'0.9.0'` 的结果 → 落账记录 status `'warned'` 且 meta 含 degraded/restoredTo → 设置 Tab 徽标非空；②dismiss 该记录 → 徽标清零；③dismiss 后真实插件状态字段不变（仅记录删除）。
- Run: `npm run build; node --test tests/client-operations.test.mjs`
- Expected: 红
- [ ] Step 2: 实现（泵落账分支 + 徽标口径确认；× 通道零改动，仅回归钉）
- [ ] Step 3: 通过
- Run: `node --test tests/client-operations.test.mjs`
- Expected: 全绿

### Task 13: Phase B 收口

- [ ] Step 1: `npm run typecheck` —— 零错误
- [ ] Step 2: `npm test`（run_in_background）—— 全绿、零新增失败
- [ ] Step 3: checkpoint commit：`git add -A; git commit -m "feat(client): 降级恢复结局 + 自升级确认框 + Tab 徽标计降级态"`

### Task 14: ADR-0022 落盘

- Files: Create `docs/adr/0022-already-installed-two-step-upgrade.md`
- 接口契约：Consumes 本计划 §架构快照 + §1 决议表（R1–R15）。Produces：ADR 文档（背景：守卫语义 + spike 实证；决策：install-first 自适应两步 / 通道分治 / 兜底回装 / D3；备选与否决：直连两步（0.2.0 宿主风险）、D1 双投递（缺席无兜底）、web 式自编排（宿主独占/账实分裂/红线）、D2（主人否决）；后果：降级恢复新结局、URL spec 限于自升级通道、intent ledger + self-check 对账）。
- 验证范围：文档存在 + GLOSSARY 术语一致

- [ ] Step 1: 写 ADR（沿用 `docs/adr/0009` 的章节模板）
- [ ] Step 2: `Get-Content docs/adr/0022-already-installed-two-step-upgrade.md | Select-String '决策|后果'` —— Expected: 章节齐全
- [ ] Step 3: checkpoint commit `docs(adr): 0022 already-installed 两步升级与自升级专用通道`

### Task 15: GLOSSARY 七词条入册

- Files: Modify `GLOSSARY.md`
- 接口契约：Consumes Task 14 术语集。Produces：词条与代码/文案用词一致（禁实现细节，纯概念）。
- 验证范围：目视 + 术语 grep

- [ ] Step 1: 追加七词条（两步升级/宿主安装守卫/install-first 自适应/兜底回装/降级恢复/自升级专用通道/开机对账）
- [ ] Step 2: `Select-String -Path GLOSSARY.md -Pattern '两步升级|兜底回装|降级恢复'` —— Expected: 三条命中
- [ ] Step 3: checkpoint commit `docs(glossary): 0.10.0 七词条`

### Task 16: chore(release) 0.10.0

- Files: Modify `package.json`、`package-lock.json`
- 接口契约：Consumes 031 纪律（三处版本同步：package.json + package-lock 根两字段）。Produces：v0.10.0 发布-ready 树。
- 验证范围：`Select-String` 三行同版本 + 全量测试

- [ ] Step 1: `npm version 0.10.0 --no-git-tag-version`（或手改）后按 031 以 sed 同步 package-lock 两处根字段
- [ ] Step 2: 按 CHANGELOG.md:3 双区块纪律各补 0.10.0 条目（历届先例：0.9.94 双区块条目）
- Run: `Select-String -Path CHANGELOG.md -Pattern '### 0.10.0'`
- Expected: 两区块各命中一次（共 2 处）
- [ ] Step 3: `npm run build; npm test`（run_in_background）
- Expected: 全绿（028 基线零新增失败）
- [ ] Step 4: `git add -A; git commit -m "chore(release): 0.10.0"`；`git tag v0.10.0`
- Run: `git describe --tags`
- Expected: `v0.10.0`

### Task 17: 发布与装机（runbook，人工协同）

- 目标：v0.10.0 上 npm 并装回本机 desktop。
- 接口契约：Consumes Task 16。Produces：本机 dsh-m 0.10.0 + 干净 manifest spec。
- 验证范围：E2E 清单全勾

- [ ] Step 1: `git push; git push --tags` → GitHub Release run；按 018 §5 三键轮询 npm（staged 延迟 2–59 分钟，绿 ≠ 已上架）
- [ ] Step 2: `PUT https://registry-direct.npmmirror.com/dsh-m/sync?sync_upstream=true`（020 §3.1），轮询镜像出现 0.10.0
- [ ] Step 3: 官方 Settings → Plugins：remove `dsh-m` → install `dsh-m@0.10.0`（精确版本）→ 重启 Desktop（remove 顺带把 URL spec 重钉干净——通道分治自愈点）
- Run: `node -p "require('C:/Users/ies255050/.dsh/profiles/desktop/node_modules/dsh-m/package.json').version"`
- Expected: `0.10.0`
- [ ] Step 4: E2E（R11）——GUI 升级 dshmarket→1.66.34（观察 `already-installed → two-step` 留痕 + restart-required 提示 + 重启生效）→ skip-browser-auth→0.4.0 → 卸载/重装抽查 → 角标同版本静默不点亮（仅 outdated 点亮，`main.jsx:3355`；生产无同版本升级入口，确认框/needsRestart 语义由 tests/client-self-check 单测覆盖，D3 真机升级验收排入交付后动作）
- Run: `npm run build; npm test` 于发布树（终态收口）
- Expected: 全绿 + E2E 清单全勾

### Task 18: registry verified 补 0.2.1-rc.1

- Files: Modify `registry.json`（**dsh-m 与 skip-browser-auth** 两条收录条目的 verified 数组——二者均经 Task 17 在 0.2.1-rc.1 真机实测，符合 008「新代际经装机实测后补入」）
- 接口契约：Consumes Task 17 E2E 通过（008：verified 只记 DSH 运行时版本）。Produces：registry 零警告。
- 验证范围：`node scripts/validate-registry.mjs`

- [ ] Step 1: verified 数组补 `0.2.1-rc.1`（dsh-m、skip-browser-auth 两处）
- [ ] Step 2: `node scripts/validate-registry.mjs` —— Expected: 零警告
- [ ] Step 3: push 前经主人确认（008 纪律）
- [ ] Step 4: 主人确认后 commit 与 push 一体：`git add registry.json; git commit -m "docs(registry): verified 补 0.2.1-rc.1（dsh-m、skip-browser-auth）"; git push`
- Run: `git log --oneline -1`
- Expected: 顶部为该 registry 提交

## 执行纪律

- 开始实现前先批判性复查本计划；发现缺项/矛盾/命名不一致/验证命令无效，先修计划再动手。
- 按任务顺序执行（Task 6 依赖 Task 7 的导出名，执行顺序为 1→2→3→4→5→7→6→8…），不无声跳步、不合并步、不改任务目标。
- 每完成一个任务运行其验证；当前树在 main/master 时，开始实现前先经主人确认。
- 遇阻、重复失败或计划与仓库现实不符，立即停下说明，不猜。
- 全部任务完成后运行最终验证并输出修改摘要。
- 交付后动作（不在本计划内）：①know-how 020 增补 §10（0.2.1 守卫 + CLI 全退要求 + tarball 通道），由 lead 在 E2E 通过后按索引规则并入；②**D3 真机升级验收（dogfood）**：下一次 dsh-m 发版（0.10.1+）时，用已装 0.10.0 的产品内自升级通道（头部角标/卡片按钮 → 确认框 → tarball 直覆盖）执行升级——该次装机即 D3 的真机 E2E，验收点：intent 落盘、restart-required 提示、重启后版本到位、manifest spec 重钉为该版 tarball URL。

## 最终验证

- `npm run typecheck` 零错误；`npm test` 全绿（028 既有失败清单之外零新增）；`git log --oneline` 含 Task 9/13/14/15/16 的分层 commit（Task 17/18 为发布与确认后动作，随其执行产生对应提交）。
- 本机 E2E（Task 17 Step 4）清单全勾：第三方两步升级真实成功一次、角标同版本静默、卸载/重装无损；确认框/needsRestart 由 client-self-check 单测覆盖。
- 真机观察锚点：升级 dshmarket 时官方页/操作记录出现两步留痕；`C:/Users/ies255050/.dsh/profiles/desktop/package.json` 中 `dshmarket` spec 保持 registry 干净形态、仅 `dsh-m` 允许 URL 形态（0.10.0 装机后应重钉为干净形态）。

## 审阅 Checkpoint

- 计划正文结束后请求主人审阅；审阅通过前不进入实现。
- 默认执行方：普通编码 agent 或人工执行者（按任务粒度可直接派发）。
