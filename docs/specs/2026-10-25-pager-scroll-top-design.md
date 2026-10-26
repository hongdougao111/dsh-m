# 设计文档：市场分页回顶（pager scroll-to-top）· 方案 C

状态：**已对齐 / 随实施计划一并审批**（2026-10-25 CHECKPOINT A「接受：方案 C」；同日 grill-with-docs 第一轮 Q1–Q9 全按推荐收敛并回填本稿，术语已入 GLOSSARY）

## 背景与目标

### 病症

市场 tab 编号分页（页码器在列表尾部）翻页后视口停留在页尾，新页排序靠前的条目（默认 downloads-desc 下的头部条目）最先不可见，阅读顺序被倒置。

### 根因（已核实，非猜测）

- 回顶逻辑**存在**：`market-tab.jsx` `gotoPage` 自 0.7.0 task10 起调用 `scrollIntoView({block:"start"})`，注释明示「翻页：offset 定位 + 回滚列表顶部」。
- 回顶**失效**：浏览态锚点 `.dsvm-chipswrap` 是 `position:sticky; top:-14px` 吸顶元素（styles.js）。翻页时用户必然在列表下方 → chips 行处于 stuck 态、常驻滚动视口 → `scrollIntoView` 按元素**当前几何位置**判定「已在视口内」→ 空转（至多微调 14px）。
- **反证**：搜索态锚点 `.dsvm-searchmeta` 为普通流元素，搜索态翻页回顶实际生效——同一函数两条路径一好一坏，钉死 sticky 锚点是唯一病因。
- 版本排除：线上安装副本与仓内构建逐字节一致（0.10.16），非「新代码未发布」。

### 目标

1. 翻页（页码 / ‹ › / 页号跳转）后视口回到列表顶部；smooth 滚动、`prefers-reduced-motion: reduce` 时瞬时。
2. 不变式「offset 归零即回顶」：分类切换、搜索、排序、页大小、分区切换等一切回到第一页的交互都瞬时回顶。
3. 回顶手段不依赖任何子元素几何，免疫 sticky 陷阱；不触碰 0.9.76 吸顶自激循环的修复成果。

### 参考（dsh-market 钢人分析结论）

替换式编号分页翻页后回顶是行业压倒性惯例（GitHub search / npmjs / Chrome Web Store 等），「保持位置」专属无限滚动 / load-more。dsh-market 参考实现（`.dsh-research/dsh-market-clone`）用两层结构：`usePagination.goToPage` → `bodyRef.scrollTo({top:0,behavior:"smooth"})`（所有页移动）；`useLayoutEffect`（筛选态 deps）→ `scrollTop = 0`（所有回第一页的筛选变化）。其注释明示不变式："scroll back to the top of the shared body on any page move"。本设计对齐该不变式与所有权模型。

术语沉淀：本设计的四个领域词（回顶 / 页移动 / 筛选身份键 / 滚动容器）已按 grill Q9 入 `GLOSSARY.md`。

## 范围与非范围

### 范围

- `main.jsx`：滚动容器所有权显式化——shell 在 `.dshm-body`（main.jsx:828）上挂 `bodyRef`，作为 prop 下传 `MarketTab`。
- `market-tab.jsx` `gotoPage`：改为 `scrollBodyTop(bodyRef.current, preferredPagerBehavior())`（评审后建议 #1：统一字符串契约，弃 boolean 形态）；删除 `.dsvm-chipswrap` / `.dsvm-searchmeta` 的 `scrollIntoView` 分支（两路径合一）。
- `market-tab.jsx`：新增 `useLayoutEffect`，deps = `[filterScrollKey(zone, query)]`，触发 `scrollBodyTop(bodyRef.current, "instant")`（瞬时；zone 已在键内，分区切换由键变覆盖）。
- `market-state.js`：新增纯函数 `filterScrollKey(zone, query)` —— 筛选身份键，覆盖分区 + `query` 文本 / `category` / `sort` / `limit`，**不含 `offset`**（页移动不得触发该键变化）。
- `market-state.js`：新增薄封装 `scrollBodyTop(el, behavior)`（`behavior`: `"smooth" | "instant"`）与 `preferredPagerBehavior()`（读 `prefers-reduced-motion`，命中返回 `"instant"`，环境无 matchMedia 时默认 `"smooth"`）—— 容器直滚原语（`scrollTo({top:0,behavior})`，缺 `scrollTo` 时回退 `scrollTop = 0`；`el` 为 null 时 no-op）。

### 非范围

- 焦点管理与读屏公告（翻页后焦点留在 pager 按钮，本就合法）。
- 顶部页码器副本（回顶后向下翻页即标准动线，dsh-market 同款单页码器；grill Q8①）。
- 无限滚动 / load-more 模式、虚拟化。
- 收藏区（`favorite-zone.jsx`）内部的滚动行为（无编号页码器，不在病灶内；zone 切到收藏区时 layer-2 顺带回顶，属无害附带行为）。
- `.dshm-body` 既有 `overflow-anchor:none`（0.9.76）与 ZoneChips 吸顶 IO 测量逻辑——只回归验证，不改。

## 方案比较（CHECKPOINT A 已裁决，留档）

| 方案 | 内容 | 裁决 |
| --- | --- | --- |
| A | `gotoPage` 直滚容器，两路径合一 | 被 C 包含 |
| B | 保留 `scrollIntoView`，换非 sticky 锚点 | 否决——仍依赖子元素几何，留同类隐患 |
| **C（采纳）** | A + 「offset 归零即回顶」不变式（分类 / 页大小 / 搜索 / 排序 / 分区） | 用户拍板 2026-10-25 |

## 关键边界、组件与职责

| 单元 | 职责 | 依赖 |
| --- | --- | --- |
| `bodyRef`（main.jsx 持有） | 指向滚动容器 `.dshm-body` 的唯一权威引用；shell 是容器渲染者故由 shell 持有 | 无 |
| `scrollBodyTop(el, smooth)`（market-state.js 纯封装） | 容器直滚原语：null 安全、`scrollTo` 缺失回退、reduced-motion 折算 | 调用方传入容器元素 |
| `filterScrollKey(query)`（market-state.js 纯函数） | 把「筛选身份」折叠为稳定字符串键；`offset` 显式排除 | 无 |
| `MarketTab` layer-1（gotoPage） | 页移动（页码 / ‹ › / 跳转）→ smooth 回顶 | `bodyRef` prop |
| `MarketTab` layer-2（useLayoutEffect） | 筛选 / 分区身份变化（即 offset 归零）→ 瞬时回顶，useLayoutEffect 保证新内容首帧前落位 | `bodyRef` prop、`filterScrollKey` |

所有权模型与 dsh-market 一致：滚动容器是共享基础设施（"the shared body"），翻页与筛选两层各自调用同一原语，不重复实现。

## 数据流 / 控制流

- **页移动**：点击页码 → `gotoPage(p)` → `updateQuery({offset})`（状态 + 异步取数）**同时** `scrollBodyTop(bodyRef.current, preferredPagerBehavior())` 立即回顶，不等响应（响应到达时视口已在顶部，无跳动）；`reduced-motion` 命中时 `preferredPagerBehavior()` 返回 `"instant"`。
- **筛选 / 分区变化**：`updateQuery`/`setZone` → `query` 筛选字段或 `zone` 变化 → `filterScrollKey` 键变 → layout effect 在 paint 前瞬时 `scrollTop = 0`。
- **`gotoPage(1)`（从第 3 页点「1」）**：offset 64→0 但筛选身份未变 → 仅 layer-1 smooth，layer-2 不触发——两层互不重叠。
- **不回顶白名单（grill Q4）**：mutation 后 `reload()`、后台静默换新（probe 二段）、快照 background 刷新——筛选身份键不变且不经 `gotoPage` → 滚动位置原样保留；单测以「同输入恒同键」为回归锚。
- 初始挂载：layer-2 首渲染即触发一次 `scrollTop = 0`（幂等、本就在顶部，与 dsh-market 行为一致）。

## 错误处理与回退

- `bodyRef.current` 为 null（面板未挂载 / SSR 冒烟）→ `scrollBodyTop` no-op。
- 容器无 `scrollTo`（旧 webview）→ `scrollTop = 0` 回退（与 dsh-market 同款兜底）。
- 末页内容不足一屏：`scrollTop` 已为 0，滚动原语天然幂等。
- 页号跳转非法（`pageJumpValid` false）→ `jumpToPage` 早退，不滚动。
- 与 0.9.76 的相容性：`scrollTo(0)` 落点为 chips 行自然位形（IO 非 stuck 稳态），`.dshm-body` 已 `overflow-anchor:none`，不进哨兵 ±30px 边界带，自激循环无驱动器。

## 测试策略

1. **纯函数单测**（`tests/client-market-state.test.mjs`，node:test）：
   - `filterScrollKey`：同一 query 稳定；`query` 文本 / `category` / `sort`（字段或方向）/ `limit` 任一变化 → 键变化；**仅 `offset` 变化 → 键不变**（防页移动误触发 layer-2 的回归锚）。
   - `scrollBodyTop`：注入伪造容器对象断言 `scrollTo` 调用参数（smooth / instant）、`scrollTo` 缺失时回退 `scrollTop` 赋值、null 安全。
2. **SSR 冒烟**：既有 `client-render-smoke` 保持绿（effect 内 null 守卫，`renderToString` 不跑 effect 亦安全）。
3. **手工回归清单**（发版前过一遍）：
   - 第 3 页页尾点「4」→ smooth 回顶；`prefers-reduced-motion: reduce` → 瞬时；
   - 搜索态翻页 → 回顶（原 `.dsvm-searchmeta` 路径并入后不回退）；
   - 深页位切分类 / 改页大小 / 改排序 / 清搜索 → 瞬时回顶；
   - 社区 ↔ 精选分区切换 → 回顶；
   - 翻页后 chips 吸顶行无高频蹦跳（0.9.76 回归项）。
4. **全量**：`pnpm test` 绿；构建产物 `lib/client.js` 经 `pnpm build` 重出。

## 未决事项

- 无阻塞项。备忘：读屏公告（aria-live 播报「第 N 页」）与翻页后焦点移交给首个结果，列为后续可选增强，不进本设计。
