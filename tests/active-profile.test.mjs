/**
 * 0.9.0 Task 1：ActiveProfile 解析与能力表（docs/plans/2026-10-01-dual-profile-implementation-plan.md）。
 * 运行：npm run build && node --test tests/active-profile.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveActiveProfile,
  assertWriteAllowed,
  ProfileUnsupportedError,
  WRITE_GUIDANCE,
} from '../lib/core/active-profile.js'
import { webProfileDir } from '../lib/core/env.js'

/** 守卫式 ctx 桩：get 行为可编排。 */
function ctxOf({ get } = {}) {
  return { get }
}

describe('resolveActiveProfile：profileContext 存在时以宿主事实为准', () => {
  it('name=desktop → kind desktop、dir 取 profileContext、source=host', () => {
    const pc = { name: 'desktop', dir: '/tmp/dsh/profiles/desktop' }
    const p = resolveActiveProfile(ctxOf({ get: (n) => (n === 'profileContext' ? pc : undefined) }))
    assert.deepEqual(
      { name: p.name, kind: p.kind, dir: p.dir, source: p.source },
      { name: 'desktop', kind: 'desktop', dir: '/tmp/dsh/profiles/desktop', source: 'host' },
    )
  })

  it('name=web → kind web、source=host、dir 用宿主值（即使与 env 推导不同）', () => {
    const pc = { name: 'web', dir: '/tmp/dsh/profiles/web-custom' }
    const p = resolveActiveProfile(ctxOf({ get: (n) => (n === 'profileContext' ? pc : undefined) }))
    assert.equal(p.kind, 'web')
    assert.equal(p.source, 'host')
    assert.equal(p.dir, '/tmp/dsh/profiles/web-custom')
  })

  it('未知名 → kind unknown（显式拒写），事实仍取宿主', () => {
    const pc = { name: 'dev', dir: '/tmp/dsh/profiles/dev' }
    const p = resolveActiveProfile(ctxOf({ get: (n) => (n === 'profileContext' ? pc : undefined) }))
    assert.equal(p.kind, 'unknown')
    assert.equal(p.dir, '/tmp/dsh/profiles/dev')
    assert.equal(p.source, 'host')
  })

  it('畸形 profileContext（缺 name/dir）→ 降级 fallback，不抛', () => {
    const p = resolveActiveProfile(ctxOf({ get: () => ({ name: 42 }) }))
    assert.equal(p.source, 'fallback')
    assert.equal(p.kind, 'web')
    assert.equal(p.dir, webProfileDir())
  })
})

describe('resolveActiveProfile：profileContext 缺席 → fallback（旧宿主/测试）', () => {
  it('get 返回 undefined', () => {
    const p = resolveActiveProfile(ctxOf({ get: () => undefined }))
    assert.deepEqual(
      { name: p.name, kind: p.kind, source: p.source },
      { name: 'web', kind: 'web', source: 'fallback' },
    )
  })

  it('get 抛错 → fallback（不外泄宿主异常）', () => {
    const p = resolveActiveProfile(ctxOf({ get: () => { throw new Error('boom') } }))
    assert.equal(p.source, 'fallback')
    assert.equal(p.dir, webProfileDir())
  })

  it('无 get 方法 / null ctx → fallback', () => {
    assert.equal(resolveActiveProfile(ctxOf()).source, 'fallback')
    assert.equal(resolveActiveProfile(null).source, 'fallback')
    assert.equal(resolveActiveProfile(undefined).source, 'fallback')
  })
})

describe('assertWriteAllowed：能力表全矩阵', () => {
  const ACTIONS = ['install', 'set-enabled', 'upgrade', 'uninstall', 'self-upgrade', 'restart']

  it('web：全部放行', () => {
    for (const action of ACTIONS) {
      assert.doesNotThrow(() => assertWriteAllowed({ name: 'web', kind: 'web', dir: '/w', source: 'host' }, action))
    }
  })

  it('desktop：0.9.8 起 install / set-enabled / upgrade / uninstall / self-upgrade 全放行（dsh-market 同策略委派官方管理器）', () => {
    for (const action of ['install', 'set-enabled', 'upgrade', 'uninstall', 'self-upgrade']) {
      assert.doesNotThrow(() => assertWriteAllowed({ name: 'desktop', kind: 'desktop', dir: '/d', source: 'host' }, action), action)
    }
  })

  it('desktop：仅 restart → ProfileUnsupportedError 且字段完整（Electron 生命周期归官方壳）', () => {
    for (const action of ['restart']) {
      let caught = null
      try {
        assertWriteAllowed({ name: 'desktop', kind: 'desktop', dir: '/d', source: 'host' }, action)
      } catch (err) {
        caught = err
      }
      assert.ok(caught instanceof ProfileUnsupportedError, `${action} 应抛 ProfileUnsupportedError`)
      assert.equal(caught.code, 'unsupported-on-profile')
      assert.equal(caught.action, action)
      assert.equal(caught.profile, 'desktop')
      assert.equal(caught.guidance, WRITE_GUIDANCE[action])
      assert.ok(caught.message.includes(action), 'message 应含动作名')
      assert.ok(caught.message.includes(WRITE_GUIDANCE[action]), 'message 应含指引')
    }
  })

  it('0.10.0 Task 8：self-upgrade 指引不再指向 DSH Web，改指官方 Settings → Plugins remove + install（精确版本）', () => {
    const g = WRITE_GUIDANCE['self-upgrade']
    assert.ok(g.includes('Settings → Plugins'), '应含官方 Settings → Plugins 入口')
    assert.ok(g.includes('remove + install'), '应给出官方插件页 remove + install（精确版本）操作')
    assert.ok(!g.includes('DSH Web'), '不得再让用户「回 DSH Web」（desktop 形态失配指引，R7 顺带修复）')
  })

  it('unknown：全部拒绝', () => {
    for (const action of ACTIONS) {
      let caught = null
      try {
        assertWriteAllowed({ name: 'dev', kind: 'unknown', dir: '/x', source: 'host' }, action)
      } catch (err) {
        caught = err
      }
      assert.ok(caught instanceof ProfileUnsupportedError)
      assert.equal(caught.profile, 'dev')
    }
  })

  it('fallback（source=fallback, kind=web）按 web 放行——旧行为零漂移', () => {
    for (const action of ACTIONS) {
      assert.doesNotThrow(() => assertWriteAllowed({ name: 'web', kind: 'web', dir: webProfileDir(), source: 'fallback' }, action))
    }
  })
})

describe('resolveActiveProfile：宿主形态事实升级（issue #3/#6，generation-projection 探测）', () => {
  const pcOf = (name, dir) => ({ get: (n) => (n === 'profileContext' ? { name, dir } : undefined) })

  it('name=tauri（官方 dsh-tauri 实名，issue #3）→ kind desktop', () => {
    const p = resolveActiveProfile(ctxOf(pcOf('tauri', '/tmp/dsh/profiles/tauri')))
    assert.deepEqual(
      { name: p.name, kind: p.kind, source: p.source },
      { name: 'tauri', kind: 'desktop', source: 'host' },
    )
  })

  it('name=web + 投影事实（issue #6 dataelement 主案）→ 升级 kind desktop、名字不变', () => {
    const p = resolveActiveProfile(ctxOf(pcOf('web', '/tmp/dsh/profiles/web')), { generationProbe: () => true })
    assert.deepEqual(
      { name: p.name, kind: p.kind, dir: p.dir, source: p.source },
      { name: 'web', kind: 'desktop', dir: '/tmp/dsh/profiles/web', source: 'host' },
    )
  })

  it('name=web + 无投影事实 → kind web（真官方 web 不改道）', () => {
    const p = resolveActiveProfile(ctxOf(pcOf('web', '/tmp/dsh/profiles/web')), { generationProbe: () => false })
    assert.equal(p.kind, 'web')
  })

  it('未知名 + 投影事实 → 升级 desktop（事实优先于名字枚举；未知名零事实仍 unknown 拒写）', () => {
    assert.equal(resolveActiveProfile(ctxOf(pcOf('future-name', '/x')), { generationProbe: () => true }).kind, 'desktop')
    assert.equal(resolveActiveProfile(ctxOf(pcOf('future-name', '/x')), { generationProbe: () => false }).kind, 'unknown')
  })

  it('fallback（无 profileContext）不做探测、恒 web——旧行为零漂移', () => {
    let probed = false
    const p = resolveActiveProfile(ctxOf({ get: () => undefined }), { generationProbe: () => { probed = true; return true } })
    assert.equal(p.kind, 'web')
    assert.equal(p.source, 'fallback')
    assert.equal(probed, false, 'fallback 路径不得触发探测（旧行为零漂移）')
  })

  it('探测抛错 → 维持名字判定（事实不可得 ≠ 事实否定）', () => {
    const p = resolveActiveProfile(ctxOf(pcOf('web', '/tmp/dsh/profiles/web')), { generationProbe: () => { throw new Error('boom') } })
    assert.equal(p.kind, 'web')
  })
})

describe('WRITE_GUIDANCE：拒绝文案必须给可操作出口（issue #3 尾巴）', () => {
  it('install / set-enabled 指引非空且含官方插件页入口', () => {
    for (const action of ['install', 'set-enabled']) {
      const g = WRITE_GUIDANCE[action]
      assert.ok(typeof g === 'string' && g.length > 0, `${action} 指引不得为空串`)
      assert.ok(g.includes('Settings → Plugins'), `${action} 指引应含官方 Settings → Plugins 入口`)
    }
  })
})
