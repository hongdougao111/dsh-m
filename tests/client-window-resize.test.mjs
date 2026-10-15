/**
 * panel resize：window-resize 纯逻辑单测。
 * 覆盖：契约锚（SIZE_KEY/MIN_W/MIN_H）、clampSize 常规矩阵、origin 第二钳矩阵
 * （评审 R1-2：.abs 形态右/下缘不破 8px 边距；居中形态禁传）、退化矩阵
 * （视口小于下限）、存取语义（垃圾/异常回落 null，与 window-drag 逐字对称）。
 * bundle 锚 describe 于 Task 5 Step 5 增补（前置：npm run build，见该 describe 守卫）。
 * 运行：node --test tests/client-window-resize.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SIZE_KEY,
  MIN_W,
  MIN_H,
  clampSize,
  loadPanelSize,
  savePanelSize,
} from "../src/client/window-resize.js";

const mapStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
};

const VP = { width: 1440, height: 900 };
const ZERO = { left: 0, right: 0, top: 0, bottom: 0 };

describe("window-resize 常量（契约锚）", () => {
  it("存储键与下限契约值", () => {
    assert.equal(SIZE_KEY, "dshm-panel-size");
    assert.equal(MIN_W, 640);
    assert.equal(MIN_H, 460);
  });
});

describe("clampSize 常规矩阵", () => {
  it("范围内请求原样返回", () => {
    assert.deepEqual(clampSize({ w: 1200, h: 800 }, VP, ZERO), { w: 1200, h: 800 });
  });
  it("超视口请求钳到视口−四周 8px", () => {
    assert.deepEqual(clampSize({ w: 1600, h: 1000 }, VP, ZERO), { w: 1424, h: 884 });
  });
  it("低于下限请求被抬起", () => {
    assert.deepEqual(clampSize({ w: 600, h: 300 }, VP, ZERO), { w: 640, h: 460 });
  });
  it("insets 参与上限（right=40 → maxW 再减 40）", () => {
    assert.deepEqual(clampSize({ w: 1600, h: 1000 }, VP, { ...ZERO, right: 40 }), { w: 1384, h: 884 });
  });
});

describe("clampSize origin 第二钳矩阵（评审 R1-2）", () => {
  it(".abs 形态：右/下缘钳回视口−8px 边距", () => {
    assert.deepEqual(clampSize({ w: 1424, h: 884 }, VP, ZERO, { left: 1032, top: 100 }), { w: 400, h: 792 });
  });
  it("居中形态：不传 origin 不受起始原点收紧", () => {
    assert.deepEqual(clampSize({ w: 1424, h: 884 }, VP, ZERO), { w: 1424, h: 884 });
  });
  it("origin 越界：Math.max(0,…) 退化守卫不产生负宽", () => {
    assert.deepEqual(clampSize({ w: 1424, h: 884 }, VP, ZERO, { left: 1400, top: 0 }), { w: 32, h: 884 });
  });
});

describe("clampSize 退化矩阵（视口小于下限）", () => {
  it("上限被视口压到 484×384，请求与下限一并收敛", () => {
    assert.deepEqual(clampSize({ w: 640, h: 460 }, { width: 500, height: 400 }, ZERO), { w: 484, h: 384 });
    assert.deepEqual(clampSize({ w: 100, h: 100 }, { width: 500, height: 400 }, ZERO), { w: 484, h: 384 });
  });
});

describe("尺寸记忆存取语义（与 window-drag 逐字对称）", () => {
  it("save 后 load 回 {w,h}", () => {
    const storage = mapStorage();
    savePanelSize(storage, { w: 1200, h: 800 });
    assert.deepEqual(loadPanelSize(storage), { w: 1200, h: 800 });
  });
  it("垃圾 JSON/缺字段/非有限数 → load 返回 null", () => {
    const broken = {
      getItem: (k) => (k === SIZE_KEY ? "not-json" : null),
      setItem: () => {},
    };
    assert.equal(loadPanelSize(broken), null);
    const missing = mapStorage();
    missing.setItem(SIZE_KEY, JSON.stringify({ w: 1200 }));
    assert.equal(loadPanelSize(missing), null);
    const nan = mapStorage();
    nan.setItem(SIZE_KEY, JSON.stringify({ w: Number.NaN, h: 800 }));
    assert.equal(loadPanelSize(nan), null);
  });
  it("save 非有限 → 抛 TypeError", () => {
    assert.throws(() => savePanelSize(mapStorage(), { w: Number.NaN, h: 800 }), TypeError);
    assert.throws(() => savePanelSize(mapStorage(), null), TypeError);
  });
  it("setItem 抛错 → save 静默（尺寸退化为会话级）", () => {
    const readonly = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    assert.doesNotThrow(() => savePanelSize(readonly, { w: 1200, h: 800 }));
  });
  it("storage 为 null → load 返回 null", () => {
    assert.equal(loadPanelSize(null), null);
  });
});
