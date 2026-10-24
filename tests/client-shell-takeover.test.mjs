/**
 * 壳接管哨兵判定（issue #4）：负 priority 接管者分两档——
 * - 敌意换壳（原生页脚、不消费 footer.action 槽，ds-bot -10 档）→ 市场入口整行让位；
 * - 合作换壳（接管者页脚自己渲染 footer.action 槽条目，dsh-codex-ui 整壳替换 +
 *   .dcu-foot 逐条 only:id 渲染，源码锚 .dsh-research/dsh-codex-ui）→ 照常在场。
 * 合作名单按接管条目声明的 locale NS 匹配（fail-safe：未列名的负 priority 一律让位，
 * 保住 2026-10-13 ds-bot 裁定）。
 * 运行：npm run build && node --test tests/client-shell-takeover.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isNativeFootShell, COOPERATIVE_SHELL_LOCALES } from '../src/client/shell-takeover.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('isNativeFootShell：哨兵两档判别（issue #4）', () => {
  it('codex-ui 形态（priority -1 + locale NS 顶层字段）→ 合作换壳，不让位', () => {
    const entries = [{ options: { priority: -1 }, locale: 'michengai.codexUi' }]
    assert.equal(isNativeFootShell(entries), false)
  })

  it('codex-ui 形态（locale 在 options 内的变体）→ 同样不让位', () => {
    const entries = [{ options: { priority: -1, locale: 'michengai.codexUi' } }]
    assert.equal(isNativeFootShell(entries), false)
  })

  it('ds-bot 形态（负 priority、未列名 locale）→ 敌意换壳，整行让位（2026-10-13 裁定保持）', () => {
    const entries = [{ options: { priority: -10 }, locale: 'com.dsbot' }]
    assert.equal(isNativeFootShell(entries), true)
  })

  it('负 priority 且无 locale → fail-safe 让位（未列名一律视为敌意）', () => {
    assert.equal(isNativeFootShell([{ options: { priority: -1 } }]), true)
  })

  it('官方工作区树（priority 0/缺省）→ 不算接管', () => {
    assert.equal(isNativeFootShell([{ options: {} }]), false)
    assert.equal(isNativeFootShell([{ options: { priority: 0 }, locale: 'workspace' }]), false)
  })

  it('混合：官方 + 合作 → 不让位；官方 + 敌意 → 让位', () => {
    const official = { options: { priority: 0 }, locale: 'workspace' }
    const cooperative = { options: { priority: -1 }, locale: 'michengai.codexUi' }
    const hostile = { options: { priority: -10 }, locale: 'com.dsbot' }
    assert.equal(isNativeFootShell([official, cooperative]), false)
    assert.equal(isNativeFootShell([official, hostile]), true)
  })

  it('空列表 / null / 非数组 → false（无接管）', () => {
    assert.equal(isNativeFootShell([]), false)
    assert.equal(isNativeFootShell(null), false)
    assert.equal(isNativeFootShell(undefined), false)
  })

  it('列表中的 null 条目被跳过不误判', () => {
    assert.equal(isNativeFootShell([null, { options: { priority: -1 }, locale: 'michengai.codexUi' }]), false)
  })
})

describe('合作名单与接线锚', () => {
  it('合作名单含 codex-ui 的 locale NS（源码锚：.dsh-research/dsh-codex-ui locales.ts NS）', () => {
    assert.equal(COOPERATIVE_SHELL_LOCALES.has('michengai.codexUi'), true)
  })

  it('main.jsx 接线：哨兵改调 isNativeFootShell（import + 调用恰各一处）', () => {
    const main = readFileSync(join(root, 'src', 'client', 'main.jsx'), 'utf8')
    const hits = main.split('isNativeFootShell').length - 1
    assert.equal(hits, 2, `main.jsx 应恰有 import + 调用两处（实测 ${hits}）`)
    assert.equal(main.includes('entry.options.priority ?? 0') && main.includes('.some((entry)'), false, '旧内联判据应已移除')
  })
})
