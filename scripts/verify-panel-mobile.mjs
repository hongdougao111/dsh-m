// 面板手机窄屏自适应（0.9.83）真浏览器验证——手动运行，不进 npm test（verify-lightbox.mjs 同款惯例）。
// 用法：node scripts/verify-panel-mobile.mjs [--out DIR]（默认 node_modules/.dshm/panel-probe，已 gitignore）
// 方法：esbuild 打包 main.jsx + 测试导出入口（放 src/client/ 才能解析相对 require，用后即删），
// UMD react 内嵌，真实 CSS 经 __Apply→ensureCss 注入，__MountPanel 挂真实面板。
// 本地 http 源 + /dshm 桩（评审 R2/R3）：setContent 的 opaque origin 会禁 localStorage、
// fetch 必败会让 pluginVersion 恒 null（chip 根本不渲染，断言空转）——故照 verify-lightbox
// 起 http 服务：GET / = 页面；POST /dshm 桩，ping 回真实形状（pluginVersion/profile 生效，
// chip 真渲染），其余 method 回 {ok:false}（api 抛错 → 既有 catch 落错误态/静默）。
// 覆盖：窄视口默认全屏 + FS_KEY 2×2 矩阵（评审 R4）/ winctl 可达 / 头部零溢出 / 标题切换 /
// seg 36px 触控 / 版本 chip 常态渲染且隐藏（A6b 非空转）与 warn 收拢为 ⬆（A6a，预置
// dshm-selfcheck 缓存）/ 还原态 overlay 8px / 宽视口回归。
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
const OUT = join(root, outArg >= 0 ? argv[outArg + 1] : 'node_modules/.dshm/panel-probe')
mkdirSync(OUT, { recursive: true })

const entry = join(root, 'src/client/.verify-panel-entry.jsx')
writeFileSync(entry, readFileSync(join(root, 'src/client/main.jsx'), 'utf8') + '\nmodule.exports = { __Apply: apply, __MountPanel: mountPanel };\n')
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
const reactUmd = readFileSync(join(root, 'node_modules/react/umd/react.development.js'), 'utf8')
const reactDomUmd = readFileSync(join(root, 'node_modules/react-dom/umd/react-dom.development.js'), 'utf8')

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<script>${reactUmd}<\/script>
<script>${reactDomUmd}<\/script>
<script>
window.__req = (n) => (n === 'react' ? window.React : n === 'react-dom' ? window.ReactDOM : null);
window.__dshm = (function (module, exports, require) {
${bundle}
  return module.exports;
})({ exports: {} }, {}, window.__req);
window.__dshm.__Apply({ effect: (fn) => fn(), inject: () => {}, slots: { inject: () => {}, register: () => {} } });
window.__boot = function () { window.__dshm.__MountPanel(); };
<\/script></body></html>`

const results = []
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }

// 本地 http 源（localStorage 可用，等价真实宿主；评审 R3）+ /dshm 桩（评审 R2）
const http = await import('node:http')
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (req.method === 'POST' && url.pathname === '/dshm') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      let method = ''
      try { method = JSON.parse(body || '{}').method || '' } catch { /* 畸形 body 按未知 method */ }
      const json = (obj) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)) }
      if (method === 'ping') return json({ ok: true, version: '0.9.82', profile: { name: 'web', kind: 'web', source: 'fallback' } })
      return json({ ok: false, error: 'probe-stub' }) // market/installed/self-check… → api 抛错 → 既有 catch 落错误态/静默
    })
    return
  }
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end(html)
})
await new Promise((ready) => server.listen(0, '127.0.0.1', ready))
const BASE = `http://127.0.0.1:${server.address().port}/`

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const wire = (p) => { p.on('pageerror', (e) => console.log('PAGEERROR', e.message)) }
const boot = async (page) => { await page.evaluate(() => window.__boot()); await page.waitForSelector('.dshm-panel', { timeout: 5000 }) }
const newPage = async (viewport) => {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  wire(page)
  await page.goto(BASE, { waitUntil: 'load' })
  return { ctx, page }
}
try {
  // ---- A 组：窄视口 393×852（手机竖屏）·干净 context ----
  const a = await newPage({ width: 393, height: 852 })
  await boot(a.page)

  ok('A1 窄视口默认全屏（FS_KEY 未设置）',
    await a.page.$eval('.dshm-panel', (el) => el.className.includes('full')))

  ok('A2 winctl 完整落在面板内（还原/关闭可达）',
    await a.page.$eval('.dshm-panel', (panel) => {
      const pr = panel.getBoundingClientRect()
      const wr = panel.querySelector('.dshm-winctl').getBoundingClientRect()
      return wr.left >= pr.left && wr.right <= pr.right + 0.5 && wr.top >= pr.top && wr.bottom <= pr.bottom + 0.5
    }))

  ok('A3 head 零横向溢出',
    await a.page.$eval('.dshm-head', (el) => el.scrollWidth <= el.clientWidth))

  const title = await a.page.$eval('.dshm-title', (el) => ({
    full: getComputedStyle(el.querySelector('.dshm-title-full')).display,
    short: getComputedStyle(el.querySelector('.dshm-title-short')).display,
  }))
  ok('A4 窄容器短标题显/全称隐', title.full === 'none' && title.short !== 'none', JSON.stringify(title))

  const seg = await a.page.$$eval('.dshm-seg button', (bs) => {
    const widths = bs.map((b) => b.getBoundingClientRect().width)
    return { h: bs[0].getBoundingClientRect().height, ws: getComputedStyle(bs[0]).whiteSpace, widths }
  })
  const even = seg.widths.every((w) => Math.abs(w - seg.widths[0]) < 2)
  ok('A5 seg 36px/nowrap/三键均分', Math.round(seg.h) === 36 && seg.ws === 'nowrap' && even, JSON.stringify(seg))

  // ping 桩使 pluginVersion='0.9.82' → 常态版本 chip 真渲染（评审 R2：先证非空转再断隐藏）
  await a.page.waitForSelector('.dshm-head > .dshm-verchip', { state: 'attached', timeout: 5000 }) // 评审 N2+N3：$eval 不自动等待；chip 按设计 display:none，必须 attached（默认 visible 必超时）
  const chip = await a.page.$eval('.dshm-head > .dshm-verchip', (el) => getComputedStyle(el).display).catch(() => 'absent')
  ok('A6b 常态版本 chip 已渲染且隐藏', chip === 'none', `display=${chip}`)

  await a.page.click('.dshm-winctl button:not(.danger)') // ⛶ 还原（http 源 FS_KEY 真实写入 '0'）
  await a.page.waitForTimeout(150)
  const pad = await a.page.$eval('.dshm-overlay', (el) => getComputedStyle(el).padding)
  ok('A7 还原态 overlay padding 8px', pad.includes('8px'), pad)
  await a.ctx.close()

  // ---- A 组补充：窄视口 + FS_KEY='0' + selfcheck outdated（评审 R4/R2）----
  const b = await newPage({ width: 393, height: 852 })
  await b.page.evaluate(() => {
    localStorage.setItem('dshm-panel-fullscreen', '0')
    localStorage.setItem('dshm-selfcheck', JSON.stringify({ ts: Date.now(), data: { current: '0.9.82', latest: '0.9.90', outdated: true, ahead: false } }))
  })
  await boot(b.page)
  ok('A8 窄视口 + FS_KEY=\'0\' 仍恒全屏（记忆不生效）',
    await b.page.$eval('.dshm-panel', (el) => el.className.includes('full')))
  await b.page.waitForSelector('.dshm-head > .dshm-verchip.warn', { timeout: 5000 }) // 评审 N2：同 A6b，消 ping 往返竞态
  const warn = await b.page.$eval('.dshm-head > .dshm-verchip.warn', (el) => {
    const d = (sel) => getComputedStyle(el.querySelector(sel)).display
    return { root: getComputedStyle(el).display, name: d('.dshm-dshchip-name'), v: d('.dshm-dshchip-v'), upv: d('.dshm-up-v'), tip: el.title }
  })
  ok('A6a warn chip 收拢为 ⬆（文字 span 全隐藏、tooltip 保留）',
    warn.root !== 'none' && warn.name === 'none' && warn.v === 'none' && warn.upv === 'none' && warn.tip.includes('0.9.90'),
    JSON.stringify(warn))
  await b.ctx.close()

  // ---- B 组：宽视口 1280×800（FS_KEY 语义回归）----
  const c = await newPage({ width: 1280, height: 800 })
  await boot(c.page)
  ok('B1 宽视口非全屏（FS_KEY 未设置，语义不变）',
    await c.page.$eval('.dshm-panel', (el) => !el.className.includes('full')))
  ok('B2 宽视口全称标题',
    await c.page.$eval('.dshm-title', (el) => getComputedStyle(el.querySelector('.dshm-title-full')).display !== 'none'))
  ok('B3 宽视口头部零溢出',
    await c.page.$eval('.dshm-head', (el) => el.scrollWidth <= el.clientWidth))
  await c.ctx.close()

  // ---- B 组补充：宽视口 + FS_KEY='1'（评审 R4：宽视口记忆照旧生效）----
  const d = await newPage({ width: 1280, height: 800 })
  await d.page.evaluate(() => localStorage.setItem('dshm-panel-fullscreen', '1'))
  await boot(d.page)
  ok('B4 宽视口 + FS_KEY=\'1\' → 初始全屏（记忆照旧）',
    await d.page.$eval('.dshm-panel', (el) => el.className.includes('full')))
  await d.ctx.close()
} finally {
  await browser.close()
  server.close()
}
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.pass).length
console.log(failed ? `\n${failed} 项失败` : '\n全部通过')
process.exit(failed ? 1 : 0)
