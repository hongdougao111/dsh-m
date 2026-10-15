# 面板三区 resize（右边/下边/右下角 · 就地生长 · 尺寸记忆）实施计划

## 目标

给市场面板（`.dshm-panel`）补上窗口语义的最后一维：还原态下可通过**右边、下边、右下角**三个手柄拖拽调整尺寸；尺寸被记住（下次打开同尺寸出现）；与既有位置记忆（ADR-0017）、全屏态互不打架。完成后用户可以在「920px 太挤、全屏太大」之间自由取中间档，卡片网格随宽度自动重排（该能力已存在，见 [main.jsx:538](../../src/client/main.jsx#L538) 的 `auto-fit` 网格，本计划只验证不改）。

设计共识来源：`/grill-with-docs` 两轮对齐（2026-10-15，Q1–Q9 全部锁定，Q7 保留 MIN 尺寸扫宽校准权）。

## 架构快照

- **纯逻辑与接线分离**（照搬 ADR-0017 拖拽的房子格局）：新模块 `src/client/window-resize.js`（DOM-free，node:test 直测）承载尺寸数学与存储语义；`main.jsx` 的 `MarketPanel` 承载手势状态机（pointerdown 门卫 + slop + 手势期才挂 document 监听 + rAF 帧内写 + 释放烘焙收口）。
- **就地生长锚定模型**：只改宽高、不动参照。居中形态（无位置记忆）改宽后 flex 居中自动保持（`.dshm-overlay` 是 `align-items/justify-content:center` 的 fixed 层，[main.jsx:304](../../src/client/main.jsx#L304)）；`.abs` 摆放形态左上角天然固定。零位置补偿数学——这是 v1 只做朝右/下三区的前提（GLOSSARY「就地生长」词条在案）。
- **尺寸记忆与位置记忆对称**：`SIZE_KEY`（`{"w","h"}`）镜像 `POS_KEY` 的存取纪律（垃圾回落 null / 非有限抛 TypeError / setItem 静默）；存在时以 inline `width/height` 覆盖类默认 `min(920px,100%)·min(680px,86vh)`，缺席时渲染零差异。
- **手柄 = 三个透明热区 div**：`data-dshm-resize="e|s|se"`，绝对定位贴面板内缘（面板 `overflow:hidden`，不能外置），无任何视觉控件，供性全靠光标；全屏态不渲染 + CSS 双保险；`pointer:coarse` 设备 CSS 隐藏 + pointerType 门卫双保险。
- **reclamp 升维**：现有 `reclamp`（layout effect + window resize）从「夹位置」扩为「先夹尺寸、再夹位置」（同一守卫，全屏/拖拽/resize 中跳过）。

## 全局约束

- **手势纪律逐字镜像拖拽（ADR-0017）**：resize 帧绝不走 React state——`width/height` 直写面板节点、样式写集中在 rAF 帧内、帧回调首行守卫拦在途残帧、释放才 `savePanelSize` + `setSize` 收口、多指重入守卫、`setPointerCapture` 防御式捕获、主键（`button===0`）门卫、卸载清理恢复 body 样式（评审 R1-3/R1-5 补齐，拖拽机 main.jsx 同款三件）。
- **验证锚纪律**：`scripts/build.mjs` 显式 `treeShaking: false`——未调用的标识符也会进 bundle，「bundle 中 grep 不到某标识符」类预言必假（评审 R1-1）；esbuild 未设 `charset`，默认 ascii 把 bundle 内一切非 ASCII（含 i18n 中文与 CSS 串内中文）转义为 `\uXXXX`，「bundle 中 grep 得到中文」类预言同样必假（评审 R2-1 实证）。负向/差分锚只用两类：源结构锚（grep `src/**`）与字面量正/负锚（bundle 中 **ASCII** 字符串常量在场/缺席）；中文文案锚一律源结构锚；凡计数量化一律出现次数语义（`grep -o … | wc -l` 或测试内 split 计数），不用 `grep -c` 的行数语义。
- **`window-drag.js` 不改**：它是已发布的稳定契约文件；只 `import { PANEL_MARGIN, dragSlop }` 复用（8px 边距与 slop 分级契约同源）。`ZERO_INSETS`/`finiteInset` 在 window-resize.js 内本地实现（三行小函数，不为复用去动稳定文件）。
- **无新增依赖**；i18n 中英双语同步改；文案逐字用 Q8 定稿：中文 `拖拽移动 · 双击全屏 · 拖边角调大小`，英文 `Drag to move · Double-click to fullscreen · Drag edges to resize`。
- **行为零变化承诺（ADR-0017 延伸，如实收窄）**：无尺寸记忆时面板几何与内容布局与旧版一致；DOM 会多出三个 `aria-hidden` 手柄节点（透明热区，无视觉差异）——「逐字节一致」只对几何与样式成立，不对 DOM 节点数成立。
- **非目标（写进 ADR，防蔓延）**：左/上边手柄、对边锚定、键盘 resize、吸附/布局预设、`CSS resize:both`、尺寸档位按钮。
- 滚动条权衡（Q4 已接受，ADR 记录）：`.dshm-body` 纵向滚动条外缘被 6px 右热区覆盖（余 ~9px 可拖）；右下角热区 14×14 与滚动条自身 corner 死区基本重合；overlay 滚动条系统下角热区吃掉 14px 内容角。扫描期允许把角热区在 12–16px 内校准。

## 输入工件

- 设计共识：本会话 `/grill-with-docs` 两轮问答（无独立设计文档，对话即需求）；决策要点已入 `GLOSSARY.md`（还原态修订 + 尺寸记忆 + 就地生长三词条，2026-10-15）。
- 先例与格式：[docs/adr/0017-panel-drag-position-model.md](../adr/0017-panel-drag-position-model.md)（ADR 格式与手势纪律）；[tests/client-window-drag.test.mjs](../../tests/client-window-drag.test.mjs)（纯逻辑测试风格 + 契约锚写法）；[tests/client-render-smoke.test.mjs](../../tests/client-render-smoke.test.mjs)（SSR 渲染冒烟机制）；`docs/plans/2026-10-10-panel-drag-position-implementation-plan.md`（同域计划先例）。
- 运维约束：热部署与直写探针纪律（know-how 026 §①、019）；npm staged 发布延迟（know-how 018）；装机走宿主通道 `dshm_upgrade`（know-how 026 §①）。

## 文件结构与职责

- **Create**: `src/client/window-resize.js` — DOM-free 纯逻辑：`SIZE_KEY`/`MIN_W`/`MIN_H` 常量，`clampSize`，`loadPanelSize`，`savePanelSize`。ESM 具名导出（仓库 `"type":"module"`，本文件禁 `module.exports`；main.jsx 以 `require` 互操作消费，与 window-drag.js 同款）。
- **Modify**: `src/client/main.jsx` — ①顶部 import 区（约 L19 旁）加 `window-resize.js` 解构；②i18n 中英两块（约 L98 / L219）改 `panel.dragHint`；③CSS 模板串 `.dshm-panel` 区（约 L305–L333）加 `.dshm-rz` 手柄与守卫规则；④`MarketPanel`（约 L3443 起）：size state/sizeRef/resizingRef、`reclamp` 升维、resize 手势 useEffect、面板渲染加 inline 宽高与三手柄节点。
- **Test**: `tests/client-window-resize.test.mjs` — 新建；纯逻辑单测（契约锚 + clampSize 矩阵 + 存取语义）+ `lib/client.js` 字符串锚（CSS/文案/键名）。
- **Modify**: `tests/client-render-smoke.test.mjs` — 追加 resize 渲染断言 describe（restore 三手柄在场 / full 不在场 / size 记忆注入 inline 宽高）。
- **Create**: `docs/adr/0021-panel-resize-model.md` — 决策记录（格式随 ADR-0017）。
- **Modify**: `GLOSSARY.md` — 无新改动；工作区已有的未提交词条修订（还原态修订 + 尺寸记忆/就地生长两词条，评审 R1 抽检提醒其为 M 状态）随 Task 6 的 docs commit 一并入库，勿散落进无关提交。
- **Modify**: `package.json`（`0.9.87` → `0.9.88`）、`CHANGELOG.md`（双语条目，中文区在前英文区在后，同版本号对齐）。

接口总览（前后任务命名以此为准，不得另起名）：

- T1 产出：`SIZE_KEY = "dshm-panel-size"`、`MIN_W = 640`、`MIN_H = 460`、`clampSize(size, viewport, insets?, origin?)`（origin 仅 .abs 形态传，语义见 Task 1 Step 3 注释）、`loadPanelSize(storage)`、`savePanelSize(storage, {w,h})`。
- 既有消费（不新造）：`PANEL_MARGIN`、`dragSlop`（window-drag.js）；`titlebarTopInset` 经 `readTitlebarInsets()`（main.jsx 内已有）；`clampPoint`（window-drag.js）。
- T2 产出（T3/T4 消费）：面板根上三手柄节点 `data-dshm-resize="e|s|se"`、`.dshm-rz` CSS、size state + `sizeRef` + `resizingRef`、inline 宽高渲染。
- T3 产出：resize 手势状态机（`resizingRef` 置位/复位语义）。
- T4 产出：升维版 `reclamp`（尺寸先夹、位置后夹）。

## 任务清单

### Task 1: window-resize.js 纯逻辑 + 单测（TDD）

- 目标：尺寸数学与存储语义的全部可测逻辑落进独立模块，测试先行。
- Files
  - Create: `src/client/window-resize.js`
  - Test: `tests/client-window-resize.test.mjs`
- 接口契约
  - Consumes: `PANEL_MARGIN`（`import { PANEL_MARGIN } from "./window-drag.js"`）
  - Produces: `SIZE_KEY`、`MIN_W`、`MIN_H`、`clampSize`（含 origin 第二钳）、`loadPanelSize`、`savePanelSize`（签名与语义见下）
- 验证范围：`node --test tests/client-window-resize.test.mjs` 全绿。

- [ ] Step 1: 写失败测试。新建 `tests/client-window-resize.test.mjs`，`import ... from "../src/client/window-resize.js"`（文件尚不存在，导入即失败）。测试组：
  1. **契约锚**：`SIZE_KEY === "dshm-panel-size"`、`MIN_W === 640`、`MIN_H === 460`。
  2. **clampSize 常规矩阵**（传入自算 insets，普通对象 `{left,right,top,bottom}`）：面板 1200×800、视口 1440×900、零 insets → `{w:1200,h:800}` 原样；1600×1000 请求、视口 1440×900 → `{w:1440-16,h:900-16}`（四周各 8px）；600×300 请求 → `{w:640,h:460}`（下限抬起）；insets right=40 → maxW 再减 40。
  3. **origin 第二钳矩阵**（评审 R1-2）：视口 1440×900、零 insets、请求 1424×884、origin `{left:1032,top:100}` → `{w:400,h:792}`（右缘钳回 1032+400=1432=视口−8；下缘钳回 100+792=892=视口−8）；同请求不传 origin → `{w:1424,h:884}`（居中形态不受起始原点收紧）；origin 越界（`{left:1400,top:0}`，视口 1440）→ `effMaxW=max(0,1440−8−1400)=32`，min(MIN_W,32)=32 → `{w:32,h:…}`（Math.max(0,…) 退化守卫，不产生负宽）。
  4. **退化矩阵**（视口小于下限）：视口 500×400、零 insets → maxW=484、maxH=384，请求 640×460 → `{w:484,h:384}`（`Math.min(MIN, max)` 退化，与 `clampPoint` 的 Math.max 防退化同哲学）；请求 100×100 → `{w:484,h:384}`（下限被 max 抬到视口宽）。
  5. **存取语义**（`mapStorage` 桩照抄 client-window-drag.test.mjs）：save 后 load 回 `{w,h}`；垃圾 JSON/缺字段/非有限数 → load 返回 `null`；save 非有限 → 抛 `TypeError`；`setItem` 抛错 → save 静默不抛；storage 为 null → load 返回 `null`。
- [ ] Step 2: 运行确认失败
  - Run: `node --test tests/client-window-resize.test.mjs`
  - Expected: `ERR_MODULE_NOT_FOUND`（window-resize.js 不存在）
- [ ] Step 3: 写最小实现。`src/client/window-resize.js`，文件头注释声明契约（镜像 window-drag.js 头注释风格：DOM-free、node:test 直测、公式与 ADR-0021 对应）：

  ```js
  import { PANEL_MARGIN } from "./window-drag.js";

  export const SIZE_KEY = "dshm-panel-size";
  export const MIN_W = 640;
  export const MIN_H = 460;

  const ZERO_INSETS = { left: 0, right: 0, top: 0, bottom: 0 };
  const finiteInset = (v) => (Number.isFinite(v) ? v : 0);

  /**
   * 尺寸钳位：max = 视口 − 对应 insets − 四周 PANEL_MARGIN；有效下限 =
   * min(MIN_W/H, max)——视口小于下限时退化为「视口−边距」（clampPoint 同哲学）。
   * origin 第二钳（评审 R1-2）：自由摆放（.abs）形态下面板左上角固定，动态边必须
   * 额外满足「右/下缘 ≤ 视口 − insets − PANEL_MARGIN」，否则 8px 边距可破——传入
   * pointerdown 时的面板左上角 {left,top} 追加此钳；居中形态每帧 flex 重居中、
   * 无固定原点，禁传 origin（传了会用起始左上角过度收紧，封死「拉宽后重新居中」
   * 的合法空间，如 1440 视口从 920 拉满 1424 的路径）。
   */
  export function clampSize(size, viewport, insets = ZERO_INSETS, origin = null) {
    const maxW = Math.max(0, viewport.width - finiteInset(insets?.left) - finiteInset(insets?.right) - PANEL_MARGIN * 2);
    const maxH = Math.max(0, viewport.height - finiteInset(insets?.top) - finiteInset(insets?.bottom) - PANEL_MARGIN * 2);
    const effMaxW = origin ? Math.min(maxW, Math.max(0, viewport.width - finiteInset(insets?.right) - PANEL_MARGIN - finiteInset(origin.left))) : maxW;
    const effMaxH = origin ? Math.min(maxH, Math.max(0, viewport.height - finiteInset(insets?.bottom) - PANEL_MARGIN - finiteInset(origin.top))) : maxH;
    const minW = Math.min(MIN_W, effMaxW);
    const minH = Math.min(MIN_H, effMaxH);
    return {
      w: Math.min(Math.max(size.w, minW), effMaxW),
      h: Math.min(Math.max(size.h, minH), effMaxH),
    };
  }

  export function loadPanelSize(storage) {
    if (!storage || typeof storage.getItem !== "function") return null;
    try {
      const raw = storage.getItem(SIZE_KEY);
      if (typeof raw !== "string" || raw === "") return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || !Number.isFinite(parsed.w) || !Number.isFinite(parsed.h)) return null;
      return { w: parsed.w, h: parsed.h };
    } catch {
      return null;
    }
  }

  /** 写尺寸记忆：非有限属编程错误抛 TypeError；setItem 异常静默——尺寸退化为会话级。 */
  export function savePanelSize(storage, size) {
    if (typeof size !== "object" || size === null || !Number.isFinite(size.w) || !Number.isFinite(size.h)) {
      throw new TypeError(`invalid panel size: ${JSON.stringify(size)}`);
    }
    try {
      storage.setItem(SIZE_KEY, JSON.stringify({ w: size.w, h: size.h }));
    } catch {
      /* storage 不可用（配额/隐私模式）；尺寸仅本会话生效 */
    }
  }
  ```
- [ ] Step 4: 运行确认通过
  - Run: `node --test tests/client-window-resize.test.mjs`
  - Expected: 全部用例绿（5 组：契约锚/常规矩阵/origin 第二钳/退化/存取，约 14–18 断言）
- [ ] Step 5: checkpoint commit
  - Run: `git add src/client/window-resize.js tests/client-window-resize.test.mjs && git commit -m "feat(client): window-resize 纯逻辑——clampSize 尺寸钳位 + 尺寸记忆存取（panel resize T1）"`
  - Expected: commit 成功

### Task 2: 渲染接线——size 记忆 / inline 宽高 / 三手柄 / 文案（TDD via 渲染冒烟）

- 目标：restore 态渲染出三手柄与记忆尺寸；full 态不渲染手柄；提示语更新。本任务不含手势（手柄尚不可拖，属预期）。
- Files
  - Modify: `src/client/main.jsx`（import 区、i18n 两块、`MarketPanel` state 区与面板渲染 JSX）
  - Test: `tests/client-render-smoke.test.mjs`（追加 describe）
- 接口契约
  - Consumes: Task 1 的 `clampSize`/`loadPanelSize`/`SIZE_KEY`/`MIN_W`/`MIN_H`（本任务至少用 `loadPanelSize`；`SIZE_KEY` 进 smoke 桩）；既有 `loadPanelPos` 消费模式（L3477–3484）
  - Produces: `size` state + `sizeRef` + `resizingRef`（初值 `false`）+ 面板根三手柄节点（`data-dshm-resize="e|s|se"`）+ `panel.dragHint` 新文案——Task 3/4/5 按名消费
- 验证范围：`node --test tests/client-render-smoke.test.mjs` 新 describe 全绿；`npm run build` 后 `grep -o "data-dshm-resize" lib/client.js | wc -l` ≥ 3（出现次数语义，评审 R2-3）。

- [ ] Step 1: 写失败测试。`tests/client-render-smoke.test.mjs` 追加（复用文件顶部已就绪的 `React/renderToString/components/h`）：
  1. **restore 含手柄**：渲染 `h(components.__MarketPanel, { onClose: () => {} })`，对输出串断言 `data-dshm-resize="e"`、`"s"`、`"se"` 各出现 1 次（当前源没有手柄 → 失败）。
  2. **full 不含手柄**：渲染前置桩 `globalThis.window = { matchMedia: () => ({ matches: true }), localStorage: { getItem: (k) => (k === "dshm-panel-fullscreen" ? "1" : null) } }`（key 定向桩，评审 R1-7②：不给 market-snapshot/favorites 等其他 localStorage 读取器喂假值；600px 窄视口命中 → 初始化 full=true），断言输出串 `data-dshm-resize` 出现 0 次，`finally` 删桩 `delete globalThis.window`。
  3. **size 记忆进 inline 宽高**：桩 `window.localStorage = { getItem: (k) => (k === "dshm-panel-size" ? JSON.stringify({ w: 1200, h: 800 }) : null) }`（matchMedia 不匹配，走还原态），断言输出含 `width:1200px` 与 `height:800px`；无记忆时不出现 `width:` 内联样式残留（对照断言：无桩渲染输出不含 `width:1200px`）。
- [ ] Step 2: 运行确认失败
  - Run: `node --test tests/client-render-smoke.test.mjs`
  - Expected: 新 describe 三例失败（`data-dshm-resize` 缺失）
- [ ] Step 3: 写最小实现（四处小改，全在 main.jsx）：
  1. import 区（L19 旁）：`const { clampSize, loadPanelSize, savePanelSize } = require("./window-resize.js");`
  2. i18n：zh 块 `"panel.dragHint": "拖拽移动 · 双击全屏 · 拖边角调大小",`；en 块 `"panel.dragHint": "Drag to move · Double-click to fullscreen · Drag edges to resize",`
  3. `MarketPanel` 内、`pos` state（L3477）之后加：

     ```js
     // 尺寸记忆（panel resize）：{w,h} = 还原态面板宽高 px；null = 无记录 → 类默认
     // min(920px,100%)·min(680px,86vh)，渲染零差异。resizingRef 供 reclamp 与手势机
     // 互斥（同 draggingRef 语义）。
     const [size, setSize] = useState(() => {
       try {
         return loadPanelSize(typeof window !== "undefined" && window.localStorage ? window.localStorage : null);
       } catch {
         return null;
       }
     });
     const sizeRef = useRef(size);
     sizeRef.current = size; // render 期赋值（latest-ref，同 posRef/fullRef 先例）
     const resizingRef = useRef(false);
     ```
  4. 面板渲染（L3846–3851）：style 与子节点改为

     ```jsx
     style: !full
       ? {
           ...(pos ? { left: `${pos.x}px`, top: `${pos.y}px` } : {}),
           ...(size ? { width: `${size.w}px`, height: `${size.h}px` } : {}),
         }
       : undefined,
     ```
     并在 `.dshm-body` 兄弟位置（面板根闭合前）追加：

     ```jsx
     // resize 热区（panel resize）：透明无视觉；pointer-only 供性（aria-hidden），
     // 全屏态不渲染（CSS @media pointer:coarse 另有 belt，见 Task 5）
     !full && h("div", { className: "dshm-rz rz-e", "data-dshm-resize": "e", "aria-hidden": "true" }),
     !full && h("div", { className: "dshm-rz rz-s", "data-dshm-resize": "s", "aria-hidden": "true" }),
     !full && h("div", { className: "dshm-rz rz-se", "data-dshm-resize": "se", "aria-hidden": "true" }),
     ```
- [ ] Step 4: 运行确认通过
  - Run: `npm run build && node --test tests/client-render-smoke.test.mjs && grep -o "data-dshm-resize" lib/client.js | wc -l`
  - Expected: 冒烟全绿；计数 ≥3（出现次数语义，评审 R1-7①；三个手柄各含一次）
- [ ] Step 5: checkpoint commit
  - Run: `git add -A && git commit -m "feat(client): 面板 size 记忆渲染接线 + 三区手柄节点 + 提示语（panel resize T2）"`
  - Expected: commit 成功

### Task 3: resize 手势状态机（rAF 帧写 + 释放收口）

- 目标：手柄可拖。纪律与拖拽状态机（L3516 起 useEffect）逐条同构。
- Files
  - Modify: `src/client/main.jsx`（`MarketPanel` 内新增一个 useEffect，紧邻拖拽 useEffect 之后）
- 接口契约
  - Consumes: Task 2 的 `data-dshm-resize` 手柄/`sizeRef`/`resizingRef`/`setSize`；Task 1 的 `clampSize`/`savePanelSize`；既有 `dragSlop`、`readTitlebarInsets()`（main.jsx 内既有）、`panelRef`
  - Produces: `resizingRef` 的置位/复位语义（进手势即 `true`、终态复位 `false`）——Task 4 的 reclamp 守卫按名消费
- 验证范围：`npm run build && npm test` 全绿（手势机为 DOM 层，与拖拽同款不做 node 单测，真机行为归 Task 7 验收）；`lib/client.js` 锚 `nwse-resize` 在场（Task 5 CSS 后）。

- [ ] Step 1: 失败检查（先声明当前缺失）：现在手柄无任何监听、无保存路径。负向锚用**源结构锚**而非 bundle 标识符锚——`scripts/build.mjs` 显式 `treeShaking: false`（esbuild 看不到 footer 会把顶层声明当未使用摇掉，未调用的标识符同样进 bundle），「bundle 中 grep 不到未调用函数」类预言必假（评审 R1-1 实证）：
  - Run: `grep -n "savePanelSize" src/client/main.jsx`
  - Expected: 恰 1 处命中（Task 2 加的 require 解构行），无调用点
- [ ] Step 2: 确认失败信号成立（1 处在案）；Task 3 完成后同一命令应 ≥2 处（解构 + onPointerUp 调用点，收口验证复用此锚）。
- [ ] Step 3: 写实现。`MarketPanel` 内新增 useEffect（依赖 `[]`，结构逐条对齐拖拽机）：

  ```js
  // resize 手势状态机（panel resize）：pointerdown 落手柄启动；主键门卫 + setPointerCapture
  // 防御式捕获（评审 R1-3/R1-5，拖拽机 main.jsx 同款）；slop 分级复用 dragSlop；手势期才挂
  // document 监听；pointermove 只存点，宽高写集中在 rAF 帧内（帧回调首行守卫拦释放后残帧）；
  // 释放 clampSize（.abs 形态带 origin 第二钳，R1-2）收口 → savePanelSize + setSize 一次；
  // cancel 还原到拖前记忆（与拖拽 cancel 语义对称）。touch/pen 不启动（Q8）。
  useEffect(() => {
    const panelEl = panelRef.current;
    if (!panelEl) return undefined;
    let zone = null;        // "e" | "s" | "se"
    let resizing = false;
    let moved = false;
    let slop = 6;
    let originX = 0, originY = 0;
    let startW = 0, startH = 0;
    let originRect = null; // .abs 形态第二钳原点（R1-2）：pointerdown 时面板左上角；居中形态恒 null
    let lastPoint = null;
    let raf = 0;
    const ZONE_CURSOR = { e: "ew-resize", s: "ns-resize", se: "nwse-resize" };
    const bindGesture = () => {
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("pointercancel", onPointerCancel);
    };
    const unbindGesture = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
    };
    const frameStep = () => {
      raf = 0;
      if (!resizing || !moved || !lastPoint || !panelRef.current) return;
      const raw = {
        w: zone === "s" ? startW : startW + (lastPoint.x - originX),
        h: zone === "e" ? startH : startH + (lastPoint.y - originY),
      };
      const next = clampSize(raw, { width: window.innerWidth, height: window.innerHeight }, readTitlebarInsets(), originRect);
      panelRef.current.style.width = `${Math.round(next.w)}px`;
      panelRef.current.style.height = `${Math.round(next.h)}px`;
    };
    const onPointerMove = (event) => {
      if (!resizing) return;
      if (!moved) {
        if (Math.hypot(event.clientX - originX, event.clientY - originY) < slop) return;
        moved = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = ZONE_CURSOR[zone]; // 指针出面板后光标不灭
      }
      lastPoint = { x: event.clientX, y: event.clientY };
      if (!raf) raf = requestAnimationFrame(frameStep);
    };
    const onPointerUp = (event) => {
      if (!resizing) return;
      const baked = panelRef.current
        ? clampSize(
            moved && lastPoint
              ? { w: zone === "s" ? startW : startW + (lastPoint.x - originX), h: zone === "e" ? startH : startH + (lastPoint.y - originY) }
              : { w: startW, h: startH },
            { width: window.innerWidth, height: window.innerHeight },
            readTitlebarInsets(),
            originRect,
          )
        : null;
      unbindGesture();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      resizing = false;
      resizingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (!moved) return; // 纯点击手柄：无语义，不动尺寸
      try {
        savePanelSize(typeof window !== "undefined" && window.localStorage ? window.localStorage : null, baked);
      } catch { /* 非有限属编程错误；localStorage 缺席由 savePanelSize 内部静默 */ }
      setSize(baked); // 收口：inline 宽高回归 React 渲染（与拖拽烘焙 left/top 同型）
    };
    const onPointerCancel = () => {
      if (!resizing) return;
      unbindGesture();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      resizing = false;
      resizingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      // 还原视觉：inline 写已被手势覆盖，按记忆回写（无记忆清空回类默认）
      if (panelRef.current) {
        panelRef.current.style.width = sizeRef.current ? `${sizeRef.current.w}px` : "";
        panelRef.current.style.height = sizeRef.current ? `${sizeRef.current.h}px` : "";
      }
    };
    const onPointerDown = (event) => {
      if (resizing) return; // 多指重入守卫（拖拽机评审 R1-7 同款）
      if (event.button !== 0) return; // 只认主键（拖拽机 main.jsx:3607 同款；评审 R1-5①）
      if (event.pointerType !== "mouse") return; // Q8：触屏/触笔不启动（coarse CSS 为 belt）
      const handle = event.target?.closest?.("[data-dshm-resize]");
      if (!handle) return;
      zone = handle.getAttribute("data-dshm-resize");
      const rect = panelRef.current.getBoundingClientRect();
      startW = rect.width; startH = rect.height;
      // origin 第二钳（R1-2）：.abs 形态（pos 记忆在）左上角固定，右/下缘不破 8px 边距；
      // 居中形态传 null——每帧 flex 重居中，传了会拿起始原点过度收紧
      originRect = posRef.current ? { left: rect.left, top: rect.top } : null;
      originX = event.clientX; originY = event.clientY;
      slop = dragSlop(event.pointerType);
      resizing = true;
      resizingRef.current = true;
      moved = false;
      lastPoint = null;
      if (handle.setPointerCapture) {
        try {
          handle.setPointerCapture(event.pointerId); // 拖出窗外释放也能收到 pointerup（拖拽机 main.jsx:3621-3627 同款，评审 R1-3）
        } catch {
          /* 指针已释放等竞态静默；document 监听仍在，行为退化不卡死 */
        }
      }
      bindGesture();
    };
    panelEl.addEventListener("pointerdown", onPointerDown);
    return () => {
      panelEl.removeEventListener("pointerdown", onPointerDown);
      unbindGesture();
      if (raf) cancelAnimationFrame(raf);
      // 卸载时手势中途（如 Esc 关面板）：恢复 body 样式不留残留（评审 R1-5②；拖拽机 cleanup 恢复 userSelect 同款）
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, []);
  ```
  注意：`onPointerMove` 里 `moved` 置位分支与拖拽机一致（slop 门槛内不动样式）；`frameStep` 无 `will-change`（宽高写会触发 layout，transform 的合成器优化不适用，ADR 记录此性能差异）。
- [ ] Step 4: 运行确认通过
  - Run: `npm run build && npm test`
  - Expected: 全量绿（含 T1/T2 用例），无回归
- [ ] Step 5: checkpoint commit
  - Run: `git add -A && git commit -m "feat(client): resize 手势状态机——三区拖拽 + rAF 帧写 + 释放收口（panel resize T3）"`
  - Expected: commit 成功

### Task 4: reclamp 升维——先夹尺寸、再夹位置

- 目标：视口缩小/全屏往返时，记忆尺寸与记忆位置都被收回边界内，顺序为尺寸先、位置后（位置钳位消费夹后的尺寸，避免 rect 陈旧）。
- Files
  - Modify: `src/client/main.jsx`（`reclamp` useCallback，L3494–3506）
- 接口契约
  - Consumes: Task 1 `clampSize`；Task 2 `sizeRef`/`setSize`；Task 3 `resizingRef`；既有 `fullRef`/`draggingRef`/`posRef`/`setPos`/`clampPoint`/`readTitlebarInsets()`
  - Produces: 无（内部行为）
- 验证范围：`npm run build && npm test` 全绿；逻辑正确性由 Task 1 的 clampSize 单测 + Task 7 真机「缩小浏览器窗口→尺寸/位置不出界」条目覆盖。

- [ ] Step 1: 失败检查：现 reclamp 无尺寸维度——
  - Run: `grep -n "clampSize" src/client/main.jsx`
  - Expected: 仅 Task 2/3 的调用点，`reclamp` 函数体内无 `clampSize`（记录行号在案）
- [ ] Step 2: 确认失败信号成立。
- [ ] Step 3: 改 `reclamp`（守卫合并为一句，语义 = 全屏/拖拽/resize 手势中一律跳过）：

  ```js
  const reclamp = useCallback(() => {
    if (fullRef.current || draggingRef.current || resizingRef.current || !panelRef.current || typeof window === "undefined") return;
    const vp = { width: window.innerWidth, height: window.innerHeight };
    const insets = readTitlebarInsets();
    // ① 先夹尺寸：同 tick 内 setSize 不重渲（sizeRef 是 render 期赋值），位置钳位必须
    // 复用本地计算结果、禁读 sizeRef——读了拿到的是夹前值，「先夹尺寸再夹位置」在
    // 单次调用内退化为单夹（评审 R1-4）
    const prevSize = sizeRef.current;
    const eff = prevSize ? clampSize(prevSize, vp, insets) : null;
    if (eff && prevSize && (eff.w !== prevSize.w || eff.h !== prevSize.h)) setSize(eff);
    // ② 后夹位置：消费上面夹好的 eff（无尺寸记忆回退 rect，行为与旧版逐字节一致）
    const prev = posRef.current;
    if (!prev) return;
    const rect = panelRef.current.getBoundingClientRect();
    const next = clampPoint(
      { x: prev.x, y: prev.y },
      vp,
      eff ? { width: eff.w, height: eff.h } : { width: rect.width, height: rect.height },
      insets,
    );
    if (next.x !== prev.x || next.y !== prev.y) setPos(next);
  }, []);
  ```
  触发源不变：layout effect `[full, reclamp]`（全屏往返）+ window `resize` 监听（既有）。setSize/setPos 同帧批处理，下一 commit 生效；layout effect 在 paint 前跑，无闪烁。
- [ ] Step 4: 运行确认通过
  - Run: `npm run build && npm test`
  - Expected: 全量绿
- [ ] Step 5: checkpoint commit
  - Run: `git add -A && git commit -m "feat(client): reclamp 升维——尺寸先夹、位置后夹（panel resize T4）"`
  - Expected: commit 成功

### Task 5: CSS 手柄热区 + 双守卫

- 目标：热区几何、光标、coarse/full 守卫落进 CSS 模板串。
- Files
  - Modify: `src/client/main.jsx`（CSS 串，`.dshm-winctl` 规则附近，约 L333 后）
- 接口契约
  - Consumes: Task 2 的 `.dshm-rz rz-e|s|se` 类名与 `data-dshm-resize` 属性
  - Produces: `.dshm-rz` 系列规则（Task 1 测试文件的 bundle 锚断言按名消费）
- 验证范围：`npm run build && npm test` 全绿（bundle 锚在 Task 1 测试文件 Step 5 增补后由本任务点亮）。

- [ ] Step 1: 失败检查：
  - Run: `grep -o "dshm-rz" lib/client.js | wc -l`
  - Expected: 计 3（DOM 类名 `dshm-rz rz-e|s|se` 已随 Task 2 进 bundle；CSS 未写）——出现次数语义（评审 R1-7①；本任务完成后应增至 6：3 DOM + 3 CSS 规则）
- [ ] Step 2: 确认计数为 3（基线在案——DOM 类名已随 Task 2 进 bundle，评审 R2-2）。
- [ ] Step 3: 写 CSS（注释说明热区取值依据与滚动条权衡）：

  ```css
  /* resize 热区（panel resize）：透明贴内缘（面板 overflow:hidden 不可外置）。
     边 6/8px、角 14×14（Q8 定稿 12–16px 带内；扫描期可校准）。右热区盖住 .dshm-body
     纵向滚动条外缘 ~6px（余 ~9px 可拖）、角热区与滚动条 corner 死区基本重合（Q4 接受）。
     cursor 即全部供性——无视觉控件（Q8）。z-index 压过 body 内容但不进头部交互区
     （head padding 14px > 6px 热区，winctl 按钮无碰撞）。 */
  .dshm-rz{position:absolute;z-index:5;touch-action:none}
  .rz-e{top:0;right:0;width:6px;height:100%;cursor:ew-resize}
  .rz-s{bottom:0;left:0;width:100%;height:8px;cursor:ns-resize}
  .rz-se{right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize}
  .dshm-panel.full .dshm-rz{display:none} /* belt ①：全屏态手柄不渲染，CSS 兜底 */
  @media (pointer:coarse){.dshm-rz{display:none}} /* belt ②：coarse 指针整组隐藏（Q8） */
  ```
- [ ] Step 4: 运行确认通过
  - Run: `npm run build && npm test`
  - Expected: 全量绿
- [ ] Step 5: 补 bundle 锚断言（点亮负向/正向锚）：在 `tests/client-window-resize.test.mjs` 追加「bundle 锚」describe，`readFileSync` 读 `lib/client.js`。lib/ 不入库、仓库无测试读 lib 的先例——describe 内放守卫：`existsSync` 为假即 `t.skip("lib/client.js 不存在——先 npm run build（npm test 的 pretest 会自动 build）")`（评审 R1-6），测试文件头注释同步注明该前置。**锚只允许 ASCII**：esbuild 默认 `charset=ascii`，bundle 内一切非 ASCII（含 i18n 中文与 CSS 串内中文）存为 `\uXXXX` 转义，中文 bundle 锚必假（评审 R2-1 实证 `grep "拖拽移动" lib/client.js` = 0）——中文文案锚走源结构锚（`grep -o "拖边角调大小" src/client/main.jsx | wc -l` ≥1）。bundle 侧断言（一律出现次数语义，测试内 `str.split(锚).length - 1` 计数）：正向 `data-dshm-resize`、`.rz-se{`、`ew-resize`、`ns-resize`、`nwse-resize`、`pointer:coarse`、`dshm-panel-size`、`Drag edges to resize` 各 ≥1；负向 `resize:both` === 0（防有人偷懒换 CSS resize）。Run: `npm run build && node --test tests/client-window-resize.test.mjs && grep -o "拖边角调大小" src/client/main.jsx | wc -l`；Expected: 全绿（skip 只应出现在未 build 的裸检出上）+ 中文源锚 ≥1。
- [ ] Step 6: checkpoint commit
  - Run: `git add -A && git commit -m "feat(client): resize 热区 CSS——6/8px 边 + 14px 角 + coarse/full 双守卫（panel resize T5）"`
  - Expected: commit 成功

### Task 6: ADR-0021 + 全量验证

- 目标：决策入档，仓库门禁全绿。
- Files
  - Create: `docs/adr/0021-panel-resize-model.md`
- 接口契约
  - Consumes: ADR-0017 的格式骨架（标题/背景/决策/Considered Options/Consequences）与本计划全部决策；GLOSSARY 三词条（已入档，ADR 引用即可）
  - Produces: ADR-0021（后续 know-how/计划引用的决策编号）
- 验证范围：`npm test && npm run typecheck` 全绿；ADR 交叉引用可达。

- [ ] Step 1: 写 ADR-0021（结构随 ADR-0017），决策条目至少覆盖：①三区 + 就地生长（为什么不做 8 区对边锚定——位置耦合数学与 Windows 标题栏带风险；GLOSSARY「就地生长」在案）；②尺寸记忆 schema 与 clamp 语义（`SIZE_KEY`、MIN 640×460 且扫描期可校准上抬、视口小于下限的退化、**.abs 形态 origin 第二钳——右/下缘不破 8px 边距、居中形态不传 origin 的两态分界**（评审 R1-2）、reclamp 先尺寸后位置且同 tick 复用本地计算值）；③供性 = 纯光标 + 提示语（无视觉控件）；④四豁免（全屏不渲染、窄视口强制全屏路径天然缺席、touch/pen pointerType 门卫 + coarse CSS belt、滚动条角权衡）；⑤手势纪律镜像 ADR-0017（帧内写/零 React state/释放收口/**setPointerCapture 防御式捕获 + 主键门卫 + 卸载恢复 body 样式**（评审 R1-3/R1-5））；⑥非目标清单。Considered Options 至少含：8 区对边锚定、CSS `resize:both`、尺寸档位按钮、维持现状。Consequences 含性能预期（宽高写触发整帧 layout，无 transform 合成器通道；~30–60 卡片规模实测可接受，弱机报告掉帧再评估）、验收门（全量测试 ≥ 当前基线 + 本计划新增、typecheck 零错误、bundle 锚表）、行为零变化承诺（收窄版：几何/样式零差异，DOM 多三手柄节点）、GLOSSARY 词条清单、发布形态 0.9.88。
- [ ] Step 2: 全量验证
  - Run: `npm test && npm run typecheck`
  - Expected: 测试全绿（基线 1472 + 本计划新增，总数以实测为准）；typecheck 零错误
- [ ] Step 3: checkpoint commit
  - Run: `git add -A && git commit -m "docs: ADR-0021 面板三区 resize 模型 + GLOSSARY 词条入库（panel resize T6）"`
  - Expected: commit 成功（`git status` 干净，含 GLOSSARY.md）

### Task 7: 热部署 + 扫宽验收（Q9 协议，发版门）

- 目标：真机 GUI 按验收矩阵过一遍；MIN 尺寸校准判定在此完成。**本任务不通过不得进 Task 8。**
- Files
  - 无源码改动（校准触发时回改 `MIN_W`/`MIN_H` 并重跑 Task 6 Step 2）
- 接口契约
  - Consumes: Task 6 的构建产物 `lib/client.js`；热部署纪律（know-how 026 §① 直写探针、019 备份落 node_modules 外）；CDP 探针先例（`01_docs/research/2026-10-13-dshm-toggle-ux-cdp-probe.md`，029 同款）
  - Produces: 验收记录（判据表逐格打勾，存 `01_docs/research/`，供 ADR/CHANGELOG 引用）
- 验证范围：下表全绿 + MIN 校准判定完成。

- [ ] Step 1: 当会话直写探针（`touch ~/.dsh/profiles/web/node_modules/dsh-m/lib/.probe && rm`）——失败即改走 `dshm_upgrade` 装机验证路线（升级到本地版不可行时，用 `npm pack` 产物经宿主通道装）。
- [ ] Step 2: 热部署：备份 `lib/client.js` 至 `~/workspace/.dsh-m-resize-hotdeploy-backup/`（node_modules 外），覆盖为新构建产物，刷新 GUI。
- [ ] Step 3: 按矩阵验收（宽度用 DevTools 或 CDP 设定视口；每格记录列数/异常）：

  | 宽度 | 视图 | 判据 |
  |---|---|---|
  | 640 | 社区/精选 | 1 列优雅单列；头部单行（600px 断点未触发）；设置页 4:7 可读性判定（难看 → MIN_W 上抬 720，回改重扫） |
  | 720 / 760 | 已装/设置 | 行布局与双列设置无挤压、无溢出 |
  | 920 | 全部五视图 | **像素级与 0.9.87 一致**（无记忆用户零感知；对照旧截图） |
  | 1000 / 1120 | 社区 | 2→3 列过渡点（~1124）两侧各一格；卡片无文字溢出 |
  | 1300 / 满宽 | 社区/收藏 | 3 列稳定；chips 行数随宽合理收敛、⌃ 展开态正常 |
  | 高度 460 | 市场/已装 | 头部 + chips + 至少一排卡可见；滚动正常 |
  | 手势 | 还原态 | 三手柄光标正确；拖右/下/角跟手；释放后重开面板尺寸保持；拖到视口边缘钳位（8px 边距——居中形态由每帧重居中保证、.abs 形态由 origin 第二钳保证，评审 R1-2）；min/max 拐点无抖动 |
  | 互斥 | 全屏 | 手柄消失（DOM+光标双确认）；全屏→还原回记忆尺寸；双击全屏语义不变 |
  | 恢复 | 视口缩小 | 缩浏览器窗口：尺寸/位置均不出界（reclamp 双夹） |
  | 纪律 | resize 中 | Performance 面板无 React commit（帧内零 setState）；无布局抖动回弹（029 判据：0px 位移） |
  | 壳 | Windows desktop | 有条件则冒烟：右/下热区不碰标题带（v1 三区本就不触顶）；无则记录「desktop 冒烟延后至升级后」 |

- [ ] Step 4: 验收记录落盘 + checkpoint commit（`git add -A && git commit -m "docs(plan): panel resize 扫宽验收记录（T7）"`；记录文件放 `01_docs/research/`（跨仓库路径，单独 add 或按主仓库流程提交））。

### Task 8: 发版 0.9.88 + 装机冒烟

- 目标：正规发版线收编，热部署退役。
- Files
  - Modify: `package.json`（`"version": "0.9.88"`）、`CHANGELOG.md`（中文区 `### 0.9.88 …` + 英文区同版本条目，中文在前）
- 接口契约
  - Consumes: Task 7 验收通过；发版 SOP（tag `v0.9.88` → OIDC workflow）；know-how 018（staged 延迟，绿 ≠ 上架，勿重推 tag）；know-how 026 §①（装机走 `dshm_upgrade` 宿主通道）
  - Produces: npm `dsh-m@0.9.88`；本机 profile 装机
- 验证范围：npm 上架 + GUI 版本角标 0.9.88 + 冒烟三条。

- [ ] Step 1: 改版本号 + 双语 CHANGELOG（条目格式照 0.9.87：问题/方案/验证三段式，引用 ADR-0021 与验收记录）。
- [ ] Step 2: `npm test && npm run typecheck` 最终全绿；commit `chore(release): 0.9.88 面板三区 resize——尺寸记忆 + 就地生长（ADR-0021）`；`git tag v0.9.88 && git push && git push --tags`。
- [ ] Step 3: 轮询上架（`npm view dsh-m version --cache /tmp/npm-poll-cache`；staged 窗口内重试，不算失败）。
- [ ] Step 4: `dshm_upgrade` 装 0.9.88（宿主通道）；需要时经用户同意 `dshm_restart`；GUI 冒烟三条：拖角 resize 跟手、重开尺寸保持、920 无记忆默认不变；热部署备份目录确认被整包升级自然覆盖（无残留）。
- [ ] Step 5: 收尾——若 Task 7 曾改 `MIN_W`，确认 ADR-0021 与 CHANGELOG 记录的是校准后值。

## 执行纪律

- 开始实现前先批判性复查整份计划；发现缺项/矛盾/验证命令无效先修计划再动手。
- 按任务顺序执行，不无声跳步、合并步或改任务目标；每任务完成即跑该任务定义的验证。
- `npm test` 的 pretest 会先 build；单测文件可直接 `node --test tests/<file>`，但改了 main.jsx/CSS 后必须 `npm run build` 再跑锚断言。
- 沙箱内写 `~/.dsh/profiles/**` 前必做直写探针（know-how 026：沙箱视图 ≠ 宿主真身）；探针失败改宿主通道，不重试直写。
- 本计划全部验证命令在 **Linux 工作区机**（`~/workspace/dsh-m`）执行判绿；Windows 机上该测试套件有 know-how 028 §4 既有失败清单（symlink EPERM 家族等），在那台机上不得据以判绿或判红。
- 阻塞、重复失败或计划与仓库现实不符（行号漂移、API 变化）→ 立即停下说明，不猜。
- 若当前在 `main` 分支，开始实现前向用户确认（仓库现行流程即 main 直干 + 发版 tag，默认按此执行，除非用户另有指示）。

## 最终验证

- `npm test`（pretest 自动 build）全绿，总数 ≥ 基线 1472 + 新增；`npm run typecheck` 零错误。
- `lib/client.js` 锚表全过（出现次数语义，ASCII 锚限定）：`data-dshm-resize` / `.rz-se{` / `ew-resize` / `ns-resize` / `nwse-resize` / `pointer:coarse` / `dshm-panel-size` / `Drag edges to resize` ≥1；`resize:both` = 0；源结构锚：`grep -n "savePanelSize" src/client/main.jsx` ≥2 处（解构 + 调用点）、`grep -o "拖边角调大小" src/client/main.jsx | wc -l` ≥1（中文禁 bundle 锚，评审 R2-1）。
- Task 7 验收矩阵全绿（含 920 像素级不变）；Task 8 npm 上架 + 装机冒烟三条通过。

## 审阅 Checkpoint

- 计划正文到此为止。请审阅；批准前不进入实现。批准后默认由编码 agent（本会话）按任务顺序执行。

## T7 增补（2026-10-15 主人实测三修，commit 513005c）

主人真机扫宽反馈三项，当日分析→拍板→修复（均 panel resize 伴生/暴露）：

1. **头部两行重排断点 600→720px**：min 640 落在旧 600 断点的 601–720 死区，长标题/seg 文字折行。容器断点与视口断点自此解耦；`.dshm-title` 与 `.dshm-seg button` 基础补 nowrap/ellipsis 防御带。视口 600px 判定与 overlay 8px 不动。
2. **详情弹窗 modalbody 结构化**：box 整体滚动（`overflow:auto`）改 `hidden`，中段包进 `.dsvm-modalbody{overflow:auto;min-height:0;overscroll-behavior:contain}`——✕ 与「安装」双端常驻，README 任意展开关得上、装得了。
3. **设置网格三列门控改容器宽**：`@container (min-width:1100px)` 取代 `.dshm-panel.full` 门控（resize 后还原态可达任意宽，全屏与否不再是宽度信号）；≤760px 视口单列保留；顺带修正小视口全屏被强塞三列的旧账。

**验收增补行**（并入下方矩阵口径）：① 640 宽面板头部两行（短标题 + tab 拉通）、无文字折行；② 详情 Modal 展开 README 后 ✕ 与「安装」可见可点，中段独立滚动；③ 还原态拉宽 ≥1100 设置页三列（关于升右列），全屏 ≥1100 同样三列，窄全屏回落两列。

### T7 增补二（2026-10-15）：tab 切换淡入已实测否决——不再提议

tab 切换 160ms 透明度淡入（commit 48a5c8a）当日实现、当日热部署、**主人实测效果不佳，整体回滚**（revert + bundle 退回）。结论入档防止复提：① tab 内容瞬切是本面板的可接受现状，动效不是它的痛点；② 断点单帧重排维持「拖拽连续性优先」不软化。若未来重提动效，先回答「这次和上次差在哪」，不重新论证一遍原方案。
