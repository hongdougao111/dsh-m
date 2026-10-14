// 0.9.84 设置页「关于」版本号源锚（client-lightbox.test.mjs 同款惯例：includes 级，
// 红灯语义是「文本变了」而非「行为变了」）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "src/client/main.jsx"), "utf8");

test("0.9.84 关于卡标题行 sub 挂裸版本号（缺失态零占位）", () => {
  // Section 的兼容逻辑：sub 为字符串 → 标题行右侧灰字；null → 无 sub。pluginVersion
  // 缺席（ping 失败）时槽位自然为空，与头部 chip「失败不留占位」同语义。
  assert.ok(
    src.includes('Section(lookup("settings.about"), version ? `v${version}` : null'),
    "关于卡 sub 槽挂裸版本号在",
  );
});

test("0.9.84 pluginVersion 接线 SettingsTab（ping 单一事实源，不新增数据通路）", () => {
  assert.ok(src.includes("function SettingsTab({ notify, onRegistryChanged, onForceMarket, opsRecords, onOpsClearFinished, onOpsRemove, version })"), "SettingsTab 签名收 version 在");
  assert.ok(/h\(SettingsTab, \{[^}]*version: pluginVersion/s.test(src), "调用点传 version: pluginVersion 在");
});
