// 0.9.94 retro：op-outcome 接线锚永久钉（client-about-version.test.mjs 同款源锚惯例，
// 红灯语义是「文本变了」——这里刻意如此：守卫五段装配回流 main.jsx 本身就该是红灯）。
// join(" | ") 恰为守卫全版五段装配特征（0.9.94 收敛时 3→0，见 CHANGELOG 0.9.94 与
// docs/patrols/2026-10-17.md）；mutationFailed 为六站点接线标识。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "src/client/main.jsx"), "utf8");
const count = (needle) => src.split(needle).length - 1;

test("0.9.94 守卫装配特征 join(\" | \") 在 main.jsx 归零（回流即红）", () => {
  assert.equal(count('join(" | ")'), 0, "守卫文案装配已单源 op-outcome.js，main.jsx 出现 join(\" | \") 即装配回流");
});

test("0.9.94 六站点 mutationFailed 接线在位（≥6，卸站点需同步改本锚）", () => {
  assert.ok(count("mutationFailed") >= 6, "mutationFailed 接线站点不足 6——变更结局投影有站点脱管");
});
