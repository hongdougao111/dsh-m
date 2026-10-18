#!/usr/bin/env node
/**
 * npm pack 产物断言（DESIGN.md §6）：从 stdin 读取 `npm pack --dry-run --json`，
 * 机器断言实际运行时包文件清单。用法：npm pack --dry-run --json | node scripts/assert-pack.mjs
 * 注意（0.10.4 实测）：PowerShell 管道下 stdin 可能为空/乱码——用 `cmd /c` 包裹整条管道，
 * 或分两步（输出落文件 → `< 文件` 喂 stdin）。
 * 注意（0.10.4 实测）：PowerShell 管道下 stdin 可能为空/乱码——用 `cmd /c` 包裹整条管道。
 * 0.10.7：断言规则重构为导出纯函数 packIssues(files)（check-release 门禁复用同一份规则），
 * CLI 行为由 import.meta.url 守卫（被 import 时不执行）。
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const REQUIRED = [
  'lib/host.js',
  'lib/client.js',
  'lib/cli.js',
  'registry.json',
  'README.md',
  'README.en.md',
  'cordis.patch.yml',
  'package.json',
]

// 0.10.4：DESIGN.md 与 CHANGELOG.md 移出发布面（仓库 docs/ 与根目录留存）——精确名单防回潜
export const FORBIDDEN_EXACT = ['docs/DESIGN.md', 'CHANGELOG.md']

export const FORBIDDEN_PREFIXES = ['src/', 'tests/', 'scripts/']

/** 纯断言：入参为 pack 产物的路径数组，返回 issues 字符串数组（空 = 通过）。 */
export function packIssues(files) {
  const issues = []
  const missing = REQUIRED.filter((f) => !files.includes(f))
  if (missing.length) issues.push(`缺少运行时文件: ${missing.join(', ')}`)
  const leaked = files.filter((f) => FORBIDDEN_PREFIXES.some((prefix) => f.startsWith(prefix)) || FORBIDDEN_EXACT.includes(f))
  if (leaked.length) issues.push(`不应打包的文件泄漏: ${leaked.join(', ')}`)
  return issues
}

/** 从 npm pack --dry-run --json 原始输出提取 files 路径数组（容忍 prepare 日志混入 + 新旧顶层形态）。 */
export function extractPackFiles(raw) {
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    const lines = raw.split('\n')
    const jsonStart = lines.findIndex((l) => {
      const s = l.trim()
      return s === '[' || s === '{'
    })
    if (jsonStart === -1) return null
    try {
      data = JSON.parse(lines.slice(jsonStart).join('\n'))
    } catch {
      return null
    }
  }
  let entry
  if (Array.isArray(data)) entry = data[0]
  else if (data && typeof data === 'object') {
    entry = Object.values(data).find((v) => v && typeof v === 'object' && Array.isArray(v.files)) ?? data
  } else entry = data
  return Array.isArray(entry?.files) ? entry.files.map((f) => String(f.path)) : null
}

function fail(message) {
  console.error(`✗ assert-pack: ${message}`)
  process.exit(1)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  let raw = ''
  try {
    raw = readFileSync(0, 'utf8')
  } catch (err) {
    fail(`无法读取 stdin（请用 npm pack --dry-run --json | 管道输入）：${err instanceof Error ? err.message : err}`)
  }
  const files = extractPackFiles(raw)
  if (!files) fail('pack 输出缺少 files 数组')
  const issues = packIssues(files)
  if (issues.length) fail(issues.join('；'))
  console.log(`✓ assert-pack: ${files.length} 个文件，运行时清单完整（host/client/cli/registry/双语 README；DESIGN.md/CHANGELOG.md 自 0.10.4 起移出发布面）`)
}
