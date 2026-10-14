# dsh-m 手机窄屏自适应（面板头部两行重排 + 窄视口默认全屏）实施计划

## 目标

- 修复 0.9.82 手机实拍暴露的头部溢出 bug：`.dshm-head` 单行 no-wrap flex 最小内容宽 ~440-470px，手机面板内容宽仅 330-365px，行尾溢出被 `.dshm-panel{overflow:hidden}` 裁掉——winctl（还原/关闭）不可见不可点、版本 chip 拦腰截断、标题逐词换行、seg 键逐字竖排。
- 落地 grilling 共识 L1（头部容器查询两行重排）+ L2（窄视口默认全屏、overlay 8px、触控目标 36px），发布 0.9.83。

## 架构快照

- **载体**：容器查询。`.dshm-panel` 加 `container-type:inline-size`，规则写 `@container (max-width:600px)`。不用视口媒体查询——面板有还原居中 / `.abs` 拖拽位 / `.full` 全屏三形态，视口宽 ≠ 面板宽。面板宽高均为 `min(920px,100%)` / `min(680px,86vh)` 公式派生、不依赖内容，inline-size 包含安全；灯箱 portal 挂 body（0.9.73 先例）、分类行 sticky 在 `.dshm-body` 滚动容器内，均不受祖先 inline-size 包含影响（已核实；面板既有 `backdrop-filter` 使 fixed 后代包含块本就是面板，加 inline-size 不引入新变化）。
- **断点同值 600px**：容器断点（两行重排）、视口断点（默认全屏判定 + overlay 8px padding）。
- **两行布局**：行1 = `[短标题 ⋯spacer⋯ 版本chip winctl]`，行2 = `[seg 三键拉通]`。DOM 顺序零改动（`title→divider→seg→spacer→chip→winctl`），纯 CSS `flex-wrap + order`；divider 窄容器隐藏。
- **标题**：JSX 双 span（`dshm-title-full` 全称 / `dshm-title-short` 短标题「插件市场」，复用现成 `title.panel` i18n key），基础规则隐藏 short，窄容器切换。
- **版本 chip**：常态窄容器隐藏；warn 态缩为「⬆」icon。裸文本节点包 span（`dshm-dshchip-name`、`dshm-up-v`），宽屏文本序列逐字符不变；**版本 chip 根元素加专属类 `dshm-verchip`（保留 `dshm-dshchip` 基础类，样式零变化），隐藏/收拢规则全部以 `.dshm-verchip` 收窄——头部 profile 徽标（`span.dshm-dshchip`，仅非 web profile 渲染）不在共识 Q7 范围内，不得连带隐藏（评审 R5）**。
- **默认全屏**：`MarketPanel` 的 `full` 初始值加窄视口判定（`matchMedia("(max-width: 600px)")`，仅初始挂载一次、不随 resize 跟随）；窄视口下 FS_KEY（`dshm-panel-fullscreen`）记忆不生效；宽视口行为逐字节同今日。
- **兜底**：容器类规则按 CSS 条件规则组机制等效实现——`.dshm-title-short` 基础隐藏不依赖容器查询；其余新规则均为整块 at-rule（`@supports`/`@container`/`@media` 顶层兄弟），不支持容器查询的浏览器对未知 at-rule 整块忽略，效果等同「全部包进 @supports」（评审 R7：勿机械再嵌套）。不支持的浏览器视觉与旧版逐字节一致。
- **既有机制衔接**：CSS 改动经 `ensureCss` 的 djb2 哈希自愈（`data-ver` 变化自动替换旧样式表，长驻页面热更安全）；`api()` 为纯 fetch、失败被各调用点 catch（verify 脚本对未桩 method 回 `{ok:false}` 即落既有错误态，头部照常渲染）。

## 全局约束

- 设计共识（grilling Q1-Q10，用户已确认）为唯一行为依据；范围红线：**不动** ZoneChips 分类行、卡片网格、灯箱、设置页、遮罩关闭契约（0.9.27）、拖拽位置模型（ADR-0017）。
- 宽视口（容器 >600px 且视口 >600px）行为逐字节同 0.9.82。既有测试**仅** `tests/client-render-smoke.test.mjs` 两处断言同步改写（评审 R1/R5：L166 warn 类名锚、L167 `⬆ v…` 文本锚——Task 5 的 span 化/专属类必拆开这两处字面量；0.9.82「一处既有用例标题改写」先例同款），其余既有测试零改写。
- 仓库惯例：CSS 注释写透选型与不变量（不开 ADR）；verify 脚本手动运行不进 CI；CHANGELOG 中英双语、zh 前 en 后、版本倒序置顶。
- 无额外版本/依赖约束（零新增依赖；playwright-core、esbuild 均已在 devDependencies）。

## 输入工件

- 设计共识：本文件「共识速览」节（对话共识已内嵌，自包含）。
- 相关代码：`src/client/main.jsx`——CSS 模板（L303-676）、`DshmVersionChip`（L3261-3337）、`MarketPanel` full 初始化（L3386-3403）、头部 JSX（L3785-3848）、`self-check` 缓存键 `dshm-selfcheck`（`src/client/self-check.js:18`，box 形状 `{ts, data:{current,latest,outdated,ahead}}`）、`API="/dshm"`（L11）、`pluginVersion` 仅 `ping` 成功回调 set（L3647-3658）。
- 惯例参照：`tests/client-lightbox.test.mjs`（源锚写法）、`tests/client-render-smoke.test.mjs`（SSR 渲染冒烟）、`scripts/verify-lightbox.mjs`（手动真浏览器脚本写法：本地 http 源使 localStorage 可用、`--no-sandbox`、pageerror 日志、results 落盘）。

### 共识速览（Q1-Q10 全按推荐，用户 2026-10-14 确认）

| # | 决策 |
|---|---|
| Q1 | 容器查询，`.dshm-panel` 设 `container-type:inline-size` |
| Q2 | 容器断点与视口判定统一 600px |
| Q3 | 新规则对不支持容器查询的浏览器零生效（等效 @supports 兜底，实现机制见架构快照/Task 3 注释） |
| Q4 | 行1 `[短标题 spacer chip winctl]` / 行2 `[seg 拉通]`，divider 窄容器隐藏 |
| Q5 | 双 span 切换短标题「插件市场」（`title.panel` 现成 key） |
| Q6 | seg 三键 `flex:1` 均分、nowrap、`padding:0 10px`、高 36px；winctl 同步 36px |
| Q7 | 版本 chip 常态隐藏、warn 态缩 ⬆ icon（tooltip/自升级语义不变）；评审 R5 修订：以专属类 `dshm-verchip` 收窄，profile 徽标不受影响 |
| Q8 | DOM 顺序不动，纯 CSS order |
| Q9 | 默认全屏：初始挂载按视口 ≤600px 判定一次；全屏优先于记忆；不随 resize 跟随 |
| Q10 | overlay 窄视口 padding 8px；不做 safe-area；v0.9.83 双语 CHANGELOG；不开 ADR；源锚 + verify 脚本（不进 CI）；红线见全局约束 |

事实核验细化（已在对话确认）：① FS_KEY 与窄视口的优先级——窄视口恒全屏、宽视口 FS_KEY 照旧；② warn chip 裸文本节点需包 span 才能纯 CSS 收拢；③ matchMedia 守卫照 FS_KEY 同款 try/catch 防御。

### 评审修订记录（独立评审，全部接受，2026-10-14）

| 编号 | 严重度 | 一句话 | 落点 |
|---|---|---|---|
| R1 | 阻断 | Task 5 span 化必打破 render-smoke:167 文本锚 | 全局约束 + Task 5 Step 3 |
| R2 | 重要 | 原 A6 空转（pluginVersion 恒 null，chip 不渲染） | Task 8：/dshm ping 桩 + A6b 非空转化 + A6a warn 收拢 |
| R3 | 重要 | setContent 禁 localStorage，偏离 verify-lightbox 惯例 | Task 8：本地 http server + goto |
| R4 | 重要 | FS_KEY 优先级 2×2 矩阵无行为验证 | Task 8：A8/B4 两条断言 |
| R5 | 重要 | `:not(.warn)` 连带隐藏 profile 徽标，超出 Q7 范围 | 专属类 `dshm-verchip`（Task 3/5/8） |
| R6 | 建议 | 测试文件数 74→73 | Task 7 |
| R7 | 建议 | Q3 字面与实现机制对照说明防机械「全包」 | Task 3 CSS 注释 |
| R8 | 建议 | 脚本缺 --no-sandbox/pageerror/results.json | Task 8 |
| N1（第 2 轮） | 阻断 | Task 2 test5 正则内层括号未转义 → 测试文件解析失败 | 改为 includes 断言（Task 2，评审推荐方案） |
| N2（第 2 轮） | 建议 | A6b/A6a chip 断言存在 ping 往返竞态（$eval 不自动等待） | 两处前置 waitForSelector（Task 8） |
| N3（第 3 轮） | 阻断 | A6b 的 waitForSelector 默认 state:'visible'，而常态 chip 按设计 display:none → 必超时崩溃 | A6b 行改 `state:'attached'`（A6a warn 根可见，保持默认） |

## 文件结构与职责

- Modify: `src/client/main.jsx`——①CSS 模板末尾追加「手机窄屏自适应」块；②头部标题双 span；③`DshmVersionChip` 两分支（根类加 `dshm-verchip` + 裸文本 span 化）；④`full` 初始值窄视口判定。四个改动点互不重叠，可独立验证。
- Modify: `tests/client-render-smoke.test.mjs`——仅 L166/L167 两处断言同步改写（评审 R1/R5，唯一被允许的既有测试改动）。
- Create: `tests/client-mobile-head.test.mjs`——main.jsx 源串断言（client-lightbox.test.mjs 同款惯例），锁 CSS 关键规则与 JSX 结构。
- Create: `scripts/verify-panel-mobile.mjs`——playwright-core 真浏览器几何/计算样式验证（verify-lightbox.mjs 同款惯例：本地 http 源 + /dshm 桩；手动运行不进 CI）。
- Modify: `package.json`——`version` `0.9.82` → `0.9.83`。
- Modify: `CHANGELOG.md`——`## 中文`（L9）与 `## English`（L586）两区块顶部各加 `### 0.9.83` 条目。

任务依赖：Task 2（测试）→ Task 3-6（四个实现点，可按序各自转绿）→ Task 7（全量回归）→ Task 8（真浏览器验证）→ Task 9（版本/CHANGELOG/提交）。

---

### Task 1: 基线确认

- 目标：改动前确认仓库处于全绿基线，记录测试总数。
- Files: 无改动。
- 接口契约
  - Consumes: 无
  - Produces: 基线测试总数（写入 Task 9 CHANGELOG「验证」行的基线引用）
- 验证范围：`npm test` 全绿。

- [ ] Step 1: 跑基线
- Run: `cd /home/ubuntu/workspace/dsh-m && npm test 2>&1 | tail -5`
- Expected: `# pass N`（N 应为 1435 上下，与 0.9.82 CHANGELOG 一致）、`# fail 0`。若基线即红，停下报告，不得带病开工。

### Task 2: 新增源锚测试（失败先行）

- 目标：为全部新规则/结构写断言，当前全部失败（红灯）。
- Files: Create `tests/client-mobile-head.test.mjs`。
- 接口契约
  - Consumes: `src/client/main.jsx` 源串（readFileSync）
  - Produces: 断言字面量清单（Task 3-6 的实现必须逐字命中这些字面量）
- 验证范围：`node --test tests/client-mobile-head.test.mjs`。

- [ ] Step 1: 写测试文件，全文如下

```js
// 0.9.83 手机窄屏自适应源锚（client-lightbox.test.mjs 同款惯例：includes 级，
// 红灯语义是「文本变了」而非「行为变了」；几何/计算样式走 scripts/verify-panel-mobile.mjs）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "src/client/main.jsx"), "utf8");

test("0.9.83 容器查询载体与断点（共识 Q1/Q2/Q3）", () => {
  assert.ok(src.includes("@supports (container-type: inline-size)"), "@supports 兜底在");
  assert.ok(src.includes(".dshm-panel{container-type:inline-size}"), "面板容器声明在");
  assert.ok(src.includes("@container (max-width:600px){"), "容器断点 600 在");
  assert.ok(src.includes("@media (max-width:600px){.dshm-overlay{padding:8px}}"), "overlay 窄视口 8px 在");
  assert.ok(src.includes(".dshm-title-short{display:none}"), "短标题基础隐藏（老浏览器逐字节同旧版）");
});

test("0.9.83 头部两行重排（共识 Q4/Q6/Q8）", () => {
  assert.ok(src.includes(".dshm-head{flex-wrap:wrap;row-gap:6px}"), "头部换行在");
  assert.ok(src.includes(".dshm-head-divider{display:none}"), "分隔线窄容器隐藏在");
  assert.ok(src.includes(".dshm-spacer{order:1}"), "spacer order 在");
  assert.ok(src.includes(".dshm-head>.dshm-dshchip{order:2}"), "chip order 在（版本 chip 与 profile 徽标都靠右）");
  assert.ok(src.includes(".dshm-winctl{order:3}"), "winctl order 在");
  assert.ok(src.includes(".dshm-winctl button{height:36px}"), "winctl 触控 36 在");
  assert.ok(src.includes(".dshm-seg{order:4;flex:1 1 100%}"), "seg 换行拉通在");
  assert.ok(src.includes(".dshm-seg button{flex:1;justify-content:center;white-space:nowrap;padding:0 10px;height:36px}"), "seg 均分/nowrap/36px 在");
});

test("0.9.83 标题双 span 切换（共识 Q5）", () => {
  assert.ok(src.includes('className: "dshm-title-full"'), "全称 span 在");
  assert.ok(src.includes('className: "dshm-title-short"'), "短标题 span 在");
  assert.ok(src.includes('lookup("title.panel")'), "短标题用现成 title.panel key");
});

test("0.9.83 版本 chip 窄容器收拢（共识 Q7 + 评审 R5 专属类收窄）", () => {
  assert.ok(src.includes(".dshm-head>.dshm-verchip:not(.warn){display:none}"), "常态版本 chip 隐藏在（profile 徽标不命中）");
  assert.ok(src.includes(".dshm-verchip.warn .dshm-dshchip-name,.dshm-verchip.warn .dshm-dshchip-v,.dshm-verchip.warn .dshm-up-v{display:none}"), "warn 收拢为 icon 在");
  assert.ok(src.includes('className: "dshm-dshchip dshm-verchip"'), "常态分支专属类在");
  assert.ok(src.includes('className: "dshm-dshchip dshm-verchip warn"'), "warn 分支专属类在");
  assert.ok(src.includes('className: "dshm-dshchip-name"'), "前缀文本节点已包 span");
  assert.ok(src.includes('className: "dshm-up-v"'), "升级版本号文本节点已包 span");
});

test("0.9.83 窄视口默认全屏初始化（共识 Q9）", () => {
  assert.ok(src.includes('window.matchMedia("(max-width: 600px)")'), "窄视口判定在");
  assert.ok(src.includes('window.matchMedia("(max-width: 600px)").matches) return true'), "窄视口恒全屏先于 FS_KEY");
});
```

- [ ] Step 2: 运行并确认失败
- Run: `cd /home/ubuntu/workspace/dsh-m && node --test tests/client-mobile-head.test.mjs 2>&1 | tail -8`
- Expected: 5 个 test 全部 fail（断言的字符串尚不存在）。

### Task 3: CSS 窄容器块

- 目标：追加「手机窄屏自适应」CSS 块，Task 2 前两个 test 转绿。
- Files: Modify `src/client/main.jsx`（CSS 模板字符串末尾：`.dshm-compat-risk{...}` 行之后、闭合反引号之前，约 L675-676）。
- 接口契约
  - Consumes: Task 2 的断言字面量（逐字命中）
  - Produces: `.dshm-title-full`/`.dshm-title-short`/`.dshm-dshchip-name`/`.dshm-up-v`/`.dshm-verchip` 的显示规则（Task 4/5 的 JSX 类名必须与此对应）
- 验证范围：`node --test tests/client-mobile-head.test.mjs`。

- [ ] Step 1: 在 CSS 模板末尾（`.dshm-compat-risk` 规则后、闭合反引号前）追加以下整块（注意缩进为零，与模板内其他规则一致）

```css
/* ---------- 手机窄屏自适应（0.9.83，主人手机截图驱动） ---------- */
/* 病灶（0.9.82 实拍）：.dshm-head 单行 no-wrap flex 最小内容宽 ~440-470px，手机面板
   内容宽仅 330-365px → 行尾溢出被 .dshm-panel overflow:hidden 裁掉——winctl（还原/关闭）
   不可见不可点、版本 chip 拦腰截断、标题逐词换行、seg 键逐字竖排。
   载体选型：容器查询而非视口媒体查询——面板有还原居中/.abs 拖拽位/.full 全屏三形态，
   视口宽 ≠ 面板宽（600px 视口→568px 面板仍溢出）；容器查询跟随面板实际宽度。面板宽高
   均为 min(920px,100%)/min(680px,86vh) 公式派生、不依赖内容，inline-size 包含安全；
   灯箱 portal 挂 body（0.9.73）、分类行 sticky 在 .dshm-body 滚动容器内，均不受祖先
   inline-size 包含影响。断点：容器 600px（两行重排）与视口 600px（默认全屏判定 +
   overlay 8px）同值。
   兜底语义说明（共识 Q3 + 评审 R7）：「不支持容器查询的浏览器新规则零生效」按 CSS
   条件规则组机制等效落地——.dshm-title-short 基础隐藏不依赖容器查询（老浏览器也要
   生效）；其余新规则都是整块 at-rule（@supports/@container/@media 顶层兄弟），不支持
   容器查询的浏览器对未知 at-rule 整块忽略，效果等同全部包进 @supports。不要机械再
   嵌套一层。 */
.dshm-title-short{display:none}
/* 兜底：不支持容器查询的浏览器只生效本条——短标题隐藏，视觉与旧版逐字节一致 */
@supports (container-type: inline-size) {
  .dshm-panel{container-type:inline-size}
}
/* 两行重排：行1 [短标题 ⋯spacer⋯ chip winctl]，行2 [seg 拉通]。DOM 顺序不动
  （title→divider→seg→spacer→chip→winctl），全靠 order+wrap——源锚/tab 序/读屏序
  零扰动；视觉序与 DOM 序不一致（seg 在 DOM 前、视觉在后），面板内元素少可接受 */
@container (max-width:600px){
  .dshm-head{flex-wrap:wrap;row-gap:6px}
  .dshm-head-divider{display:none}
  .dshm-title-full{display:none}
  .dshm-title-short{display:inline}
  .dshm-spacer{order:1}
  .dshm-head>.dshm-dshchip{order:2}
  .dshm-winctl{order:3}
  .dshm-winctl button{height:36px}
  .dshm-seg{order:4;flex:1 1 100%}
  .dshm-seg button{flex:1;justify-content:center;white-space:nowrap;padding:0 10px;height:36px}
  /* 版本 chip（共识 Q7 + 评审 R5 收窄）：常态隐藏（设置页随时可见）；warn 态缩为 ⬆
     icon——文字 span 全隐藏，tooltip 与点击自升级语义不变。规则以版本 chip 专属类
     .dshm-verchip 收窄：头部另有 profile 徽标（span.dshm-dshchip，仅非 web profile
     渲染），不在共识范围内，不得连带隐藏 */
  .dshm-head>.dshm-verchip:not(.warn){display:none}
  .dshm-verchip.warn .dshm-dshchip-name,.dshm-verchip.warn .dshm-dshchip-v,.dshm-verchip.warn .dshm-up-v{display:none}
}
/* overlay 窄视口兜底：还原态 8px（.full 的 padding:0 特异性 (0,2,0)>(0,1,0) 自然保持）；
   窄视口默认全屏的 JS 判定在 MarketPanel full 初始化 */
@media (max-width:600px){.dshm-overlay{padding:8px}}
```

- [ ] Step 2: 运行并确认部分转绿
- Run: `cd /home/ubuntu/workspace/dsh-m && node --test tests/client-mobile-head.test.mjs 2>&1 | tail -8`
- Expected: 前两个 test（容器查询载体/两行重排）pass；后三个（标题双 span / chip span / matchMedia）仍 fail。

### Task 4: 标题双 span JSX

- 目标：头部标题渲染双 span，Task 2 的「标题双 span」test 转绿。
- Files: Modify `src/client/main.jsx`（`MarketPanel` 头部 JSX，锚点 `h("span", { className: "dshm-title" }, lookup("title.full")),`，约 L3803）。
- 接口契约
  - Consumes: Task 3 的 `.dshm-title-full`/`.dshm-title-short` CSS；i18n 现成 key `title.full`/`title.panel`
  - Produces: 无
- 验证范围：`node --test tests/client-mobile-head.test.mjs` + `node --test tests/client-render-smoke.test.mjs`。

- [ ] Step 1: 将
  `h("span", { className: "dshm-title" }, lookup("title.full")),`
  改为

```js
        h("span", { className: "dshm-title" },
          h("span", { className: "dshm-title-full" }, lookup("title.full")),
          h("span", { className: "dshm-title-short" }, lookup("title.panel")),
        ),
```

- [ ] Step 2: 运行并确认
- Run: `cd /home/ubuntu/workspace/dsh-m && node --test tests/client-mobile-head.test.mjs tests/client-render-smoke.test.mjs 2>&1 | tail -6`
- Expected: 标题 test pass；render-smoke 全绿（`dshm-winctl` 等既有锚不受影响）；chip/matchMedia 两个 test 仍 fail。

### Task 5: 版本 chip 专属类 + 文本节点 span 化 JSX（含 render-smoke 两处断言同步改写）

- 目标：`DshmVersionChip` 两分支根类加 `dshm-verchip`、裸文本包 span，Task 2 的「版本 chip」test 转绿；宽屏文本序列逐字符不变（`"dsh-m "` 尾随空格保留；`"⬆"` 与 `" v…"` 拼接次序不变）。同步改写 render-smoke 仅有的两处受影响断言（评审 R1/R5）。
- Files: Modify `src/client/main.jsx`（`DshmVersionChip`，锚点 `if (state.kind === "outdated")` 分支与函数尾部常态 return，约 L3313-3336）；Modify `tests/client-render-smoke.test.mjs`（L166/L167 两行）。
- 接口契约
  - Consumes: Task 3 的 `.dshm-verchip` 隐藏/收拢规则
  - Produces: render-smoke 新断言字面量（Task 7 回归依赖其转绿）
- 验证范围：`node --test tests/client-mobile-head.test.mjs` + `node --test tests/client-render-smoke.test.mjs`。

- [ ] Step 1: outdated 分支（约 L3313-3326）——root className 由 `"dshm-dshchip warn"` 改为 `"dshm-dshchip dshm-verchip warn"`；children 由

```js
      "dsh-m ",
      h("span", { className: "dshm-dshchip-v" }, `v${version}`),
      busy ? h(Spin) : h("span", { className: "dshm-up" }, `⬆ v${state.latest}`),
```
  改为

```js
      h("span", { className: "dshm-dshchip-name" }, "dsh-m "),
      h("span", { className: "dshm-dshchip-v" }, `v${version}`),
      busy ? h(Spin) : h("span", { className: "dshm-up" }, "⬆", h("span", { className: "dshm-up-v" }, ` v${state.latest}`)),
```

- [ ] Step 2: 常态分支（约 L3331-3336）——root className 由 `"dshm-dshchip"` 改为 `"dshm-dshchip dshm-verchip"`；children 由

```js
    "dsh-m ",
    h("span", { className: "dshm-dshchip-v" }, `v${version}`),
```
  改为

```js
    h("span", { className: "dshm-dshchip-name" }, "dsh-m "),
    h("span", { className: "dshm-dshchip-v" }, `v${version}`),
```

- [ ] Step 3: `tests/client-render-smoke.test.mjs` 两处断言同步改写（「outdated 点亮 warn」用例内）：
  - L166 `assert.ok(html.includes('dshm-dshchip warn'), 'warn 样式在')` → `assert.ok(html.includes('dshm-verchip warn'), 'warn 样式在')`（断言意图不变：warn 样式在；类序插入 dshm-verchip 后原字面量不再连续）；
  - L167 `assert.ok(html.includes('⬆ v0.9.1'), '箭头 + 最新版本号在')` → `assert.ok(html.includes('⬆<span class="dshm-up-v"> v0.9.1</span>'), '箭头 + 最新版本号在')`（renderToStaticMarkup 对 `"⬆"` 文本节点 + 相邻 span 的序列化是确定性的：无空白节点间隔）。
  同文件 L153 `html.includes('dshm-dshchip')` 与 L155 `!html.includes('⬆')` 语义不变、零改写。

- [ ] Step 4: 运行并确认
- Run: `cd /home/ubuntu/workspace/dsh-m && node --test tests/client-mobile-head.test.mjs tests/client-render-smoke.test.mjs 2>&1 | tail -6`
- Expected: 源锚 5 个 test 全部 pass；render-smoke 全绿（含改写后的两条断言）。

### Task 6: 窄视口默认全屏初始化

- 目标：`full` 初始值加窄视口判定，Task 2 的「默认全屏」test 转绿。
- Files: Modify `src/client/main.jsx`（`MarketPanel` 内 `FS_KEY` 声明之后的 `useState` 初始化，锚点 `const [full, setFull] = useState(() => {`，约 L3386）。
- 接口契约
  - Consumes: 既有 `FS_KEY`/`toggleFull`（零改动）
  - Produces: 无
- 验证范围：`node --test tests/client-mobile-head.test.mjs` + `node --test tests/client-render-smoke.test.mjs`。

- [ ] Step 1: 将 `const [full, setFull] = useState(() => { ... })` 初始化体改为

```js
  const [full, setFull] = useState(() => {
    try {
      // 窄视口（手机）恒全屏初始化（0.9.83 共识 Q9）：仅初始挂载判定一次、不随 resize
      // 跟随（旋转后可手动 ⛶ 切换）；FS_KEY 记忆在窄视口下不生效——防「手动还原一次被
      // 永久记住 361px 挤压态」。宽视口行为逐字节同今日（FS_KEY 照旧）。
      // matchMedia 守卫与 FS_KEY 同款防御：SSR 无 window / jsdom 缺 matchMedia 安全回落。
      if (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 600px)").matches) return true;
      return typeof window !== "undefined" && window.localStorage ? window.localStorage.getItem(FS_KEY) === "1" : false;
    } catch {
      return false;
    }
  });
```

- [ ] Step 2: 运行并确认
- Run: `cd /home/ubuntu/workspace/dsh-m && node --test tests/client-mobile-head.test.mjs tests/client-render-smoke.test.mjs 2>&1 | tail -4`
- Expected: 全部 pass。

### Task 7: 全量回归

- 目标：确认既有 73 个测试文件（新增 1 个后共 74）零破坏。
- Files: 无新改动。
- 接口契约
  - Consumes: Task 3-6 全部改动
  - Produces: 全绿基线（Task 9 CHANGELOG 引用最终数字）
- 验证范围：`npm test` + `npm run typecheck`。

- [ ] Step 1: 全量测试
- Run: `cd /home/ubuntu/workspace/dsh-m && npm test 2>&1 | tail -5`
- Expected: `# pass 基线+5`、`# fail 0`（`pretest` 会先 build，esbuild 打包成功即顺带验证 JSX 语法）。

- [ ] Step 2: 类型检查
- Run: `cd /home/ubuntu/workspace/dsh-m && npm run typecheck`
- Expected: 零错误退出。

### Task 8: 真浏览器验证脚本

- 目标：393×852 窄视口 + 1280×800 宽视口双视角、FS_KEY 2×2 矩阵、chip 双态，几何与计算样式全链路断言（源锚测不了的盲区）。
- Files: Create `scripts/verify-panel-mobile.mjs`。
- 接口契约
  - Consumes: Task 3-6 全部改动；devDependencies 的 esbuild/playwright-core + 本机可用 Chromium（`~/.cache/ms-playwright`，verify-lightbox 同前提）；self-check 缓存键 `dshm-selfcheck`（box `{ts, data}`）与 FS_KEY `dshm-panel-fullscreen`
  - Produces: 手动验证命令 `node scripts/verify-panel-mobile.mjs`（不进 CI）
- 验证范围：脚本自身运行结果。
- 环境前提：本机有 playwright-core 可用的 Chromium；缺失时按脚本输出提示安装后重跑（与 verify-lightbox.mjs 同一前提，不阻塞 Task 9 的 CI 内验证）。零外网依赖（/dshm 全桩）。

- [ ] Step 1: 写脚本，全文如下

```js
// 面板手机窄屏自适应（0.9.83）真浏览器验证——手动运行，不进 npm test（verify-lightbox.mjs 同款惯例）。
// 用法：node scripts/verify-panel-mobile.mjs [--out DIR]（默认 node_modules/.dshm/panel-probe，已 gitignore）
// 方法：esbuild 打包 main.jsx + 测试导出入口（放 src/client/ 才能解析相对 require，用后即删），
// UMD react 内嵌，真实 CSS 经 __Apply→ensureCss 注入，__MountPanel 挂真实面板。
// 本地 http 源 + /dshm 桩（评审 R2/R3）：setContent 的 opaque origin 会禁 localStorage、
// fetch 必败会让 pluginVersion 恒 null（chip 根本不渲染，断言空转）——故照 verify-lightbox
// 起 http 服务：GET / = 页面；POST /dshm 桩，ping 回真实形状（pluginVersion/profile 生效，
// chip 真渲染），其余 method 回 {ok:false}（api 抛错 → 既有 catch 落错误态/静默）。
// 覆盖：窄视口默认全屏 + FS_KEY 2×2 矩阵（评审 R4）/ winctl 可达 / 头部零溢出 / 标题切换 /
// seg 36px 触控 / 版本 chip 常态渲染且隐藏（A6b 非空转）与 warn 收拢为 ⬆（A6a，预置
// dshm-selfcheck 缓存）/ 还原态 overlay 8px / 宽视口回归。
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require2 = createRequire(join(root, 'package.json'))
const esbuild = require2('esbuild')
const { chromium } = require2('playwright-core')

const argv = process.argv.slice(2)
const outArg = argv.indexOf('--out')
const OUT = join(root, outArg >= 0 ? argv[outArg + 1] : 'node_modules/.dshm/panel-probe')
mkdirSync(OUT, { recursive: true })

const entry = join(root, 'src/client/.verify-panel-entry.jsx')
writeFileSync(entry, readFileSync(join(root, 'src/client/main.jsx'), 'utf8') + '\nmodule.exports = { __Apply: apply, __MountPanel: mountPanel };\n')
let bundle
try {
  await esbuild.build({
    entryPoints: [entry], bundle: true, platform: 'browser', format: 'cjs',
    outfile: join(OUT, 'bundle.cjs'), external: ['react', 'react-dom'],
    loader: { '.jsx': 'jsx' }, logLevel: 'silent',
  })
  bundle = readFileSync(join(OUT, 'bundle.cjs'), 'utf8')
} finally {
  try { rmSync(entry, { force: true }) } catch { /* 清理失败不阻塞 */ }
}
const reactUmd = readFileSync(join(root, 'node_modules/react/umd/react.development.js'), 'utf8')
const reactDomUmd = readFileSync(join(root, 'node_modules/react-dom/umd/react-dom.development.js'), 'utf8')

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<script>${reactUmd}<\/script>
<script>${reactDomUmd}<\/script>
<script>
window.__req = (n) => (n === 'react' ? window.React : n === 'react-dom' ? window.ReactDOM : null);
window.__dshm = (function (module, exports, require) {
${bundle}
  return module.exports;
})({ exports: {} }, {}, window.__req);
window.__dshm.__Apply({ effect: (fn) => fn(), inject: () => {}, slots: { inject: () => {}, register: () => {} } });
window.__boot = function () { window.__dshm.__MountPanel(); };
<\/script></body></html>`

const results = []
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }

// 本地 http 源（localStorage 可用，等价真实宿主；评审 R3）+ /dshm 桩（评审 R2）
const http = await import('node:http')
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (req.method === 'POST' && url.pathname === '/dshm') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      let method = ''
      try { method = JSON.parse(body || '{}').method || '' } catch { /* 畸形 body 按未知 method */ }
      const json = (obj) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)) }
      if (method === 'ping') return json({ ok: true, version: '0.9.82', profile: { name: 'web', kind: 'web', source: 'fallback' } })
      return json({ ok: false, error: 'probe-stub' }) // market/installed/self-check… → api 抛错 → 既有 catch 落错误态/静默
    })
    return
  }
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end(html)
})
await new Promise((ready) => server.listen(0, '127.0.0.1', ready))
const BASE = `http://127.0.0.1:${server.address().port}/`

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const wire = (p) => { p.on('pageerror', (e) => console.log('PAGEERROR', e.message)) }
const boot = async (page) => { await page.evaluate(() => window.__boot()); await page.waitForSelector('.dshm-panel', { timeout: 5000 }) }
const newPage = async (viewport) => {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  wire(page)
  await page.goto(BASE, { waitUntil: 'load' })
  return { ctx, page }
}
try {
  // ---- A 组：窄视口 393×852（手机竖屏）·干净 context ----
  const a = await newPage({ width: 393, height: 852 })
  await boot(a.page)

  ok('A1 窄视口默认全屏（FS_KEY 未设置）',
    await a.page.$eval('.dshm-panel', (el) => el.className.includes('full')))

  ok('A2 winctl 完整落在面板内（还原/关闭可达）',
    await a.page.$eval('.dshm-panel', (panel) => {
      const pr = panel.getBoundingClientRect()
      const wr = panel.querySelector('.dshm-winctl').getBoundingClientRect()
      return wr.left >= pr.left && wr.right <= pr.right + 0.5 && wr.top >= pr.top && wr.bottom <= pr.bottom + 0.5
    }))

  ok('A3 head 零横向溢出',
    await a.page.$eval('.dshm-head', (el) => el.scrollWidth <= el.clientWidth))

  const title = await a.page.$eval('.dshm-title', (el) => ({
    full: getComputedStyle(el.querySelector('.dshm-title-full')).display,
    short: getComputedStyle(el.querySelector('.dshm-title-short')).display,
  }))
  ok('A4 窄容器短标题显/全称隐', title.full === 'none' && title.short !== 'none', JSON.stringify(title))

  const seg = await a.page.$$eval('.dshm-seg button', (bs) => {
    const widths = bs.map((b) => b.getBoundingClientRect().width)
    return { h: bs[0].getBoundingClientRect().height, ws: getComputedStyle(bs[0]).whiteSpace, widths }
  })
  const even = seg.widths.every((w) => Math.abs(w - seg.widths[0]) < 2)
  ok('A5 seg 36px/nowrap/三键均分', Math.round(seg.h) === 36 && seg.ws === 'nowrap' && even, JSON.stringify(seg))

  // ping 桩使 pluginVersion='0.9.82' → 常态版本 chip 真渲染（评审 R2：先证非空转再断隐藏）
  await a.page.waitForSelector('.dshm-head > .dshm-verchip', { state: 'attached', timeout: 5000 }) // 评审 N2+N3：$eval 不自动等待；chip 按设计 display:none，必须 attached（默认 visible 必超时）
  const chip = await a.page.$eval('.dshm-head > .dshm-verchip', (el) => getComputedStyle(el).display).catch(() => 'absent')
  ok('A6b 常态版本 chip 已渲染且隐藏', chip === 'none', `display=${chip}`)

  await a.page.click('.dshm-winctl button:not(.danger)') // ⛶ 还原（http 源 FS_KEY 真实写入 '0'）
  await a.page.waitForTimeout(150)
  const pad = await a.page.$eval('.dshm-overlay', (el) => getComputedStyle(el).padding)
  ok('A7 还原态 overlay padding 8px', pad.includes('8px'), pad)
  await a.ctx.close()

  // ---- A 组补充：窄视口 + FS_KEY='0' + selfcheck outdated（评审 R4/R2）----
  const b = await newPage({ width: 393, height: 852 })
  await b.page.evaluate(() => {
    localStorage.setItem('dshm-panel-fullscreen', '0')
    localStorage.setItem('dshm-selfcheck', JSON.stringify({ ts: Date.now(), data: { current: '0.9.82', latest: '0.9.90', outdated: true, ahead: false } }))
  })
  await boot(b.page)
  ok('A8 窄视口 + FS_KEY=\'0\' 仍恒全屏（记忆不生效）',
    await b.page.$eval('.dshm-panel', (el) => el.className.includes('full')))
  await b.page.waitForSelector('.dshm-head > .dshm-verchip.warn', { timeout: 5000 }) // 评审 N2：同 A6b，消 ping 往返竞态
  const warn = await b.page.$eval('.dshm-head > .dshm-verchip.warn', (el) => {
    const d = (sel) => getComputedStyle(el.querySelector(sel)).display
    return { root: getComputedStyle(el).display, name: d('.dshm-dshchip-name'), v: d('.dshm-dshchip-v'), upv: d('.dshm-up-v'), tip: el.title }
  })
  ok('A6a warn chip 收拢为 ⬆（文字 span 全隐藏、tooltip 保留）',
    warn.root !== 'none' && warn.name === 'none' && warn.v === 'none' && warn.upv === 'none' && warn.tip.includes('0.9.90'),
    JSON.stringify(warn))
  await b.ctx.close()

  // ---- B 组：宽视口 1280×800（FS_KEY 语义回归）----
  const c = await newPage({ width: 1280, height: 800 })
  await boot(c.page)
  ok('B1 宽视口非全屏（FS_KEY 未设置，语义不变）',
    await c.page.$eval('.dshm-panel', (el) => !el.className.includes('full')))
  ok('B2 宽视口全称标题',
    await c.page.$eval('.dshm-title', (el) => getComputedStyle(el.querySelector('.dshm-title-full')).display !== 'none'))
  ok('B3 宽视口头部零溢出',
    await c.page.$eval('.dshm-head', (el) => el.scrollWidth <= el.clientWidth))
  await c.ctx.close()

  // ---- B 组补充：宽视口 + FS_KEY='1'（评审 R4：宽视口记忆照旧生效）----
  const d = await newPage({ width: 1280, height: 800 })
  await d.page.evaluate(() => localStorage.setItem('dshm-panel-fullscreen', '1'))
  await boot(d.page)
  ok('B4 宽视口 + FS_KEY=\'1\' → 初始全屏（记忆照旧）',
    await d.page.$eval('.dshm-panel', (el) => el.className.includes('full')))
  await d.ctx.close()
} finally {
  await browser.close()
  server.close()
}
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.pass).length
console.log(failed ? `\n${failed} 项失败` : '\n全部通过')
process.exit(failed ? 1 : 0)
```

- [ ] Step 2: 运行并确认
- Run: `cd /home/ubuntu/workspace/dsh-m && node scripts/verify-panel-mobile.mjs`
- Expected: A1-A8、A6a、B1-B4 共 13 项全 PASS（results.json 落盘），退出码 0。若 A5 三键均分或 A7 失败，属 CSS 细节回归，回 Task 3 修；若 A1/A8/B1/B4 失败，回 Task 6 修；若 A6a/A6b 失败，回 Task 5 或 /dshm 桩修。

### Task 9: 版本号 + CHANGELOG + checkpoint commit

- 目标：发版三件套并落盘提交。
- Files: Modify `package.json`（`"version": "0.9.82"` → `"0.9.83"`）、`CHANGELOG.md`（`## 中文` L9 之后、`## English` L586 之后各插一条）。
- 接口契约
  - Consumes: Task 7 的最终测试数、Task 8 的断言结果
  - Produces: 0.9.83 发布态
- 验证范围：`npm test` 仍全绿（版本号变更不破坏任何断言）+ `git log -1`。

- [ ] Step 1: `package.json` 版本号改 `0.9.83`。

- [ ] Step 2: `CHANGELOG.md` `## 中文` 标题后插入：

```md
### 0.9.83 功能：手机窄屏自适应——面板头部两行重排 + 窄视口默认全屏

- **问题（主人手机实拍）**：`.dshm-head` 是单行 no-wrap flex，最小内容宽 ~440-470px，手机面板内容宽仅 330-365px → 行尾溢出被 `.dshm-panel` overflow:hidden 裁掉：还原/关闭按钮组不可见不可点（关面板只剩遮罩点击）、版本 chip 拦腰截断、标题逐词换行、seg 键逐字竖排。移动端问题第三次以「用户手机截图反馈」方式暴露（0.9.66 触屏滑动方向、0.9.67 字号失控之后）。
- **方案（容器查询两行重排 + 窄视口默认全屏，grilling 共识 Q1-Q10 + 独立评审 R1-R8 修订）**：`.dshm-panel` 加 `container-type:inline-size`（面板宽高均公式派生不依赖内容，包含安全；灯箱 portal 挂 body、sticky 行在滚动容器内，均不受影响），`@container (max-width:600px)` 两行重排——行1 [短标题 ⋯spacer⋯ chip winctl]、行2 [seg 三键拉通 36px 触控]；DOM 顺序零改动（纯 order+wrap，源锚/tab 序/读屏序稳定）；标题双 span 切换（窄显「插件市场」，`title.panel` 现成 key）；版本 chip 常态隐藏、warn 态缩为 ⬆ icon（tooltip/自升级语义不变），隐藏/收拢规则以专属类 `.dshm-verchip` 收窄——头部 profile 徽标（非 web profile）不在共识范围、不受影响；新规则对不支持容器查询的浏览器零生效（条件规则组等效兜底，老浏览器逐字节同旧版）；窄视口（≤600px）初始挂载恒全屏（仅判定一次、不随 resize 跟随，FS_KEY 记忆窄视口下不生效——防「还原一次被永久记住挤压态」），宽视口行为逐字节同今日；overlay 窄视口 padding 8px。范围红线：ZoneChips/卡片网格/灯箱/设置页/遮罩契约/拖拽模型零触碰。
- **验证**：N 项测试全绿（0.9.82 基线 1435 + 新增源锚 5 组于 client-mobile-head.test.mjs；既有 render-smoke 两处断言同步改写——「warn 类名锚 + `⬆ v…` 文本锚」，0.9.82「一处既有用例标题改写」先例同款）、typecheck 零错误；`node scripts/verify-panel-mobile.mjs` 真浏览器 13 断言全过（393×852 窄 + 1280×800 宽 + FS_KEY 2×2 矩阵 + chip 双态：默认全屏/winctl 可达/头部零溢出/标题切换/seg 36px 触控/chip 隐藏与 warn 收拢/还原态 8px/宽视口 FS_KEY 回归）；verify 脚本照 verify-lightbox 惯例手动运行不进 CI（本地 http 源 + /dshm 桩，零外网依赖）；真机复核：主人手机。
```
  （执行时把 N 替换为 Task 7 实测 `# pass` 总数。）

- [ ] Step 3: `## English` 标题后插入对应英文条目（与中文条目同构：标题 `### 0.9.83 — Mobile adaptive layout: two-row panel head + fullscreen-by-default on narrow viewports`，问题/方案/验证三段对译，保留 `.dshm-verchip`/FS_KEY/断言数字等字面）。

- [ ] Step 4: 提交
- Run: `cd /home/ubuntu/workspace/dsh-m && npm test 2>&1 | tail -3 && git add src/client/main.jsx tests/client-render-smoke.test.mjs tests/client-mobile-head.test.mjs scripts/verify-panel-mobile.mjs package.json CHANGELOG.md docs/plans/2026-10-14-mobile-panel-head-adaptive-implementation-plan.md && git commit -m "0.9.83: 手机窄屏自适应——面板头部两行重排 + 窄视口默认全屏（容器查询，共识 Q1-Q10 + 评审 R1-R8）"`
- Expected: 测试全绿、commit 成功。

## 执行纪律

- 开始实现前先批判性复查本计划；发现缺项、矛盾、命名不一致或验证命令无效，先修计划再动手。
- 仓库当前在 `main` 分支：本计划默认沿仓库既有单人主干流直接提交（0.9.x 全部发于主干）；**若希望走 feature 分支，请在批准本计划时说明**，Task 9 的 commit 前先建分支。
- 按任务顺序执行，不无声跳步/合并/改目标；每任务完成即跑该任务定义的验证。
- Task 3-6 的实现字面量必须与 Task 2 断言逐字一致（含空格与标点），不一致以 Task 2 为准回改实现。
- Task 5 对 render-smoke 的改写**仅限 L166/L167 两行**，其余既有测试出现红灯即视为回归，回查实现而不是继续改测试。
- 遇阻塞、重复失败或计划与仓库现实不符（如行号漂移导致锚点找不到），立即停下说明，不猜。
- 全部任务完成后运行最终验证并输出修改摘要。

## 最终验证

- `cd /home/ubuntu/workspace/dsh-m && npm test 2>&1 | tail -5` → `# fail 0`
- `cd /home/ubuntu/workspace/dsh-m && npm run typecheck` → 零错误
- `cd /home/ubuntu/workspace/dsh-m && node scripts/verify-panel-mobile.mjs` → 13 项 PASS
- 真机复核（主人手机）：打开 DSH Web → 插件市场 → 确认头部两行、关闭/还原按钮可达、默认全屏、还原后 8px 边距；桌面端打开确认与旧版无差异。

## 审阅 Checkpoint

- 计划正文到此结束，请审阅；批准前不进入实现。
