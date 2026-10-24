# market 读写分缝：写侧出仓 market-mutation.ts（ADR-0024）

2026-10-24 架构评审（钢人裁决，唯一入选项）+ /grill-with-docs 两轮共识（10 项裁决全按推荐落定）+ 独立评审 Agent 两轮核证（4 项问题闭环）的决策记录。实施计划见 `docs/plans/2026-10-24-market-read-write-seams-implementation-plan.md`。

## 决策

1. **为什么现在**：market.ts 1960 行、37 个 export——interface 几乎与实现一样宽（浅模块教科书形态）；近两月 51 次触碰为 core 第一热点；0.10.11 社区 issue 四连修（#2/#3/#6/#7）中 #3/#6 需「同根因合并修」，理解一个安装 bug 要跨 market → generation-projection → installed → enablement 走链——locality 失效的实证。写侧符号的调用方天然聚簇（cli/tools 的 install/upgrade、host-api 的变更路由、profile-ops/toggle 的 mutation session），缝在调用方已存在，market.ts 只是没暴露它：**两个 adapter = 真缝**。
2. **读写分缝**：写侧整段（原 market.ts:1004–1960）verbatim 迁入 `src/core/market-mutation.ts`（GLOSSARY「市场变更编排 Market Mutation」）——收录条目解析、兼容预检、快照、安装/卸载/升级/自升级事务编排；读侧（列表/搜索/已装投影/probe 预算/排序）留 market.ts。依赖单向 mutation → read；`abortError`/`mapWithConcurrency` 等共用小工具留读侧。
3. **不留 re-export**：全部调用方（src 5 处：cli.ts / tools.ts / host-api.ts / profile-ops.ts / toggle.ts；tests 命写侧符号者）直改 import——ADR-0016 的 re-export「保零改动」遗留成永久转手债是实证教训。顺手清债：market.ts:56–57 对 merged-market 的转手 re-export 删除，profile-ops 的 `matchInstalledByEntry`、tools 的 `CommunityRegistrySummary` 直连 merged-market.js。
4. **测试分册**：same-PR 拆出 `tests/market-mutation.test.mjs`（写侧用例 + 复制的共享夹具，独立 tmp root）；interface 即测试面，测试分册是缝真实性的判据。
5. **提交形状**：本 ADR + GLOSSARY 词条先行一 commit；实现 + 测试 + 接线第二 commit；同 PR。零行为变化、零版本号变化。

## Considered Options

- **小刀只迁 guard 线格式**：不采——留双头 interface，下次 issue 仍在旧摩擦面上修。
- **留 re-export 保调用方零改动**：不采——ADR-0016 实证：re-export 至今未清，成永久导航债；5 处机械改动成本远低。
- **新开 util 模块放共用小工具**：不采——YAGNI，单向依赖已消解归属问题。
- **写侧留在 market.ts 内部分层**：不采——模块的 interface 不变就没有深化，测试面照旧。

## Consequences

- market.ts 预期 ~1000 行级；market-mutation.ts ~950 行级。
- 测试计数变化回写 CHANGELOG 中文顶条「全量 N/N」（check-release 计数新鲜度步对账对象）。
- build 形态不变：tsc 全项目编译自动产出 lib/core/market-mutation.js；npm 发布面零变化（构建产物目录，非手工维护）。
- 后续市场侧写路径变更（新的社区 issue、升级语义调整）应落 market-mutation.ts；读路径（列表/搜索/展示投影）落 market.ts——下次架构评审以此为既定缝，不再重议。
