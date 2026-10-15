# 还原态面板三区 resize：尺寸记忆 + 就地生长 + origin 第二钳（ADR-0021；v1 = 0.9.88 待发）

市场面板自 0.7.7 有窗口化形态（最大化/还原 + 全屏记忆）、0.9.69 有位置记忆（ADR-0017），但尺寸恒为类默认 `min(920px,100%)·min(680px,86vh)` 二值之外的空白：用户在大屏上「920px 浏览卡片太挤、全屏又太大」，且按桌面软件使用习惯会下意识把鼠标移向面板边缘试图 resize——今天试到的是死边。本卡为它补上窗口语义的最后一维：右/下/右下角三区拖拽调整尺寸、尺寸记忆、与位置记忆及全屏态互不打架。设计走 `/grill-with-docs` 两轮对齐（2026-10-15，Q1–Q9 锁定：三区/就地生长/尺寸记忆全套/四豁免/网格已流体/正规发版线）；实施计划 `docs/plans/2026-10-15-panel-resize-implementation-plan.md` 经独立评审 Agent 三轮对抗审核（R1×7 + R2×4 共 11 条，含两个「确定性为假的验证锚」实质缺陷：treeShaking:false 下 bundle 标识符缺席类预言、esbuild charset=ascii 下中文 bundle 锚，全部「已修改并复核通过」）后执行。参考实现：`window-drag.js`/ADR-0017 手势纪律（本卡逐条镜像）。

## 决策

1. **手柄 = 三区（右/下/右下角），锚定模型 = 就地生长**：只改宽高、不动已定参照——居中形态（无位置记忆）改宽后 flex 居中自动保持（`.dshm-overlay` 为 flex 居中层），自由摆放（`.abs`）形态左上角天然固定；零位置补偿数学。三区是本模型成立的前提：三个受力方向都「远离参照」，不需要 OS 式对边锚定的位置耦合数学（那正是左/上边手柄的全部风险所在，叠加 Windows 壳标题栏拖拽带——ADR-0017 已证该带按布局吞事件）。GLOSSARY「就地生长」词条在案。
2. **尺寸记忆与 clamp 语义**：localStorage `dshm-panel-size`（`{"w","h"}`，与 ADR-0017 `dshm-panel-pos` 逐字对称的存取纪律：垃圾回落 null/非有限抛 TypeError/setItem 静默）。记忆以 inline 宽高覆盖类默认，缺席时渲染零差异（收窄承诺见 Consequences）。下限 640×460（600px 容器断点之上，设置页双列与头部 winctl 不塌；真机扫宽保留上抬校准权）；上限 = 视口 − insets − 四周 8px 边距（`PANEL_MARGIN` 复用 window-drag 导出）；视口小于下限时退化为「视口−边距」（`Math.max(0,…)` + `min(MIN, max)`，与 `clampPoint` 同哲学）。**origin 第二钳**：`.abs` 形态下面板左上角固定，动态边必须额外满足「右/下缘 ≤ 视口 − insets − 8px」否则边距可破——手势期传入 pointerdown 时刻的面板左上角；居中形态禁传（每帧 flex 重居中、无固定原点，传起始左上角会过度收紧，封死 1440 视口从 920 拉满 1424 的合法路径）。reclamp 升维为先夹尺寸、再夹位置，且同 tick 内位置钳位复用本地计算值（sizeRef 是 render 期赋值，读了拿夹前值）。纯逻辑与接线分离：`src/client/window-resize.js`（DOM-free，node:test 直测，14 例）+ main.jsx 手势状态机。
3. **供性 = 纯光标 + 提示语，无任何视觉控件**：右/下/角热区 6/8/14×14px（角在 12–16px 业界带内，扫描期可校准），光标 `ew/ns/nwse-resize` 即全部可供性；头部提示语更新为「拖拽移动 · 双击全屏 · 拖边角调大小」（en: Drag to move · Double-click to fullscreen · Drag edges to resize）。不加 grip 图标、不加按钮——破坏性最小的取舍（需求方原话「设计破坏性不要太大」）。
4. **四豁免与滚动条权衡**：①全屏态手柄不渲染 + `.full` CSS belt；②窄视口（≤600px）强制全屏路径天然无手柄；③`pointerType!=="mouse"` 不启动 + `@media (pointer:coarse)` CSS belt（桌面触摸屏防误触）；④`.dshm-body` 纵向滚动条外缘 ~6px 被右热区覆盖（余 ~9px 可拖），角热区与滚动条自身 corner 死区基本重合——接受（macOS 老 grip 同款实践；overlay 滚动条系统下角热区吃掉 14px 内容角，同属接受范围）。
5. **手势纪律逐字镜像 ADR-0017**：pointer capture 手势期才挂 document 监听、pointermove 只存点、样式写集中在 rAF 帧内、帧回调首行守卫拦在途残帧、释放才 `savePanelSize` + `setSize` 收口、多指重入守卫、`setPointerCapture` 防御式捕获（拖出窗外释放不卡死）、主键（`button===0`）门卫、`touch-action:none` 热区、卸载清理恢复 body 样式。**差异一处并如实入档**：无 `will-change`/transform——宽高写每帧触发 layout，合成器通道不适用（见性能预期）。
6. **非目标（防蔓延）**：左/上边手柄与对边锚定、键盘 resize、吸附/布局预设、CSS `resize:both`、尺寸档位按钮、 market 之外的面板（详情 Modal/灯箱自有过场）。

## Considered Options

- **全 8 区 + 对边锚定（OS 桌面全规格）**：左/上区要求位置耦合数学（y 与 h 联动）且撞 Windows 标题栏带，风险全在接缝、价值最低（右上/左上角使用频次极低）——被否（v1 三区；真实需求出现再加，schema 不用改）。
- **CSS `resize:both`**：零 JS 成本但无钳位/无记忆/不可测（DOM-free 纪律破功）/手柄样式浏览器自绘丑——被否（负向锚 `resize:both` = 0 入测试）。
- **尺寸档位按钮（S/M/L 进 winctl）**：占头部空间、手势与业界窗口直觉不一致——被否。
- **维持现状（全屏二值）**：中间档无路可达，用户本能手势试到死边——被否（需求方主诉）。
- **手势期写 React state**：每帧重渲整棵面板树（市场两分区数据 + 卡片林）必然掉帧——被否（红线同 ADR-0017：手势帧零 React）。

## Consequences

- **性能预期**：resize 每帧 = 一次 width/height 写 → 整帧 layout（含容器查询与 auto-fit 网格重排、chips ResizeObserver 重测），无 transform 合成器通道；~30–60 卡片规模实测可接受（60fps 预算内），弱机若报告掉帧再评估（候选优化：resize 中给卡片网格降级渲染）。静止态零额外监听（手势期才挂 document 级）。
- **验收门**：全量测试 ≥1493（T1–T5 实测 14+4 新增，基线 1472）；typecheck 零错误；bundle 锚表（ASCII 限定）+ 源结构锚（`savePanelSize` ≥2 处、中文提示语源锚 ≥1）全过；Task 7 扫宽矩阵（640/720/760/920/1000/1120/1300/满宽 × 五视图，**920 像素级不变**）全绿。
- **行为零变化承诺（ADR-0017 承诺的收窄版）**：无尺寸记忆时面板几何与内容布局与旧版一致；DOM 多出三个 `aria-hidden` 透明热区节点（无视觉差异）——「逐字节一致」对几何与样式成立、对 DOM 节点数不成立。
- **验证锚纪律（评审沉淀，未来计划的通用教训）**：本仓库 build 为 `treeShaking:false` + esbuild 默认 charset=ascii——「bundle 中标识符缺席」与「bundle 中 grep 得到中文」两类预言确定性为假；验证锚只允许源结构锚与 ASCII 字面量正/负锚，量化一律出现次数语义。
- **GLOSSARY**：新增「尺寸记忆（Size Memory）」「就地生长（Grow-in-Place）」、修订「还原态（Restore State）」三词条（设计共识期已入档，随本卡 docs commit 提交）。
- **反哺候选（不在本卡范围）**：位置记忆与尺寸记忆的存储读写已高度对称，未来如加「重置窗口」入口可一并清两键；quota-watch 胶囊如需 resize 可直接复用 window-resize.js（契约零耦合 DOM）。
- **发布形态**：v1 随 0.9.88 发版（发版动作待需求方人工审核后执行，不入自动化）。
