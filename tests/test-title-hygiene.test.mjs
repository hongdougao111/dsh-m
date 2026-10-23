/**
 * 测试标题卫生守卫（评审 S-3，2026-10-23）：禁测试标题携带源码行号。
 * 病灶家族：标题里的 `main.jsx:921-922` 类行号随拆分/漂移静默过期——0.10.9 评审 O-4
 * 实证（zonechips-clip 标题引用的行号在逻辑迁出 main.jsx 后仍留在标题里）。
 * 规则：it/test 标题文本不得匹配 `\.[a-z]{2,4}:\d+`（文件名:行号形态，含 :N-M 区间）。
 * 端口/版本号等数字不以「扩展名:」前缀出现，不受影响。
 * 扫描面说明（评审 O-6a 说破）：本文件自身被排除在扫描外——这是功能必需而非偷懒：
 * 守卫的自证串含 `.test('…main.jsx:921…')` 形态，抓取正则的 `test\(` 分支会把自证串
 * 当标题命中，不排除即守卫自红（实验实证 exit 1）。已知盲区（2026-10-23 盘点，
 * 现状零受害者）：it.each/test.each/describe.each 表格标题不在扫描面；模板串标题在
 * 内嵌引号处截断——引入这些形态时改本守卫并在 CODING-STANDARDS 锚纪律节登记。
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

  it('守卫自证（端到端环，评审 O-6b）：抓取正则+判别正则的完整管线对病灶样本真判违、对干净样本零误报', () => {
    // 用与本文件顶部扫描完全相同的管线跑合成源——防未来重构抓取正则时守卫静默失明
    const capture = /(?:it|test)\(\s*["'`]([^"'`]+)/g
    const lineRef = /\.[a-z]{2,4}:\d+/
    const badSrc = `it('现状 main.jsx:921-922 展开态也写 autoRef', () => {})`
    const badHits = [...badSrc.matchAll(capture)].map((m) => m[1]).filter((t) => lineRef.test(t))
    assert.equal(badHits.length, 1, '病灶样本被端到端判违（O-4 原文形态）')
    const cleanSrc = `it('接线现居 zone-chips.jsx（符号锚表述）', () => {})`
    const cleanHits = [...cleanSrc.matchAll(capture)].map((m) => m[1]).filter((t) => lineRef.test(t))
    assert.equal(cleanHits.length, 0, '干净样本零误报')
  })
})
