/**
 * 0.10.0 Task 1：自升级 intent ledger（ADR-0018 合规——panel 通道零外部日志，
 * 自升级 delegated 预写落独立 ledger，self-check 对账收口）。
 * 覆盖：write→read 回读（白名单外字段不落盘）、resolve 悬垂收口落盘、
 * 无文件 undefined、损坏容错（改名 .corrupt-<ts> 隔离后按空处理）。
 * 运行：npm run build && node --test tests/upgrade-intent.test.mjs
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  writeUpgradeIntent,
  readUpgradeIntent,
  resolveUpgradeIntent,
  upgradeIntentFile,
} from '../lib/core/upgrade-intent.js'

let dir
let file
let prevEnv

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dshm-upgrade-intent-'))
  file = join(dir, 'self-upgrade-intent.json')
  prevEnv = process.env.DSHM_UPGRADE_INTENT_FILE
  process.env.DSHM_UPGRADE_INTENT_FILE = file
})

afterEach(() => {
  if (prevEnv === undefined) delete process.env.DSHM_UPGRADE_INTENT_FILE
  else process.env.DSHM_UPGRADE_INTENT_FILE = prevEnv
  rmSync(dir, { recursive: true, force: true })
})

const rec = (over = {}) => ({
  target: 'dsh-m',
  version: '0.10.0',
  fromVersion: '0.9.94',
  at: 1_000,
  ...over,
})

describe('upgrade-intent 存储', () => {
  it('①write→read 回读相等（status 由 writer 盖章 delegated；白名单外字段不落盘）', async () => {
    await writeUpgradeIntent(rec({ junk: 'superset-field' }))
    const read = await readUpgradeIntent()
    assert.deepEqual(read, {
      target: 'dsh-m',
      version: '0.10.0',
      fromVersion: '0.9.94',
      at: 1_000,
      status: 'delegated',
    })
    assert.equal(upgradeIntentFile(), file)
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(raw.junk, undefined, '白名单外字段不得落盘')
  })

  it('②resolve 悬垂记录：返回被收口记录、status/outcome/resolvedAt/installedVersion 落盘；已 resolved 再 resolve → undefined', async () => {
    await writeUpgradeIntent(rec())
    const resolved = await resolveUpgradeIntent({ ok: true, installedVersion: '0.10.0' })
    assert.equal(resolved.status, 'resolved')
    assert.equal(resolved.outcome, 'ok')
    assert.equal(resolved.installedVersion, '0.10.0')
    assert.equal(typeof resolved.resolvedAt, 'number')
    // 原字段保留
    assert.equal(resolved.target, 'dsh-m')
    assert.equal(resolved.version, '0.10.0')
    assert.equal(resolved.fromVersion, '0.9.94')
    assert.equal(resolved.at, 1_000)
    // 落盘确认（回读 = 返回值）
    assert.deepEqual(await readUpgradeIntent(), resolved)
    // 已无悬垂：幂等 undefined（不冒充收口）
    assert.equal(await resolveUpgradeIntent({ ok: false }), undefined)
  })

  it('③resolve ok=false → outcome=failed 落盘（崩溃兜底网的失败收口形态）', async () => {
    await writeUpgradeIntent(rec())
    const resolved = await resolveUpgradeIntent({ ok: false })
    assert.equal(resolved.status, 'resolved')
    assert.equal(resolved.outcome, 'failed')
    assert.equal(resolved.installedVersion, undefined)
    assert.equal(typeof resolved.resolvedAt, 'number')
  })

  it('④无文件：read 返回 undefined、resolve 返回 undefined', async () => {
    assert.equal(await readUpgradeIntent(), undefined)
    assert.equal(await resolveUpgradeIntent({ ok: true }), undefined)
  })

  it('⑤损坏文件：read 不抛、改名 .corrupt-<ts> 隔离留证、按空处理（resolve undefined），隔离后可重新 write', async () => {
    writeFileSync(file, 'not-json', 'utf8')
    assert.equal(await readUpgradeIntent(), undefined)
    const entries = readdirSync(dir)
    const quarantined = entries.filter((n) => n.startsWith('self-upgrade-intent.json.corrupt-'))
    assert.equal(quarantined.length, 1, `应有且仅有一个 corrupt 隔离文件，实际: ${entries.join(',')}`)
    assert.equal(readFileSync(join(dir, quarantined[0]), 'utf8'), 'not-json')
    // 按空处理：无悬垂可收口
    assert.equal(await resolveUpgradeIntent({ ok: true }), undefined)
    // 隔离后从干净状态开始
    await writeUpgradeIntent(rec())
    assert.equal((await readUpgradeIntent()).status, 'delegated')
  })
})
