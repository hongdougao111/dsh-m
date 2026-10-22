/**
 * 已装页两段加载合并/统计纯逻辑（ADR-0008）+ 0.10.0 降级恢复站点接线结构锚。
 * 运行：node --test tests/client-installed-updates.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { applyInstalledUpdates, installedUpdateStats } from '../src/client/installed-updates.js'

const base = { pkg: 'a', name: 'A', version: '1.0.0' }
const upd = (over = {}) => ({
  pkg: 'a', latestVersion: '2.0.0', latestTag: null, latestSha: null,
  outdated: true, latestError: null, latestErrorCode: null, ...over,
})

describe('applyInstalledUpdates', () => {
  it('七字段按 pkg 落位：outdated 与 latestError 项都在 updates 内', () => {
    const items = [{ ...base }, { pkg: 'b', name: 'B', version: '1.0.0' }]
    const updates = [
      upd(),
      { pkg: 'b', latestVersion: null, latestTag: null, latestSha: null, outdated: false, latestError: '更新检查未完成：超时', latestErrorCode: 'timeout' },
    ]
    const merged = applyInstalledUpdates(items, updates)
    assert.equal(merged[0].latestVersion, '2.0.0')
    assert.equal(merged[0].outdated, true)
    assert.equal(merged[1].latestError, '更新检查未完成：超时')
    assert.equal(merged[1].latestErrorCode, 'timeout')
    assert.equal(merged[1].outdated, false)
  })

  it('updates 缺席的 pkg 原样保留；未知 pkg 忽略', () => {
    const items = [{ ...base }, { pkg: 'c', name: 'C', version: '0.1.0' }]
    const merged = applyInstalledUpdates(items, [upd()])
    assert.equal(merged[1].latestVersion, undefined)
    assert.deepEqual(merged[1], { pkg: 'c', name: 'C', version: '0.1.0' })
  })

  it('不可变：原数组与原 item 对象不被改写', () => {
    const item = { ...base }
    const items = [item]
    applyInstalledUpdates(items, [upd()])
    assert.deepEqual(item, { pkg: 'a', name: 'A', version: '1.0.0' })
    assert.equal(items.length, 1)
  })

  it('items/updates 非数组安全降级', () => {
    assert.deepEqual(applyInstalledUpdates(null, [upd()]), [])
    assert.deepEqual(applyInstalledUpdates([{ ...base }], 'nope'), [{ ...base }])
    assert.deepEqual(applyInstalledUpdates(undefined, undefined), [])
  })
})

describe('installedUpdateStats', () => {
  it('分别计数 outdated 与 latestError；null 安全', () => {
    const items = [
      { pkg: 'a', outdated: true },
      { pkg: 'b', outdated: false, latestError: '更新检查未完成：超时' },
      { pkg: 'c', outdated: true, latestError: 'GitHub 更新检查预算已用尽' },
      { pkg: 'd', outdated: false },
    ]
    assert.deepEqual(installedUpdateStats(items), { outdatedCount: 2, incompleteCount: 2 })
    assert.deepEqual(installedUpdateStats(null), { outdatedCount: 0, incompleteCount: 0 })
  })
})

// ---------- 0.10.0 Task 10：降级恢复结局站点接线（main.jsx 源串结构锚；单行锚——避开 CRLF 多行锚陷阱） ----------
describe('降级恢复站点接线（0.10.0 Task 10：市场卡 + 已装列表两处升级站点）', () => {
  const src = readFileSync(new URL('../src/client/main.jsx', import.meta.url), 'utf8')
  const count = (needle) => src.split(needle).length - 1

  it('① 两处升级站点都先问降级分支（恰两处）', () => {
    assert.equal(count('const degraded = oc.degradedOutcome(res);'), 2, '市场卡 doUpgrade + 已装列表 doUpgrade 各一处')
  })

  it('② 降级分支 warn 通知、不进 upgradeOkText 成功臂（守卫分支恰两处）', () => {
    assert.equal(count('if (degraded) {'), 2)
    assert.equal(count('notify({ kind: "warn", text: degraded.text });'), 2, '降级走 warn（零「升级成功 vX→vY」路径）')
  })

  it('③ 市场卡站点同步 setInstallNote 降级句（恰一处；已装列表站点无 installNote 惯例）', () => {
    assert.equal(count('setInstallNote({ id: it.id, kind: "warn", text: degraded.text });'), 1)
  })

  it('④ 文案键双字典同层：op.degraded zh 逐字 + en 键在位（i18n.js 词典面——ADR-0023 T1）', () => {
    const i18nSrc = readFileSync(new URL('../src/client/i18n.js', import.meta.url), 'utf8')
    assert.ok(i18nSrc.includes('"op.degraded": "升级失败：新版安装未成功，已自动恢复旧版 {restoredTo}——插件当前可用，可稍后重试。"'), 'zh 字典逐字锚')
    assert.equal(i18nSrc.split('"op.degraded":').length - 1, 2, 'zh/en 各一枚')
  })
})

// ---------- 0.10.3（挂账 1 数据面）：升级目标版随 enqueue 落 meta（中断恢复对账的比对依据） ----------
describe('升级 enqueue meta 携带 toVersion（0.10.3：三站点单行锚）', () => {
  const src = readFileSync(new URL('../src/client/main.jsx', import.meta.url), 'utf8')
  const count = (needle) => src.split(needle).length - 1

  it('① chip 静默升级以运行时探测的 latest 为目标版', () => {
    assert.equal(count('{ npm: "dsh-m", toVersion: state.latest }'), 1)
  })

  it('② 已装列表以 updates 合并的 latestVersion 为目标版', () => {
    assert.equal(count('{ toVersion: it.latestVersion }'), 1)
  })

  it('③ 市场卡以卡片 latest 为目标版（升级站点 meta 原为空对象，第 4 参落 meta）', () => {
    assert.equal(count('{ toVersion: it.latest }'), 1, '市场卡 doUpgrade meta 锚')
  })
})
