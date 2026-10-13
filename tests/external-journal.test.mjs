/**
 * Task 2（外部操作记录，ADR-0018）：机器本地外部操作日志存储单测。
 * 覆盖：append→list 降序、200 条滚动、clear、损坏容错（改名隔离）、
 * panel 通道拒绝（防御性不变量）、无凭据序列化、不可创建路径上抛、reason 截断。
 * 运行：npm run build && node --test tests/external-journal.test.mjs
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  appendExternalOperation,
  listExternalOperations,
  clearExternalOperations,
  removeExternalOperation,
  journalFile,
} from '../lib/core/external-journal.js'

let dir
let file
let prevEnv

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dshm-extjournal-'))
  file = join(dir, 'external-operations.json')
  prevEnv = process.env.DSHM_EXTERNAL_JOURNAL_FILE
  process.env.DSHM_EXTERNAL_JOURNAL_FILE = file
})

afterEach(() => {
  if (prevEnv === undefined) delete process.env.DSHM_EXTERNAL_JOURNAL_FILE
  else process.env.DSHM_EXTERNAL_JOURNAL_FILE = prevEnv
  rmSync(dir, { recursive: true, force: true })
})

const rec = (over = {}) => ({
  id: 'ext-1',
  at: 1_000,
  channel: 'cli',
  kind: 'upgrade',
  target: 'demo-pkg',
  result: 'ok',
  ...over,
})

describe('external-journal 存储', () => {
  it('①append→list 返回同记录且按 at 降序', async () => {
    await appendExternalOperation(rec({ id: 'a', at: 1_000 }))
    await appendExternalOperation(rec({ id: 'b', at: 2_000, result: 'failed', reason: 'boom' }))
    const list = await listExternalOperations()
    assert.equal(list.length, 2)
    assert.deepEqual(list.map((r) => r.id), ['b', 'a'])
    assert.equal(list[0].result, 'failed')
    assert.equal(list[0].reason, 'boom')
    // 缺省路径 = $DSH_HOME/dshm/external-operations.json（DSHM_EXTERNAL_JOURNAL_FILE 可整文件覆盖）
    assert.equal(journalFile(), file)
  })

  it('②第 201 条 append 后最旧一条被滚出（总数恒 ≤200）', async () => {
    for (let i = 1; i <= 201; i++) {
      await appendExternalOperation(rec({ id: `r${i}`, at: i }))
    }
    const list = await listExternalOperations()
    assert.equal(list.length, 200)
    // 最旧（at=1 / r1）被滚出；最新（r201）在最前
    assert.ok(!list.some((r) => r.id === 'r1'))
    assert.equal(list[0].id, 'r201')
  })

  it('③clear 后 list 为空且文件仍存在（空数组）', async () => {
    await appendExternalOperation(rec())
    await clearExternalOperations()
    assert.deepEqual(await listExternalOperations(), [])
    assert.ok(existsSync(file))
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), [])
  })

  it('④损坏文件：list 不抛、改名 .corrupt-<ts> 隔离、从空开始', async () => {
    writeFileSync(file, 'not-json', 'utf8')
    const list = await listExternalOperations()
    assert.deepEqual(list, [])
    const entries = (await import('node:fs')).readdirSync(dir)
    const quarantined = entries.filter((n) => n.startsWith('external-operations.json.corrupt-'))
    assert.equal(quarantined.length, 1, `应有且仅有一个 corrupt 隔离文件，实际: ${entries.join(',')}`)
    assert.equal(readFileSync(join(dir, quarantined[0]), 'utf8'), 'not-json')
    // 隔离后 append 从空开始，不残留旧记录
    await appendExternalOperation(rec({ id: 'fresh' }))
    const after = await listExternalOperations()
    assert.equal(after.length, 1)
    assert.equal(after[0].id, 'fresh')
  })

  it('⑤channel=panel 的记录被 append 拒绝（面板通道不走外部日志）', async () => {
    await assert.rejects(
      () => appendExternalOperation(rec({ channel: 'panel' })),
      /panel/,
    )
    assert.deepEqual(await listExternalOperations(), [])
  })

  it('⑥记录序列化后不含 token|key|secret 字样（无凭据断言）', async () => {
    await appendExternalOperation(
      rec({ id: 'cred-check', target: 'some-pkg', fromVersion: '1.0.0', toVersion: '2.0.0', reason: '升级完成' }),
    )
    const text = readFileSync(file, 'utf8')
    assert.doesNotMatch(text, /token|key|secret/i)
  })

  it('⑦不可创建路径 → append 抛错（存储契约：错误上抛，由上层钩子吞）', async () => {
    // 计划示例路径 /proc/.../x.json 在本机 Linux 会令 recursive mkdir 挂死（不抛错，实测），
    // 改用等价的确定失败形态：父路径是普通文件 → mkdir 立即抛（实测 EEXIST；契约不变：错误上抛）。
    writeFileSync(join(dir, 'blocker'), 'regular file', 'utf8')
    delete process.env.DSHM_EXTERNAL_JOURNAL_FILE
    process.env.DSHM_EXTERNAL_JOURNAL_FILE = join(dir, 'blocker', 'x.json')
    await assert.rejects(() => appendExternalOperation(rec()))
  })

  it('⑧reason 超 300 字符被截断', async () => {
    const long = 'x'.repeat(500)
    await appendExternalOperation(rec({ id: 'trunc', result: 'failed', reason: long }))
    const list = await listExternalOperations()
    assert.equal(list[0].reason.length, 300)
  })

  it('⑨removeExternalOperation 按 id 删除单条，其余保留（0.9.82 修订 R2-3）', async () => {
    await appendExternalOperation(rec({ id: 'a', at: 1_000 }))
    await appendExternalOperation(rec({ id: 'b', at: 2_000, result: 'failed', reason: 'boom' }))
    await removeExternalOperation('a')
    const list = await listExternalOperations()
    assert.equal(list.length, 1)
    assert.equal(list[0].id, 'b')
    assert.equal(list[0].result, 'failed')
  })

  it('⑩removeExternalOperation 对不存在的 id 静默 no-op（幂等）', async () => {
    await appendExternalOperation(rec({ id: 'keep' }))
    await removeExternalOperation('not-exist')
    const list = await listExternalOperations()
    assert.equal(list.length, 1)
    assert.equal(list[0].id, 'keep')
  })

  it('⑪删除后重读文件：JSON 可解析、长度减一、保留记录字段逐字段不变（删除不改写历史）', async () => {
    await appendExternalOperation(rec({ id: 'gone', at: 1_000 }))
    await appendExternalOperation(
      rec({ id: 'kept', at: 2_000, channel: 'host-tool', kind: 'toggle', target: 'pkg-x', result: 'failed', reason: 'boom' }),
    )
    await removeExternalOperation('gone')
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(raw.length, 1)
    assert.deepEqual(raw[0], {
      id: 'kept',
      at: 2_000,
      channel: 'host-tool',
      kind: 'toggle',
      target: 'pkg-x',
      result: 'failed',
      reason: 'boom',
    })
  })
})
