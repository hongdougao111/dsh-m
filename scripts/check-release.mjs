#!/usr/bin/env node
/**
 * 发版前门禁（0.9.94 retro 落地，validate-registry.mjs 同款独立脚本惯例）。
 * 一条命令跑完 know-how 031/018 检查单的机器可判部分：
 *   1. 版本三处一致：package.json ≡ lock 根两字段；
 *   2. CHANGELOG 双语顶条均含该版本号（顶条版本号此前是人工核对项，现门禁化）；
 *   3. 本地 tag v<version> 存在且指向 HEAD（0.9.94 实录教训：tag 未建先 push 报 refspec 错）。
 * 用法：bump 版本 → 建 tag → `npm run check-release` → push。任一项不符 exit 1。
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
const version = pkg.version

const fails = []
const check = (label, cond, detail = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) fails.push(label)
}

check(`package.json version = ${version}`, typeof version === 'string' && version.length > 0)
check('lock 根字段 version 一致', lock.version === version, `lock.version = ${lock.version}`)
check('lock packages."" version 一致', lock.packages?.['']?.version === version, `packages."" = ${lock.packages?.['']?.version}`)

const lines = readFileSync(join(root, 'CHANGELOG.md'), 'utf8').split('\n')
const topAfter = (marker) => {
  const idx = lines.indexOf(marker)
  return idx === -1 ? null : lines.slice(idx + 1).find((l) => l.startsWith('### '))
}
const zhTop = topAfter('## 中文')
const enTop = topAfter('## English')
check(`CHANGELOG 中文顶条含 ${version}`, Boolean(zhTop && zhTop.includes(version)), zhTop ?? '（未找到条目）')
check(`CHANGELOG English 顶条含 ${version}`, Boolean(enTop && enTop.includes(version)), enTop ?? '（未找到条目）')

let tagHead = ''
try {
  tagHead = execSync(`git rev-parse "v${version}^{commit}"`, { cwd: root, encoding: 'utf8' }).trim()
} catch {
  /* tag 不存在 → 留空，下方判 ✗ */
}
const head = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim()
check(
  `tag v${version} 存在且指向 HEAD`,
  tagHead === head,
  tagHead === '' ? '本地无此 tag——先 git tag 再 push' : tagHead === head ? 'tag = HEAD' : `tag 指向 ${tagHead.slice(0, 8)} ≠ HEAD ${head.slice(0, 8)}`,
)

if (fails.length > 0) {
  console.error(`\n发版门禁未过（${fails.length} 项）：${fails.join('；')}`)
  process.exit(1)
}
console.log('\n发版门禁全过，可推送。')
