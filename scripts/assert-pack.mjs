#!/usr/bin/env node
/**
 * npm pack 产物断言（DESIGN.md §6）：从 stdin 读取 `npm pack --dry-run --json`，
 * 机器断言实际运行时包文件清单。用法：npm pack --dry-run --json | node scripts/assert-pack.mjs
 */
import { readFileSync } from 'node:fs'

const REQUIRED = [
  'lib/host.js',
  'lib/client.js',
  'lib/cli.js',
  'registry.json',
  'README.md',
  'README.en.md',
  'cordis.patch.yml',
  'package.json',
]

// 0.10.4：DESIGN.md 移出发布面（仅仓库 docs/ 留存）——FORBIDDEN 精确名单防回潜
const FORBIDDEN_EXACT = ['docs/DESIGN.md']

const FORBIDDEN_PREFIXES = ['src/', 'tests/', 'scripts/']

function fail(message) {
  console.error(`✗ assert-pack: ${message}`)
  process.exit(1)
}

let raw = ''
try {
  raw = readFileSync(0, 'utf8')
} catch (err) {
  fail(`无法读取 stdin（请用 npm pack --dry-run --json | 管道输入）：${err instanceof Error ? err.message : err}`)
}
let data
try {
  data = JSON.parse(raw)
} catch {
  // npm pack 会先执行 prepare（形如 `[dsh-m] build: …` 的日志混入 stdout）：
  // pack JSON 是 pretty-print 多行，从第一条独占一行的 `[` 或 `{` 开始解析。
  // （0.10.4：兼容新旧 npm 两种顶层形态——老版裸数组 `[...]`，新版对象 `{"<name>": {...}}`。）
  const lines = raw.split('\n')
  const jsonStart = lines.findIndex((l) => {
    const s = l.trim()
    return s === '[' || s === '{'
  })
  if (jsonStart === -1) fail('stdin 中找不到 JSON 输出（prepare 日志污染且无 pack JSON）')
  try {
    data = JSON.parse(lines.slice(jsonStart).join('\n'))
  } catch (err) {
    fail(`stdin 不是合法 JSON：${err instanceof Error ? err.message : err}`)
  }
}
let entry
if (Array.isArray(data)) entry = data[0]
else if (data && typeof data === 'object') {
  // 新版 npm 顶层为 `{ "<pkg>": { files: [...] } }`——取带 files 数组的那个值
  entry = Object.values(data).find((v) => v && typeof v === 'object' && Array.isArray(v.files)) ?? data
} else entry = data
const files = Array.isArray(entry?.files) ? entry.files.map((f) => String(f.path)) : null
if (!files) fail('pack 输出缺少 files 数组')

const missing = REQUIRED.filter((f) => !files.includes(f))
if (missing.length) fail(`缺少运行时文件: ${missing.join(', ')}`)

const leaked = files.filter((f) => FORBIDDEN_PREFIXES.some((prefix) => f.startsWith(prefix)) || FORBIDDEN_EXACT.includes(f))
if (leaked.length) fail(`不应打包的文件泄漏: ${leaked.join(', ')}`)

console.log(`✓ assert-pack: ${files.length} 个文件，运行时清单完整（host/client/cli/registry/双语 README；DESIGN.md 自 0.10.4 起移出发布面）`)
