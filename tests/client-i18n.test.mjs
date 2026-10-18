/**
 * i18n 完整性审计（0.10.5）：main.jsx 全部 lookup("key") 直接量必须落在字典定义内——
 * 0.10.4 真机 dogfood 实证：缺失键以裸键名 toast 给用户（upgrade.reconciled.done 事件，
 * 恢复对账横幅键漏定义）。动态前缀键（"cat." + id 等，尾点结尾）不在审计范围。
 * 运行：npm test 自动发现（node --test tests/）。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../src/client/main.jsx', import.meta.url), 'utf8')

describe('i18n 完整性审计（0.10.5：lookup 直接量必须有字典定义）', () => {
  const used = new Set()
  for (const m of src.matchAll(/lookup\("([^"]+)"/g)) {
    const k = m[1]
    if (!k.endsWith('.')) used.add(k)
  }
  const dictKeys = new Set()
  for (const m of src.matchAll(/"([a-zA-Z0-9._-]+)":\s*"/g)) dictKeys.add(m[1])

  it('全部 lookup 直接量键均有字典定义（防裸键名 toast 回归）', () => {
    const missing = [...used].filter((k) => !dictKeys.has(k)).sort()
    assert.deepEqual(missing, [], `缺失字典定义的键: ${missing.join(', ')}`)
  })

  it('审计自身健全性：抽查已知键在册', () => {
    for (const k of ['common.ok', 'notify.selfupgraded', 'failed.upgrade']) {
      assert.ok(dictKeys.has(k), `${k} 应在字典`)
    }
  })
})
