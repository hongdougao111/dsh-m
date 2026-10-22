# dsh-m 客户端壳层组件缝实施计划（0.10.9 单版三刀）

## 目标

- 按 ADR-0023 执行三刀战役：第一刀 i18n/styles 机械开路；第二刀 panel-ops 深模块化（消灭 opsPumpCtx 可变单例、纯化对账编排、收拢横幅判定、删 refreshViews 死字段）；第三刀组件分文件 + 测试面从源文本迁到真缝。
- 全程零行为变化；合并单版 0.10.9；刀刀独立 commit、每个 commit 全量测试绿。
- 源锚按三桶政策迁移（附录逐锚去向表）；render-smoke 拼接导出 hack 缩至 MarketPanel 一项。

## 架构快照

- main.jsx（4475 行）= i18n 词典(37 段注释–314，:303 的 `const oc = createOpOutcome(lookup)` 属 op-outcome 接线不迁) + CSS(315-784) + 数据 hooks(785-919) + 小组件(920-1626) + ZoneChips(1163-1386) + DetailModal(1627-1884) + MarketTab(1901-2429) + Installed/SettingsTab(2488-2983) + Card/FavoriteZone/OperationsCard/VerChip(2984-3425) + MarketPanel 组合根(3467-4200) + 挂载/apply(4201-4475)。
- 横幅判定站点全集（评审 R1-1 取证，行号统一以 notify 调用行为锚）：install 字面 true（MarketTab:2012）；uninstall 字面 true（InstalledTab:2543）；toggle 读 `toggleNoticeKeys(res).needsRestart`（InstalledTab:2521，值源 :2520，toggle-view.js:45-54 `applied === 'restart'`，live→false、缺席→true）；upgrade 读 `oc.upgradeOkText(res).needsRestart`（MarketTab:2060、InstalledTab:2573，值源 :2572，operations.js:82-86 `upgradeNotify`：client-only→false，unknown/缺席→true）；self-upgrade 读 `res.needsRestart ?? true`（VerChip:3381，保守默认）；MarketPanel notify 生成条件 :4042、desktop 分叉 :4045-4047（留适配器）。
- 操作泵事实（ADR-0023 决策 3）：opsStore/opsPump 模块级创建（main.jsx:3160/3164）全程存活；ToolCardRow 面板外写入（:4319-4321）；未绑定上下文=设计内降级（恢复 queued 无执行上下文→failed，operations.js:471-472/499）。
- 恢复对账 effect（main.jsx:3980-4011）：判定已纯（restoreRecords，operations.js:326-385）；副作用串 = replaceAll → 逐条[查重(id|target|toVersion) → writeReconcileNotified → notify] → syncOps → kick。
- 渲染探针（scripts/probe-render-count.mjs）4 处插桩锚：`function Card({...})`、`function Icon({ entry })`、`function MarketTab({...})`（拆后迁新文件）、MarketTab 调用点 + footer `module.exports = { __Apply, __MountPanel }`（留 main.jsx）。

## 全局约束（逐字继承 ADR-0023 / CODING-STANDARDS）

- 单版 0.10.9；刀刀独立 commit、每个 commit 全量测试绿；回滚粒度 = commit。
- 新 `.js` 逻辑模块 ESM 具名导出、禁 `module.exports`；新 `.jsx` 组件文件同样 ESM 具名导出（`import React from "react"`，esbuild 负责与 main.jsx CJS require 的 interop）；main.jsx 自身保持 CJS require。
- 构建形态不变：lib/client.js 单 bundle；build.mjs 的 banner/footer/treeShaking:false/external react 一律不动；npm 发布面零变化。
- esbuild interop 写法（评审 R1-10 探针实证，/tmp/review-dshm 副本、esbuild 0.25.12 同 build 参数）：CJS entry（main.jsx）require ESM `.js`/`.jsx` 具名导出均通过；组件文件统一头部 `import React from "react"; const h = React.createElement;`；**禁 `import { h } from "react"`**（react 18.3.1 无 `h` 导出，实测不可用）。
- 无 DOM 纪律：不引入 jsdom/happy-dom；SSR 冒烟保持首渲染语义。
- 锚纪律三条物理事实继续管辖全部锚（bundle 锚仅 ASCII 字面量；源串锚禁含 `\n` 转义；量化一律出现次数语义 `str.split(needle).length - 1`）。
- 行为零变化承诺：三刀全部零行为；K2 的横幅/toast 行为按 0.10.8 逐条一致，验收按口径核验不虚报。
- i18n 中英同步、文案零改动（搬家不改字）；新文件行尾跟随工作树现状（CRLF）。
- **同名消歧（红线）**：删除目标仅是 opsPumpCtx 的 `refreshViews` 死字段（写入于 main.jsx:3961-3966 区域，全库无消费）；MarketPanel 传给子 Tab 的活回调 `onMutation: refreshViews` 共**两处**（:4140 MarketTab、:4141 InstalledTab），禁碰。T6 附自证：`split('onMutation: refreshViews').length - 1 === 2`。
- 工作分支在 main：开始实现前须获主人明确同意（或按主人指示开分支）。

## 输入工件

- 设计决策：`docs/adr/0023-client-shell-component-seams.md`（2026-10-23 落盘）
- 术语：`GLOSSARY.md`「面板操作接线（Panel Ops Wiring）」
- 标准：`docs/CODING-STANDARDS.md`「客户端状态机约定」（已随 ADR-0023 改写）
- 事实调查：两轮子代理走查报告（2026-10-22/23，结论已固化进 ADR-0023 与本计划架构快照）

## 文件结构与职责

- Create: `src/client/i18n.js` — ZH/EN 词典 + browserLang/interpolate/lookup/communityLabels（T1）
- Create: `src/client/styles.js` — CSS 字符串 + cssVersionOf/ensureCss（T2）
- Create: `src/client/panel-ops.js` — 泵持有者 + 显式绑定 + 对账编排纯函数 + 横幅判定（T5）
- Create: `src/client/hooks.js` — api/useAsync/useMarketData/fmtDate（T9）
- Create: `src/client/chrome.jsx`（Icon/Spin/PhaseDot/ToggleSwitch/TwoStepButton/RestartBanner/SearchBox/XIcon/FsIcon/LinksRow/officialLinks/safeScreenshots/compactCount/Shot/UseImgChainProbe/Lightbox）、`card.jsx`（Card/snapshotOf）、`favorite-zone.jsx`、`zone-chips.jsx`、`operations-card.jsx`、`version-chip.jsx`（T10）
- Create: `src/client/detail-modal.jsx`（DetailModal/useModalDepth）、`market-tab.jsx`、`installed-tab.jsx`、`settings-tab.jsx`（Section/DetailRows 随迁）（T11）
- Create: `tests/client-panel-ops.test.mjs`（T4）
- Modify: `src/client/main.jsx` — 逐刀减量，终态 = MarketPanel + 挂载 + apply + tool views 组合根（预期 ~1300 行）
- Modify: `tests/client-i18n.test.mjs`（词典改 import；K3 后调用侧扫描面扩至新组件文件）、`tests/client-render-smoke.test.mjs`（装载机制改造）、其余按附录逐锚表
- Modify: `scripts/probe-render-count.mjs`（插桩锚迁新文件）
- Modify: `CHANGELOG.md`、`package.json`（0.10.9 收口）

## 任务清单

### Task 1: 抽出 i18n.js（K1）

- 目标：main.jsx:37-314 的 i18n 段（词典 + browserLang/interpolate/lookup/communityLabels）verbatim 迁入 `src/client/i18n.js`，main.jsx require 接线，i18n 审计测试的词典侧改 import。
- 涉及文件：`src/client/main.jsx`、新建 `src/client/i18n.js`、`tests/client-i18n.test.mjs`
- 接口契约：
  - Consumes: main.jsx:37-314 现有实现（含 communityLabels 对 lookup 的使用）
  - Produces: `i18n.js` 具名导出 `{ ZH, EN, browserLang, interpolate, lookup, communityLabels }`；main.jsx `const { lookup, communityLabels } = require("./i18n.js")`（按实际用量解构）；`tests/client-i18n.test.mjs` 词典键集来自 `import { ZH, EN }`，调用侧扫描目标仍为 main.jsx + op-outcome.js（K3 的 T11 再扩面）
- 验证范围：全量测试绿；搬家完成自证。
- [ ] Step 1: 建 `i18n.js`（ESM；迁移 = ZH/EN 词典 + browserLang/interpolate/lookup + communityLabels，函数体零重写 + 具名导出；**`const oc = createOpOutcome(lookup)` 及其注释不迁**——它属 op-outcome 接线，留在 main.jsx require 解构之后），main.jsx 删除该段并加 require 解构
- [ ] Step 2: 改 `tests/client-i18n.test.mjs`：删词典正则抽取（`dictSrc`/`dictKeys` 逻辑），改 `import { ZH, EN } from '../src/client/i18n.js'` 组键集；调用侧审计逻辑不动。**并同步迁移附录桶①「改读 i18n.js」词典键锚全集**（render-smoke:330-331/358/365-366/369/384、self-check:188-189、operations:509、installed-updates:86-87、img-chain:177-178、window-resize:133-134、operations-view:170-172/248-250/251-255/264/280——按附录表逐行，执行时 grep 自证无漏；新增长针按横切纪律 4 入 hygiene ALLOWLIST）
- [ ] Step 3: Run: `npm test`
- Expected: 全绿（pretest 自动 build 成功 = 接线无断链；client-i18n 审计通过 = 键集等价）
- [ ] Step 4: 搬家自证。Run: `node -e "const s=require('fs').readFileSync('src/client/main.jsx','utf8'); if(s.includes('const ZH = {')){console.error('ZH dictionary still in main.jsx');process.exit(1)} console.log('i18n moved')"`
- Expected: 输出 `i18n moved`

### Task 2: 抽出 styles.js（K1）

- 目标：main.jsx:315-784 的 CSS 字符串 + cssVersionOf/ensureCss 迁入 `src/client/styles.js`；附录表中桶① 的 CSS 字面量锚全部改锚 styles.js。
- 涉及文件：`src/client/main.jsx`、新建 `src/client/styles.js`、附录表桶① 涉及的测试文件（预期含 `tests/client-scroll-contain.test.mjs`、`tests/client-mobile-head.test.mjs` 等，以附录表为准）
- 接口契约：
  - Consumes: main.jsx:315-784 现有实现
  - Produces: `styles.js` 具名导出 `{ CSS, cssVersionOf, ensureCss }`；main.jsx `const { CSS, ensureCss } = require("./styles.js")`（按实际用量）；各 CSS 锚测试的读取路径 `src/client/main.jsx` → `src/client/styles.js`（锚文本不变，CRLF 语义不变）
- 验证范围：全量测试绿；搬家完成自证。
- [ ] Step 1: 建 `styles.js` 并迁 CSS/cssVersionOf/ensureCss；main.jsx require 接线
- [ ] Step 2: 按附录表桶① 逐条改锚（换文件路径，锚文本零改动）
- [ ] Step 3: Run: `npm test`
- Expected: 全绿
- [ ] Step 4: 搬家自证。Run: `node -e "const s=require('fs').readFileSync('src/client/main.jsx','utf8'); if(s.includes('const CSS = \`')){console.error('CSS still in main.jsx');process.exit(1)} console.log('styles moved')"`
- Expected: 输出 `styles moved`

### Task 3: K1 checkpoint commit

- [ ] Step 1: Run: `git add -A && git commit -m "refactor(client): K1 i18n/styles 出仓（ADR-0023 第一刀，零行为搬家）"`
- Expected: commit 成功且此前 `npm test` 全绿

### Task 4: panel-ops 纯函数失败测试先行（K2, TDD）

- 目标：为 `planReconcileActions` 与 `restartBannerDecision` 写失败测试（红）。
- 涉及文件：新建 `tests/client-panel-ops.test.mjs`
- 接口契约：
  - Consumes: 本计划定义的契约 + `tests/client-operations.test.mjs` 既有夹具形态（judged 记录结构照 operations.js restoreRecords 输出；夹具在本文件内自备副本，不跨测试文件引用——遵守「新 describe 自带测试夹具与 helpers」纪律）
  - Produces: 两个 describe（红）
- 验证范围：新测试当前失败（模块不存在）。
- [ ] Step 1: 写 `planReconcileActions(judged, seenKeys)` 矩阵：查重键 `id|target|toVersion`；seen 命中 → 不产 notification 但记录仍入 replacements；`done && meta.reconciledAfterRestart` 不满足 → 不产 notification；有 queued 记录 → `shouldKick: true`；replacements 对 judged 透传（逐字节等价断言）；notifications 项形状 = `{ dedupeKey, i18nKey, params }`（i18nKey = `upgrade.reconciled.done`，params = `{ pkg: target, to: "v" + toVersion }`，对齐 :4003 现行拼装——纯函数不携成品文案）
- [ ] Step 2: 写 `restartBannerDecision(opKind, res)` 真值表（res = 各调用点现行原始 op 结果，评审 R1-1 修正版）：
  - `install` → `{ needsRestart: true, conservative: false }`（对齐 :2012 字面）
  - `uninstall` → `{ needsRestart: true, conservative: false }`（对齐 :2543 字面）
  - `toggle` → 委派 `toggleNoticeKeys(res).needsRestart`（live→false；restart/缺席→true；对齐 :2521 与 toggle-view.js:45-54），`conservative: res.applied == null`
  - `upgrade` → 委派 `upgradeNotify(res.activation).needsRestart`（client-only→false；unknown/缺席→true；对齐 :2060/:2573 与 operations.js:82-86），`conservative: res.activation == null`
  - `self-upgrade` → `{ needsRestart: res.needsRestart ?? true, conservative: res.needsRestart == null }`（对齐 :3381）
  - 职责边界：**判定**单源本函数；**文案装配**留 op-outcome（upgradeOkText）与 toggle-view（textKey）——调用点形态 = `notify({ kind: "ok", needsRestart: restartBannerDecision("upgrade", res).needsRestart, text: ok.text })`；不重复实现 tri-state/applied 逻辑，经 import 委派。`conservative` 仅供测试断言与诊断，运行时无消费方（如实注明）。
- [ ] Step 3: Run: `node --test tests/client-panel-ops.test.mjs`
- Expected: 全部失败（Cannot find module '../src/client/panel-ops.js'）

### Task 5: 实现 panel-ops.js（K2）

- 目标：新建 `src/client/panel-ops.js` 使 T4 转绿；收编泵持有者与 recordSettingsOp。
- 涉及文件：新建 `src/client/panel-ops.js`
- 接口契约：
  - Consumes: `operations.js` 的 `createOperationsStore/createOpsPump`（import）；main.jsx:3160-3174（store/pump 顶层创建 + recordSettingsOp，verbatim 迁入）；main.jsx:3988-4008 副作用编排（逻辑提纯为 plan）；四调用点判定（:2012/:2060/:2521/:2543/:2573/:3381）
  - Produces: 具名导出 `{ getSharedOpsStore, getSharedOpsPump, bindPanelOps, unbindPanelOps, recordSettingsOp, planReconcileActions, restartBannerDecision }`；`bindPanelOps(deps)` 的 deps 键 = `{ stillApplies, dispatchRestored, syncOps }`（**无 refreshViews**）；模块内私有 holder，未绑定 = 现行 null 语义（泵 getCtx 判空路径零改动）。`planReconcileActions(judged, seenKeys)` 返回 `{ replacements, notifications: [{ dedupeKey, i18nKey, params }], shouldKick }`（notifications 携 i18n 键+参数不携成品文案——纯函数无 lookup；dedupeKey = `id|target|toVersion`；params 如 `{ pkg: r.target, to: "v" + r.meta.toVersion }` 对齐 :4003 现行拼装）。`restartBannerDecision` 按 T4 Step 2 契约，import `toggleNoticeKeys`（toggle-view.js）与 `upgradeNotify`（operations.js）委派，不重复实现。
- 验证范围：T4 测试绿；泉语义回归。
- [ ] Step 1: 建 panel-ops.js：私有创建 store/pump（getCtx 读私有 holder）；bindPanelOps/unbindPanelOps 写清 holder；recordSettingsOp 迁入（改经内部 store 引用）；planReconcileActions/restartBannerDecision 按契约实现
- [ ] Step 2: Run: `node --test tests/client-panel-ops.test.mjs`
- Expected: 全绿
- [ ] Step 3: Run: `node --test tests/client-operations.test.mjs`
- Expected: 全绿（泵/store 语义未动）

### Task 6: main.jsx 接线改造（K2）

- 目标：main.jsx 删单例段改 require panel-ops；MarketPanel 挂载/清理 effect 改 bind/unbind；恢复对账 effect 改薄适配器；删 refreshViews 死字段；四处横幅判定改调 restartBannerDecision。
- 涉及文件：`src/client/main.jsx`
- 接口契约：
  - Consumes: T5 全部导出；main.jsx:3933-4011 现行 effect 语义（stillApplies 实读取数 :3933-3944、restoredRef 每挂载一次门 :3979-3982、installed.data 门控 :3981/:4011）
  - Produces: 薄适配器执行序（**逐条落账**，与现行 :4000-4006 崩溃窗口语义逐字节一致——评审 R1-11）：`replaceAll(plan.replacements)`（抛错 console.error + return，与 :3989-3991 一致）→ `for (n of plan.notifications) { seen.add(n.dedupeKey); writeReconcileNotified(seen); notify({ kind: "ok", text: lookup(n.i18nKey, n.params) }) }` → `syncOps()` → `plan.shouldKick && opsPump.kick()`（desktop 分叉 :4045-4047 留适配器）。
  - 引用点清点表（评审 R1-2，grep 自证 `opsStore\.|opsPump\.` 在 main.jsx 基线共 16 行）：main.jsx 顶层以 `const opsStore = getSharedOpsStore(); const opsPump = getSharedOpsPump();` 取代原 :3160-3164 顶层创建——**标识符不变**，:3827/:3828/:3836/:3868/:3875/:3984/:3988/:4008/:4149/:4150/:4162/:4169（MarketPanel 内 12 处）与 :4321/:4324/:4328（ToolCardRow 3 处）全部原样引用零改写；:3173（recordSettingsOp 内 upsert）随函数体迁入 panel-ops.js。执行时以 `grep -n 'opsStore\.\|opsPump\.' src/client/main.jsx` 现场清点并对表，行数漂移按符号锚处理。
- 验证范围：全量测试绿；行为零变化口径 = 横幅/toast/操作泵记录与 0.10.8 逐条一致（由 client-operations + panel-ops 双矩阵背书）。
- [ ] Step 1: 改造 main.jsx（单例段删除 → 顶层 accessor 常量；bind/unbind effect；对账 effect 薄化；四处横幅判定改调 restartBannerDecision；**仅删 opsPumpCtx 的 refreshViews 写入，两处活回调 `onMutation: refreshViews`（:4140/:4141）禁碰**）
- [ ] Step 2: Run: `npm test`
- Expected: 全绿（含 client-render-smoke、client-operations）
- [ ] Step 3: 死字段与接线自证（三连）。Run: `node -e "const s=require('fs').readFileSync('src/client/main.jsx','utf8'); const c=(n)=>s.split(n).length-1; if(c('opsPumpCtx')!==0){console.error('opsPumpCtx 残留 '+c('opsPumpCtx')+' 处');process.exit(1)} if(c('onMutation: refreshViews')!==2){console.error('活回调 onMutation: refreshViews 应恰 2 处，实测 '+c('onMutation: refreshViews'));process.exit(1)} if(c('createOperationsStore')!==0||c('createOpsPump')!==0){console.error('泵/store 创建应已迁 panel-ops.js');process.exit(1)} console.log('singleton gone, callbacks intact')"`
- Expected: 输出 `singleton gone, callbacks intact`

### Task 7: 对账主题源锚升级（K2，桶②）

- 目标：附录表桶② 中「对账/横幅/泵接线」主题的源锚，逐条改为 client-panel-ops 接口测试或新模块直接断言；旧锚删除。
- 涉及文件：附录表桶② 对账主题行所列测试文件 + `tests/client-panel-ops.test.mjs`
- 接口契约：Consumes: T5/T6 产物 + 附录表逐锚行；Produces: 迁移后的测试断言（接口形态）
- 验证范围：全量绿；附录表内该主题行全部「已迁」。
- [ ] Step 1: 按附录表逐条迁移（升级为 require panel-ops 后的行为/结构断言；保留断言语义不降级：原锚钉什么行为，新测试就断什么行为）
- [ ] Step 2: Run: `npm test`
- Expected: 全绿
- [ ] Step 3: Run: `node --test tests/client-op-outcome-anchor.test.mjs tests/client-operations.test.mjs`
- Expected: 全绿（同族套件无回归）

### Task 8: K2 checkpoint commit

- [ ] Step 1: Run: `git add -A && git commit -m "refactor(client): K2 panel-ops 深模块化——泵显式绑定/对账编排纯化/横幅判定收拢/死字段删除（ADR-0023 第二刀）"`
- Expected: commit 成功且此前 `npm test` 全绿

### Task 9: 抽出 hooks.js（K3）

- 目标：main.jsx:785-919（api/useAsync/useMarketData）+ fmtDate(:810) + useScrollableContain(:3191-3210，评审 R1-3 归此任务——消费方含 chrome.jsx（RestartBanner:1088）、operations-card.jsx（:3221）与 main.jsx 保留区（MarketPanel toast :4025），必须在 T10 出仓前就位）迁 `src/client/hooks.js`，main.jsx require；为 T10/T11 组件出仓消除反向依赖。
- 涉及文件：`src/client/main.jsx`、新建 `src/client/hooks.js`
- 接口契约：Consumes: main.jsx:785-919 与 :3191-3210 现实现；Produces: `{ api, useAsync, useMarketData, fmtDate, useScrollableContain }` 具名导出（`import { useState, … } from "react"`，esbuild interop）
- 验证范围：全量绿；搬家自证。
- [ ] Step 1: 迁移 + 接线
- [ ] Step 2: **同步迁移 hooks 相关锚**（附录时序绑定表 T9 行）：render-smoke:294-297、market-state:315-316、scroll-contain:51-59 —— 改读 hooks.js
- [ ] Step 3: Run: `npm test` — Expected: 全绿
- [ ] Step 4: Run: `node -e "const s=require('fs').readFileSync('src/client/main.jsx','utf8'); if(s.includes('async function api(method, params, signal)')){console.error('api still in main.jsx');process.exit(1)} console.log('hooks moved')"` — Expected: `hooks moved`

### Task 10: 组件出仓批次一（K3）

- 目标：chrome.jsx / card.jsx / favorite-zone.jsx / zone-chips.jsx / operations-card.jsx / version-chip.jsx 建立并出仓（verbatim 迁移 + ESM 具名导出 + main.jsx require）；render-smoke 装载机制同步改造（这 6 文件的组件改直接 require）。
- 涉及文件：新建上列 6 个 `.jsx`；`src/client/main.jsx`；`tests/client-render-smoke.test.mjs`
- 接口契约：
  - Consumes: hooks.js（T9）、i18n.js（T1）、既有 client 模块（market-state/img-chain/lightbox/wheel-strip 等）
  - Produces: 6 个组件文件的具名导出；render-smoke 的组件来源拆分：新文件直接 require，main.jsx 拷贝的追加导出仅剩 MarketPanel 及暂未出仓组件（批次二完成前过渡态）
- 验证范围：全量绿（smoke 含批次一组件的首渲染）。
- [ ] Step 1: 逐文件迁移（成员清单见「文件结构与职责」；函数体零重写，仅头部改 `export function` + 依赖改 import/require）
- [ ] Step 2: main.jsx require 解构替换原定义
- [ ] Step 3: 改 render-smoke：追加导出表删去已出仓组件，新增对这些文件的直接 require 组装
- [ ] Step 4: **同步迁移批次一组件锚**（附录时序绑定表 T10 行）：落位 ∈ 批次一 6 文件的全部桶② 锚（self-check:145-184、lightbox:52-121/150-160/171、img-chain:130-152/172-176/214-215、mobile-head:41-44、market-state:309-312、scroll-contain:64-78、operations:434、operations-view:159-281、render-smoke:127-133/350/371/377-383/399-400 等，以附录表逐行为准）
- [ ] Step 5: Run: `npm test` — Expected: 全绿（smoke 首渲染覆盖批次一全部组件；批次一锚全部改读新文件）

### Task 11: 组件出仓批次二（K3）

- 目标：detail-modal.jsx / market-tab.jsx / installed-tab.jsx / settings-tab.jsx 出仓；render-smoke 追加导出缩至仅 `__MarketPanel`；i18n 审计调用侧扫描面扩至全部新组件文件；附录表桶② 余量迁移。
- 涉及文件：新建 4 个 `.jsx`；`src/client/main.jsx`；`tests/client-render-smoke.test.mjs`；`tests/client-i18n.test.mjs`；附录表桶② 余量行所列测试
- 接口契约：
  - Consumes: T10 模式与产物
  - Produces: 4 个组件文件具名导出；main.jsx 终态 = MarketPanel + 挂载 + apply + tool views；smoke 终态 = 组件直接 require + MarketPanel 拷贝追加导出
- 验证范围：全量绿；main.jsx 行数进入预期带。
- [ ] Step 1: 迁移 4 文件（DetailModal 带 useModalDepth；SettingsTab 带 Section/DetailRows）
- [ ] Step 2: main.jsx require 化；smoke 终态改造
- [ ] Step 3: client-i18n.test.mjs 的 auditTargets 扩至 10 个新组件文件（含 chrome.jsx 等）
- [ ] Step 4: 按附录「锚迁移·任务时序绑定」T11 行迁移桶② 余量锚（落位 ∈ 批次二 4 文件的全部行）
- [ ] Step 5: Run: `npm test` — Expected: 全绿
- [ ] Step 6: Run: `node -e "const s=require('fs').readFileSync('src/client/main.jsx','utf8').split('\n'); console.log('main.jsx lines: '+s.length)"` — Expected: 输出行数且 ≤ 1500

### Task 12: render-smoke 扩面（K3）

- 目标：为已出仓组件各加 1–2 个代表性 props 变体首渲染（MarketTab loading/有数据、DetailModal 开态、OperationsCard 有记录）。
- 涉及文件：`tests/client-render-smoke.test.mjs`
- 接口契约：Consumes: T11 终态装载机制；Produces: 扩面用例（不穷举，每组件 1–2 变体）
- 验证范围：全量绿。
- [ ] Step 1: 加变体用例（夹具自备，遵守「新 describe 自带夹具」纪律）
- [ ] Step 2: Run: `npm test` — Expected: 全绿

### Task 13: 渲染探针锚点迁移（K3）

- 目标：probe-render-count.mjs 的 `function Card` 锚 → card.jsx、`function Icon` 锚 → chrome.jsx、`function MarketTab` 锚 → market-tab.jsx（多源变换）；调用点锚 + footer 锚留 main.jsx；每锚「恰好命中一次」断言不变。
- 涉及文件：`scripts/probe-render-count.mjs`
- 接口契约：Consumes: T11 终态文件布局；Produces: 可运行的探针（源漂移保护语义不变）
- 验证范围：探针全场景跑通且数字在 ADR-0020 带内。
- [ ] Step 1: 改造探针为多源读取（main.jsx + card.jsx + chrome.jsx + market-tab.jsx）、分别 patch：计数器/Profiler 注入语义与锚文本零变化（`function Card` 等子串在 `export function Card` 头下仍命中，评审 R1-8 已核实）；装载层（读源→patch→entry 组装）允许重构，「每锚恰好命中一次」断言保留
- [ ] Step 2: Run: `node scripts/probe-render-count.mjs`
- Expected: 正常退出；各场景 renderMs 在 16–57ms 带（慢机按 ADR-0020 余量注记放宽判断）、longtask = 0；锚点断言无一报漂移
- [ ] Step 3: K3 checkpoint commit。Run: `git add -A && git commit -m "refactor(client): K3 组件出仓+源锚迁移+探针锚迁移（ADR-0023 第三刀）"`
- Expected: commit 成功且此前 `npm test` 与探针均绿（B3 刀刀 commit 的第三刀落点）

### Task 14: 0.10.9 收口（文档与版本）

- 目标：CHANGELOG 0.10.9 条目（三刀结构 + ADR-0023 指针 + 附录表指针）+ package.json version 0.10.9。
- 涉及文件：`CHANGELOG.md`、`package.json`
- 接口契约：Consumes: T1–T13 完成态；Produces: 版本可发布态
- 验证范围：check-release 门禁绿。
- [ ] Step 1: 写 CHANGELOG 条目与版本号
- [ ] Step 2: Run: `npm run check-release`
- Expected: 通过（实际发版按仓库发版序列另行执行，不入本计划）
- [ ] Step 3: 收口 commit。Run: `git add -A && git commit -m "chore(release): 0.10.9 三刀战役收口（ADR-0023）"`
- Expected: commit 成功（与 T13 的 K3 代码 commit 分立，文档/版本独立可回滚）

### Task 15: 最终验证

- [ ] Step 1: Run: `npm test`
- Expected: 全量绿（含 pretest build）
- [ ] Step 2: Run: `node scripts/probe-render-count.mjs`
- Expected: 数字在带、零 longtask（与 T13 一致）
- [ ] Step 3: Run: `git diff --stat v0.10.8..HEAD 2>/dev/null || git diff --stat HEAD` + 逐文件归因检查（计划外改动未夹带）
- Expected: 变更文件全部可归因到本计划任务
- [ ] Step 4: dogfood 门（Q14 承诺）：按主人本机惯例执行狗粮清单——面板开合/还原态拖拽、安装一个插件、对账横幅出现与一次性化、开关切换、设置变更入操作记录；主人确认后打 tag
- [ ] Step 5: 输出修改摘要（三刀各自 commit 列表 + main.jsx 行数前后对照）

## 执行纪律

- 开始实现前先批判性复查整份计划；发现缺项、矛盾、命名不一致或验证命令无效，先修计划。
- 按任务顺序执行，不无声跳步、合并步或改变任务目标；每完成一个任务运行该任务的验证。
- 每个任务结束保持 `npm test` 可绿；checkpoint commit 只在 T3/T8 与战役末自然边界打。
- 管道消费测试输出时守退出码卫生（`set -o pipefail` 或显式 `$?`）。
- 遇阻塞、重复失败或计划与仓库现实不符（行号漂移、锚点计数≠1、require 断链），立即停下说明，不猜。
- main 分支实现须先获主人明确同意。
- 全部任务完成后运行最终验证并输出修改摘要。

## 最终验证

- `npm test`（含 pretest build）全量绿；`node scripts/probe-render-count.mjs` 数字在 ADR-0020 带内且零 longtask；`git diff` 逐文件可归因；main.jsx 行数 ≤ 1500；附录逐锚表全部行「已迁/保留」闭环。

## 审阅 Checkpoint

- 计划正文结束。审阅通过前不进入实现；默认执行方为普通编码 agent 或人工执行者。

## 附录：逐锚去向表

普查口径（评审 R1-6 复核修正）：grep `main.jsx` 命中 18 个测试文件，其中 **17 个真读 main.jsx 源码做断言**（client-zonechips-clip.test.mjs 仅 :96 注释提及旧行号、不读源码），共 **195 条锚点** + render-smoke 装载机制 1 条单列。锚点位置已在 main.jsx 逐一定位核实。**执行前必须重跑定位核对（行号会随拆分漂移，本表行号是 2026-10-23 普查时点值）。**

### 表前横切纪律（迁移时逐条遵守）

1. **切片锚机制退役**：依赖 main.jsx 内函数相邻顺序的切片锚（render-smoke:461、img-chain:143/155/171/185/192-196/204-208/214-215、wheel-strip:92、installed-view:107、self-check:145/168、operations:517）在组件分文件后边界消失，统一改为**单文件全文锚**或 **require 后行为断言**，锚语义不降级（img-chain:204-208 modalSeg 行同为切片语义，其「迁移动作」列按此办理）。
2. **跨文件计数锚必须改多文件合计**（installed-updates:73-82 恰 N 处、op-outcome-anchor:20 ≥6、i18n:18 审计面），否则保护面静默收窄——逐条在迁移 PR 里显式列出合计口径。
3. **负向双扫**：client-lightbox:100 的 `--dshm-drag-bg` 是唯一跨 CSS+JS 的负向锚，迁后需 styles.js + main.jsx 双文件扫描；i18n 负向键锚同理（i18n.js + 组件调用面）。
4. **卫兵登记**：本战役改锚新增的多行针须入 `tests/source-anchor-hygiene.test.mjs` 的 ALLOWLIST 登记（禁 `\n` 转义纪律不豁免）。
5. 顺手清理：`tests/client-zonechips-clip.test.mjs:96` 标题注释里的旧行号引用（该文件不读 main.jsx 源码，纯注释过期）——并入 T10 zone-chips 步骤。

### 锚迁移·任务时序绑定（评审 R2-1）

**绑定规则：内容在哪个任务迁走，其锚在该任务同步迁移**——凡断言 main.jsx 源文本的正向锚，钉住内容被物理搬走的那一刻即红，锚迁移必须与内容迁移同任务（同 commit）。附录「迁移动作」列只给去向，时点由本表裁定；执行各任务前先按本表圈定该任务锚范围，迁完 grep 自证无漏：

| 任务 | 内容迁移 | 同任务必须迁移的锚（按附录表行） |
|---|---|---|
| T1 | i18n 词典+函数 → i18n.js | 桶①「改读 i18n.js」全集（词典键锚，分布 7 文件：render-smoke:330-331/358/365-366/369/384、self-check:188-189、operations:509、installed-updates:86-87、img-chain:177-178、window-resize:133-134、operations-view:170-172/248-250/251-255/264/280）+ client-i18n:13-15/41 词典侧 + **负向键锚词典侧半边**（self-check:161-162、operations-view:176/180——负向扫描对象改 i18n.js；组件调用面半边随 T10/T11 出仓补全，见两行注记，防 T1→T10 间 i18n.js 负向保护真空） |
| T2 | CSS → styles.js | 桶①「改读 styles.js」全集 |
| T7 | 对账/横幅判定 → panel-ops.js | operations:506-507/517-527、self-check:166（锚文本随实现位移）、op-outcome-anchor:16/20（扫描面扩 src/client/**） |
| T9 | 数据 hooks + useScrollableContain → hooks.js | render-smoke:294-297、market-state:315-316、scroll-contain:51-59 |
| T10 | 批次一 6 文件出仓 | 落位文件 ∈ {chrome/card/favorite-zone/zone-chips/operations-card/version-chip}.jsx 的全部桶② 行：self-check:145-184、**installed-updates:97（chip 锚，评审 R3-1 纠排）**、lightbox:52-79/112/117-121/150-160 + **87-89 的 ‹› 断言半边**（该 it 拆双断言分别落位——‹› 半边随 Lightbox→chrome.jsx，键盘半边留 T11，附录 :346 既定）、img-chain:130-152/172-176/214-215、mobile-head:41-44、market-state:309-312、scroll-contain:64-78、operations:434、operations-view:159-281、render-smoke:127-133/350/371/377-383/399-400，以附录表逐行为准。**注意**：lightbox:56-60/63-64/82-84/95-96/99-102/105-107/110-111/115-116/124/171 为 CSS 锚归 T2，勿入本批；负向 i18n 锚组件面半边（self-check:161-162、operations-view:176/180 调用面扫描）随本批出仓落新文件 |
| T11 | 批次二 4 文件出仓 | 桶② 余量（落位 ∈ {detail-modal/market-tab/installed-tab/settings-tab}.jsx：wheel-strip:92-102、lightbox:**87-89 键盘断言半边**（DetailModal）/163-168、img-chain:142/155-168/204-208/213/219-220、installed-updates:**73-82/101/105**（:97 已归 T10）、installed-view:107-117、render-smoke:301/303/312-313/322/326-328/**348-349/351**（:350 已归 T10）/364/370/385/457/461-462、about-version:13-20 等）+ i18n 审计调用侧扩面（Step 3） |
| T13 | 探针插桩锚 | scripts/probe-render-count.mjs 四插桩锚（多源化） |

迁移时逐条遵守横切纪律 2/3/4（跨文件合计口径、负向双扫、hygiene ALLOWLIST 登记）。

### 总表

| 测试文件:行 | 锚点内容摘要 | 归属桶 | 迁移动作 |
|---|---|---|---|
| client-render-smoke.test.mjs:19,29-34 | 【装载机制，非锚】拷贝 main.jsx 全文+追加 `module.exports={__MarketPanel,__InstalledTab,…__UseImgChainProbe}` 临时入口→esbuild bundle | 机制 | 战役后仅 MarketPanel 保留追加导出；InstalledTab/ZoneChips/FavoriteZone/DshmVersionChip/RestartBanner/DetailModal/Lightbox/UseImgChainProbe 改直接 require 新组件文件/hooks.js |
| client-render-smoke.test.mjs:78 | `.dshm-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:8px}` | ① | 改读 styles.js，锚文本不变 |
| client-render-smoke.test.mjs:79 | 负向：`@media(max-width:680px)` 下 .dshm-cards 1fr 覆盖不存在 | ① | 改读 styles.js |
| client-render-smoke.test.mjs:88 | `.dshm-overlay.full{…top:var(--dsh-windows-titlebar-height,0px)}` | ① | 改读 styles.js |
| client-render-smoke.test.mjs:89 | `padding:max(24px,var(--dsh-windows-titlebar-height,0px)) 16px 24px` | ① | 改读 styles.js |
| client-render-smoke.test.mjs:127 | `const chipsSignature = JSON.stringify(chips.map`（ZoneChips 签名） | ② | 改读 zone-chips.jsx |
| client-render-smoke.test.mjs:128 | deps `[chipsSignature, active, expanded, zone, stuck, rowHeight, measure]` | ② | 改读 zone-chips.jsx |
| client-render-smoke.test.mjs:129 | `existing.querySelector(".dshm-panel")…existing.remove()`（挂载区 :4207） | ③ | 保留，锚对象 main.jsx 不变 |
| client-render-smoke.test.mjs:130 | `.dshm-chips…reserve{padding-right:calc(var(--dshm-clip-gutter,96px) + 60px)}` | ① | 改读 styles.js |
| client-render-smoke.test.mjs:131 | `const moreLeft = geom ? geom.lastVisRight + 6 : 0;` | ② | 改读 zone-chips.jsx |
| client-render-smoke.test.mjs:132 | `const moreHeight = geom ? geom.lastVisHeight` | ② | 改读 zone-chips.jsx |
| client-render-smoke.test.mjs:133 | `` height: `${moreHeight}px` `` | ② | 改读 zone-chips.jsx |
| client-render-smoke.test.mjs:294 | `probeMode = "cache-only"`（:848 useMarketData 内） | ② | useMarketData 迁 hooks.js → 改读 hooks.js |
| client-render-smoke.test.mjs:295 | `latestComplete === false`（:887） | ② | 改读 hooks.js |
| client-render-smoke.test.mjs:296 | `return fetchPage(nextQuery, force, true, "full")` | ② | 改读 hooks.js |
| client-render-smoke.test.mjs:297 | `mergeLatestFields(` | ② | 改读 hooks.js |
| client-render-smoke.test.mjs:301 | `onForceMarket`（SettingsTab 签名 :2718 + 接线 :4146） | ② | 升级为接口断言：settings-tab.jsx 签名 + main.jsx 传参各锚一处 |
| client-render-smoke.test.mjs:302 | `marketReloadAll(true)`（:4146 MarketPanel 保留区） | ③ | 保留，锚对象 main.jsx 不变 |
| client-render-smoke.test.mjs:303 | `refresh = async () => {…onForceMarket?.()`（SettingsTab :2738-2748） | ② | 改读 settings-tab.jsx |
| client-render-smoke.test.mjs:312 | `ops.runOp("upgrade", it.installedPkg`（:2047 MarketTab） | ② | 改读 market-tab.jsx |
| client-render-smoke.test.mjs:313 | `activeUpgradeRec.target === detailItem.installedPkg` | ② | 改读 market-tab.jsx |
| client-render-smoke.test.mjs:322 | `kv(lookup("modal.added"), fmtDate(it.added))` | ② | 改读 detail-modal.jsx |
| client-render-smoke.test.mjs:326 | `lookup("failed.load"…)…lookup("market.retry")` 错误行重试（MarketTab） | ② | 改读 market-tab.jsx |
| client-render-smoke.test.mjs:327 | `market.empty.unavailable` 分支 | ② | 改读 market-tab.jsx |
| client-render-smoke.test.mjs:328 | `market.empty.category` 分支 | ② | 改读 market-tab.jsx |
| client-render-smoke.test.mjs:330-331 | `market.retry`/`market.empty.category`/`market.empty.unavailable` 三键 ZH/EN 各一次 | ① | 改读 i18n.js（import ZH/EN 计数） |
| client-render-smoke.test.mjs:348 | `role: "dialog"` Modal 容器 | ② | 改读 detail-modal.jsx |
| client-render-smoke.test.mjs:349 | `closeRef.current.focus()` | ② | 改读 detail-modal.jsx |
| client-render-smoke.test.mjs:350 | Shot `role:"button",tabIndex:0…onKeyDown Enter/Space` | ② | 改读 chrome.jsx（Shot 落位） |
| client-render-smoke.test.mjs:351 | 负向 `focus-trap\|focusTrap` | ② | 负向扫描改 detail-modal.jsx |
| client-render-smoke.test.mjs:357 | `.dshm-chip.zero{opacity` | ① | 改读 styles.js |
| client-render-smoke.test.mjs:358 | `chips.crossbucket.tip` 键 | ① | 改读 i18n.js |
| client-render-smoke.test.mjs:364 | 负向 `lookup("badge.decoupled")` 调用 | ② | 负向扫描改 card.jsx/detail-modal.jsx |
| client-render-smoke.test.mjs:365 | 负向 `badge.decoupled.tip` 键 | ① | 负向扫描改 i18n.js |
| client-render-smoke.test.mjs:366 | 负向 `"badge.decoupled"` 键 | ① | 负向扫描改 i18n.js |
| client-render-smoke.test.mjs:369 | `modal.decoupled.label`/`.value` 两键在 | ① | 改读 i18n.js |
| client-render-smoke.test.mjs:370 | `it.decoupled === true ? kv(lookup("modal.decoupled.label")` | ② | 改读 detail-modal.jsx |
| client-render-smoke.test.mjs:371 | `"verified", "audience", "decoupled"]`（snapshotOf :3044） | ② | 改读 card.jsx（snapshotOf 落位） |
| client-render-smoke.test.mjs:377 | 负向 `lookup("badge.verified")` 调用 | ② | 负向扫描改 card.jsx |
| client-render-smoke.test.mjs:378 | 负向 `"badge.verified"` 键 | ① | 负向扫描改 i18n.js |
| client-render-smoke.test.mjs:381 | `const verifiedByline = (it) =>`（:1896） | ② | 改读 card.jsx（verifiedByline 落位） |
| client-render-smoke.test.mjs:382 | `verifiedByline(it),` 市场卡接线 | ② | 改读 card.jsx/market-tab.jsx |
| client-render-smoke.test.mjs:383 | `lookup("byline.verified", { v: …最新 }）， title: join("、")` | ② | 改读 card.jsx |
| client-render-smoke.test.mjs:384 | `"byline.verified":` ZH/EN 各一次 | ① | 改读 i18n.js |
| client-render-smoke.test.mjs:385 | Modal 实测版本行条件渲染 | ② | 改读 detail-modal.jsx |
| client-render-smoke.test.mjs:391 | `.dshm-body{…overflow-anchor:none` | ① | 改读 styles.js |
| client-render-smoke.test.mjs:392 | `position:sticky;top:-14px` | ① | 改读 styles.js |
| client-render-smoke.test.mjs:393 | `top: "-5px"`（ZoneChips 哨兵 JSX） | ② | 改读 zone-chips.jsx |
| client-render-smoke.test.mjs:399 | `ops.runOp("upgrade", "dsh-m", async () => { const r = await api("self-upgrade");`（:3369 chip 内） | ② | 改读 version-chip.jsx |
| client-render-smoke.test.mjs:400 | `opMeta: { from: version, to: r.version \|\| "latest" }` | ② | 改读 version-chip.jsx |
| client-render-smoke.test.mjs:401 | `h(DshmVersionChip, { version: pluginVersion, notify, ops })`（:4114 head） | ③ | 【已裁决】head JSX 属 MarketPanel 保留区 → 锚不变 |
| client-render-smoke.test.mjs:449 | `@container (max-width:720px){` | ① | 改读 styles.js |
| client-render-smoke.test.mjs:450 | 负向旧 600 容器断点 | ① | 改读 styles.js |
| client-render-smoke.test.mjs:451 | `.dshm-title{…ellipsis}` 全串 | ① | 改读 styles.js |
| client-render-smoke.test.mjs:452 | seg button nowrap 全串 | ① | 改读 styles.js |
| client-render-smoke.test.mjs:453 | `@media (max-width:600px){.dshm-overlay{padding:8px}}` | ① | 改读 styles.js |
| client-render-smoke.test.mjs:457 | `className: "dsvm-modalbody"`（:1773） | ② | 改读 detail-modal.jsx |
| client-render-smoke.test.mjs:458 | `.dsvm-modalbox{…overflow:hidden` | ① | 改读 styles.js |
| client-render-smoke.test.mjs:459 | 负向 modalbox 整体 overflow:auto | ① | 改读 styles.js |
| client-render-smoke.test.mjs:460 | `.dsvm-modalbody{overflow:auto;min-height:0;overscroll-behavior:contain` | ① | 改读 styles.js |
| client-render-smoke.test.mjs:461-462 | 切片 `function DetailModal(`→`// ---------- 市场页`，body 包住 kv→actions | ② | 切片机制退役，改读 detail-modal.jsx 全文顺序断言 |
| client-render-smoke.test.mjs:466 | `@container (min-width:1100px){` | ① | 改读 styles.js |
| client-render-smoke.test.mjs:467 | `.dshm-settings-grid{grid-template-columns:4fr 7fr 4fr}` | ① | 改读 styles.js |
| client-render-smoke.test.mjs:468 | 负向 `.dshm-panel.full .dshm-settings-grid` 三列退役 | ① | 改读 styles.js |
| client-render-smoke.test.mjs:469 | `@media (max-width:760px){.dshm-settings-grid` | ① | 改读 styles.js |
| client-i18n.test.mjs:13-15 | 词典正则抽取 `"([a-zA-Z0-9._-]+)":\s*"` 建 dictKeys | ① | 改为 `import { ZH, EN } from '../src/client/i18n.js'` 由对象键集合构建 |
| client-i18n.test.mjs:18 | lookup 直接量审计对象含 main.jsx | ① | 审计清单扩面：main.jsx+新组件文件+op-outcome.js |
| client-i18n.test.mjs:41 | 抽查 5 已知键在册（依赖 dictKeys） | ① | 随 import ZH/EN 自动迁移 |
| client-self-check.test.mjs:145-148 | `const doUpgrade = async () => {`/`const performUpgrade = async () => {` 结构（:3351-3356 chip 内） | ② | 改读 version-chip.jsx |
| client-self-check.test.mjs:149 | doUpgrade 切片零 `api(` | ② | 改读 version-chip.jsx（切片边界改文件内标记） |
| client-self-check.test.mjs:150 | `performUpgrade()` 直呼 | ② | 改读 version-chip.jsx |
| client-self-check.test.mjs:151 | 负向 `setConfirming` | ② | 负向扫描改 version-chip.jsx |
| client-self-check.test.mjs:154-156 | 全文 `api("self-upgrade")` 均位于升级臂后 | ② | 改读 version-chip.jsx 全文定位 |
| client-self-check.test.mjs:157 | `api("self-upgrade")` 存在 | ② | 改读 version-chip.jsx |
| client-self-check.test.mjs:161-162 | 负向 `selfupgrade.confirm`/`selfupgrade.go` dead key | ① | 负向扫描改 i18n.js+组件调用面双扫 |
| client-self-check.test.mjs:166 | `needsRestart: res.needsRestart ?? true` | ② | **迁移时点 T7（K2）**：判定收拢进 restartBannerDecision 后锚文本随实现位移 → 改锚 panel-ops.js |
| client-self-check.test.mjs:168-172 | performUpgrade 切片负向 `needsRestart: true` | ② | 改读 version-chip.jsx（调用点 K2 改调 restartBannerDecision、K3 才出仓——锚文本变化在 T7 同步核对，文件迁移在 T11） |
| client-self-check.test.mjs:182 | `const ir = data.intentResolved;`（:3338） | ② | 改读 version-chip.jsx |
| client-self-check.test.mjs:183 | `lookup("selfupgrade.reconciled.done"` | ② | 改读 version-chip.jsx |
| client-self-check.test.mjs:184 | `lookup("selfupgrade.reconciled.failed"` | ② | 改读 version-chip.jsx |
| client-self-check.test.mjs:188 | `"selfupgrade.reconciled.done": "` ×2 | ① | 改读 i18n.js |
| client-self-check.test.mjs:189 | `"selfupgrade.reconciled.failed": "` ×2 | ① | 改读 i18n.js |
| client-lightbox.test.mjs:52-53 | createPortal 挂 body + SSR 回退 | ② | 改读 chrome.jsx（Lightbox 落位） |
| client-lightbox.test.mjs:56-60 | ✕/‹› 复合选择器 3 正向+单类规则 2 负向 | ① | 改读 styles.js |
| client-lightbox.test.mjs:63-64 | `.dsvm-lightbox{position:fixed;top:var(…,0px)` + 负向 inset:0 | ① | 改读 styles.js |
| client-lightbox.test.mjs:67-71 | R3 焦点还原（捕获先于聚焦顺序锚 + isConnected 还原） | ② | 改读 chrome.jsx |
| client-lightbox.test.mjs:74-75 | 圆点 `key: i` + 负向旧 key:s | ② | 改读 chrome.jsx |
| client-lightbox.test.mjs:78-79 | img 属性全串 + `className: "dsvm-btn dsvm-lbclose"` | ② | 改读 chrome.jsx |
| client-lightbox.test.mjs:82-84 | `.dsvm-lbbar` / img 74vh + 负向 `.dsvm-lbnav{` | ① | 改读 styles.js |
| client-lightbox.test.mjs:87-89 | 组件/键盘走 lbStep + 负向内联取模 | ② | ‹› 锚 chrome.jsx；键盘 lbStep 行在 DetailModal → detail-modal.jsx，两文件各锚 |
| client-lightbox.test.mjs:95-96 | 影院遮罩 `!important` 自持 + `!important` 全文定长计数 4 | ① | 改读 styles.js；计数口径复核（注释随 CSS 迁移后若同在 styles.js 则不变） |
| client-lightbox.test.mjs:99-102 | 拖拽态 3 正向 CSS + 负向 `--dshm-drag-bg`（CSS/JS/注释全清） | ① | CSS 三锚改读 styles.js；负向需 styles.js+main.jsx 双文件扫描 |
| client-lightbox.test.mjs:105-107 | 深色玻璃芯片 3 条 CSS | ① | 改读 styles.js |
| client-lightbox.test.mjs:110-111 | `@keyframes dsvm-lbspin` + `.dsvm-lbspin{` | ① | 改读 styles.js |
| client-lightbox.test.mjs:112 | `!chain.settled && chain.src ? h("div", { className: "dsvm-lbspin"…}) : null` | ② | 改读 chrome.jsx |
| client-lightbox.test.mjs:115-116 | 淡入两规则 CSS | ① | 改读 styles.js |
| client-lightbox.test.mjs:117-118 | `` className: `dsvm-lbimg${chain.settled ? …}` `` + img 属性锚 | ② | 改读 chrome.jsx |
| client-lightbox.test.mjs:121 | `return { src, failed, retry, onError, onLoad, settled };`（useImgChain :1450） | ② | useImgChain 随 Shot/Lightbox 落位 chrome.jsx → 改读 chrome.jsx |
| client-lightbox.test.mjs:124 | `@media (prefers-reduced-motion:reduce){…}` | ① | 改读 styles.js |
| client-lightbox.test.mjs:150-154 | 邻图预取五锚（settled 门卫/lbNeighbors/weservUrl 同形/去重/Set） | ② | 改读 chrome.jsx |
| client-lightbox.test.mjs:157-160 | 触屏滑动四锚（touch 门卫/swipeDir/onNav 取反/500ms 吞 click） | ② | 改读 chrome.jsx |
| client-lightbox.test.mjs:163-168 | 焦点圈闭六锚（在 DetailModal lb 键盘 effect 内） | ② | 改读 detail-modal.jsx |
| client-lightbox.test.mjs:171 | `touch-action:pan-y pinch-zoom}` | ① | 改读 styles.js |
| client-window-resize.test.mjs:121-124 | bundle 正向锚 8 个 ASCII 字面量（读 lib/client.js） | ③ | 保留，锚对象 lib/client.js 不变 |
| client-window-resize.test.mjs:127 | bundle 负向 resize:both | ③ | 保留，锚对象不变 |
| client-window-resize.test.mjs:130 | bundle `dshm-rz` 计数 6 | ③ | 保留，锚对象不变 |
| client-window-resize.test.mjs:133-134 | 源锚 `拖边角调大小`（词典值 panel.dragHint :100/225） | ① | 改读 i18n.js |
| client-window-resize.test.mjs:135 | bundle 中文已 \uXXXX 转义自证 | ③ | 保留，锚对象不变 |
| client-img-chain.test.mjs:130-133 | useImgChain 计时门控四锚（守卫四条件/deps/onLoad settled/startChain 重置） | ② | 改读 chrome.jsx（useImgChain 落位） |
| client-img-chain.test.mjs:136 | prevUrl 渲染期 derived-state 重置 | ② | 改读 chrome.jsx |
| client-img-chain.test.mjs:142 | `useImgChain(src, { h: 300, active: show })`（Shot） | ② | 改读 chrome.jsx（Shot 落位） |
| client-img-chain.test.mjs:143-147 | 切片 `function Shot(`→`function Lightbox(`：img 属性锚 | ② | Shot/Lightbox 同落 chrome.jsx，切片改文件内标记或全文锚 |
| client-img-chain.test.mjs:150-152 | onBroken 经 useEffect + `chain.failed ? null` | ② | 改读 chrome.jsx |
| client-img-chain.test.mjs:155-168 | 切片 `function DetailModal(`→市场页：visible/broken 去重/四处 visible.length 基准/稳定 key/shots:visible/钳制 | ② | 改读 detail-modal.jsx 全文 |
| client-img-chain.test.mjs:172-176 | 切片 `function Lightbox(`→`function DetailModal(`：w=1600 走链/双败占位/三键接线 | ② | 改读 chrome.jsx |
| client-img-chain.test.mjs:177-178 | ZH/EN 三键词典逐字（lb.fail/lb.retry/lb.open 6 串） | ① | 改读 i18n.js |
| client-img-chain.test.mjs:179 | `.dsvm-lbfail{` | ① | 改读 styles.js |
| client-img-chain.test.mjs:185-191 | 切片 `.dsvm-shotrow{`→`/* 灯箱 v2`：统一瓷砖 4 正向 | ① | CSS 迁 styles.js → 切片边界在 styles.js 内重定（锚文本不变） |
| client-img-chain.test.mjs:192-196 | 同切片负向 4 条（min-width/min-height/max-width/max-height 病灶） | ① | 改读 styles.js（同上切片重定） |
| client-img-chain.test.mjs:204-208 | modalSeg：primaryShots/primary-screenshots/safeScreenshots×2/deps | ② | 改读 detail-modal.jsx |
| client-img-chain.test.mjs:213 | `api("market", { query: id, source: "all", limit: 8 })`（openFavDetail :2127 MarketTab 内） | ② | 改读 market-tab.jsx |
| client-img-chain.test.mjs:214-215 | 切片 `function snapshotOf(`→`function FavoriteZone(` 负向 screenshots | ② | snapshotOf 落位 card.jsx 后改读全文负向 |
| client-img-chain.test.mjs:219-220 | brokenShotsKey 渲染期重置 | ② | 改读 detail-modal.jsx |
| client-operations.test.mjs:431 | `const opsAttention = …failed \|\| warned`（:3861 MarketPanel 保留区） | ③ | 保留，锚对象 main.jsx 不变 |
| client-operations.test.mjs:434 | `title: lookup("op.remove")`（:3252 OperationsCard） | ② | 改读 operations-card.jsx |
| client-operations.test.mjs:506 | `lookup("upgrade.reconciled.done"`（:4003 恢复对账编排→第二刀 planReconcileActions） | ② | 迁 panel-ops.js → 改读 panel-ops.js（或对纯函数行为测试） |
| client-operations.test.mjs:507 | `r.meta.reconciledAfterRestart` 消费 | ② | 改读 panel-ops.js |
| client-operations.test.mjs:509 | `"upgrade.reconciled.done": "` ×2 | ① | 改读 i18n.js |
| client-operations.test.mjs:517-519 | 时序锚 replaceAll 先于补横幅 lookup（indexOf 比较） | ② | 改读适配器执行序 + panel-ops 内两标记顺序（先落账后补报语义保持） |
| client-operations.test.mjs:520 | `restore persist failed` 诊断留痕 | ② | 改读 panel-ops.js |
| client-operations.test.mjs:525-527 | 已读集合三锚 readReconcileNotified/seen.has/writeReconcileNotified | ② | 改读 panel-ops.js（plan.seenAdditions 契约对齐） |
| client-window-drag.test.mjs:129 | `require("./window-drag.js")`（:19 顶部） | ③ | 保留，锚对象 main.jsx 不变 |
| client-window-drag.test.mjs:132-133 | head `onDoubleClick`+isDragTarget 门卫（:4076） | ③ | 【已裁决】head JSX 属 MarketPanel 保留区 → 锚不变 |
| client-window-drag.test.mjs:136-137 | loadPanelPos/savePanelPos（:3503 MarketPanel） | ③ | 保留，锚对象不变 |
| client-window-drag.test.mjs:140 | 负向 `"dshm-panel-pos"` 键字面量 | ③ | 保留，锚对象不变 |
| client-window-drag.test.mjs:143-145 | fullRef/posRef render 期镜像+负向（:3523） | ③ | 保留，锚对象不变 |
| client-wheel-strip.test.mjs:92 | 切片 `function DetailModal(`→市场页 | ② | 改读 detail-modal.jsx 全文 |
| client-wheel-strip.test.mjs:94 | `const { shotWheelAction } = require("./wheel-strip.js")` | ② | 改读 detail-modal.jsx |
| client-wheel-strip.test.mjs:95-98 | 手动 addEventListener({passive:false})/remove/入参现读/deps=[visible.length] | ② | 改读 detail-modal.jsx |
| client-wheel-strip.test.mjs:101-102 | `ref: shotRowRef, className: "dsvm-shotrow"`+useRef 声明 | ② | 改读 detail-modal.jsx |
| client-mobile-head.test.mjs:13-17 | 容器查询载体 5 锚 | ① | 改读 styles.js |
| client-mobile-head.test.mjs:21-29 | 头部两行重排 9 锚 | ① | 改读 styles.js |
| client-mobile-head.test.mjs:33-35 | 标题双 span+`lookup("title.panel")`（:4089 head） | ③ | 【已裁决】head JSX 属 MarketPanel 保留区 → 锚不变 |
| client-mobile-head.test.mjs:39-40 | verchip 收拢 2 条 CSS | ① | 改读 styles.js |
| client-mobile-head.test.mjs:41-44 | chip 专属类 4 锚（DshmVersionChip JSX） | ② | 改读 version-chip.jsx |
| client-mobile-head.test.mjs:48-49 | `window.matchMedia("(max-width: 600px)")` 恒全屏（:3478 MarketPanel） | ③ | 保留，锚对象 main.jsx 不变 |
| client-installed-updates.test.mjs:73 | `const degraded = oc.degradedOutcome(res);` 恰 2（:2043 MarketTab+:2556 InstalledTab） | ② | 计数拆 market-tab.jsx+installed-tab.jsx 各 1 合计 |
| client-installed-updates.test.mjs:77 | `if (degraded) {` ×2 | ② | 同上双文件合计 |
| client-installed-updates.test.mjs:78 | `notify({ kind: "warn", text: degraded.text });` ×2 | ② | 同上双文件合计 |
| client-installed-updates.test.mjs:82 | `setInstallNote({ id: it.id, kind: "warn"…});` ×1（市场卡） | ② | 改读 market-tab.jsx 计数 |
| client-installed-updates.test.mjs:86 | `"op.degraded": "升级失败：…"` zh 逐字 | ① | 改读 i18n.js |
| client-installed-updates.test.mjs:87 | `"op.degraded":` ×2 | ① | 改读 i18n.js |
| client-installed-updates.test.mjs:97 | `{ npm: "dsh-m", toVersion: state.latest }` ×1（chip） | ② | 改读 version-chip.jsx |
| client-installed-updates.test.mjs:101 | `{ toVersion: it.latestVersion }` ×1（已装） | ② | 改读 installed-tab.jsx |
| client-installed-updates.test.mjs:105 | `{ toVersion: it.latest }` ×1（市场卡） | ② | 改读 market-tab.jsx |
| client-op-outcome-anchor.test.mjs:16 | 负向 `join(" \| ")` main.jsx 归零（回流 tripwire） | ② | 负向扫描扩为 src/client/**（装配回流可落任何新文件） |
| client-op-outcome-anchor.test.mjs:20 | `mutationFailed` ≥6 站点 | ② | 六站点随组件分文件 → 目录级合计计数 |
| client-market-state.test.mjs:309 | `api("market-ids-exist", { ids: … })`（:3075 FavoriteZone 内） | ② | 改读 favorite-zone.jsx |
| client-market-state.test.mjs:311 | `present = new Set();` ×2 | ② | 改读 favorite-zone.jsx |
| client-market-state.test.mjs:312 | 负向逐收藏 `api("market", { query: fav.id` 扇出 | ② | 负向扫描改 favorite-zone.jsx |
| client-market-state.test.mjs:315 | `if (!marketResponseEquivalent(prevData, merged)) setData(merged);`（:883 useMarketData） | ② | 迁 hooks.js → 改读 hooks.js |
| client-market-state.test.mjs:316 | `…marketResponseEquivalent } = require("./market-state.js")` 导入行（:14） | ② | 导入行随拆分重排 → 改锚 hooks.js 内 marketResponseEquivalent 导入 |
| client-installed-view.test.mjs:107-117 | 已装 doUpgrade 切片（两处同名函数取第二处→`if (loading && !data) return`）：通用 upgrade API+负向零 self-upgrade/SELF_PKG/dsh-m 特判 | ② | InstalledTab 单文件化后切片退役，改读 installed-tab.jsx 全文（负向语义保留） |
| client-scroll-contain.test.mjs:29-35 | 负向恒挂 contain 2 条 | ① | 改读 styles.js |
| client-scroll-contain.test.mjs:40-47 | `.dshm-ops-scroll` 双规则对+banner-text 条件规则 | ① | 改读 styles.js |
| client-scroll-contain.test.mjs:51-59 | `function useScrollableContain(dep)` 定义/ResizeObserver 守卫/可滚判定 | ② | useScrollableContain 主要消费方 OperationsCard/RestartBanner——落位后改读落位文件（hooks.js 或 chrome.jsx，以 T10 实际落位为准） |
| client-scroll-contain.test.mjs:64-74 | 操作记录滚动区三锚（OperationsCard :3221-3276） | ② | 改读 operations-card.jsx |
| client-scroll-contain.test.mjs:76-78 | RestartBanner `` className: `dsvm-banner-text${textScrollCls}` ``（:1088-1092） | ② | 【已裁决】RestartBanner 在 chrome.jsx 成员清单内 → 改读 chrome.jsx |
| client-scroll-contain.test.mjs:80-86 | toast 两锚（:4025 MarketPanel 保留区） | ③ | 保留，锚对象 main.jsx 不变 |
| client-operations-view.test.mjs:159 | `require("./operations-view.js")` | ② | 改读 operations-card.jsx |
| client-operations-view.test.mjs:160-162 | groupOpsByDay/opRowVm/opUpgradeMeta 消费 | ② | 改读 operations-card.jsx |
| client-operations-view.test.mjs:165-169 | 新展示类名 5 锚 dsvm-optime/opday/opdir/opver/opdur | ② | 改读 operations-card.jsx（类名亦在 styles.js CSS，择一保锚） |
| client-operations-view.test.mjs:170-172 | 键三锚 op.day.today/yesterday、settings.ops.group.done.n | ① | 改读 i18n.js |
| client-operations-view.test.mjs:175 | 负向 `const targetText` | ② | 负向扫描改 operations-card.jsx |
| client-operations-view.test.mjs:176 | 负向 `"settings.ops.group.done"` 旧键 | ① | 负向扫描改 i18n.js（+组件双扫更稳） |
| client-operations-view.test.mjs:179 | 负向 `dsvm-opsession` | ② | 负向扫描改 operations-card.jsx |
| client-operations-view.test.mjs:180 | 负向 `op.session.tip` | ① | 负向扫描改 i18n.js |
| client-operations-view.test.mjs:246-247 | `dsvm-opchan`+`channelLabelKey(` | ② | 改读 operations-card.jsx |
| client-operations-view.test.mjs:248-250 | ZH 渠道键 3 锚（host-tool/cli/external 逐字） | ① | 改读 i18n.js |
| client-operations-view.test.mjs:251-255 | op.kind 5 键（self-upgrade/desktop-*） | ① | 改读 i18n.js |
| client-operations-view.test.mjs:258 | `canRemoveRow(r)` | ② | 改读 operations-card.jsx |
| client-operations-view.test.mjs:259 | 负向内联可移除判定退役 | ② | 负向扫描改 operations-card.jsx（+main.jsx 双扫） |
| client-operations-view.test.mjs:262 | `api("external-operations-remove"`（:4160 MarketPanel 泵接线） | ③ | 【已裁决】泵接线 effect 留 MarketPanel 适配器（T6 缝位）→ 锚不变 |
| client-operations-view.test.mjs:263 | `removeExternal(`（:4162） | ③ | 同上 |
| client-operations-view.test.mjs:264 | `"op.remove.failed"` 键 | ① | 改读 i18n.js（用例在 MarketPanel 保留区仍匹配） |
| client-operations-view.test.mjs:265 | `onRemove(r)` | ② | 改读 operations-card.jsx |
| client-operations-view.test.mjs:270-271 | `api("external-operations")`/`api("external-operations-clear")`（:3832+） | ③ | 【已裁决】同 :262——锚不变 |
| client-operations-view.test.mjs:272-274 | `opsStore.setExternal(`/`clearExternal()`/`listMerged()` | ③ | 【已裁决】store 经 panel-ops accessor，调用点留 MarketPanel → 锚文本可能改 `getSharedOpsStore().setExternal(`，以 T6 实际接线为准 |
| client-operations-view.test.mjs:276 | `fetchExternalOps`（三处时机） | ③ | 【已裁决】留 MarketPanel → 锚不变 |
| client-operations-view.test.mjs:279 | `finishedAll`（:3215 OperationsCard） | ② | 改读 operations-card.jsx |
| client-operations-view.test.mjs:280 | `settings.ops.group.done.n` 键沿用 | ① | 改读 i18n.js |
| client-operations-view.test.mjs:281 | `/group\.done\.n.*finishedAll\.length/s` 计数实参（:3266） | ② | 改读 operations-card.jsx |
| client-about-version.test.mjs:13-14 | `dshm-links-ver` 版本 span+条件分隔点 regex | ② | 改读 settings-tab.jsx |
| client-about-version.test.mjs:16 | 负向 `Section(lookup("settings.about"), version` | ② | 负向扫描改 settings-tab.jsx |
| client-about-version.test.mjs:20 | `function SettingsTab({ …, version })` 签名（:2718） | ② | 改读 settings-tab.jsx |
| client-about-version.test.mjs:21 | `h(SettingsTab, { …version: pluginVersion })` 调用点（:4142 MarketPanel 保留区） | ③ | 保留，锚对象 main.jsx 不变 |

### 裁决补注（普查子代理标「待人工」4 条 + 落位归一）

- 4 条待人工全部由 Q11 已裁边界解决：head JSX（VerChip 调用点 :4114、标题双 span :4089、拖拽门卫 :4076）在 MarketPanel 保留区 → 桶③ 锚不变；RestartBanner:76-78 在 chrome.jsx 成员清单 → 桶② 改读 chrome.jsx。
- 普查表中 `lightbox.jsx` 字样一律读作 **chrome.jsx**（Shot/UseImgChainProbe/Lightbox/useImgChain 按 Q11 与「文件结构与职责」落位 chrome.jsx）；泵接线五行（operations-view:262-276）按 T6 缝位留 MarketPanel → 桶③（:272-274 锚文本随 accessor 接线微调）。
- useScrollableContain（:3191）落位：主要消费方 OperationsCard 与 RestartBanner 分属两文件，hook 本体建议随 hooks.js（T9 一并迁），消费点锚分指 operations-card.jsx / chrome.jsx——执行时以实际落位为准并同步本表。

### 计数（裁决后终值）

桶① 63 ｜ 桶② 111 ｜ 桶③ 21 ｜ 待人工 0 ｜ 合计 195 条 + 机制说明 1 条。