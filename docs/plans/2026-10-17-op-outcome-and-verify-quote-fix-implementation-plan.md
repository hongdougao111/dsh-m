# 变更结局描述客户端单源化（op-outcome.js）+ 补丁映射 YAML 引号宽容与重复键根治（D9）实施计划

## 目标

- 新纯模块 `src/client/op-outcome.js`（GLOSSARY「变更结局描述」）收敛 main.jsx 五类变更结局投影：守卫拦截全版文案 ×3（逐字相同）、升级成功文案 ×2（逐字相同）、builds 后缀 ×4、superseded 分支 ×5、纯失败兜底 ×5（仅 i18n key 不同，参数化）。工厂 `createOpOutcome(lookup)` 出成品文案（`createMarkdown(h)` 同款注入先例）。
- D9 双修（`src/core/profile-transaction.ts`）：①`verifyPatchMapping` workspace 支改 yaml 正经解析的**键成员判定**（解析失败 fail-closed 报「复读失败」）；②`restorePatchMapping` 追加前解析去重——同键**任意引号形态**在场即跳过（解析失败退化为今日逐字判重，保守不收紧）。
- 独立发版 **0.9.94**；🔴 **硬停点：Task 1–4 全绿后暂停，等主人安排的 subagent 评审通过后才执行 Task 5 发版**（2026-10-17 主人指示）。

## 架构快照

- **op-outcome.js**：ESM 具名导出 `createOpOutcome(lookup)`，返回 `{ guardBlockedText, buildsSuffix, upgradeOkText, mutationFailed }` 四函数；`import { upgradeNotify } from './operations.js'`（兄弟互导先例：market-snapshot→market-state、window-resize→window-drag）。main.jsx 顶部 `require` 后模块级实例化 `const oc = createOpOutcome(lookup)`（lookup 是纯函数，字典静态）。收敛锚：`grep -c 'join(" | ")' src/client/main.jsx` 由 **3 → 0**（三处守卫装配 :2029/:2073/:2602）。
- **D9 机理（2026-10-17 本机复核 + 评审 R2 校准）**：`verifyPatchMapping` 唯一调用点在 `profile-transaction.ts:1150`，且 restore（:1149）恒先于 verify；compensate 流程 strip（:1123 `stripPatchedEntries`，正则本就宽容单/双/无引号、谓词与 `mappingFor` 同源 `key===pkg || key.startsWith(pkg+'@')`）又恒先于 restore——故生产全流程对**同包键**的「pnpm 单引号书写 → restore 追加重复键」**不可达**（strip 先摘同包行）。破口形态（防御面——两种形态生产今日均未证实触发）：①**异包键** mapping 条目（`mappingFor` 今日只产 realKey 自身条目，异包属未来演化面/防御面）；②**strip 逃逸形态**——如 flow 风格单行映射（strip 的 block header 正则不认 → no-op）→ restore 追加第二个 `patchedDependencies:` header → 顶层重复键。两形态下 restore 逐字判重（`lines.includes('  "key": path')`）对一切非双引号在场形态失明，而今日 verify 的 `text.includes(JSON.stringify(key))` 只看见自己刚追加的双引号行 → **假 committed**。修法（verify yaml 键成员 fail-closed + restore 解析去重）是**纯收紧的防御**，对上述全部形态正确；单测直钉 restore/verify 两函数行为，夹具一律用异包键（被补偿坏包 `pkg-a` ≠ mapping 键包名，预置行方能在 strip 后幸存——评审 N1/N2）。
- **yaml@2.9.1 行为实证**（2026-10-17 本机 node 探针，已在位依赖）：单引号键正常解析；重复键 parse 抛 `Map keys must be unique`；坏 YAML 抛解析错误。

## 全局约束

- **文案逐字节红线**：五类投影产出与今日逐字节相同（含 `join(" | ")` 分隔、`filter(Boolean)`、compstatus 缺省 `—`/`""`、`v` 前缀、sha 7 位、`latest` 兜底、后缀顺序 installed→builds→bundlewarning / upgraded→builds→activation）。
- **D9 语义边界**：只查**键在场**（不做键值比对）；manifest 支（JSON 解析）不动；restore 去重只跳过追加、不改写已有行；heal note `PATCH_MAPPING_RESTORED` 文案不变；restore 解析失败（`workspacePatchedKeys` 返回 null）退化为今日逐字判重。**新行为（fail-closed，需钉例）**：workspace 文本 yaml 解析失败 → verify 报 `pnpm-workspace.yaml 复读失败：YAML 无法解析`。
- **main.jsx 组件名与 render-smoke 测试导出零迁移**；ToolCardRow 短版守卫文案（:4307，`·` 连接三段）**有意留守**，就地补一行注记（已知残余·有意短版，单点不收）。
- **发版**：0.9.93 → 0.9.94；版本三处一致（package.json / package-lock 根两字段 / CHANGELOG 双语顶条——顶条版本号为人工核对项，publish 门禁只机器核对前两处，know-how 031）；tag `v0.9.94` 单 tag 推送（`git push origin main v0.9.94`，勿 `--tags`）。
- **硬停点（主人 2026-10-17 指示）**：Task 4 最终验证全绿后**停下**，等主人 subagent 评审；未获通过不进 Task 5。
- **平台**：验证命令均为 bash（本机 Linux）；`npm run build && npm test`（pretest 自动 build）。

## 输入工件

- grill 九决议（2026-10-17 本对话）：Q1 收五类投影/短版留守；Q2 工厂注入 lookup 出成品文案；Q3 命名 op-outcome.js + GLOSSARY「变更结局描述」；Q4 模块只出 `{kind, text}`、副作用留守；Q5 verify yaml 正经解析 fail-closed；Q6 只查键在场；Q7 合发 0.9.94 双 bullet、无 ADR、计划入库 + 硬停点；Q8 矩阵测试 + 装配特征锚归零；Q9 restore 产地去重（同键任意引号形态跳过）。
- 重复度证据：`grep -n 'join(" | ")' src/client/main.jsx` = :2029/:2073/:2602 三处守卫装配**逐字相同**（2026-10-17 主审复核）；升级成功文案 :2050-2057 ≡ :2584-2594；builds 后缀 ×4（:1997-1999 / :2055 / :2589 / :3392）；superseded ×5（:2019/:2062/:2538/:2562 及各 catch 分支）；纯失败 key 五枚（failed.install / failed.upgrade / failed.uninstall / toggle.failed / notify.selfupgraded.failed）。
- 客户端模块配方（既定）：ESM 具名导出、零 DOM/React、文件头注释「Node tests 直接覆盖」、专属 `tests/client-*.test.mjs`。

## 语义等价红线

1. 五类投影文案逐字节不变（真实保障网：Task 1 矩阵测试对期望串逐字节断言 + Task 2 全量 client 测试与 render-smoke 零迁移 + 锚 `join(" | ")` 归零）。
2. `mutationFailed` 返回 `{kind:'ok'|'err', text}`；`setInstallNote` 的 `kind` 映射（ok→hint，其余→err）是调用点副作用语义，留守 main.jsx。
3. catch 链分支互斥（`e.opSuperseded` / `e.guard` / 其余），函数内判定顺序（superseded→guard→plain）与今日各站顺序语义等价；流程特有分支（MarketTab install 的 `e.issue` 兼容弹窗、chip 的 `e.unsupported` info 横幅）留守调用点并**先于** `mutationFailed` 判定。
4. D9：既有 mappingOnly 双引号常规路径（tests/profile-transaction.test.mjs ㉒）零迁移；`workspacePatchedKeys` 纯函数、不抛（解析失败返 null）。
5. 纯加法 + 接线替换：不改 operations.js、不动 i18n 字典键值、不改 InstallGuardError 线格式（0.9.93 toWire 成果不在本次触碰面）。

## 文件结构与职责

- **Create** `src/client/op-outcome.js` —— 变更结局描述模块：工厂 + 四函数；组合 `upgradeNotify`（activation 三态），不拥有 i18n 字典。
- **Create** `tests/client-op-outcome.test.mjs` —— 参数化矩阵：guardBlockedText（repairBasis 有无 × restartSafe 两态 × compstatus 缺省）、buildsSuffix（approvals 有无 × fallback）、upgradeOkText（version/sha/latest × activation 三态）、mutationFailed（superseded/guard/plain × verb 五枚 + 异常对象花样）。
- **Modify** `src/client/main.jsx` —— 顶部 require + 模块级 `oc`；**六处接线站点**（MarketTab doInstall/doUpgrade、InstalledTab doToggle/doUninstall/doUpgrade、chip doUpgrade——五类投影收敛为六站点）；`installResultText` 与 chip 成功文案的 builds 段换 `oc.buildsSuffix`；:30 解构中的 `upgradeNotify` 随两处调用点入模块后同步删除；ToolCardRow 短版补注记。
- **Modify** `src/core/profile-transaction.ts` —— 新私有帮手 `workspacePatchedKeys(text): Set<string> | null`（yaml parse，容错返回）；verify workspace 支改键成员判定；restore workspace 支去重；新增 `import { parse } from 'yaml'`。
- **Modify** `tests/profile-transaction.test.mjs` —— 新 describe「补丁映射 YAML 引号宽容与重复键根治（0.9.94 D9）」五钉例。
- **Modify** `GLOSSARY.md` —— 新词条「变更结局描述（Mutation Outcome Copy）」，插入「操作记录（Operation Record）」词条之后。
- **Modify（Task 5，硬停后）** `CHANGELOG.md` / `package.json` / `package-lock.json` —— 0.9.94 发版三处。

## 任务清单

### Task 0: 计划入库（评审 R1/R2 修正后）

- 目标：承载 grill Q7「计划入库」决议（历届实施计划均已入库，0.9.93 CHANGELOG 亦以入库路径引用）；同时保证 Task 4「工作树干净」判据可达。
- [ ] Step 1: checkpoint commit
  - Run: `git add docs/plans/2026-10-17-op-outcome-and-verify-quote-fix-implementation-plan.md && git commit -m "docs(plan): 变更结局描述单源化 + 补丁映射 YAML 引号宽容实施计划入库（grill 九决议 + 评审 R1/R2 十二项收敛）"`
  - Expected: `git status -sb` 无 untracked 计划文件。

### Task 1: op-outcome.js 模块 + 矩阵测试（TDD）+ GLOSSARY 词条

- 目标：模块先立（此刻 main.jsx 未接线，纯加法）；文案装配的期望串在测试里逐字节钉死。
- 涉及文件：`tests/client-op-outcome.test.mjs`（先写）、`src/client/op-outcome.js`、`GLOSSARY.md`。
- 接口契约：
  - Consumes: `upgradeNotify(activation)`（`src/client/operations.js` :82-86，返回 `{ needsRestart, suffixKey }`）。
  - Produces（后续任务依赖的完整定义）：
    - `export function createOpOutcome(lookup)`，`lookup: (key: string, params?: Record<string,string>) => string`。
    - 返回 `{ guardBlockedText(guard), buildsSuffix(res), upgradeOkText(res), mutationFailed(e, opts) }`：
      - `guardBlockedText(guard)` → string：五段装配 `[lookup("guard.blocked"), `${lookup("guard.compstatus")}: ${guard.compensation?.status || "—"}（${guard.compensation?.note || ""}）`, guard.repairBasis ? `${lookup("guard.repairbasis")}: ${guard.repairBasis}` : null, lookup("guard.noforce"), guard.restartSafe ? lookup("guard.restartsafenow") : lookup("guard.restartunsafe")].filter(Boolean).join(" | ")`。
      - `buildsSuffix(res)` → string：`res.buildApprovals && res.buildApprovals.length ? lookup("notify.builds", { names: res.buildApprovals.join(", ") }) : res.fallbackAllBuilds ? lookup("notify.builds.fallback") : ""`。
      - `upgradeOkText(res)` → `{ needsRestart: boolean, text: string }`：`const note = upgradeNotify(res.activation)`；text = `lookup("notify.upgraded", { pkg: res.pkg, from: res.fromVersion ? `v${res.fromVersion}` : "—", to: res.version ? `v${res.version}` : res.sha ? res.sha.slice(0, 7) : "latest" }) + buildsSuffix(res) + (note.suffixKey ? lookup(note.suffixKey) : "")`。
      - `mutationFailed(e, { verb, target })` → `{ kind: "ok" | "err", text: string }`：`e && e.opSuperseded` → `{kind:"ok", text: lookup("op.superseded.note", { target })}`；`e && e.guard` → `{kind:"err", text: guardBlockedText(e.guard)}`；其余 → `{kind:"err", text: lookup(PLAIN_FAIL_KEY[verb], { err: (e && e.message) || e })}`。`PLAIN_FAIL_KEY = { install: "failed.install", upgrade: "failed.upgrade", uninstall: "failed.uninstall", toggle: "toggle.failed", self: "notify.selfupgraded.failed" }`。
- 验证范围：新测试文件全绿；`npm run build` 通过（esbuild 打包 client 含新模块）。

- [ ] Step 1: 写失败测试。`tests/client-op-outcome.test.mjs`：文件头注释「变更结局描述（0.9.94）：工厂注入 lookup 出成品文案——五类投影矩阵。运行：npm test 自动发现」。假 lookup：`const lk = (k, p) => (p ? `${k}{${Object.entries(p).map(([a,b]) => a + '=' + b).join(',')}}` : k)`。断言全部对**合成期望串逐字节**（用同款假 lookup 手工拼出）。矩阵至少：
  ① guardBlockedText：repairBasis 有/无 × restartSafe true/false（4 例）+ compensation 全缺省（status→`—`、note→``）（1 例）+ repairBasis 空串（falsy → 段缺席）（1 例）；
  ② buildsSuffix：approvals `["a","b"]`（join `", "`）/ 空数组 / undefined × fallbackAllBuilds true/false（4 例，空数组+fallback 取 fallback、空数组+无 fallback → `""`）；
  ③ upgradeOkText：to 三态（version `1.2.3`→`v1.2.3` / sha `abcdef1234567890`→前 7 位 / 两者皆无→`latest`）× activation（`'client-only'`→suffix `notify.upgraded.clientonly`+needsRestart false / `'unknown'`→`notify.upgraded.activationUnknown`+true / undefined→无后缀+true）（9 例）+ from 缺省→`—`（1 例）；
  ④ mutationFailed：superseded（kind ok + target 插值）/ guard（kind err + guardBlockedText 同串）/ plain Error（message 插值）/ plain 字符串异常（`String(e)` 即原文）/ plain null-ish e（`(e && e.message) || e` 兜底）/ verb 五枚各自落正确 key（≥8 例）。
- [ ] Step 2: 确认失败
  - Run: `npm run build && node --test tests/client-op-outcome.test.mjs`
  - Expected: 全红（模块不存在，import 报错）。
- [ ] Step 3: 写实现 `src/client/op-outcome.js`：文件头注释「变更结局描述（GLOSSARY）：一次变更操作终态的统一文案装配——工厂注入 i18n lookup 出成品文案（createMarkdown(h) 同款注入先例）；文案键在 main.jsx 字典，装配在此单源；流程特有分支（兼容弹窗/能力表拒绝/乐观提示）不入内。Node tests 直接覆盖（0.9.94）。」+ 接口契约逐字实现。
- [ ] Step 4: 确认通过
  - Run: `npm run build && node --test tests/client-op-outcome.test.mjs`
  - Expected: 全绿。
- [ ] Step 5: GLOSSARY 词条。`GLOSSARY.md` 在「操作记录（Operation Record）」词条之后插入：
  ```
  **变更结局描述（Mutation Outcome Copy）**:
  一次变更操作（安装/升级/卸载/开关/自升级）终态（成功/守卫拦截/已跳过/失败）的统一文案装配：注入 i18n lookup 出成品文案，文案键在 i18n 字典、装配单一模块；流程特有分支（兼容确认弹窗、能力表拒绝横幅、乐观提示）不入内，由调用点自理。
  _Avoid_: 错误处理（只覆盖错误侧）、notify 工具（notify 是通道不是内容）、文案表（键在字典，模块只管装配）
  ```
- [ ] Step 6: checkpoint commit
  - Run: `git add src/client/op-outcome.js tests/client-op-outcome.test.mjs GLOSSARY.md && git commit -m "feat(client): 变更结局描述模块 op-outcome——工厂注入 lookup 出成品文案，五类投影矩阵钉例（六处接线前置）+ GLOSSARY 入册"`

### Task 2: main.jsx 六处接线站点 + 锚收敛

- 目标：六处接线站点（五类投影）改一行接线；流程特有分支留守；锚归零；render-smoke 与全部 client 测试零迁移全绿。
- 涉及文件：`src/client/main.jsx`。
- 接口契约：
  - Consumes: `createOpOutcome`（Task 1）。
  - Produces: 无下游依赖。
- 验证范围：`tests/client-*.test.mjs` 全量（含 render-smoke）+ `npm run build` + 锚归零。

- [ ] Step 1: 顶部 sibling require 区（:14-33 块尾）加 `const { createOpOutcome } = require("./op-outcome.js");`；`lookup` 定义（:288-291）之后模块级 `const oc = createOpOutcome(lookup);`。
- [ ] Step 2: MarketTab doInstall catch（:2018-2041）：`e.issue` 分支（兼容弹窗）留守首位；其余三分支（superseded/guard/plain）合并为 `const m = oc.mutationFailed(e, { verb: "install", target: it.name }); notify({ kind: m.kind, text: m.text }); setInstallNote({ id: it.id, kind: m.kind === "ok" ? "hint" : "err", text: m.text });`。`installResultText`（:1996-1999）builds 段换 `oc.buildsSuffix(res)`（notify.installed 与 bundleWarning 两段留守原样）。
- [ ] Step 3: MarketTab doUpgrade（:2045-2082）：成功臂 `const ok = oc.upgradeOkText(res); notify({ kind: "ok", needsRestart: ok.needsRestart, text: ok.text }); setInstallNote({ id: it.id, kind: "ok", text: ok.text });`（`upgradeNotify` 调用点随文案移入模块；`opUpgradeMeta` 装配留守）；catch 臂三分支合并 `const m = oc.mutationFailed(e, { verb: "upgrade", target: it.installedPkg }); notify({ kind: m.kind, text: m.text }); setInstallNote({ id: it.id, kind: m.kind === "ok" ? "hint" : "err", text: m.text });`。Step 4 完成后 main.jsx `upgradeNotify` 已无调用点，:30 解构项同步删除。
- [ ] Step 4: InstalledTab 三处：doToggle catch（:2545-2550）→ superseded/plain 两分支即 `const m = oc.mutationFailed(e, { verb: "toggle", target: it.pkg }); notify({ kind: m.kind, text: m.text });`（toggle 无 guard 路径，guard 分支自然不触发）；doUninstall catch（:2561-2567）同款 verb `"uninstall"`；doUpgrade（:2572-2610）成功臂换 `oc.upgradeOkText`（无 setInstallNote）、catch 臂（guard→superseded→plain 顺序今日与 MarketTab 相反，互斥分支合一后语义等价）换 `oc.mutationFailed(e, { verb: "upgrade", target: it.pkg })` + notify。
- [ ] Step 5: chip doUpgrade（:3371-3407）：成功臂 builds 段换 `oc.buildsSuffix(res)`（`notify.selfupgraded` 主句与 needsRestart:true 留守——自升级恒需重启，不经 upgradeOkText）；catch 臂 `e.unsupported` 分支留守首位，else 分支换 `const m = oc.mutationFailed(e, { verb: "self", target: "dsh-m" }); notify({ kind: m.kind, text: m.text });`（评审 B4：与六处其余站点一致取 `m.kind`；今日 self-upgrade 无守卫/superseded 路径，`m.kind` 恒 `"err"`，零行为迁移；未来自升级接装后守卫时文案不错色）。ToolCardRow 短版（:4305-4309）就地补注释一行：`// 已知残余（0.9.94 grill Q1）：工具卡片短版守卫文案有意留守——单点、形状与全版不同（无 repairBasis/restartSafe 段），不为它扩接口。`
- [ ] Step 6: 验证
  - Run: `npm run build && node --test tests/client-*.test.mjs && grep -c 'join(" | ")' src/client/main.jsx || true`
  - Expected: 全部 client 测试全绿（render-smoke 零迁移）；末行 grep 计数输出 `0`（计数 0 时 grep 退出码为 1 属预期，`|| true` 防 `&&` 链断裂）。
- [ ] Step 7: checkpoint commit
  - Run: `git add src/client/main.jsx && git commit -m "refactor(client): 六站点变更结局接线 op-outcome——守卫装配/升级成功文案/builds 后缀/superseded/纯失败五类投影收敛，锚 join(\" | \") 3→0；流程特有分支与 ToolCardRow 短版留守注记"`

### Task 3: D9 双修（TDD）

- 目标：verify workspace 支 yaml 键成员判定 + restore 去重；五钉例红→绿；既有事务测试零迁移。
- 涉及文件：`tests/profile-transaction.test.mjs`（先写）、`src/core/profile-transaction.ts`。
- 接口契约：
  - Consumes: `yaml` 包 `parse`（package.json 已在位依赖 2.9.1）。
  - Produces（模块私有，不导出）：`function workspacePatchedKeys(text: string): Set<string> | null`——`try { parse(text) } catch { return null }`；doc 非对象或无 `patchedDependencies` 或其非对象 → `new Set()`；否则 `new Set(Object.keys(patchedDependencies))`。显式钉死：`patchedDependencies` 空值/缺省（parse 得 null/undefined）与数组形态**一律按空集处理**（本机实证 `parse('') === null`；防 `typeof null === 'object'` 朴素实现令 `Object.keys(null)` 抛错走 INTERNAL_ERROR 而非 fail-closed 文案——评审 N5）。
- 实现要点：
  - verify workspace 支（:1044-1050）：readFile 的 try/catch 保留（读失败照旧报 `pnpm-workspace.yaml 复读失败：${errText(err)}`）；取 `const keys = workspacePatchedKeys(text)`，`keys === null` → return `pnpm-workspace.yaml 复读失败：YAML 无法解析`；否则逐 entry `!keys.has(entry.key)` → return `workspace 补丁映射复读缺失：${entry.key}`（消息与今日逐字同款）。
  - restore workspace 支（:1008-1018）：`const existingKeys = workspacePatchedKeys(text)`（退化分支仅在 parse **抛错**时进入——坏 YAML/重复键；空文本 `parse('')` 返回 null 走「doc 非对象 → 空集」分支，追加行为与逐字判重等价，评审 B2 订正）；逐 entry：`const present = existingKeys !== null ? existingKeys.has(entry.key) : lines.includes(line)`；`if (!present) lines.push(line)`。header 追加逻辑（`patchedDependencies:` 行存在性检查）不动；heal note 不动。
- 验证范围：`tests/profile-transaction.test.mjs` 全绿（含既有 ㉒ 零迁移）+ `npm run typecheck`。

- [ ] Step 1: 写失败测试。新 describe「补丁映射 YAML 引号宽容与重复键根治（0.9.94 D9）」，复用既有工装（`mkdtempSync` 临时 profile + `compFakeRunner(dir)` + `runProfileTransaction`，同 ㉒ :1812-1852 样式）。**夹具前提（评审 N1，五例通用）**：被补偿坏包一律 `pkg-a`（manifest/lock fixture 同 ㉒ 形态），mapping 键一律用**异包名** `scoped@1.0.0`（或 T2 的 `other@1.0.0`）——strip（:1123，引号宽容、谓词与 mappingFor 同源）会先摘除与坏包同名的补丁行，预置行必须异包才能在 strip 后幸存、红绿判读才成立。五钉例（fixture 中 workspace 原文逐字给出）：
  - **T1 单引号去重**：ws 预置 `patchedDependencies:\n  'scoped@1.0.0': patches/a.patch\n`（单引号，pnpm 对 scoped 键的书写形态），mappingOnly prior workspace `[{key:'scoped@1.0.0', patchPath:'patches/a.patch'}]`；断言：res.ok true、ws 终态 `'scoped@1.0.0'` 行**恰一次**且不含 `"scoped@1.0.0"` 双引号行（今日红：追加后两行并存）。
  - **T2 无引号去重**：ws 预置 `patchedDependencies:\n  other@1.0.0: patches/other.patch\n`（无引号，pnpm 对非 scoped 键的书写形态），mapping 键 `other@1.0.0`，同款断言（今日红）。
  - **T3 模拟 pnpm 解析炸（端到端危害钉例）**：坏包 pkg-a 的 dependency prior（prior.state.patchMapping 含异包键 `scoped@1.0.0`），ws 预置单引号形态；`addBehavior` 先用 yaml 解析读 ws、遇重复键抛错（复刻真实 pnpm 行为；测试文件顶部 `import { parse } from 'yaml'`——ESM 文件，评审 B3 订正，无 require）再成功。断言：res.ok true（今日红：restore 先造重复键 → addBehavior 解析抛 → ADD_FAILED 回滚）。
  - **T4 坏 YAML 假 committed → fail-closed**：mappingOnly，ws 预置坏 YAML 且文本含 `"scoped@1.0.0"` 双引号子串（如 `patchedDependencies: [unclosed "scoped@1.0.0"`）；断言：res 终态 manual-repair 且 failure.note 含 `pnpm-workspace.yaml 复读失败`（今日红：子串命中 → 假 committed）。
  - **T5 坏 YAML 无子串 + restore 退化**：mappingOnly，ws 坏 YAML 不含目标键；断言：restore 不抛（退化逐字追加被调用，终态同为 `复读失败` fail-closed 而非 INTERNAL_ERROR）（今日红：追加后子串命中 → committed）。
- [ ] Step 2: 确认失败
  - Run: `npm run build && node --test tests/profile-transaction.test.mjs`
  - Expected: 新 describe 五例全红（T3 红 in ADD_FAILED、T4/T5 红 in 假 committed）。
- [ ] Step 3: 写实现（按上方接口契约与实现要点）：`import { parse } from 'yaml'` 入 import 区；`workspacePatchedKeys` 置于 `restorePatchMapping` 之前；verify/restore 两支改造。
- [ ] Step 4: 确认通过
  - Run: `npm run build && node --test tests/profile-transaction.test.mjs && npm run typecheck`
  - Expected: 全绿（既有套件零迁移——以实际计数为准，评审 N3 订正）+ 零类型错误。
- [ ] Step 5: checkpoint commit
  - Run: `git add src/core/profile-transaction.ts tests/profile-transaction.test.mjs && git commit -m "fix(core): 补丁映射复读 YAML 引号宽容与重复键根治——verify workspace 改 yaml 键成员判定（fail-closed）+ restore 追加前解析去重（任意引号形态；解析失败退化逐字判重），单引号/无引号/模拟 pnpm 解析炸/坏 YAML 五钉例"`

### Task 4: 最终验证（实施面收口）

- [ ] Step 1: 全量验证
  - Run: `npm run build && npm test && npm run typecheck`
  - Expected: 全量测试全绿（0.9.93 基线 1530 + 新增约 28 矩阵 + 5 钉例；**判据是全绿，以实际计数为准**，评审 B5/N3 订正）、typecheck 零错误。
- [ ] Step 2: 锚与版本复核
  - Run: `grep -c 'join(" | ")' src/client/main.jsx || true; grep '"version"' package.json | head -1; git status -sb`
  - Expected: 计数 `0`；版本仍 `0.9.93`（发版在 Task 5）；工作树干净（各 checkpoint 已提交）。

### 🔴 硬停点（主人 2026-10-17 指示）

Task 4 全绿后**立即停下**，向主人报告实施摘要（commit 列表 + 测试计数 + 锚读数），等主人 subagent 评审；**评审通过前不执行 Task 5 任何步骤**。

### Task 5（评审通过后）: 发版 0.9.94

- [ ] Step 1: CHANGELOG 双语两条目（中文区块与 English 区块各一条，同版本号对齐，置顶）。中文草稿如下，English 区块为**忠实对译**（术语与数字不增不减）：
  > ### 0.9.94 重构+修复：变更结局描述客户端单源化（op-outcome）+ 补丁映射 YAML 引号宽容与重复键根治
  > - **需求（2026-10-17 架构巡查 + grill 九决议）**：变更结局的呈现无 owning module——守卫拦截文案装配 main.jsx 三处逐字重复（0.9.93 toWire 收敛了线格式、client 侧呈现是已知残尾，`repairBasis` 后加时的多点位手补复发已实证）、升级成功文案两处逐字、builds 后缀四处拼装、superseded 五处；另：事务补偿对 workspace `patchedDependencies` **非双引号在场形态**（pnpm 的单引号/无引号书写）逐字判重失明——逐字判重可自造重复键文件、复读检查可假 committed（同包链经 strip 先摘在生产不可达，本项属防御面收敛与 fail-closed 补洞）。
  > - **方案**：新纯模块 `src/client/op-outcome.js`（GLOSSARY「变更结局描述」入册）——工厂 `createOpOutcome(lookup)` 出成品文案（`createMarkdown(h)` 同款注入先例），`guardBlockedText`/`buildsSuffix`/`upgradeOkText`/`mutationFailed` 四函数；六处接线站点（五类投影）一行接线，流程特有分支（兼容弹窗/能力表拒绝/乐观提示）与 ToolCardRow 短版留守注记。D9：`verifyPatchMapping` workspace 支改 yaml 键成员判定（解析失败 fail-closed 报「复读失败」）；`restorePatchMapping` 追加前解析去重（同键任意引号形态在场即跳过，解析失败退化逐字判重）。
  > - **验证**：全量 N 测试全绿（新增 client-op-outcome 参数化矩阵 + 事务补丁映射五钉例：单引号去重/无引号去重/模拟 pnpm 解析炸端到端/坏 YAML 假 committed→fail-closed/restore 退化不抛）、typecheck 零错误；收敛锚 main.jsx `join(" | ")` 3→0；实施经主人 subagent 评审（硬停点）后发版。
- [ ] Step 2: 版本三处。package.json `"version"` 手改 `0.9.94`；package-lock.json 先 `grep -n '"version": "0.9.93"' package-lock.json` 核对**恰 2 处**（lockfile v3 根双字段；多于 2 处则只手改两根字段，不全局替换），恰 2 处时 `sed -i 's/"version": "0.9.93"/"version": "0.9.94"/g' package-lock.json`；核对 `grep '"version"' package.json package-lock.json | head -3` 三行同版本（know-how 031 检查单）。
- [ ] Step 3: checkpoint commit + tag
  - Run: `git add CHANGELOG.md package.json package-lock.json && git commit -m "chore(release): 0.9.94 变更结局描述单源化 + 补丁映射 YAML 引号宽容与重复键根治" && git push origin main v0.9.94`
  - Expected: publish workflow（OIDC）触发；staged 延迟窗口参照 know-how 018（无 scope 包历史 2–12 分钟，绿≠已上架，三键轮询确认）。

## 最终验证

- `npm run build && npm test && npm run typecheck` 全绿；
- `grep -c 'join(" | ")' src/client/main.jsx` = 0；`grep -c 'mutationFailed' src/client/main.jsx` ≥ 6（六处接线站点佐证，评审 A1 订正）；
- 既有 mappingOnly ㉒ / render-smoke / client 全套零迁移；
- 版本三处一致（Task 5 后）。

## 执行纪律

- 开始实现前，先批判性复查整份计划；发现缺项、矛盾、命名不一致或验证命令无效，先修计划。
- 按任务顺序执行，不无声跳步、合并步或改变任务目标；每完成一个任务运行该任务定义的验证。
- 遇阻塞、重复失败或计划与仓库现实不符（行号漂移以「路径 + 符号锚点」就近定位），立即停下说明，不猜。
- 当前在 `main` 分支：本仓库日常直推 main（历届 chore(release)/feat 直推在案），照旧执行。
- Task 4 后硬停点为**主人明确指示的强制门**，不因任何「顺手」理由越过。
- 全部任务完成后运行最终验证并输出修改摘要。
