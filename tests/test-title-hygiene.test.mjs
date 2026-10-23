/**
 * 测试标题卫生守卫（评审 S-3，2026-10-23）：禁测试标题携带源码行号。
 * 病灶家族：标题里的 `main.jsx:921-922` 类行号随拆分/漂移静默过期——0.10.9 评审 O-4
 * 实证（zonechips-clip 标题引用的行号在逻辑迁出 main.jsx 后仍留在标题里）。
 * 规则：it/test 标题文本不得匹配 `\.[a-z]{2,4}:\d+`（文件名:行号形态，含 :N-M 区间）。
 * 端口/版本号等数字不以「扩展名:」前缀出现，不受影响。守卫本身零扫描排除项——
 * 新增合法形态时改本守卫并在 CODING-STANDARDS 锚纪律节登记理由。
 * 运行：npm test 自动发现（node --test tests/）。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const files = readdirSync(here).filter((f) => f.endsWith('.test.mjs') && f !== 'test-title-hygiene.test.mjs')

describe('测试标题卫生：禁携源码行号（评审 S-3）', () => {
  it('全部 it/test 标题不含「文件名:行号」形态引用', () => {
    const offenders = []
    const re = /(?:it|test)\(\s*["'`]([^"'`]+)/g
    const lineRef = /\.[a-z]{2,4}:\d+/
    for (const f of files) {
      const src = readFileSync(join(here, f), 'utf8')
      for (const m of src.matchAll(re)) {
        if (lineRef.test(m[1])) offenders.push(`${f} :: ${m[1].slice(0, 90)}`)
      }
    }
    assert.deepEqual(offenders, [], `标题携行号的测试（改用符号锚表述）:\n${offenders.join('\n')}`)
  })

  it('守卫自证：行号形态样本确实被本规则判违（永真/永假自证）', () => {
    const lineRef = /\.[a-z]{2,4}:\d+/
    assert.ok(lineRef.test('现状 main.jsx:921-922 展开态也写 autoRef'), '样本（O-4 原病灶）判违')
    assert.ok(!lineRef.test('端口 3080 服务健康'), '端口数字不误伤')
    assert.ok(!lineRef.test('接线现居 zone-chips.jsx（符号锚表述）'), '符号锚表述不误伤')
  })
})
