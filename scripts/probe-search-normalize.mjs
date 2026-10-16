#!/usr/bin/env node
/**
 * 搜索归一化冷路径计时探针（2026-10-16 计划 Task 4；手动验收工具，不进 CI——render-probe 惯例）。
 *
 * 模式：
 *   node scripts/probe-search-normalize.mjs          语料全量 pass + 冷搜索复现（验收口径③）
 *   node scripts/probe-search-normalize.mjs --e2e    换代+首搜两口径（验收口径④；独立进程单独跑）
 *
 * 口径（评审 R1-P4/R2-R2 钉死）：
 * - 语料 pass：真实目录全部字段串（含重复，同真实负载），暖 2 遍后计时 5 遍取 p50。
 * - 冷搜索：条目深克隆 ×5（WeakMap 冷），第 1 次含 JIT 冷**单独记录**，p50 取第 2–5 次。
 * - --e2e：独立进程；第 1 次 listMarket = 冷进程建代+JIT 冷首搜（重启场景）；随后 loadRegistry
 *   包装器改写 fetchedAt 强制换代，第 2 次 = 重建+JIT 暖首搜（小时场景）；builds 增量 = 每次
 *   listMarket 返回后各取一次快照的相邻差分（不 reset，保 L1/L2 温态）。
 *
 * 产物：node_modules/.dshm/search-probe/results.json（gitignore 区）。
 * 目录缺失时打印提示并以已跑模式收尾（exit 0）。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listMarket } from '../lib/core/market.js'
import { loadRegistry as realLoadRegistry } from '../lib/core/registry.js'
import { fetchCommunityCatalog as realFetchCommunityCatalog } from '../lib/core/community.js'
import { listInstalledPlugins as realListInstalledPlugins } from '../lib/core/installed.js'
import { _mergedMarketStatsForTests } from '../lib/core/merged-market.js'
import { adaptCommunityCatalog } from '../lib/core/community-adapter.js'
import { normalizeSearchText, tokenizeSearchText, relevanceScore } from '../lib/core/search-relevance.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const CACHE_DIR = join(process.env.HOME ?? '', '.dsh', 'dshm', 'cache', 'host', 'awesome')
const OUT_DIR = join(ROOT, 'node_modules', '.dshm', 'search-probe')
const E2E = process.argv.includes('--e2e')

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}
const round1 = (n) => Math.round(n * 10) / 10

function pickCatalog(dir) {
  const files = readdirSync(dir).filter((f) => /^catalog-.+\.json$/.test(f))
  if (files.length === 0) return null
  const verOf = (f) => f.replace(/^catalog-/, '').replace(/\.json$/, '')
  const segs = (v) => v.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const cmp = (a, b) => {
    const sa = segs(a)
    const sb = segs(b)
    for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
      const d = (sa[i] ?? 0) - (sb[i] ?? 0)
      if (d !== 0) return d
    }
    return 0
  }
  let best = files[0]
  for (const f of files.slice(1)) if (cmp(verOf(f), verOf(best)) > 0) best = f
  return { path: join(dir, best), version: verOf(best) }
}

function loadEntries() {
  const catalog = pickCatalog(CACHE_DIR)
  if (!catalog) return null
  const raw = JSON.parse(readFileSync(catalog.path, 'utf8'))
  const adapted = adaptCommunityCatalog(raw, {})
  return { entries: Array.isArray(adapted) ? adapted : (adapted.entries ?? []), version: catalog.version }
}

function fieldStringsOf(entries) {
  const strs = []
  for (const e of entries) {
    for (const k of ['id', 'name', 'npm', 'owner', 'description', 'descriptionEn', 'category']) {
      const v = e[k]
      if (typeof v === 'string' && v !== '') strs.push(v)
    }
    if (Array.isArray(e.tags)) for (const t of e.tags) if (typeof t === 'string' && t !== '') strs.push(t)
  }
  return strs
}

const COLD_TERMS = tokenizeSearchText(normalizeSearchText('主题'))

/** 验收口径③：语料 pass + 冷搜索复现。 */
function measureSteady(entries) {
  const strs = fieldStringsOf(entries)
  const corpusRuns = []
  for (let i = 0; i < 2; i++) for (const s of strs) normalizeSearchText(s) // 暖 2 遍
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now()
    for (const s of strs) normalizeSearchText(s)
    corpusRuns.push(performance.now() - t0)
  }
  const coldRuns = []
  for (let i = 0; i < 5; i++) {
    const cloned = structuredClone(entries) // 新对象 → WeakMap 冷
    const t0 = performance.now()
    let hits = 0
    for (const e of cloned) if (relevanceScore(e, COLD_TERMS) > 0) hits++
    coldRuns.push(performance.now() - t0)
  }
  return {
    corpusPass: {
      strings: strs.length,
      runs: corpusRuns.map(round1),
      p50: round1(median(corpusRuns)),
      口径: '真实目录全部字段串（含重复），暖 2 遍后计时 5 遍取 p50',
    },
    coldSearch: {
      entries: entries.length,
      firstRunJitCold: round1(coldRuns[0]),
      runs2to5: coldRuns.slice(1).map(round1),
      p50: round1(median(coldRuns.slice(1))),
      口径: '深克隆 ×5 → WeakMap 冷；第 1 次含 JIT 冷单独记录；p50 取第 2–5 次',
    },
  }
}

/** 验收口径④：换代+首搜两口径（--e2e，独立进程）。 */
async function measureE2E() {
  let called = false
  const deps = {
    loadRegistry: async (cfg, opts) => {
      const loaded = await realLoadRegistry(cfg, opts)
      if (called) loaded.fetchedAt = new Date().toISOString() // 强制身份换代 → 下一次查询必重建
      called = true
      return loaded
    },
    fetchCommunityCatalog: realFetchCommunityCatalog,
    listInstalledPlugins: realListInstalledPlugins,
  }
  const opts = { query: '主题', source: 'all', limit: 10, withLatest: false, namespace: 'host' }
  const t1 = performance.now()
  const r1 = await listMarket({}, opts, deps)
  const s1 = _mergedMarketStatsForTests()
  const restartMs = performance.now() - t1
  const t2 = performance.now()
  const r2 = await listMarket({}, opts, deps)
  const s2 = _mergedMarketStatsForTests()
  const hourlyMs = performance.now() - t2
  return {
    restartScenario: {
      wallMs: round1(restartMs),
      items: r1.items.length,
      口径: '冷进程首调：L1/L2 冷建代 + JIT 冷首搜（≈宿主重启后首次搜索）',
    },
    hourlyScenario: {
      wallMs: round1(hourlyMs),
      items: r2.items.length,
      口径: 'fetchedAt 换代：重建 + JIT 暖首搜（≈每小时 SWR 落地后首次搜索）',
    },
    builds: { before: s1.builds, after: s2.builds, delta: s2.builds - s1.builds, 期望: 'delta=1（换代确实发生）' },
    对照基线: '换代 42–63ms + 冷首搜 ~330ms（2026-10-16 上午实测）；冷进程 wall ~173ms + ~330ms',
  }
}

mkdirSync(OUT_DIR, { recursive: true })
try {
  if (E2E) {
    const result = { generatedAt: new Date().toISOString(), node: process.version, mode: 'e2e', ...(await measureE2E()) }
    writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(result, null, 2))
    console.log('[probe:e2e] 重启场景（冷建代+JIT 冷首搜）:', result.restartScenario.wallMs, 'ms')
    console.log('[probe:e2e] 小时场景（换代重建+暖首搜）:', result.hourlyScenario.wallMs, 'ms')
    console.log('[probe:e2e] builds delta:', result.builds.delta, '（期望 1）')
    console.log('[probe:e2e] 结果:', join(OUT_DIR, 'results.json'))
  } else {
    const catalog = pickCatalog(CACHE_DIR)
    if (!catalog) {
      console.log('[probe] 未找到目录缓存（' + CACHE_DIR + '），跳过测量（exit 0）')
      writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), skipped: 'no catalog cache' }))
      process.exit(0)
    }
    const { entries, version } = loadEntries()
    const m = measureSteady(entries)
    const result = { generatedAt: new Date().toISOString(), node: process.version, mode: 'steady', catalog: version, ...m }
    writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(result, null, 2))
    console.log(`[probe] catalog=${version} entries=${m.coldSearch.entries} corpusStrings=${m.corpusPass.strings}`)
    console.log('[probe] 语料 pass p50:', m.corpusPass.p50, 'ms（门槛 ≤60；基线 256.8）runs=', m.corpusPass.runs)
    console.log('[probe] 冷搜索 首跑(JIT 冷):', m.coldSearch.firstRunJitCold, 'ms | p50(第2–5次):', m.coldSearch.p50, 'ms（门槛 ≤150；基线 324–364）runs2-5=', m.coldSearch.runs2to5)
    console.log('[probe] 结果:', join(OUT_DIR, 'results.json'))
  }
} catch (err) {
  console.error('[probe] 测量失败：', err?.message ?? err)
  process.exit(1)
}
