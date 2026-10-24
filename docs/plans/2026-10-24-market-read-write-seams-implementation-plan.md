# market 读写分缝（market-mutation.ts 拆分）实施计划

## 目标

把 `src/core/market.ts`（1960 行、37 个 export）沿「读侧市场查询 / 写侧市场变更编排」缝一分为二：写侧整段迁入新模块 `src/core/market-mutation.ts`，market.ts 只留读侧；全部调用方（src 5 处 + tests 约 10 处）直改 import，不留任何 re-export；顺手清除 ADR-0016 遗留的 `matchInstalledByEntry` 转手 re-export。零行为变化，测试按缝分册。

## 架构快照

- 读侧（留 `src/core/market.ts`）：`listMarket` / `listInstalledWithMeta` / `existingMarketIds` / probe 预算（`probeWithBudget`/`classifyLatestError` 等）/ 排序 / 合并投影消费，以及共用小工具 `abortError` / `mapWithConcurrency`。
- 写侧（迁 `src/core/market-mutation.ts`，当前 market.ts:1004–1960）：`InstallDeps` / `InstallResult` / `resolveRegistryEntry` / `installFromRegistry` / `InstallableEntry` / `withMutationSession` / `InstallGuardError` / `InstallGuardWire` / `GuardViolation` re-export / `PreMutationSnapshot` / `capturePreMutationState` / `derivePrior` / `installEntry` / `UninstallResult` / `UninstallDeps` / `uninstallPlugin` / `UpgradeResult` / `upgradePlugin` / `selfUpgrade` / `leftoverCandidates`，连同仅被它们使用的私有 helper。
- 依赖方向唯一：`market-mutation.ts` → `market.ts`（读侧）单向 import；无反向依赖、无环。
- 调用方现为：`src/cli.ts:17`、`src/tools.ts:18`、`src/core/host-api.ts:22`、`src/core/profile-ops.ts:24`、`src/core/toggle.ts:26`（皆 import `market.js`）；测试侧凡 `import … from '../lib/core/market.js'` 拿写侧符号的文件同样重接。
- 测试消费的是构建产物 `lib/core/*.js`（见 tests/market.test.mjs:12），因此任何源码迁移后必须先 `npm run build` 再跑测试。

## 全局约束

- **Verbatim 迁移纪律**（仓库 ADR-0023 先例）：搬家零重写、零调用点语义变化；不顺手重构、不改函数体。
- 新 `.ts` 模块沿用 ESM 具名导出纪律。
- 不新增任何 re-export 转发层（含 market.ts 对 merged-market 的 `matchInstalledByEntry`/`communityOutcome` 转手——market.ts 读侧若自用则保留内部 import，不再 export；`communityOutcome` 若读侧不用则一并删 export）。
- 版本纪律：本拆分不发独立版本，随下一次常规发版走；`package.json` 版本号不动。
- 命令环境：Windows，bash 工具；仓库惯例 `npm run build` / `npm test`（内部为 `node scripts/build.mjs` + `node scripts/check-client-imports.mjs && node --test tests/*.test.mjs`）。
- 若当前分支是 main/master，开始实现前先向用户确认分支策略。

## 输入工件

- 设计共识：本会话 /grill-with-docs 两轮裁决（2026-10-24，Round 1 六项 + Round 2 四项全按推荐落定）+ 钢人裁决结论（唯一入选项）。
- 词汇表：`GLOSSARY.md`（新增「市场变更编排（Market Mutation）」词条，措辞已获批准）。
- 先例参照：`docs/adr/0016-merged-market-materialization.md`（迁移模式）、`docs/adr/0023-client-shell-component-seams.md`（三刀纪律）。

## 文件结构与职责

- Create: `docs/adr/0024-market-read-write-seams.md` —— 决策记录。
- Create: `src/core/market-mutation.ts` —— 市场变更编排模块（写侧全部符号 + 私有 helper）。
- Create: `tests/market-mutation.test.mjs` —— 从 market.test.mjs 拆出的写侧测试。
- Modify: `GLOSSARY.md` —— 增「市场变更编排（Market Mutation）」词条。
- Modify: `src/core/market.ts` —— 删除 1004–1960 写侧段落与写侧 import；删第 56–57 行转手 re-export。
- Modify: `src/cli.ts`、`src/tools.ts`、`src/core/host-api.ts`、`src/core/toggle.ts` —— 写侧符号改 import `market-mutation.js`。
- Modify: `src/core/profile-ops.ts` —— 写侧符号改 import `market-mutation.js`；`matchInstalledByEntry` 改直连 `merged-market.js`。
- Modify: `tests/market.test.mjs` 及其他从 `lib/core/market.js` import 写侧符号的测试文件（至少：`rollback-heal.test.mjs`、`install-guard.test.mjs`、`host-api.test.mjs`、`tools-install.test.mjs`、`external-journal-channels.test.mjs`，以实际 grep 为准）—— import 路径重接。
- Modify（可能）: `scripts/check-release.mjs` —— 测试计数新鲜度步若因拆册计数变化需同步基线数字。

## 任务清单

### Task 1: ADR-0024 与 GLOSSARY 词条先行入库（commit 1）

- 目标：决策记录与领域词条先于代码落盘（仓库惯例，ADR-0023 同款节奏）。
- 涉及文件：`docs/adr/0024-market-read-write-seams.md`、`GLOSSARY.md`。
- 接口契约
  - Consumes: 本计划「架构快照」节 + 已批准词条措辞（见下）。
  - Produces: ADR-0024 全文；GLOSSARY「市场变更编排（Market Mutation）」词条。
- 验证范围：文档存在、格式与既有 ADR/GLOSSARY 条目一致。

- [ ] Step 1: 写 ADR-0024，内容覆盖：背景（market.ts 1960 行 / 37 export / 0.10.11 四连修跨模块理解成本、近两月 51 次触碰为 core 第一热点）；决策（读写分缝、`market-mutation.ts` 命名、5 处 src 调用方 + 测试直改 import 不留 re-export、mutation→read 单向依赖、`abortError`/`mapWithConcurrency` 留读侧、顺手清 ADR-0016 `matchInstalledByEntry` 转手债）；Considered Options（小刀只迁 guard 线格式——不采，双头 interface；留 re-export——不采，ADR-0016 永久债实证；util 模块——不采，YAGNI）；Consequences（测试分册、调 import 的文件清单）。
- [ ] Step 2: GLOSSARY.md 按现有格式追加词条（措辞逐字）：

> **市场变更编排（Market Mutation）**:
> 市场侧对 Profile 变更事务的统一编排入口：收录条目解析、兼容预检、快照、发起安装/卸载/升级/自升级事务的模块。与读侧市场查询（列表/搜索/已装投影）互为独立模块，单向依赖读侧的 registry 加载与探测能力。
> _Avoid_: 安装模块（以偏概全——四种入口并列）、market service（英文旧语）、写服务（无领域含义）

- [ ] Step 3: checkpoint commit（仅这两个文件）
- Run: `cd dsh-m && git add docs/adr/0024-market-read-write-seams.md GLOSSARY.md && git commit -m "docs(adr-0024): market 读写分缝决策 + GLOSSARY「市场变更编排」词条"`

### Task 2: 创建 src/core/market-mutation.ts（写侧整段 verbatim 迁移）

- 目标：market.ts:1004–1960 的全部写侧符号及其私有 helper 迁入新模块，逐字搬家。
- 涉及文件：Create `src/core/market-mutation.ts`；Modify `src/core/market.ts`（同步删去迁走段落——本任务与 Task 3 连续执行，market.ts 在本任务末尾暂时保留对 mutation 的调用不可能出现：迁移是整段剪切）。
- 接口契约
  - Consumes: market.ts 现有写侧源码（路径 + 行段锚点 `src/core/market.ts:1004-1960`；以符号清单为准：`InstallDeps`…`leftoverCandidates` 全集见「架构快照」）。
  - Produces: `src/core/market-mutation.ts`，具名导出符号集合 = 架构快照写侧清单（含 `export type { GuardViolation } from './install-guard.js'`）；从 `./market.js` import `abortError`、`mapWithConcurrency` 及写侧实际用到的读侧符号（如 `MarketDeps`、probe 相关——以编译通过为准，不做多余 import）。
- 验证范围：TypeScript 编译通过、market.ts 不再含写侧符号。

- [ ] Step 1: 剪切 market.ts:1004–1960 写侧段落及其专属私有 helper，粘贴入新文件；补 import 头（market.ts 读侧符号、既有上游依赖如 profile-transaction/compat-check/install-guard 等随迁）。
- [ ] Step 2: 编译检查
- Run: `cd dsh-m && npx tsc --noEmit 2>&1 | head -30`
- Expected: 报错仅限 5 个调用方（cli.ts / tools.ts / host-api.ts / profile-ops.ts / toggle.ts）缺失符号——调用方重排在 Task 4（与 Task 3 Step 3 同款预期失败信号）；若报 market.ts 内部残留引用或 market-mutation.ts 自身错误，说明剪切清单有漏，补齐再验。

### Task 3: market.ts 收缩定形 + 删转手 re-export

- 目标：market.ts 成为纯读侧模块；删除第 56–57 行对 merged-market 的转手 re-export。
- 涉及文件：`src/core/market.ts`。
- 接口契约
  - Consumes: Task 2 产物（写侧已迁走）。
  - Produces: 读侧 market.ts，export 集合 = 类型/工具/listMarket/existingMarketIds/listInstalledWithMeta + merged-market 投影中读侧自用者；`matchInstalledByEntry`、`communityOutcome` 不再从 market.ts export。
- 验证范围：market.ts 中 grep 不到 `installFromRegistry|withMutationSession|uninstallPlugin|upgradePlugin|selfUpgrade|InstallGuardError`；grep 不到对 merged-market 的 export 转发。

- [ ] Step 1: 删除 market.ts 第 56–57 行转手 re-export；读侧内部仍需 merged-market 符号处改为普通 import（不 export）。
- [ ] Step 2: 确认收缩
- Run: `cd dsh-m && grep -nE "installFromRegistry|withMutationSession|uninstallPlugin|upgradePlugin|selfUpgrade|InstallGuardError|leftoverCandidates|derivePrior|capturePreMutationState" src/core/market.ts; grep -n "export .* from './merged-market" src/core/market.ts`
- Expected: 两条 grep 均零输出。
- [ ] Step 3: 编译复验（此刻 src 内调用方尚未重接，tsc 会报 cli/tools/host-api/profile-ops/toggle 的缺失符号——这是预期失败信号，属 Task 4 修复；故本步只跑 `npx tsc --noEmit 2>&1 | head -30` 确认报错全部集中于这 5 个文件的缺失 import，无 market-mutation.ts 自身错误）。

### Task 4: 调用方 import 重接（src 5 处）

- 目标：全部 src 调用方改从 `market-mutation.js` 取写侧符号；profile-ops 的 `matchInstalledByEntry` 直连 `merged-market.js`。
- 涉及文件：`src/cli.ts`、`src/tools.ts`、`src/core/host-api.ts`、`src/core/toggle.ts`、`src/core/profile-ops.ts`。
- 接口契约
  - Consumes: Task 2/3 产出的 `src/core/market-mutation.ts` 符号集。
  - Produces: src 树内对 `market.js` 的 import 只剩读侧符号；对 `market-mutation.js` 的 import 只含写侧符号。
- 验证范围：tsc 零错误；check-client-imports 通过。

- [ ] Step 1: 逐文件把写侧符号的 import 来源改为 `./core/market-mutation.js`（cli/tools）或 `./market-mutation.js`（core 内）；两处直连 merged-market：`src/core/profile-ops.ts:24` 的 `matchInstalledByEntry` 改从 `./merged-market.js`，`src/tools.ts:16` 的 `type CommunityRegistrySummary` 改从 `./core/merged-market.js`（原经 market.ts:57 转手）。
- [ ] Step 2: 编译 + 客户端 import 守卫
- Run: `cd dsh-m && npx tsc --noEmit && node scripts/check-client-imports.mjs`
- Expected: 两者均零错误。
- [ ] Step 3: 全库反向确认无残留
- Run: `cd dsh-m && grep -rn "market.js'" src --include=*.ts --include=*.tsx | grep -v "market-mutation\|market-query\|merged-market\|market-state"`
- Expected: 各命中行 import 的均为读侧符号（人工核对一遍清单）。

### Task 5: 构建产物 + 测试 import 重接 + 测试分册

- 目标：`npm run build` 刷新 `lib/core/market-mutation.js`；所有从 `lib/core/market.js` import 写侧符号的测试改接新模块；`market.test.mjs` 写侧用例拆出 `market-mutation.test.mjs`。
- 涉及文件：`scripts/build.mjs` 产物（lib/，不手工编辑）、`tests/market.test.mjs`、Create `tests/market-mutation.test.mjs`、其余命中测试文件。
- 接口契约
  - Consumes: Task 2–4 产物；`grep -rln "lib/core/market.js" tests` 的命中清单。
  - Produces: `lib/core/market-mutation.js` 构建产物；`tests/market-mutation.test.mjs`（写侧用例：installFromRegistry / upgradePlugin / uninstallPlugin / capturePreMutationState / derivePrior 相关 describe/it 整块迁移）；market.test.mjs 只剩读侧用例。
- 验证范围：构建成功、全量测试绿、无测试再从 market.js 拿写侧符号。

- [ ] Step 1: 构建
- Run: `cd dsh-m && npm run build`
- Expected: 成功；`ls lib/core/market-mutation.js` 存在。
- [ ] Step 2: 找齐测试命中清单并逐文件重接 import（写侧符号 → `../lib/core/market-mutation.js`；`communityOutcome`（market.test.mjs:12/1807）等原经 market.ts:56 转手的 merged-market 符号 → `../lib/core/merged-market.js`；只 import 读侧符号的文件不动；若某文件同时用两侧符号则加行 import，不动用例本体）。
- Run: `cd dsh-m && grep -rln "lib/core/market.js" tests`
- Expected: 实测命中 12 个文件（external-journal-channels / host-api / install-guard / market-golden / market / merged-market / npm-integrity / rollback-heal / tools-install / uninstall-patch / upgrade-activation / versions），其中命写侧或转手符号者完成重接（以符号为准，不强求 12 个全改）。
- [ ] Step 3: 拆册——market.test.mjs 中写侧用例整块迁入 market-mutation.test.mjs（文件头注释注明运行方式 `npm run build && node --test tests/market-mutation.test.mjs`，沿用 market.test.mjs 现有头注释格式）；market.test.mjs 的顶层共享夹具（beforeEach 重置、`marketTestCacheRoot` mkdtemp/after 清理、`makeThousand/readyLoaded/unavailableLoaded/fakeDeps/cfg/CATEGORIES/sleep` 等）按需复制进新文件——两侧各自持有独立 tmp root 与清理钩子、可独立跑绿，不共享跨文件状态；两侧各自跑绿。
- Run: `cd dsh-m && node --test tests/market.test.mjs tests/market-mutation.test.mjs`
- Expected: 全部 pass。
- [ ] Step 4: 确认无残留错接
- Run: `cd dsh-m && grep -rn "installFromRegistry\|withMutationSession\|uninstallPlugin\|upgradePlugin\|selfUpgrade\|derivePrior\|capturePreMutationState\|InstallGuardError\|communityOutcome" tests/*.mjs | grep "lib/core/market.js"`
- Expected: 零输出（退出码 1；grep 计 0 = exit 1，故此判据独立运行、不并入 && 链）。

### Task 6: 全量门禁 + 发版基线同步（commit 2）

- 目标：三道门全绿；check-release 计数新鲜度若因拆册变化同步基线；第二 commit 收口。
- 涉及文件：可能 `scripts/check-release.mjs`（计数基线）；其余不再改。
- 接口契约
  - Consumes: Task 1–5 全部产物。
  - Produces: 全绿门禁证据 + 实现收口 commit。
- 验证范围：build / test / check-release 三道门。

- [ ] Step 1: 全量验证
- Run: `cd dsh-m && npm run build && npm test && npm run check-release`
- Expected: 三道全部通过。check-release 的「CHANGELOG 计数新鲜度」步（check-release.mjs:92-98）读的是 CHANGELOG 中文顶条「全量 N/N」主张并与实测 pass 数对账——拆册增减用例后若计数不符，回写的是 **CHANGELOG 顶条计数**，不是脚本基线；改后重跑至绿。
- [ ] Step 2: checkpoint commit（实现 + 测试 + 可能的 check-release 基线）
- Run: `cd dsh-m && git add -A && git commit -m "refactor(core): market 读写分缝——写侧出仓 market-mutation.ts（ADR-0024），零行为搬家"`
- Expected: commit 成功，`git status` 干净。

## 执行纪律

- 开始实现前，先批判性复查整份计划；发现缺项、矛盾、命名不一致或验证命令无效，先修计划再动手。
- 按任务顺序执行，不无声跳步、合并步或改变任务目标；verbatim 纪律高于一切顺手优化。
- 每完成一个任务，运行该任务定义的验证；Task 3 Step 3 的预期失败信号（5 个调用方缺 import）不算阻塞。
- 遇到阻塞、重复失败或计划与仓库现实不符（例如写侧实际还引用了计划未列的读侧符号、或 build.mjs 对新文件有清单式登记），立即停下说明，不猜。
- 若工作分支是 main/master 且用户未同意直接在其上作业，先确认分支策略。

## 最终验证

- Run: `cd dsh-m && npm run build && npm test && npm run check-release`
- Expected: 全绿；`lib/core/market-mutation.js` 存在；`grep -c "" src/core/market.ts` 约 1000 行级；输出修改摘要（两 commit 的 diffstat + 测试分册前后用例数）。

## 审阅 Checkpoint

- 计划正文结束。审阅通过前不进入实现。
