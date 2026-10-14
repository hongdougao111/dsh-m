// 市场卡片渲染计数探针（钢人报告 2026-10-10 原 C3 遗留半边：「先测量再决定」）——手动运行，
// 不进 npm test（verify-panel-mobile.mjs 同款惯例）。
// 用法：node scripts/probe-render-count.mjs [--out DIR]（默认 node_modules/.dshm/render-probe，已 gitignore）
//
// 方法：零生产改动——探针内对 main.jsx 源做精确字符串变换（每处断言恰好命中一次，源漂移即中止）：
//   ① Card/Icon/MarketTab 函数体头部注入计数器自增（window.__dshmProbe 存在时才计，生产路径恒无此对象）；
//   ② MarketTab 调用点包一层 React.Profiler（dev UMD 下 onRender 真触发）拿每次 commit 的
//      actualDuration（该次 commit 渲染 Profiler 子树的纯 React 时间）。
// 场景（钢人报告点名四态）：boot 两段加载（cache-only 首段 + phase-2 补全）、翻页、搜索提交、
// mutation 后 refreshViews 四连响应（详情弹窗安装 → onMutation → market×2+installed+updates）。
// 本地 http 源 + /dshm 桩：合成目录 4,460 条（32/页默认）+ 精选 22 条；cache-only 回页不带
// latest 字段（latestComplete:false 触发第二段），full 回页带；安装后条目标 installed → 内容
// 真变化 → 零增量守卫放行 → 全量卡片重建被如实计数。图标用 npm-only 无头字母兜底，零外网。
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require2 = createRequire(join(root, 'package.json'))
const esbuild = require2('esbuild')
const { chromium } = require2('playwright-core')

const argv = process.argv.slice(2)
const outArg = argv.indexOf('--out')
const OUT = join(root, outArg >= 0 ? argv[outArg + 1] : 'node_modules/.dshm/render-probe')
mkdirSync(OUT, { recursive: true })

// ---- ① 源变换：插桩（断言每处恰好命中一次） ----
const src0 = readFileSync(join(root, 'src/client/main.jsx'), 'utf8')
const patched = []
const sub1 = (s, from, to, name) => {
  const n = s.split(from).length - 1
  if (n !== 1) throw new Error(`插桩锚点「${name}」命中 ${n} 次（应为 1）——main.jsx 已漂移，先更新探针锚点`)
  patched.push(name)
  return s.replace(from, to)
}
let src = src0
src = sub1(src,
  'function Card({ icon, name, badges, desc, sub, links, open, onToggle, detail, actions, topRight, byline, clampLines }) {',
  'function Card({ icon, name, badges, desc, sub, links, open, onToggle, detail, actions, topRight, byline, clampLines }) {\n  if (typeof window !== "undefined" && window.__dshmProbe) window.__dshmProbe.cards++;',
  'Card 计数')
src = sub1(src,
  'function Icon({ entry }) {',
  'function Icon({ entry }) {\n  if (typeof window !== "undefined" && window.__dshmProbe) window.__dshmProbe.icons++;',
  'Icon 计数')
src = sub1(src,
  'function MarketTab({ notify, markets, onMutation, ops, favorites, profileKind, onOpenOps }) {',
  'function MarketTab({ notify, markets, onMutation, ops, favorites, profileKind, onOpenOps }) {\n  if (typeof window !== "undefined" && window.__dshmProbe) window.__dshmProbe.tabs++;',
  'MarketTab 计数')
src = sub1(src,
  'tab === "market" ? h(MarketTab, { notify, markets, onMutation: refreshViews, ops, favorites, profileKind: profile?.kind ?? null, onOpenOps: openOps }) : null',
  'tab === "market" ? h(React.Profiler, { id: "market-tab", onRender: __dshmProbeOnRender }, h(MarketTab, { notify, markets, onMutation: refreshViews, ops, favorites, profileKind: profile?.kind ?? null, onOpenOps: openOps })) : null',
  'Profiler 包裹')
src = `function __dshmProbeOnRender(id, phase, actualDuration) { if (typeof window !== "undefined" && window.__dshmProbe) { window.__dshmProbe.commits++; window.__dshmProbe.renderMs += actualDuration; } }\n${src}\nmodule.exports = { __Apply: apply, __MountPanel: mountPanel };\n`

// ---- ② 打包（browser UMD 装载同 verify-panel-mobile） ----
const entry = join(root, 'src/client/.probe-render-entry.jsx')
writeFileSync(entry, src)
let bundle
try {
  await esbuild.build({
    entryPoints: [entry], bundle: true, platform: 'browser', format: 'cjs',
    outfile: join(OUT, 'bundle.cjs'), external: ['react', 'react-dom'],
    loader: { '.jsx': 'jsx' }, logLevel: 'silent',
  })
  bundle = readFileSync(join(OUT, 'bundle.cjs'), 'utf8')
} finally {
  try { rmSync(entry, { force: true }) } catch { /* 清理失败不阻塞 */ }
}
// profiling UMD = 生产速度 + Profiler onRender 可用（比 development UMD 诚实：不带 dev 版约 2× 的开销）
const reactUmd = readFileSync(join(root, 'node_modules/react/umd/react.profiling.min.js'), 'utf8')
const reactDomUmd = readFileSync(join(root, 'node_modules/react-dom/umd/react-dom.profiling.min.js'), 'utf8')

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<script>${reactUmd}<\/script>
<script>${reactDomUmd}<\/script>
<script>
window.__req = (n) => (n === 'react' ? window.React : n === 'react-dom' ? window.ReactDOM : null);
window.__dshmLongtasks = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__dshmLongtasks.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch (e) { /* longtask 不支持则留空 */ }
window.__dshm = (function (module, exports, require) {
${bundle}
  return module.exports;
})({ exports: {} }, {}, window.__req);
window.__dsmhProbeBoot = function () { window.__dshmProbe = { commits: 0, renderMs: 0, cards: 0, icons: 0, tabs: 0 }; window.__dshm.__Apply({ effect: (fn) => fn(), inject: () => {}, slots: { inject: () => {}, register: () => {} } }); window.__dshm.__MountPanel(); };
<\/script></body></html>`

// ---- ③ /dshm 桩：合成目录 + 两段加载相位 + 安装态 ----
const TOTAL = 4460, LIMIT = 32
const communityCatalog = Array.from({ length: TOTAL }, (_, i) => ({
  id: `probe-pkg-${i}`, name: `Probe Package ${i}`, community: true, source: 'npm',
  npm: `https://www.npmjs.com/package/probe-pkg-${i}`, owner: 'probe-dev',
  description: `合成目录条目 ${i}：渲染探针测量用，描述长度对齐真实社区目录的常见分布。`,
  downloads: ((i * 137) % 90000) + 100, stars: (i * 7) % 500,
}))
const primaryCatalog = Array.from({ length: 22 }, (_, i) => ({
  id: `probe-curated-${i}`, name: `Probe Curated ${i}`, source: 'npm',
  npm: `https://www.npmjs.com/package/probe-curated-${i}`,
  description: `精选合成条目 ${i}：渲染探针测量用。`, tags: ['tools'], verified: ['0.2.0-rc.2'],
}))
const installedIds = new Set()
const respondMarket = (b) => {
  const source = b.source || 'community'
  const q = typeof b.query === 'string' ? b.query.toLowerCase() : ''
  const cacheOnly = b.probeMode === 'cache-only'
  let pool = source === 'primary' ? primaryCatalog : communityCatalog
  if (source === 'all') pool = [...primaryCatalog, ...communityCatalog]
  const hits = q ? pool.filter((it) => it.name.toLowerCase().includes(q) || it.description.toLowerCase().includes(q)) : pool
  const offset = Number.isFinite(b.offset) ? b.offset : 0
  const limit = Number.isFinite(b.limit) ? b.limit : LIMIT
  const items = hits.slice(offset, offset + limit).map((it) => {
    const base = { ...it }
    if (installedIds.has(it.id)) { base.installed = true; base.installedVersion = '1.0.0' }
    if (!cacheOnly) base.latestVersion = `1.${(Number.parseInt(it.id.split('-').pop(), 10) || 0) % 9}.0`
    return base
  })
  return {
    ok: true, items, total: hits.length, offset, limit, categoryCounts: {},
    sourceCounts: { primary: source === 'primary' ? hits.length : q ? primaryCatalog.filter((it) => it.name.toLowerCase().includes(q)).length : 0, community: source === 'primary' ? 0 : hits.length },
    registryState: { status: 'ok', isDefault: true, count: source === 'primary' ? primaryCatalog.length : TOTAL },
    community: { enabled: true, status: 'ok', acceptedCount: TOTAL, upstreamCount: TOTAL },
    installedComplete: true, latestComplete: !cacheOnly, latestTimedOut: false,
  }
}

let active = 0
const server = (await import('node:http')).createServer((req, res) => {
  active++
  req.on('end', () => { active-- })
  const url = new URL(req.url, 'http://127.0.0.1')
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    let b = {}
    try { b = JSON.parse(body || '{}') } catch { /* 畸形按未知 method */ }
    const json = (obj) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)) }
    if (req.method === 'POST' && url.pathname === '/dshm') {
      if (b.method === 'ping') return json({ ok: true, version: '0.9.86', profile: { name: 'web', kind: 'web', source: 'fallback' } })
      if (b.method === 'market') return json(respondMarket(b))
      if (b.method === 'install') { installedIds.add(String(b.id || '')); return json({ ok: true, applied: true }) }
      if (b.method === 'installed') return json({ ok: true, items: [] })
      if (b.method === 'installedUpdates') return json({ ok: true, updates: [] })
      return json({ ok: false, error: 'probe-stub' })
    }
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(html)
  })
})
await new Promise((ready) => server.listen(0, '127.0.0.1', ready))
const BASE = `http://127.0.0.1:${server.address().port}/`

// ---- ④ 探针例程 ----
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const results = []
const read = (page) => page.evaluate(() => ({ ...window.__dshmProbe, domCards: document.querySelectorAll('.dshm-card').length, lt: window.__dshmLongtasks.length, ltMs: window.__dshmLongtasks.reduce((a, b) => a + b, 0) }))
const reset = (page) => page.evaluate(() => { const p = window.__dshmProbe; for (const k of Object.keys(p)) p[k] = 0; window.__dshmLongtasks.length = 0 })
const markT0 = (page) => page.evaluate(() => { window.__wt0 = performance.now() })
const wall = (page) => page.evaluate(() => (typeof window.__wt0 === 'number' ? Math.round(performance.now() - window.__wt0) : null))
const stable = async (page) => {
  let last = null, same = 0
  for (let i = 0; i < 250; i++) {
    const snap = JSON.stringify(await read(page))
    if (snap === last && active === 0) { if (++same >= 4) return } else same = 0
    last = snap
    await new Promise((r) => setTimeout(r, 120))
  }
  throw new Error('quiesce 超时（30s）')
}
const record = async (name, page, note = '') => {
  const w = await wall(page)
  const r = { name, ...readSync, wallMs: w, note }
  results.push(r)
  console.log(`${name.padEnd(24)} commits=${String(r.commits).padStart(3)}  renderMs=${r.renderMs.toFixed(1).padStart(7)}  cards=${String(r.cards).padStart(5)}  icons=${String(r.icons).padStart(5)}  tabs=${String(r.tabs).padStart(3)}  dom=${String(r.domCards).padStart(3)}  longtask=${String(r.lt).padStart(2)}个/${String(r.ltMs).padStart(4)}ms${note ? '  ' + note : ''}`)
}
let readSync = null

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await page.goto(BASE, { waitUntil: 'load' })
  await page.evaluate(() => window.__dsmhProbeBoot())
  await page.waitForSelector('.dshm-card', { timeout: 8000 })

  // S1 boot 两段加载：首段 commit（此刻快照 A）→ phase-2/primary 落地 → 静默（快照 B，delta=补全成本）
  const a = await read(page)
  await stable(page)
  readSync = await read(page)
  await record('S1 boot+phase-2 总量', page)
  const delta = { commits: readSync.commits - a.commits, renderMs: readSync.renderMs - (a.renderMs || 0), cards: readSync.cards - a.cards, icons: readSync.icons - a.icons, tabs: readSync.tabs - a.tabs }
  results.push({ name: 'S1 phase-2 补全 delta', ...delta, domCards: readSync.domCards, wallMs: null })
  console.log(`${'S1 phase-2 补全 delta'.padEnd(24)} commits=${String(delta.commits).padStart(3)}  renderMs=${delta.renderMs.toFixed(1).padStart(7)}  cards=${String(delta.cards).padStart(5)}  icons=${String(delta.icons).padStart(5)}  tabs=${String(delta.tabs).padStart(3)}  （本机桩零网络差，首卡可见前已并段）`)

  // S2 翻页：点页码 2（140 页 pager）
  reset(page); markT0(page)
  await page.$$eval('.dsvm-pager button', (bs) => { const b = bs.find((x) => x.textContent === '2'); if (b) b.click(); return Boolean(b) })
  await stable(page)
  readSync = await read(page)
  await record('S2 翻页→第2页', page)

  // S3 搜索提交（跨区全局语义）
  reset(page); markT0(page)
  await page.fill('.dshm-search input', 'Package 42')
  await page.press('.dshm-search input', 'Enter')
  await stable(page)
  readSync = await read(page)
  await record('S3 搜索提交', page, `'Package 42' 命中 ${readSync.domCards} 卡`)

  // S4 mutation 四连响应：清搜索回浏览态 → 点首卡开详情 → 安装 → refreshViews 四路 reload
  await page.fill('.dshm-search input', '')
  await page.press('.dshm-search input', 'Enter')
  await stable(page)
  reset(page); markT0(page)
  await page.click('.dshm-card')
  await page.waitForSelector('.dsvm-modalbox', { timeout: 5000 })
  await page.click('.dsvm-modalactions .dshm-btn.primary')
  await stable(page)
  readSync = await read(page)
  await record('S4 安装→refreshViews', page, '含 Modal 开合+op 泵+notify 横幅')
  await page.keyboard.press('Escape') // 关详情 Modal（installDone 后 Modal 留驻展示终态行）
  await stable(page)

  // ---- 96/页（MARKET_PAGE_SIZES 上限，最坏常规形态） ----
  // S5 切页大小 32→96：筛选弹层点选 96
  reset(page); markT0(page)
  await page.click('.dsvm-filterbtn')
  await page.waitForSelector('.dsvm-filterpop', { timeout: 5000 })
  await page.$$eval('.dsvm-filterpop button.dsvm-filteropt', (bs) => { const b = bs.find((x) => x.textContent.trim() === '96'); if (b) b.click(); return Boolean(b) })
  await page.click('.dsvm-filterback') // 选完页大小弹层留驻（设计如此），点背板关闭
  await stable(page)
  readSync = await read(page)
  await record('S5 切页大小→96/页', page)

  // S6 翻页@96
  reset(page); markT0(page)
  await page.$$eval('.dsvm-pager button', (bs) => { const b = bs.find((x) => x.textContent === '2'); if (b) b.click(); return Boolean(b) })
  await stable(page)
  readSync = await read(page)
  await record('S6 翻页@96', page)

  // S7 安装@96（第 2 页首卡，非已装条目）
  reset(page); markT0(page)
  await page.click('.dshm-card')
  await page.waitForSelector('.dsvm-modalbox', { timeout: 5000 })
  await page.click('.dsvm-modalactions .dshm-btn.primary')
  await stable(page)
  readSync = await read(page)
  await record('S7 安装@96→refreshViews', page, '含 Modal 开合+op 泵+notify 横幅')

  await ctx.close()
} finally {
  await browser.close()
  server.close()
}
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ transforms: patched, pageLimit: LIMIT, catalogTotal: TOTAL, results }, null, 2))
console.log(`\n产物：${join(OUT, 'results.json')}（插桩锚点 ${patched.join(' / ')}）`)
