/**
 * 依赖卫生守卫（issue #7 方案 3）：`dependencies` 不得出现 `@deepseek-ai/*` 包——
 * profile pnpm（nodeLinker: hoisted）会把它提升到 profile 顶层 node_modules，按
 * 「同名目录必赢」遮蔽应用自带核心包（官方 health 判危「遮蔽启动必需包」、启动壳
 * 拦重启；dsh-atomic-write@0.1.7-rc.2 遮蔽应用 0.2.1-rc.1 实案）。peerDependencies
 * 不受限——既有的 cordis/dsh-tools/schemastery peers 是兼容预检的载重结构
 * （dshm_install 按它做安装前 peer 预检），且版本一致时 health 仅记「注意」。
 * devDependencies 不受限（不入发布面、不进 profile）。
 * 运行：node --test tests/package-hygiene.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, globSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

describe('package.json 依赖卫生（issue #7）', () => {
  it('dependencies 零 @deepseek-ai/* 键（防 profile 顶层遮蔽应用自带包）', () => {
    const keys = Object.keys(manifest.dependencies ?? {})
    const offenders = keys.filter((k) => k.startsWith('@deepseek-ai/'))
    assert.deepEqual(offenders, [], `dependencies 不得包含 @deepseek-ai/*（防遮蔽；found=${offenders.join('、')}）`)
  })

  it('src/** 零 `@deepseek-ai/dsh-atomic-write` import（已 vendor 进 core/atomic-write.ts）', () => {
    const files = globSync(join(root, 'src', '**', '*.ts'))
    let hits = 0
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      hits += text.split(`from '@deepseek-ai/dsh-atomic-write'`).length - 1
      hits += text.split(`from "@deepseek-ai/dsh-atomic-write"`).length - 1
    }
    assert.equal(hits, 0, `src 内不得再 import @deepseek-ai/dsh-atomic-write（实测 ${hits} 处）`)
  })

  it('vendor 模块在位且导出齐（writeFileAtomic / withFileLock）', async () => {
    const mod = await import('../lib/core/atomic-write.js')
    assert.equal(typeof mod.writeFileAtomic, 'function')
    assert.equal(typeof mod.withFileLock, 'function')
    const source = readFileSync(join(root, 'src', 'core', 'atomic-write.ts'), 'utf8')
    assert.ok(source.includes('0.2.1-rc.1'), 'vendor 头必须锚定上游版本号（跟版 diff 依据）')
    assert.ok(source.includes('MIT'), 'vendor 头必须带上游许可证标注')
  })
})
