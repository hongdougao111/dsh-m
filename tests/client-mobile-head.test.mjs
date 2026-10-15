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
  assert.ok(src.includes("@container (max-width:720px){"), "容器断点 720 在（0.9.88 起与视口 600 解耦：resize min 640 恒入两行区）");
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
