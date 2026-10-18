/**
 * 源锚卫生守卫（0.10.7）：tests/*.test.mjs 的源串锚（.includes 针）禁含 \n 转义——
 * CRLF 检出的工作树上，对「盘读内容」的多行锚恒真（永不触发 = 假绿；028 §4 第 3 项；
 * 0.10.4 dogfood 轮两例实证：C3 存量锚 + client-self-check 负向锚）。
 *
 * 豁免语义：对「内存生成字符串」的多行针按构造为 LF、无 CRLF 风险，逐条人工核验后
 * 登记进 ALLOWLIST（新增多行针 → 本测试红 → 核验后入表，防静默扩散）。
 * 本文件自身豁免扫描（守卫的正则字面量合法持有 \n 转义）。
 * 运行：npm test 自动发现（node --test tests/）。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const testsDir = dirname(fileURLToPath(import.meta.url))
const SELF = 'source-anchor-hygiene.test.mjs'
// 命中类：.includes( 的针字符串内含 \n 转义（多行锚）
const NEEDLE_RE = /\.includes\(\s*(['"`])[^'"`]*\\n/

// 豁免清单（逐条人工核验）：{ file, needle } —— needle 为该行包含的片段
const ALLOWLIST = [
  // exclude-governance：r.yaml 为内存生成的 YAML 串（LF by construction），非盘读内容
  { file: 'exclude-governance.test.mjs', needle: "r.yaml.includes('  - pkg\\n')" },
  { file: 'exclude-governance.test.mjs', needle: "r.yaml.includes('minimumReleaseAgeExclude:\\n  - pkg-a@1.0.0\\n')" },
]

const offenders = []
for (const f of readdirSync(testsDir).filter((n) => n.endsWith('.test.mjs') && n !== SELF)) {
  const lines = readFileSync(join(testsDir, f), 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    if (!NEEDLE_RE.test(line)) return
    const trimmed = line.trim()
    if (ALLOWLIST.some((a) => a.file === f && trimmed.includes(a.needle))) return
    offenders.push(`${f}:${i + 1}  ${trimmed.slice(0, 140)}`)
  })
}

describe('源锚卫生守卫（0.10.7）：盘读源串锚禁含 \\n 转义', () => {
  it(`tests/*.test.mjs 零未登记多行源串锚（现 ${offenders.length} 处违规）`, () => {
    assert.deepEqual(offenders, [], `以下源锚含 \\n 且未入豁免清单（CRLF 工作树恒真，假绿）：\n  ${offenders.join('\n  ')}`)
  })

  it('守卫自身健全性：样例多行锚能被捕获（防守卫正则失效）', () => {
    const sample = `assert.ok(src.includes('a\\nb'))`
    assert.ok(NEEDLE_RE.test(sample), '守卫正则能捕获多行锚样例')
  })

  it('豁免清单逐条仍在位（防清单腐化：源码改动后失效条目应清理）', () => {
    for (const a of ALLOWLIST) {
      const text = readFileSync(join(testsDir, a.file), 'utf8')
      assert.ok(text.includes(a.needle), `豁免条目失效（needle 已不在源中，清理该条）: ${a.file} :: ${a.needle}`)
    }
  })
})
