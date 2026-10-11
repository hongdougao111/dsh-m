# C3 收藏 stale 检查改走 cache-only + 零增量提交守卫 实施计划

## 目标

- 钢人报告（`docs/architecture-review-20261010-0300-steelman.html` C3 节）主半边：收藏 stale 判定只需「id 还在不在目录」的布尔值，却穿透 full 探测模式（每命中条 latest 网络扇出、产物全丢弃）——`lookupLive` 补 `probeMode:"cache-only"`（ADR-0013 第一段模式，零网络零探测），语义不变（existence 判定 = items 成员判定）。
- 附带红利半边：`fetchPage` 的 `.then` 无条件 `setData`，即使响应内容与当前数据逐字段等价（toggle 后 refreshViews 四连响应常态）——数据层维持的引用稳定性一次 setState 就蒸发。守卫 = 内容等价则不提交（ZoneChips setGeom 同款纪律，纯函数 Node 可测）。
- 发布约束（需求方指示）：**执行完先交独立评审，评审通过前不发版**——本计划不含版本号与 CHANGELOG。

## 架构快照

- 等价判定放 `market-state.js` 纯函数 `marketResponseEquivalent(a, b)`：JSON 值语义递归比较（身份无关——服务端/normalize 每轮都是新容器；undefined 与缺席键视为等价），覆盖 normalizeMarketResponse 的全部规范字段（items/latest 族/categoryCounts/sourceCounts/registryState/community/latestComplete）。
- 接线两处均在 `main.jsx`：`lookupLive`（收藏 stale 检查，≈2967 行）传 `probeMode:"cache-only"`（`fetchPage` ≈767 行同款先例）；`fetchPage` `.then`（≈774-780 行）捕获 `prevData` 后，`if (!marketResponseEquivalent(prevData, merged)) setData(merged)`——`dataRef.current` 照常更新（mergeLatestFields 的 prev 事实源），`setLoading(false)` 照常收口，仅跳过 React 提交。
- 报告标注的可选项「客户端 stale 结果 TTL 缓存」**明确不做**：C1 物化后 cache-only 查询已是内存级（身份键 memo 命中），TTL 缓存只剩本地省，复杂度不配。

## 全局约束

- 收藏 stale 语义零变化：红点 =「已下架」成员判定布尔；800ms debounce 合并突变逻辑不动。
- ADR-0013 两段加载语义不动：cache-only 首段 `latestComplete===false` 的第二段 full 追发仅存在于 `fetchPage`（页面路径）；收藏路径无第二段（不消费 latest 族字段）。
- 快照写入时机不动（终态才写）。
- 环境：bash + Node，命令在 `dsh-m/` 仓库根；基线 `npm test` = **1323 全绿**（2026-10-11 实测）+ typecheck exit 0。

## 文件结构与职责

- Modify: `src/client/market-state.js` — 新增 `marketResponseEquivalent` 纯函数（紧随 `mergeLatestFields`）。
- Modify: `src/client/main.jsx` — market-state require 行追加导入；`fetchPage` 守卫；`lookupLive` 补 `probeMode`。
- Test: `tests/client-market-state.test.mjs` — 纯函数单测 + main.jsx 接线结构锚（readFileSync 源串，client-lightbox 同款惯例）。

## 任务清单

### Task 1: `marketResponseEquivalent` 纯函数 + 单测（TDD）

- 目标：等价判定的全部语义先在 node:test 里钉死。
- 涉及文件：Modify `src/client/market-state.js`；Test `tests/client-market-state.test.mjs`。
- 接口契约：Produces `marketResponseEquivalent(a, b): boolean`（Task 2 按名导入）；Consumes 无。
- 验证范围：`node --test tests/client-market-state.test.mjs` 全绿。

- [ ] Step 1: 写失败用例（追加 describe，`ms.marketResponseEquivalent` 引用）：同引用→true；`null` vs 对象→false；等值不同身份（items 嵌套 + categoryCounts + community.errors 数组）→true；`total` 差→false；items 元素 `outdated` 差→false；items 长度差→false；`{a:1,b:undefined}` vs `{a:1}`→true；数组 vs 普通对象→false；categoryCounts 值差→false。
- [ ] Step 2: Run `node --test tests/client-market-state.test.mjs` → Expected：新 describe 红（函数不存在）。
- [ ] Step 3: 实现 `marketResponseEquivalent`（递归：`===` 短路；双方对象才比；数组比长度+逐元素；普通对象比「有值键集」并逐键递归；其余 false）。
- [ ] Step 4: Run 同上 → Expected 全绿。
- [ ] Step 5: checkpoint commit。

### Task 2: main.jsx 接线 + 结构锚

- 目标：收藏查询零网络；fetchPage 零增量不提交；结构锚防回归。
- 涉及文件：Modify `src/client/main.jsx`；Test `tests/client-market-state.test.mjs`。
- 接口契约：Consumes Task 1 的 `marketResponseEquivalent`；Produces 无（行为变更）。
- 验证范围：`npm test` 全量 ≥ 1323 + 新增；`grep -c 'probeMode: "cache-only"' src/client/main.jsx` ≥ 2。

- [ ] Step 1: 追加结构锚 describe（readFileSync main.jsx）：① `api("market", { query: fav.id, source: "all", limit: 8, probeMode: "cache-only" })` 逐字锚；② `if (!marketResponseEquivalent(prevData, merged)) setData(merged);` 逐字锚；③ require 行含 `marketResponseEquivalent` 导入锚。
- [ ] Step 2: Run → Expected：仅结构锚红。
- [ ] Step 3: 三处接线：require 行追加 `marketResponseEquivalent`；`fetchPage` 捕获 `prevData` + 守卫替换裸 `setData(merged)`（`dataRef.current`/`setLoading` 语义不动）；`lookupLive` 的 api 参数补 `probeMode: "cache-only"` + 注释（C3：stale 只需成员布尔，latest 扇出产物全丢弃）。
- [ ] Step 4: Run `npm test` → Expected：全量绿（≥1323+新增，0 fail）；grep ≥2。
- [ ] Step 5: checkpoint commit（不 tag、不发版）。

## 执行纪律

- 按任务顺序执行；每任务跑其验证；main.jsx 编辑先读后写带足锚点；遇阻即停。

## 最终验证

- `npm run typecheck` exit 0；`npm test` 全绿且 ≥ 1323 + 本批新增；手工冒烟移交评审：收藏区切换/增删收藏——stale 红点语义不变、DevTools Network 面板零 `dshm/market` 探测型请求（cache-only 首段后无 full 追发）。

## 审阅 Checkpoint

- 执行完成后交独立评审 Agent 审核产出；评审通过 + 需求方放行前不 tag、不发版。
