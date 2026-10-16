# InstallGuardError 线格式投影收敛（toWire）实施计划

## 目标

- 把 `InstallGuardError` → 线格式（wire format）的 5 处逐字手写投影收敛为产地方法 `toWire()`：host-api（InstallGuardError 分支 :238-253，HTTP 409 payload）、tools（:304 install / :468 upgrade，agent 结构化 error result）、cli（:383 install / :408 upgrade，`[⛔ 装后守卫拦截] ` JSON 行）。
- 消灭「加一个守卫字段要碰 8 处」的复发模式（`repairBasis` 后加时 5 投影 + client 读取各自手补，已实证一次）；收敛后加字段 = 类 + toWire 一处 + client 读取一处（浏览器边界物理约束，见红线 #3）。
- 独立发版 **0.9.93**；**发版 push 前硬停**，等主人安排的外部代码审核（2026-10-17 主人指示）。

## 架构快照

- `InstallGuardError`（`src/core/market.ts` :1142-1162）新增方法 `toWire(): InstallGuardWire`，返回裸 6 字段共享线格式；5 处投影改为一行展开——host-api `{ ok:false, error: e.message, ...e.toWire() }`、tools `{ ok:false, guard:true, message: e.message, ...e.toWire() }`、cli `JSON.stringify(e.toWire())`。
- 数据 + 行为同址（类自己知道自己的线格式），各端信封差异（ok/error vs ok/guard/message vs 裸 JSON）留在各端——信封键名是消费方契约（GUI 读 `error`、agent 读 `message`），不入 toWire。
- 删除测试：删掉 toWire → 6 字段形状散回 5 处——复杂度集中，过。这不是新 seam（无第二 adapter），是投影的单一事实源化。

## 全局约束

- **线格式语义红线**：6 字段值与键缺席语义逐字节不变——`repairBasis` undefined 时键**不存在**（5 处现场条件展开 `...(x.repairBasis ? { repairBasis: x.repairBasis } : {})`（x = err/e）整体移入 toWire 本体），各处现有写法语义同款。
- **命名**：`InstallGuardWire` 接口 + `toWire()` 方法，从 `src/core/market.ts` 随类导出；`GuardViolation` 类型经 market.ts re-export（现仅 import，:64）。
- **发版**：0.9.92 → 0.9.93；版本三处一致（package.json / package-lock 根两字段 / CHANGELOG 双语顶条——顶条版本号为人工核对项，publish 门禁只机器核对前两处）；tag `v0.9.93` 单 tag 推送（`git push origin main v0.9.93`，勿 `--tags`）。
- **硬停点（主人 2026-10-17 指示）**：Task 3 Step 4（tag push）之前必须停下，等主人安排的外部代码审核通过后才执行发版；本计划其余任务不受此停点约束。
- client 侧（`src/client/main.jsx` :792-793）**不动**：浏览器 bundle 不能 import core 模块，防御性拼装留守（已知残余点，如实注记）。
- **平台**：验证命令均为 bash（本机 Linux），`npm run build && npm test`（pretest 自动 build）。

## 输入工件

- grill 共识（2026-10-17 本对话：Q1-Q4/Q6 按推荐、Q5 主人改为独立发 0.9.93 + 发版前外部审核硬停）。
- 重复度证据：5 处投影逐字相同（`grep -n "restartSafe" src/core/host-api.ts src/tools.ts src/cli.ts`：host-api :249、tools :304/:468、cli :383/:408，全部含同款条件展开 `...(x.repairBasis ? { repairBasis: x.repairBasis } : {})`，x = err/e）。覆盖度如实口径：**直接测试钉住仅 tools 两臂**（tools-install :35-48 install 臂 / :74-86 upgrade 臂，含 :57 repairBasis 在场钉例）；host-api 投影与 cli 守卫行**无直接测试**（rollback-heal 钉事务终态字符串、不钉投影形状）——本计划 Task 2 补一条 host-api dispatcher 级守卫 409 钉例补此缺口。
- 测试键序敏感度事实：tests/ 对守卫输出均为解析后对象断言或前缀正则（tools-upgrade-message :35 `/⛔ 升级被装后守卫拦截/`），**无原始 JSON 键序钉**——tools 信封键序微移（见红线 #2）安全。

## 语义等价红线

1. 6 字段值与键缺席语义逐字节不变。真实保障网（如实口径）：① tools 两臂 execute 钉例零迁移（tools-install / tools-upgrade-message）② Task 1 的 toWire 形状/键序/键缺席单钉例 ③ Task 2 新增 host-api dispatcher 级守卫 409 钉例 ④ 最终验证的 grep 收敛锚——四层共同构成验收门。
2. **tools 信封键序微移（自觉差异注记）**：今日 tools 投影键序 `ok, guard, kind, message, violations, …`，改后 `{ ok, guard, message, …toWire() }` 展开为 `ok, guard, message, kind, violations, …`——kind 与 message 交换。JSON 对象键序对消费方无语义（agent 读取解析后对象），5 套件无键序钉（事实见输入工件）；host-api 与 cli 键序不变（host-api `error` 前置 + 展开序同今；cli 本就 kind 前置裸对象，toWire 序同）。
3. client 拼装留守：加字段的编辑点从 8 → 2（类+toWire 一处、client 读取一处）；这是浏览器/宿主边界的物理约束，不是设计缺陷，不改 client。
4. 类字段、构造签名、`name`/`message` 行为零变化；仅新增方法与类型导出（纯加法 + 接线替换）。

## 文件结构与职责

- Modify: `src/core/market.ts` —— `InstallGuardError` 增 `toWire()`；`export interface InstallGuardWire`；`export type { GuardViolation }`（re-export）
- Modify: `src/core/host-api.ts`（InstallGuardError 分支 :238-253）—— 投影段改 `{ ok:false, error: err.message, ...err.toWire() }`
- Modify: `src/tools.ts`（:304、:468）—— 两处投影改 `{ ok:false, guard:true, message: err.message, ...err.toWire() }`
- Modify: `src/cli.ts`（:383、:408）—— 两处改 `'[⛔ 装后守卫拦截] ' + JSON.stringify(e.toWire())`
- Modify: `tests/install-guard.test.mjs` —— 补 toWire 单元钉例（TDD 失败先行）
- Modify（Task 3）: `CHANGELOG.md` / `package.json` / `package-lock.json` —— 0.9.93 发版三处

## 任务清单

### Task 1: toWire 方法 + InstallGuardWire 类型 + 单元钉例（TDD）

- 目标：产地先立方法与类型（此刻 5 处未接线，纯加法）。
- 涉及文件：`src/core/market.ts`、`tests/install-guard.test.mjs`。
- 接口契约：
  - Consumes: `InstallGuardError` 类（`src/core/market.ts` :1142-1162）、`GuardViolation`（`src/core/install-guard.js`）。
  - Produces（后续任务依赖的完整定义）：
    - `export interface InstallGuardWire { kind: 'compensated' | 'manual_required'; violations: GuardViolation[]; compensation: { status: string; note: string }; needsRestart: boolean; restartSafe: boolean; repairBasis?: string }`
    - `toWire(): InstallGuardWire` —— 实现：`return { kind: this.kind, violations: this.violations, compensation: this.compensation, needsRestart: this.needsRestart, restartSafe: this.restartSafe, ...(this.repairBasis ? { repairBasis: this.repairBasis } : {}) }`
    - `export type { GuardViolation }`（market.ts re-export，紧邻类导出）
- 验证范围：钉例红→绿；typecheck 零错误。

- [ ] Step 1: 写失败测试（`tests/install-guard.test.mjs` 追加 describe「InstallGuardError.toWire 线格式（0.9.93 收敛）」，import `InstallGuardError` 自 `../lib/core/market.js`）：① 无 repairBasis 构造（`{kind:'manual_required', message:'m', violations:[], needsRestart:true, restartSafe:false, compensation:{status:'manual-repair', note:'n'}}`）→ `toWire()` deepEqual `{kind:'manual_required', violations:[], compensation:{status:'manual-repair', note:'n'}, needsRestart:true, restartSafe:false}` 且 `'repairBasis' in wire === false`（键缺席钉例）；② 带 repairBasis 构造 → toWire 含 `repairBasis: '旧 spec'` 键在场；③ `Object.keys(toWire())` 键序 `['kind','violations','compensation','needsRestart','restartSafe']`（+repairBasis 尾随，与今日 5 处投影序一致）。
- [ ] Step 2: 确认失败
  - Run: `npm run build && node --test tests/install-guard.test.mjs`
  - Expected: 新 describe 全红（toWire 不是函数）。
- [ ] Step 3: 写最小实现（`src/core/market.ts`：接口 + re-export + 方法，按上方契约逐字）。
- [ ] Step 4: 确认通过
  - Run: `npm run build && node --test tests/install-guard.test.mjs && npm run typecheck`
  - Expected: 全绿 + 零错误。
- [ ] Step 5: checkpoint commit
  - Run: `git add src/core/market.ts tests/install-guard.test.mjs && git commit -m "feat(core): InstallGuardError.toWire 线格式单一事实源——InstallGuardWire 类型 + GuardViolation re-export + 键缺席/键序钉例（五处投影收敛前置）"`

### Task 2: 五处投影接线

- 目标：5 处手写投影替换为一行展开；钉住套件零迁移全绿。
- 涉及文件：`src/core/host-api.ts`（:239-256）、`src/tools.ts`（:304、:468）、`src/cli.ts`（:383、:408）。
- 接口契约：
  - Consumes: `toWire()`（Task 1）。
  - Produces: 无下游依赖。
- 验证范围：5 套件 + 全量门禁。

- [ ] Step 1: host-api InstallGuardError 分支（:238-253，注意 :254-256 起是 IncompatibleError 分支、不在改动面）投影段替换——payload 改 `{ ok: false, error: err.message, ...err.toWire() }`；就地注释保留「GUI 一键重启只读 restartSafe」决策句并补一句「0.9.93 起线格式单源于 toWire」。
- [ ] Step 2: tools 两处（:304、:468）替换为 `{ ok: false, guard: true, message: err.message, ...err.toWire() }`（两处逐字同款，保留各自上下文注释）。
- [ ] Step 3: cli 两处（:383、:408）替换为 `'[⛔ 装后守卫拦截] ' + JSON.stringify(e.toWire())`。
- [ ] Step 4: 补 host-api dispatcher 级守卫 409 钉例（现状补钉，0.9.92 CLI source 钉例同款先例——接线前后均绿、防回退）：`tests/host-api.test.mjs` 追加——经 Overrides 注入 `installFromRegistry` 抛构造的 `InstallGuardError`（无 repairBasis），POST `install` → 断言 HTTP 409 + payload `{ ok:false, error, kind:'manual_required', violations, compensation, needsRestart:true, restartSafe:false }` 且 `'repairBasis' in payload === false`（键缺席钉）。
- [ ] Step 5: 验证
  - Run: `npm run build && node --test tests/tools-install.test.mjs tests/tools-upgrade-message.test.mjs tests/install-guard.test.mjs tests/rollback-heal.test.mjs tests/market.test.mjs tests/host-api.test.mjs && npm run typecheck`
  - Expected: 全绿零迁移（含 tools-install :57 repairBasis 在场钉例与新增 host-api 409 钉例）+ typecheck 零错误。
- [ ] Step 6: 接线 commit
  - Run: `git add src/core/host-api.ts src/tools.ts src/cli.ts tests/host-api.test.mjs && git commit -m "refactor(api,tools,cli): 五处装后守卫投影收敛至 InstallGuardError.toWire + host-api dispatcher 409 钉例——加守卫字段编辑点 8→2；tools 信封键序微移注记（JSON 键序无消费方语义，套件无键序钉）"`

### Task 3: 发版 0.9.93（含硬停点）

- 目标：全量门禁 → **硬停等主人外部审核** → 审核通过后发版。
- 涉及文件：`CHANGELOG.md`、`package.json`、`package-lock.json`。
- 接口契约：
  - Consumes: Task 1/2 全部改动；publish 门禁（typecheck + tests + 版本三处一致）。
  - Produces: npm 上的 0.9.93。
- 验证范围：全量门禁；审核记录；发版后装机冒烟。

- [ ] Step 1: 全量门禁
  - Run: `npm run build && npm test && npm run typecheck`
  - Expected: 全套件绿（基线 1526 + Task 1 新增钉例）、typecheck 零错误。
- [ ] Step 2: 接线 commit 后的 diff 就是送审对象——**🔴 硬停点：到此停下，向主人报告送审范围（commit 区间与 diffstat），等主人安排的外部代码审核结论**。审核意见回来后：计划内问题按「接受修复 / 证据反驳」处理并复跑门禁；通过后才进 Step 3。**审核未过不得进 Step 3。**
- [ ] Step 3: 发版三件套——CHANGELOG 双语顶条（问题/方案/验证三段式：五处投影收敛至 toWire、加字段编辑点 8→2、tools 键序微移注记、client 残余点如实注记）+ 版本三处 `0.9.92` → `0.9.93`（CHANGELOG 顶条版本号人工核对）
- [ ] Step 4: 发版 commit + 单 tag 推送
  - Run: `git add -A && git commit -m "chore(release): 0.9.93 装后守卫线格式收敛 toWire（纯重构，线格式语义零变化）" && git tag v0.9.93 && git push origin main v0.9.93`
  - Expected: publish workflow 触发（OIDC；know-how 018 staged 延迟）。
- [ ] Step 5: npm 上架确认 + 宿主通道升级装机冒烟（know-how 026 §①）：`dshm_upgrade dsh-m` → 装机 CLI 一次守卫触发路径（或以 install-guard 单测 + ping version=0.9.93 为准）+ 面板 ping `version: "0.9.93"`（重启生效，重启前问主人）。

## 执行纪律

- 开始实现前批判性复查本计划；发现缺项/矛盾/锚漂移（一律以符号锚为准重新定位）先修计划。
- 按任务顺序执行；每任务跑该任务验证，红了先停下归因。
- **Task 3 Step 2 硬停点是本计划的最高优先级约束**——无论门禁多绿，外部审核未过不得 push tag。
- 遇阻塞立即停下说明，不猜；全部完成后跑最终验证并输出修改摘要。

## 回退预案

- 本变更是纯加法 + 接线替换（无线格式语义变化）：Task 2 验证期发现问题 → 在接线 commit 上修复或 revert 接线 commit（Task 1 的方法+钉例纯增量，可独立保留）。
- 发版后发现问题 → revert 接线 commit + 0.9.94 修复版；tag 不重推（know-how 018）。鉴于线格式零变化，预期无需回退。

## 最终验证

- Run: `npm run build && npm test && npm run typecheck`
- Expected: 全套件绿（5 个钉住套件零迁移是核心判据）、typecheck 零错误。
- Run: `grep -Ec 'repairBasis \? \{ repairBasis: (err|e)\.repairBasis \} : \{\}' src/core/host-api.ts src/tools.ts src/cli.ts`
  - Expected: 三文件合计 **5 → 0**（今日恰 5 处命中即五处投影本体，改后归零；此锚兼作「无第 6 处」证明。勿用裸 `grep -c repairBasis`——tools 渲染侧 :548/:629/:688 合法保留会误报）。
- 发版门禁 + 审核记录齐备后才算计划完成。

## 审阅 Checkpoint

- 计划正文结束。请主人审阅：收敛形状（方法挂产地 + 三端信封展开）、红线 #2（tools 键序微移注记）、红线 #3（client 残余点口径）、Task 3 Step 2 硬停点表述。
- 审阅通过后仍走独立计划评审（评审 Agent）→ 执行 → 硬停送审 → 发版。
