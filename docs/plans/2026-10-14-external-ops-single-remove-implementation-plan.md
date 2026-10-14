# 外部操作记录单条移除（外部 failed 行 ✕ + per-id 服务端删除）实施计划

## 目标

- 外部操作记录（CLI / Agent 工具通道）的 **failed** 行开放单条 ✕：点 ✕ 经服务端 per-id 删除后从面板消失；若该行是唯一 failed，设置 tab 红点随之熄灭——解除「外部失败记录只能全量清空才能消红点」的死锁。
- **面板（本地）操作记录行为完全不变**（主人 2026-10-14 裁决）：本地分支代码与现状逐字节等价。
- 外部 done 行不给 ✕、无二次确认、失败 toast 反馈——与面板问题态语义完全对齐（grill Q1–Q10 已锁定）。

## 架构快照

外部记录的唯一事实源在服务端（`$DSH_HOME/dshm/external-operations.json`，ADR-0018），面板侧是内存 overlay。因此单条 ✕ 不能走本地 `store.remove(id)`（下次 fetch 会按 id 复活），必须补一条服务端 per-id 删除链路：

```
UI ✕(外部 failed 行) → api("external-operations-remove",{id})
  → host-api case → d.removeExternalOperation(id)   [core：readAll→filter→原子写]
  → 成功后 client：opsStore.removeExternal(id) + syncOps()
  → 失败：行保留 + notify err（遵守 0.9.6 反无声 no-op 裁决）
```

与「清除已结束」（fire-and-forget）相比事务顺序更强：**先 api 成功、再动 overlay**，常规复活路径消除；在途 fetch 窗口（删除前发出的 list 响应晚于删除落地时由 merge-only 的 `setExternal` 并回）由 store **墓碑**（`removedIds`）兜住（评审 R1-C3）。并发纪律与 append 现状同款（整文件读-改-写无锁，ADR Consequences 已有同类明示局限）。

## 全局约束

- 面板本地分支行为零变化；本次全部行为增量只作用于 `rec.channel` 非空的记录。
- 幂等：`removeExternalOperation` 对不存在的 id 静默 no-op，签名 `Promise<void>`。
- host-api 鉴权沿用方法分发前既有宿主信任检查，零新增特例；参数校验风格同 `registry-config-apply`（`ApiProtocolError` 400）。
- 无二次确认弹窗（与面板 ✕ 一致）。
- ADR-0018 原文不动，追加修订注记（保留决策史）。
- CHANGELOG 双语（中文在前英文在后，同版本号对齐，各区块倒序插最前）；i18n zh/en 两字典同步。
- 测试零触碰真实 `~/.dsh`：journal 相关测试用 `DSHM_EXTERNAL_JOURNAL_FILE` 指向 tmp 目录（0.9.79 既有纪律）。
- 版本 `0.9.81 → 0.9.82`（npm latest=0.9.81 已核实，无冲突）。
- 无额外平台约束（开发验证在 Linux bash；`npm test` 内含 pretest build）。

## 输入工件

- 设计共识：本会话 grill 两轮（Q1–Q10），主人逐条按推荐确认。
- ADR-0018：`docs/adr/0018-external-operations-journal.md`（决策 4 / R2-3 为本次修订对象）。
- 前版实施计划参照：`docs/plans/2026-10-13-external-operations-journal-implementation-plan.md`。

## 文件结构与职责

- Modify: `src/core/external-journal.ts` — 新增 `removeExternalOperation(id)`（存储层 per-id 删除，紧跟 `clearExternalOperations` 之后）。
- Modify: `src/core/host-api.ts` — 新增 method `external-operations-remove`（import、`HostApiOverrides` 注入位、缺省接线、case 分发四处，锚点见任务）。
- Modify: `src/client/operations.js` — store 新增 `removeExternal(id)`（overlay 剔除 + 墓碑 `removedIds` 拦在途 fetch 复活，紧跟 `clearExternal` 之后）。
- Modify: `src/client/operations-view.js` — `canRemoveRow` 外部分支放行 failed（121–130 行区域）。
- Modify: `src/client/main.jsx` — ①i18n zh/en 各加 `op.remove.failed`；②`OperationsCard` 行渲染 ✕ 的 `onClick` 改传整行 record（3191–3196 区域，注释同步改写）；③Panel 的 `onOpsRemove` 分流（3866–3869 区域）。
- Test: `tests/external-journal.test.mjs`（+3 用例）
- Test: `tests/host-api-external.test.mjs`（+3 用例）
- Test: `tests/client-operations.test.mjs`（+2 用例）
- Test: `tests/client-operations-view.test.mjs`（改写 ⑥ 断言 + 接线锚 2 条）
- Modify: `docs/adr/0018-external-operations-journal.md`（文末追加修订段）
- Modify: `CHANGELOG.md`（中/英两区块各插 0.9.82 条目）
- Modify: `package.json`（version 0.9.82）

任务间依赖链：Task 1 产出的 `removeExternalOperation` → Task 2 的 method；Task 3 产出的 `removeExternal` 与 Task 4 产出的新 `canRemoveRow` 语义 → Task 5 的 UI 接线；Task 6 收口文档与版本。

## 任务清单

### Task 1: core 存储层 `removeExternalOperation`（TDD）

- 目标：journal 按 id 删除单条，幂等，原子写，其余记录原样保留。
- 涉及文件：`src/core/external-journal.ts`、`tests/external-journal.test.mjs`
- 接口契约：
  - Consumes: 模块内既有 `readAll`/`atomicWrite`/`journalFile`；测试文件既有 `DSHM_EXTERNAL_JOURNAL_FILE` tmp 隔离 harness 与 `rec()` 工厂。
  - Produces: `export async function removeExternalOperation(id: string): Promise<void>`（构建后位于 `lib/core/external-journal.js`，Task 2 消费）。
- 验证范围：新增 3 用例全绿，既有用例不回归。

- [ ] Step 1: 在 `tests/external-journal.test.mjs` 的 `describe('external-journal 存储')` 内新增用例（import 列表补 `removeExternalOperation`）：①append a/b 两条 → `removeExternalOperation('a')` → list 仅含 b；②`removeExternalOperation('not-exist')` → 不抛、list 原样（幂等 no-op）；③删一条后重读文件：JSON 可解析、长度减一、保留记录字段逐字段不变（删除断言字段不被改写）。
- Run: `npm run build && node --test tests/external-journal.test.mjs`
- Expected: 新用例失败——Node ESM **链接期** `SyntaxError`，文案含 `does not provide an export named 'removeExternalOperation'`（具名导入缺失时测试文件整体加载失败，到不了调用点的 TypeError；评审 R1-C2）。
- [ ] Step 2: 运行并确认失败信号与上一步一致。
- Run: 同上
- Expected: 同上（链接期 SyntaxError，非 TypeError）
- [ ] Step 3: 最小实现——在 `src/core/external-journal.ts` 的 `clearExternalOperations` 之后新增：

```ts
/** 按 id 删除单条外部记录（0.9.82 修订 R2-3）：幂等——id 不存在静默 no-op；
 *  整文件读-改-写与 append 同款并发纪律（ADR-0018 Consequences 既有明示局限）；
 *  保留记录原样透写，不做 normalize 重写（删除不改写历史字段）。 */
export async function removeExternalOperation(id: string): Promise<void> {
  const file = journalFile()
  const records = await readAll(file)
  const kept = records.filter((r) => r.id !== id)
  if (kept.length === records.length) return
  await mkdir(dirname(file), { recursive: true })
  await atomicWrite(file, `${JSON.stringify(kept, null, 2)}\n`)
}
```

- [ ] Step 4: 运行并确认通过。
- Run: `npm run build && node --test tests/external-journal.test.mjs`
- Expected: 全部用例绿（含既有 8+ 用例）。
- [ ] Step 5: checkpoint commit（`feat(core): removeExternalOperation — per-id journal delete`）。

### Task 2: host-api method `external-operations-remove`（TDD）

- 目标：面板可信通道可按 id 删服务端 journal 记录；参数缺失 400；注入位可测。
- 涉及文件：`src/core/host-api.ts`、`tests/host-api-external.test.mjs`
- 接口契约：
  - Consumes: Task 1 的 `removeExternalOperation`；既有 `ApiProtocolError`、`HostApiOverrides` 接口（`listExternalOperations?`/`clearExternalOperations?` 注入位先例，约 91–92 行）、缺省接线（约 301–302 行）、`external-operations-clear` case（约 658–662 行）。
  - Produces: method `external-operations-remove`（body `{ id: string }`，成功 payload `{}`），Task 5 的 client 调用消费。
- 验证范围：新增断言全绿（删除直通 / 400 校验 / 注入位 / 401 鉴权）。

- [ ] Step 1: 在 `tests/host-api-external.test.mjs` 既有 harness（`setup()`/`callApi`/journal env 隔离）内新增断言：①journal 预置两条 → `callApi({ method: 'external-operations-remove', id: 'ext-1' })` → `status/body.ok` 成功且再发 `external-operations` 只剩一条；②缺 `id` 与 `id: 123` 各断言 400（错误信息含「id」）；③`setup` 注入 `removeExternalOperation` mock → 调用后 mock 收到正确 id（注入位生效，真实现未被触达）；④`setup` 注入 `rejectRequest`（401）时 `external-operations-remove` 同样 401——钉住「分发前宿主信任检查覆盖新 method」的仓内不变量惯例（对齐 list/clear 既有 401 断言；评审 R1-C6）。
- Run: `npm run build && node --test tests/host-api-external.test.mjs`
- Expected: 新断言失败——**①②③ 不满足**（未知 method 实得 404：非 200、非 400、mock 未触达）；**④ 实现前即通过**——宿主信任检查在 `parseRequest` 分发之前、与 method 无关，这恰是要钉住的不变量（评审 R2-C2）。
- [ ] Step 2: 运行并确认失败。
- Run: 同上
- Expected: 同上
- [ ] Step 3: 最小实现——`src/core/host-api.ts` 四处：
  1. line 23 import 补 `removeExternalOperation`；
  2. `HostApiOverrides` 的 `clearExternalOperations?:` 行后补 `removeExternalOperation?: typeof removeExternalOperation`（注释：0.9.82 修订 R2-3）；
  3. 缺省接线（`clearExternalOperations: ...` 行后）补 `removeExternalOperation: ctx.deps?.removeExternalOperation ?? removeExternalOperation,`；
  4. `external-operations-clear` case 后新增：

```ts
case 'external-operations-remove': {
  // 0.9.82 修订 R2-3：外部 failed 行单条 ✕ 的服务端出口；鉴权同 list/clear（零新增特例）
  if (typeof body.id !== 'string' || body.id === '') throw new ApiProtocolError(400, '缺少 id')
  await d.removeExternalOperation(body.id)
  payload = {}
  break
}
```

- [ ] Step 4: 运行并确认通过。
- Run: `npm run build && node --test tests/host-api-external.test.mjs`
- Expected: 全绿。
- [ ] Step 5: checkpoint commit（`feat(api): external-operations-remove host-api method`）。

### Task 3: client store `removeExternal`（TDD）

- 目标：overlay 按 id 剔除，本地记录零接触。
- 涉及文件：`src/client/operations.js`、`tests/client-operations.test.mjs`
- 接口契约：
  - Consumes: 模块内 `externalOverlay` 声明（约 133 行）与 `setExternal`/`clearExternal`/`listMerged`（152–173 行区域）。
  - Produces: `store.removeExternal(id)`（返回 `listMerged()`，与 `setExternal`/`clearExternal` 同款），Task 5 消费。
- 验证范围：新增 2 用例全绿。

- [ ] Step 1: `tests/client-operations.test.mjs` 新增用例：①`setExternal` 两条 + 本地 1 条 → `removeExternal('ext-a')` → `listMerged()` 不含 ext-a、本地记录原样、`externalList()` 只剩一条；②`removeExternal('not-exist')` → 不抛、视图不变；③**墓碑**（评审 R1-C3）：`removeExternal('ext-b')` 后再次 `setExternal([ext-b])`（模拟在途 fetch 迟到响应）→ `listMerged()` 仍不含 ext-b；`clearExternal()` 后 `setExternal([ext-b])` → ext-b 恢复（「清除已结束」重置墓碑）。
- Run: `node --test tests/client-operations.test.mjs`
- Expected: 新用例失败——`removeExternal is not a function`。
- [ ] Step 2: 运行并确认失败。
- Run: 同上
- Expected: 同上
- [ ] Step 3: 最小实现——`externalOverlay` 声明处（约 133 行）补墓碑集合：

```js
// 墓碑（0.9.82 修订 R2-3，评审 R1-C3）：removeExternal 后（服务端删除已成功）的 id 在本页
// 内存记名——拦截在途 fetch 迟到响应把已删记录并回 overlay（setExternal 是只增改的 merge-only
// 合并，无墓碑时该行会僵尸存留）。clearExternal（「清除已结束」）重置：服务端 journal 已整体
// 清空，无需再拦。
const removedIds = new Set()
```

`setExternal` 的合并循环补过滤（`if (removedIds.has(r.id)) continue`）；`clearExternal` 改为 `externalOverlay = []; removedIds.clear(); return this.listMerged()`；`clearExternal()` 之后新增：

```js
/** 按 id 剔除外部 overlay（0.9.82 修订 R2-3）：仅内存视图——调用方必须已在服务端
 *  删除成功后调用（external-operations-remove）；墓碑拦住在途 fetch 迟到响应的复活。 */
removeExternal(id) {
  removedIds.add(id)
  externalOverlay = externalOverlay.filter((r) => r.id !== id)
  return this.listMerged()
},
```

- [ ] Step 4: 运行并确认通过。
- Run: `node --test tests/client-operations.test.mjs`
- Expected: 全绿。
- [ ] Step 5: checkpoint commit（`feat(client): opsStore.removeExternal — overlay per-id removal`）。

### Task 4: `canRemoveRow` 外部 failed 放行（TDD，改写既有断言）

- 目标：出口判定对齐——外部 failed 行有 ✕，done 行没有；本地路径不变。
- 涉及文件：`src/client/operations-view.js`（121–130 行）、`tests/client-operations-view.test.mjs`（206–216 行 ⑥ 用例）
- 接口契约：
  - Consumes: 无新依赖（纯函数改写）。
  - Produces: 新 `canRemoveRow` 语义——`channel` 非空时 `return r.status === "failed"`；Task 5 的行渲染消费。
- 验证范围：⑥ 用例改写后全绿；其余用例（含 247 行源码锚 `canRemoveRow(r)`）不动。

- [ ] Step 1: 改写 ⑥ 用例为：本地 `input/failed/superseded` → true（断言原样保留）；**现行负向断言原样保留**——本地 `queued/running/done/warned` → false 与外部 `queued/running/warned` → false（本地 done/warned 无 ✕ 是 R0 红线与 R5 的直接回归锚，评审 R1-C4）；仅翻转一处期望：外部 `channel:'cli'` + `failed` → **true**（新期望）；外部 `channel:'host-tool'` + `done` → false；外部 `input/superseded` → false（防御断言，外部记录实际不产生这两态）；`null` → false。用例标题改为「⑥canRemoveRow：本地问题态出口 + 外部 failed 放行（0.9.82 修订 R2-3）」。
- Run: `node --test tests/client-operations-view.test.mjs`
- Expected: ⑥ 失败——外部 failed 期望 true 实得 false。
- [ ] Step 2: 运行并确认失败。
- Run: 同上
- Expected: 同上
- [ ] Step 3: 最小实现——`canRemoveRow` 改为：

```js
export function canRemoveRow(r) {
  if (!r || typeof r !== 'object') return false
  if (r.channel) return r.status === 'failed' // 0.9.82 修订 R2-3：外部记录只可能是 done/failed 终态
  return r.status === 'input' || r.status === 'failed' || r.status === 'superseded'
}
```

同时把 121–125 行的 JSDoc 注释与 **116 行** `opRowVm` 的 channel 字段注释（「非空 = 渠道徽标渲染 + 无单条 ✕ 出口」）一并改写为修订后语义（failed 放行、服务端 per-id delete 已建；评审 R1-C5）。
- [ ] Step 4: 运行并确认通过。
- Run: `node --test tests/client-operations-view.test.mjs`
- Expected: 全绿。
- [ ] Step 5: 无独立 commit（与 Task 5 同属 client 行为面，合并提交）。

### Task 5: main.jsx 接线——onOpsRemove 分流 + 行渲染传 record + i18n（TDD：源码锚）

- 目标：✕ 点击按 `rec.channel` 分流；外部分支「先 api 成功、再动 overlay」，失败 toast；本地分支逐字节等价。
- 涉及文件：`src/client/main.jsx`、`tests/client-operations-view.test.mjs`（源码锚）
- 接口契约：
  - Consumes: Task 2 的 method `external-operations-remove`、Task 3 的 `removeExternal`、Task 4 的 `canRemoveRow` 新语义；既有 `api(method, params)`（702 行，params 展开进 body）、`notify({ kind: "err", text })`、`syncOps()`、`opsStore`。
  - Produces: 完整用户可见行为（验收路径的载体）。
- 验证范围：新增源码锚用例绿；`client-render-smoke` 等既有 client 测试不回归。

- [ ] Step 1: 在 `tests/client-operations-view.test.mjs` 既有源码锚用例（247 行「⑥单条 ✕ 出口改走 canRemoveRow」同款范式）后新增锚用例：fs 读 `src/client/main.jsx` 文本，断言同时包含 `"external-operations-remove"`、`"removeExternal("`、`"op.remove.failed"`、`"onRemove(r)"`；读 `src/client/operations-view.js` 断言包含 `return r.status === 'failed'`。
- Run: `node --test tests/client-operations-view.test.mjs`
- Expected: 新锚用例失败（源码尚未改）。
- [ ] Step 2: 运行并确认失败。
- Run: 同上
- Expected: 同上
- [ ] Step 3: 三处实现：
  1. **i18n**：zh 字典（`"op.remove"` 同行区域，约 47 行）加 `"op.remove.failed": "记录移除失败：{err}"`；en 字典（约 168 行）加 `"op.remove.failed": "Failed to dismiss record: {err}"`（带 {err} 插值，对齐 failed.install 等既有失败文案惯例，保留服务端错误线索；评审 R1-C7）；
  2. **OperationsCard 行渲染**（3191–3196）：注释块改写为修订后语义（外部 failed 行有 ✕；移除走服务端 per-id 删除，成功才动 overlay），`onClick: () => onRemove(r.id)` 改为 `onClick: () => onRemove(r)`；
  3. **Panel 的 `onOpsRemove`**（3866–3869）改为：

```js
onOpsRemove: (rec) => {
  if (rec && rec.channel) {
    // 0.9.82 修订 R2-3：外部记录 ✕ = 服务端 per-id 删除；成功才动 overlay（强于 clear 的
    // fire-and-forget）；复活由 store 墓碑拦住（clearExternal 重置）；失败行保留 + toast
    // （0.9.6 反无声 no-op 裁决）
    api("external-operations-remove", { id: rec.id })
      .then(() => {
        opsStore.removeExternal(rec.id);
        syncOps();
      })
      .catch((err) => {
        notify({ kind: "err", text: lookup("op.remove.failed", { err: (err && err.message) || "unknown" }) });
      });
  } else {
    opsStore.remove(rec.id); // 面板本地路径：现状逐字节不动
    syncOps();
  }
},
```

- [ ] Step 4: 运行并确认通过。
- Run: `npm run build && node --test tests/client-operations-view.test.mjs tests/client-operations.test.mjs tests/client-render-smoke.test.mjs`
- Expected: 全绿。
- [ ] Step 5: checkpoint commit（`feat(client): external failed rows get per-row dismiss — panel path untouched`）。

### Task 6: ADR 修订注记 + CHANGELOG 双语 + 版本号

- 目标：决策变更留痕、发版物料齐备。
- 涉及文件：`docs/adr/0018-external-operations-journal.md`、`CHANGELOG.md`、`package.json`
- 接口契约：
  - Consumes: Task 1–5 全部落地（文档描述的机制必须与代码一致）。
  - Produces: 可发版的工作树。
- 验证范围：grep 锚点齐全；全量测试与 typecheck 绿（并入 Task 7 收口）。

- [ ] Step 1: `docs/adr/0018-external-operations-journal.md` 文末（Consequences 之后）追加：

```markdown
## 修订（0.9.82，2026-10-14）

- **外部 failed 行开放单条 ✕（修订决策 4 / R2-3）**：原裁决「外部行不渲染单条 ✕」的实现前提
  （服务端只有 list/clear）已补齐——新增 core `removeExternalOperation(id)` 与 host-api
  `external-operations-remove`（鉴权同 list/clear，零新增特例）。翻案动因：外部失败记录点亮
  红点却无单条出口，唯一消除手段「清除已结束」附带清空全部终态——红点死锁 + 警报疲劳；
  且展示层（渠道徽标/分组/计数）0.9.79 起已同构，操作层掉队。范围收敛：仅 `failed` 行放行
  （与面板 ✕ 的问题态集合 input/failed/superseded 语义对齐，done 同样不给）；事务顺序强于
  clear（先 api 成功、再动 overlay，失败行保留 + toast；在途 fetch 窗口由客户端墓碑
  `removedIds` 兜住，「清除已结束」时重置）；幂等 no-op；并发纪律与
  append 同款读-改-写（Consequences 既有明示局限覆盖本路径）。「清除已结束」行为不变。
```

- [ ] Step 2: `CHANGELOG.md` 中文区块（`## 中文` 标题后、`### 0.9.80` 之前）插入 `### 0.9.82 功能：外部操作记录 failed 行单条移除——红点死锁解除（ADR-0018 修订）`，正文按 0.9.79 条目版式写：问题（红点死锁 + 操作层与展示层不对齐）、方案（服务端 per-id 链路 + 事务顺序 + overlay 墓碑 + 幂等 + 范围收敛仅 failed）、验证（全量测试/typecheck 结果占位为「见 Task 7 实测数」——**提交前必须回填真实数字，不得保留占位**）；英文区块（`## English` 后对应位置）插入同版本对齐条目。
- Run: `grep -n "0.9.82" CHANGELOG.md | head` 与 `grep -c '"op.remove.failed":' src/client/main.jsx`
- Expected: CHANGELOG 中英各 1 处 0.9.82 标题；i18n 键定义恰 2 处（zh/en 字典各一，Task 5 已加；评审 R2-C1：带引号冒号的精确模式排除 lookup 调用行，调用行不加计数）。
- [ ] Step 3: `package.json` version `"0.9.81"` → `"0.9.82"`。
- Run: `node -e "console.log(require('./package.json').version)"`
- Expected: `0.9.82`

### Task 7: 最终验证与交付（全量收口 → 确认 → push → 发版 → 装机验收）

- 目标：基线同绿、发版上架、装机后按 Q9 三步验收。
- 涉及文件：无新改动（验证与交付动作）。
- 接口契约：
  - Consumes: Task 1–6 全部完成。
  - Produces: npm `dsh-m@0.9.82` 上架 + 本机 profile 装机 + 验收结论。
- 验证范围：全量测试、typecheck、构建产物、真机验收。

- [ ] Step 1: 全量收口。
- Run: `npm test && npm run typecheck`
- Expected: 全量测试全绿（0.9.80 基线 1425，本次净增用例以实测为准，**CHANGELOG 验证行回填实测数**）、typecheck 零错误、build ok。
- [ ] Step 2: commit 全部剩余改动（`chore(release): 0.9.82 — external ops per-row dismiss (ADR-0018 revision)`），**push 前经主人确认**（本会话纪律），然后 `git push origin main`。
- Run: `git push origin main`
- Expected: push 成功。
- [ ] Step 3: 发版：`git tag v0.9.82 && git push origin v0.9.82`（触发 OIDC Release workflow）。按 know-how 018 纪律：publish 绿 ≠ 上架，挂 schedule 每 10 分钟三键轮询（`npm view dsh-m version` / packument versions / dist-tags），实测窗口 17–59 分钟。
- [ ] Step 4: 上架确认后 `dshm_upgrade`（dsh-m 自升级，宿主通道）装机 0.9.82。
- Run: 升级后在宿主 shell 探针：`grep -c "external-operations-remove" ~/.dsh/profiles/web/node_modules/dsh-m/lib/core/host-api.js`
- Expected: ≥1（宿主侧新 method 已装机）。**注意探针目标**：host/core 走 tsc 逐文件编译，分发 case 落在 `lib/core/host-api.js`，不在 `lib/host.js`（评审 R1-C1 实测：`external-operations-clear` 在 lib/host.js 计数为 0）。
- [ ] Step 5: Q9 三步验收——①我执行 `dshm toggle <某未装包> --profile web` 造 `cli` 通道 failed 记录；②经 Agent 工具对一个不存在的版本发起升级造 `host-tool` 通道 failed 记录（不触碰真实已装插件）；③主人在面板设置 tab 终验：两条外部失败行**带 ✕ 且渠道徽标在**、点 ✕ 单条消失、唯一失败行删除后红点熄灭、done 行（含外部）无 ✕、面板本地记录行为与改前一致。验收通过后本轮交付闭环；`schedule` 轮询任务删除。

## 执行纪律

- 开始实现前先批判性复查本计划；发现缺项/矛盾/与仓库现实不符，先修计划再动手。
- 按任务顺序执行，不无声跳步、合并步或改变任务目标；每任务完成即跑该任务验证。
- 面板本地路径（Task 5 的 else 分支）是零变化红线：review diff 时该分支不得出现语义改动。
- 测试全程零触碰真实 `~/.dsh`（journal 测试一律走 `DSHM_EXTERNAL_JOURNAL_FILE` tmp 隔离）。
- 遇阻、重复失败或验证命令失效，立即停下说明，不猜。
- 回退口径（评审 R1-C8）：tag `v0.9.82` 未打 → `git revert` 对应 checkpoint commit 即可（journal 文件格式未变，回退零数据迁移）；已发版上架 → 在 main 修复后 bump `0.9.83` 重走 Task 7 发版与验收流程。
- 当前分支为 `main`（本会话既有惯例：改动直接落 main、push 逐次经主人确认）；发版 push 与 tag 在 Step 2/3 各自确认后执行。

## 最终验证

- `npm test`（全量全绿，净增用例数回填 CHANGELOG）、`npm run typecheck`（零错误）。
- 装机后真机验收：Task 7 Step 5 三步全部通过。
- 验证命令环境：Linux bash、仓库根 `/home/ubuntu/workspace/dsh-m`、Node ≥22（repo 既有约定）。

## 审阅 Checkpoint

- 计划正文结束后，请主人审阅；审阅通过前不进入实现。
- 默认执行方：本会话 Agent（与 grill 共识同环境）；Task 7 Step 4 的 `dshm_upgrade` 走宿主通道，沙箱受限时按 know-how 026 处理。
