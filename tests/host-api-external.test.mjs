/**
 * Task 4（外部操作记录，ADR-0018）：host-api 读取与清除 method 单测——
 * external-operations → {ok:true, records:[...]}；external-operations-clear → {ok:true}；
 * external-operations-remove → {ok:true}（0.9.82 修订 R2-3：外部 failed 行单条 ✕ 的服务端出口）；
 * 三 method 沿既有宿主信任检查（panel 会话要求，零新增特例）；overrides 注入位与既有模式同形。
 * 驱动方式沿用 host-api.test.mjs：createApiDispatcher + mock req/res，不 mock HTTP 层。
 * 运行：npm run build && node --test tests/host-api-external.test.mjs
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createApiDispatcher } from '../lib/core/host-api.js'
import { createRegistryController } from '../lib/core/registry-controller.js'
import { appendExternalOperation, listExternalOperations } from '../lib/core/external-journal.js'

// 隔离 cacheRoot + journal（不触碰真实 ~/.dsh，同 host-api.test.mjs 纪律）
let cacheRoot = ''
beforeEach(() => {
  cacheRoot = mkdtempSync(join(tmpdir(), 'dshm-apiext-'))
  process.env.DSHM_CACHE_DIR = cacheRoot
  process.env.DSHM_EXTERNAL_JOURNAL_FILE = join(cacheRoot, 'external-operations.json')
})
afterEach(() => {
  delete process.env.DSHM_CACHE_DIR
  delete process.env.DSHM_EXTERNAL_JOURNAL_FILE
  if (cacheRoot) rmSync(cacheRoot, { recursive: true, force: true })
})

/** 极简 req/res 替身（转写 host-api.test.mjs mockReq/mockRes 的 EventEmitter 形态）。 */
function req2(body) {
  const req = new EventEmitter()
  req.method = 'POST'
  req.url = '/dshm'
  req.headers = { 'content-type': 'application/json', origin: 'http://127.0.0.1:3080', host: '127.0.0.1:3080' }
  req.resume = () => {}
  queueMicrotask(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)))
    req.emit('end')
  })
  return req
}

function res2() {
  const res = new EventEmitter()
  res.statusCode = null
  res.bodyText = ''
  res.writeHead = (status) => { res.statusCode = status }
  res.end = (text) => { res.bodyText = text ?? ''; res.finished = true }
  return res
}

function setup(overrides = {}) {
  const dispatcher = createApiDispatcher({
    controller: createRegistryController({}),
    pkg: { name: 'dsh-m', version: '0.0.0-test' },
    profile: { name: 'web', kind: 'web', dir: '/tmp/profile', source: 'fallback' },
    deps: {
      resolveDshVersion: async () => '0.0.0-dsh-test',
      rejectRequest: () => undefined,
      getCommunitySummary: async () => ({ enabled: false, status: 'disabled', version: null, checkedAt: null, fetchedAt: null, route: null, acceptedCount: 0, upstreamCount: null, displaced: 0, skippedDirty: 0, skippedSubpathNoNpm: 0, errors: [], warnings: [] }),
      ...overrides,
    },
  })
  return dispatcher
}

async function callApi(dispatcher, body) {
  const res = res2()
  await dispatcher(req2(body), res)
  let parsed = null
  try { parsed = JSON.parse(res.bodyText) } catch { /* raw */ }
  return { status: res.statusCode, body: parsed }
}

const rec = (over = {}) => ({ id: 'ext-1', at: 1_000, channel: 'cli', kind: 'upgrade', target: 'demo-pkg', result: 'ok', ...over })

describe('host-api × 外部操作读取/清除（Task 4）', () => {
  it('external-operations 返回 journal 内容（直通 listExternalOperations）', async () => {
    await appendExternalOperation(rec({ id: 'a' }))
    await appendExternalOperation(rec({ id: 'b', at: 2_000, channel: 'host-tool', kind: 'install', target: 'x' }))
    const { status, body } = await callApi(setup(), { method: 'external-operations' })
    assert.equal(status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.records.length, 2)
    assert.deepEqual(body.records.map((r) => r.id), ['b', 'a'], '按 at 降序')
  })

  it('external-operations-clear 后 journal 为空且再次 list 为空', async () => {
    await appendExternalOperation(rec())
    const clear = await callApi(setup(), { method: 'external-operations-clear' })
    assert.equal(clear.status, 200)
    assert.equal(clear.body.ok, true)
    assert.deepEqual(await listExternalOperations(), [])
    const again = await callApi(setup(), { method: 'external-operations' })
    assert.deepEqual(again.body.records, [])
  })

  it('两 method 均要求面板会话（沿既有宿主信任检查，零新增特例）', async () => {
    const dispatcher = setup({ rejectRequest: () => 401 })
    const list = await callApi(dispatcher, { method: 'external-operations' })
    const clear = await callApi(dispatcher, { method: 'external-operations-clear' })
    assert.equal(list.status, 401)
    assert.equal(clear.status, 401)
  })

  it('overrides 注入位：dispatcher 消费注入的 list/clear（与既有模式同形）', async () => {
    const calls = { list: 0, clear: 0 }
    const dispatcher = setup({
      listExternalOperations: async () => { calls.list += 1; return [rec({ id: 'injected' })] },
      clearExternalOperations: async () => { calls.clear += 1 },
    })
    const list = await callApi(dispatcher, { method: 'external-operations' })
    assert.deepEqual(list.body.records.map((r) => r.id), ['injected'])
    await callApi(dispatcher, { method: 'external-operations-clear' })
    assert.deepEqual(calls, { list: 1, clear: 1 })
  })
})

describe('host-api × 外部单条移除（0.9.82 修订 R2-3）', () => {
  it('external-operations-remove 按 id 删除且再 list 只剩其余（直通真实现）', async () => {
    await appendExternalOperation(rec({ id: 'a', at: 1_000 }))
    await appendExternalOperation(rec({ id: 'b', at: 2_000, channel: 'host-tool', kind: 'install', target: 'x', result: 'failed' }))
    const removed = await callApi(setup(), { method: 'external-operations-remove', id: 'a' })
    assert.equal(removed.status, 200)
    assert.equal(removed.body.ok, true)
    const list = await callApi(setup(), { method: 'external-operations' })
    assert.deepEqual(list.body.records.map((r) => r.id), ['b'])
  })

  it('缺 id 与 id 非字符串 → 400（错误信息含 id）', async () => {
    const missing = await callApi(setup(), { method: 'external-operations-remove' })
    assert.equal(missing.status, 400)
    assert.match(String(missing.body?.error || missing.body || ''), /id/)
    const nonString = await callApi(setup(), { method: 'external-operations-remove', id: 123 })
    assert.equal(nonString.status, 400)
    assert.match(String(nonString.body?.error || nonString.body || ''), /id/)
  })

  it('overrides 注入位：dispatcher 消费注入的 removeExternalOperation（真实现未被触达）', async () => {
    const seen = []
    const dispatcher = setup({
      removeExternalOperation: async (id) => { seen.push(id) },
    })
    const res = await callApi(dispatcher, { method: 'external-operations-remove', id: 'ext-9' })
    assert.equal(res.status, 200)
    assert.equal(res.body.ok, true)
    assert.deepEqual(seen, ['ext-9'])
  })

  it('external-operations-remove 同样要求面板会话（沿既有宿主信任检查，实现前即应 401）', async () => {
    const dispatcher = setup({ rejectRequest: () => 401 })
    const res = await callApi(dispatcher, { method: 'external-operations-remove', id: 'ext-1' })
    assert.equal(res.status, 401)
  })
})
