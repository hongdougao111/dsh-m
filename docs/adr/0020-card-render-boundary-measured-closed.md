# 卡片渲染边界：实测关案——不设 per-card memo / Tab 级渲染边界（ADR-0020）

钢人报告（2026-10-10 `docs/architecture-review-20261010-0300-steelman.html`）对原 C3 主体（卡片渲染边界 / React.memo）的裁决是**条件挂起**：「先测量（React Profiler / 渲染计数探针）再决定」——反对理由是 memo 会被 `cardOf` 现造的 badges 数组 / inline icon 元素击穿、真实工作量远超表面，且 reconcile 成本估算从未实测。2026-10-15 测量落地（探针 `scripts/probe-render-count.mjs`），本 ADR 记录数据与裁决，未来架构评审不再无条件重提本题。

## 决策

1. **探针形态（零生产改动）**：探针内对 `main.jsx` 源做精确字符串变换插桩（Card / Icon / MarketTab 函数体计数器 + MarketTab 调用点包 `React.Profiler`；每处锚点断言恰好命中一次，源漂移即中止），bundle 用后即弃——生产代码与生产行为零触碰。React 用 **profiling UMD**（`react.profiling.min.js`）：生产速度 + Profiler `onRender` 真触发，避免 dev 版约 2× 开销造成的虚高（dev 数字仅作上界参考，不进裁决）。本地 http 源 + `/dshm` 桩：合成目录 4,460 条（32/页默认 + 96/页上限）+ 精选 22 条，cache-only 回页不带 latest 字段驱动两段加载，安装后条目标 installed 驱动内容真变化；图标 npm-only 走字母兜底零外网。Long Tasks API 交叉验证主线程阻塞。
2. **实测数字（本机 headless Chromium，多遍稳定；renderMs = Profiler actualDuration 累计，纯 React 渲染段）**：

   | 场景 | commits | renderMs | 卡片重建 | MarketTab 渲染 | longtask(>50ms) |
   |---|---|---|---|---|---|
   | boot + 两段加载 @32/页 | 9 | ~56 | 128（4×32） | 6 | 0 |
   | 翻页 @32/页 | 5 | ~22 | 96（3×32） | 3 | 0 |
   | 搜索提交 @32/页 | 4 | ~16-20 | 96（3×32） | 3 | 0 |
   | 安装完成→refreshViews @32/页 | 9 | ~37 | 256（8×32） | 8 | 0 |
   | 切页大小→96/页 | 5 | ~48-57 | 352 | 5 | 0 |
   | 翻页 @96/页 | 5 | ~18-32 | 288（3×96） | 3 | 0 |
   | 安装完成 @96/页 | 6-7 | ~36-38 | 480-576 | 5-6 | 0 |

   对照钢人生存带的门槛问法（「谁、在什么场景、痛多少毫秒」；生存卡实测带 65–400ms）：**全部场景 16–57ms，均在带下；全场景零 long task**。现状最强辩护（「reconcile 是 5–20ms 级」）被实测确认。
3. **结构性事实存档（与性能裁决解耦的乘数结构）**：MarketTab 无 memo 边界；`cardOf` 直接函数调用 `Card()`——卡片在 React 眼里**根本不是组件**，不存在可挂 memo 的边界；每次 MarketTab 渲染全量重建全部可见卡（实测 cards = tabs × dom 恒等）；一次安装完成伴随 8 次 MarketTab 渲染、256–576 次卡片元素树重建（驱动源：ops 记录态迁、notify/toast 横幅、installed/updates/两分区 market 四路响应、Modal 本地态）。今日成本可忍的原因是单卡便宜（全网格一轮 ≈7–19ms）；**成本按 tabs × dom 乘数放大**——单卡变贵或页上限上调时乘数不变而基数变。
4. **裁决：不开案**。per-card React.memo：无边界可挂（决策 3）且 fresh props 必击穿——报告预言成立。MarketTab 级 memo + 六个 props 稳定化（markets/ops/notify/onOpenOps/favorites/profileKind）：预估可砍 mutation 场景约一半渲染，但绝对值 16–57ms 本就在感知带下——收益无感知锚点，不值得为之引入 props 稳定化纪律的持续负担。**关案**。

## Considered Options

- **per-card React.memo**：`cardOf` 是直接函数调用非组件边界，先要改建 `h(Card, …)` 边界，再解决 badges 数组 / icon 元素 / onToggle 闭包三类 fresh props——工作量远超表面（报告预言实测成立），且无感知收益锚点——不采。
- **MarketTab 级 memo + props 稳定化**：见决策 4——收益存在（mutation 场景约砍半）但落点在感知带下，纯优化无体验差——不采（留作重开触发条件命中时的首选形态）。
- **维持现状**：实测数字全部在感知带下 + 零 long task——**采纳**。

## Consequences

- **重开触发条件**（未来评审命中才重开，不命中不重提）：① 单卡渲染成本显著上升（徽章逻辑 / 图片链 / 卡片结构加重）；② `MARKET_PAGE_SIZES` 上限上调；③ 探针复测任一常规场景 > 65ms 或出现 longtask ≥ 1；④ 真实用户渲染卡顿反馈。重开时首选形态 = MarketTab 级边界 + props 稳定化（非 per-card）。
- **复测方法**：`node scripts/probe-render-count.mjs`（手动运行不进 CI，verify-panel-mobile 同款惯例；产物 `node_modules/.dshm/render-probe/results.json`；插桩锚点漂移会显式报错而非静默测错）。
- **测量诚实性边界**：本机为服务器级 x86（headless Chromium），慢机器按比例放大——最大场景 37ms 对 65ms 感知线余量约 1.8×；dev UMD 参考数字约 2×（88–130ms），仅作最坏上界。
- **发布形态**：随 0.9.87+ 顺带入库（探针 + 本 ADR 均为开发工具/文档，无运行时行为变化）。
