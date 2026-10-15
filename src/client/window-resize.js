/**
 * window-resize：还原态面板尺寸调整的 DOM-free 纯逻辑（panel resize）。
 * Point/rect 值由调用方传入，本模块不触碰 DOM——node:test 可直接单测。
 * 契约与 window-drag.js 同源：PANEL_MARGIN 复用其导出（四周 8px），存取语义
 * 与 loadPanelPos/savePanelPos 逐字对称（垃圾回落 null / 非有限抛 TypeError /
 * setItem 异常静默）。决策记录见 docs/adr/0021-panel-resize-model.md。
 * 仓库 `"type":"module"`：本文件必须用 ESM 具名导出，禁用 module.exports。
 */

import { PANEL_MARGIN } from "./window-drag.js";

/** localStorage 键：{"w":number,"h":number} = 还原态面板宽高 px。 */
export const SIZE_KEY = "dshm-panel-size";

/** 尺寸下限：640×460（600px 容器断点之上，设置页双列与头部 winctl 不塌）；
 * 真机扫宽（实施计划 Task 7）保留上抬校准权（如 720）。 */
export const MIN_W = 640;
export const MIN_H = 460;

const ZERO_INSETS = { left: 0, right: 0, top: 0, bottom: 0 };

function finiteInset(v) {
  return Number.isFinite(v) ? v : 0;
}

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

/** 位置记忆同款防御：storage 缺席/损坏/异常一律 null（回类默认尺寸）。 */
export function loadPanelSize(storage) {
  if (!storage || typeof storage.getItem !== "function") return null;
  try {
    const raw = storage.getItem(SIZE_KEY);
    if (typeof raw !== "string" || raw === "") return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Number.isFinite(parsed.w) ||
      !Number.isFinite(parsed.h)
    ) {
      return null;
    }
    return { w: parsed.w, h: parsed.h };
  } catch {
    return null;
  }
}

/** 写尺寸记忆：非有限属编程错误，抛 TypeError；setItem 异常静默——尺寸退化为会话级。 */
export function savePanelSize(storage, size) {
  if (
    typeof size !== "object" ||
    size === null ||
    !Number.isFinite(size.w) ||
    !Number.isFinite(size.h)
  ) {
    throw new TypeError(`invalid panel size: ${JSON.stringify(size)}`);
  }
  try {
    storage.setItem(SIZE_KEY, JSON.stringify({ w: size.w, h: size.h }));
  } catch {
    /* storage 不可用（配额/隐私模式）；尺寸仅本会话生效 */
  }
}
