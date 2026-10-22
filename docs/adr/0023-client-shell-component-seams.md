# 客户端壳层组件缝：main.jsx 三刀拆解与源锚迁移政策（ADR-0023）

2026-10-22 架构评审（钢人裁决）+ /grill-with-docs 共识（2026-10-23，19 项裁决全落）的决策记录。前置事实调查：两轮子代理走查（main.jsx 结构/churn 直方图、操作泵生命周期/消费点全集）。

## 决策

1. **为什么现在**：main.jsx 4475 行、近月 113 次触碰（第二名 market.ts 36 次）；18 个测试文件读其源码文本、11+ 个源码断言 describe；「对账横幅」单主题四轮修复（0.10.3–0.10.7）每轮同改 main.jsx 3–5 区 + 双语词典；render-smoke 仅覆盖首渲染（11 个 MarketPanel effect 在 SSR 下不可达）。「测试面 = 源文本」是浅接口的制度化代价——锚纪律三条物理事实、源锚卫兵测试、i18n 审计正则皆为此而设，且缺陷家族仍活跃（0.9.94 恒假锚、CRLF 恒真锚、0.10.4 裸键名 toast 真机实证）。
2. **三刀战役**（合并单版 0.10.9；刀刀独立 commit、每个 commit 全量测试绿，回滚粒度由 commit 级保全）：
   - **第一刀（机械开路，纯搬家零调用点语义变化）**：`src/client/i18n.js`（ZH/EN 词典 + browserLang/interpolate/lookup/communityLabels，ESM 具名导出）与 `src/client/styles.js`（CSS 字符串 + cssVersionOf/ensureCss）；main.jsx require 接线；i18n 审计与 CSS 字面量锚改锚新模块。
   - **第二刀（深化本体）**：新建 `src/client/panel-ops.js`（GLOSSARY「面板操作接线」）——① 泵上下文经显式 `bindPanelOps(deps)`/`unbindPanelOps()` 装配，取代模块级可变单例 opsPumpCtx；store/pump 的模块级创建收进该模块，面板外写入方（ToolCardRow、recordSettingsOp）经显式 accessor 取用；② 恢复对账副作用编排纯化为 `planReconcileActions(judged, seenKeys)`（先算后写原则从 restoreRecords 延伸到编排层）；③ 横幅判定收拢为 `restartBannerDecision(opKind, outcome)`（四处调用点恒值/读值/保守默认一处收拢）；④ refreshViews 死字段（全库无消费）删除。MarketPanel 保留薄 effect 适配器：取数 → restoreRecords（既有纯函数）→ planReconcileActions → 逐项执行。
   - **第三刀（测试面收口）**：大块组件一组件一文件（market-tab/installed-tab/settings-tab/detail-modal/zone-chips/operations-card/version-chip/card/favorite-zone.jsx，Icon/Spin/ToggleSwitch/TwoStepButton/RestartBanner/SearchBox/Shot/Lightbox 等小组件归组 chrome.jsx）；数据 hooks（api/useAsync/useMarketData）迁 `src/client/hooks.js`（防组件文件反向依赖 main.jsx 的循环 require）；main.jsx 降级为组合根（MarketPanel + 挂载 + apply + tool views）；render-smoke 的拷贝拼接追加导出 hack 缩至 MarketPanel 一项，其余组件直接 require。
3. **泵生命周期约束（事实裁定，评审不得重提相反方案）**：opsStore/opsPump 必须模块级存活——ToolCardRow 经 toolview 槽渲染于面板树外、面板未挂载时仍写入（main.jsx:4319–4321 注释明示）；泵创建移入组件生命周期被事实封死。未绑定上下文 = 设计内降级语义（恢复 queued 无 executor 且无上下文 → failed「无执行上下文（面板未挂载）」），原样保留。
4. **源锚迁移政策**：**有缝即接口测试，源锚只留给无缝可走的物理事实**。三桶：① i18n/CSS 字面量锚 → 改锚新模块文件；② 获得真缝的接线/结构锚 → 升级为接口测试（require 新模块/组件文件后的直接断言或行为测试）；③ build 产物 ASCII 物理事实与 main.jsx 保留区（挂载/apply）结构锚 → 保留。逐锚去向表附实施计划。
5. **测试纪律边界**：维持无 DOM 纪律，不引入 jsdom/happy-dom；SSR 冒烟保持首渲染语义并扩组件面（每组件 1–2 个代表性 props 变体，不穷举）；ADR-0020 渲染探针插桩锚随拆分同步迁移，打 tag 前复测为验收门。

## Considered Options

- **React Context 载泵上下文**：不采——把逻辑模块缠回 React 接线，违反深化方向。
- **泵/store 移入 MarketPanel 生命周期**：不采——面板外写入方（ToolCardRow）事实封死。
- **引入 jsdom 组件行为测试**：不采——与「接线降维为 DOM-free 纯函数」正交的独立议题，本次不混入。
- **三刀各自发版**：主人否决（2026-10-23）——合并单版 0.10.9；回滚粒度由 commit 级保全。
- **只拆纯逻辑不拆组件壳（现状路线延伸）**：不采——源锚家族与 i18n 审计正则的持续税已实证，组件无导出 = 测试只能 grep 源文本。
- **refreshViews 死字段保留**：不采——无消费者的写入面，未来真需要时再显式加回。

## Consequences

- CODING-STANDARDS「客户端状态机约定」节同步改写（标准本体，随本 ADR 同日落盘）。
- GLOSSARY 增「面板操作接线（Panel Ops Wiring）」词条（2026-10-23 已入表）。
- 拆分后 main.jsx 预期 ~1300 行；新 `.js` 逻辑模块遵循 ESM 具名导出纪律（禁 module.exports），`.jsx` 组件文件沿用 main.jsx 现行 CJS require 风格（verbatim 迁移、零重写）。
- 构建形态不变：lib/client.js 单 bundle、build.mjs banner/footer/treeShaking:false/external react 全不动；npm 发布面零变化。
- 实施计划：`docs/plans/2026-10-23-client-shell-seams-implementation-plan.md`（含逐锚去向表）。
- 渲染探针（scripts/probe-render-count.mjs）插桩锚迁移时其「锚点断言恰好命中一次」保护生效，源漂移即中止。
