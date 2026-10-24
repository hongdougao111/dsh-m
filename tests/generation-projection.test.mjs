/**
 * generation 投影事实探测（issue #6）：单包/目录级判定 + lockfile 回退 + io 注入还原。
 * 全程 fake io——零真实符号链接（Windows 无特权 symlink EPERM，既有环境失败类）。
 * 运行：npm run build && node --test tests/generation-projection.test.mjs
 */
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'

import {
  isGenerationProjectionPkg,
  isGenerationProjectionDir,
  isGenerationTarget,
  _setProjectionIoForTests,
} from '../lib/core/generation-projection.js'

/** fake io 组装：按绝对路径表编排 lstat/readlink/readdir/readFile 行为。 */
function fakeIo({ links = {}, dirs = {}, files = {} } = {}) {
  const calls = { lstat: [], readlink: [], readdir: [], readfile: [] }
  return {
    calls,
    io: {
      lstatSync(path) {
        calls.lstat.push(path)
        const hit = links[path]
        if (!hit) throw new Error(`ENOENT ${path}`)
        return { isSymbolicLink: () => hit === 'link' }
      },
      readlinkSync(path) {
        calls.readlink.push(path)
        const target = Object.entries(links).find(([p, kind]) => p === path && kind === 'link')
        if (!target) throw new Error(`EINVAL ${path}`)
        return linkTargets[path] ?? ''
      },
      readdirSync(path) {
        calls.readdir.push(path)
        const hit = dirs[path]
        if (!hit) throw new Error(`ENOENT ${path}`)
        return hit
      },
      readFileSync(path) {
        calls.readfile.push(path)
        const hit = files[path]
        if (hit === undefined) throw new Error(`ENOENT ${path}`)
        return hit
      },
    },
  }
}

/** readlink 目标表（与 links 的 'link' 标记配对使用）。 */
let linkTargets = {}

afterEach(() => {
  _setProjectionIoForTests(null)
  linkTargets = {}
})

describe('isGenerationTarget：链接目标判定', () => {
  it('.generations 前缀目录命中（dataelement 形态）', () => {
    assert.equal(isGenerationTarget('../.generations/live/dsh-ppt+0.16.0+c835bca9a976/node_modules/dsh-ppt'), true)
  })

  it('generations/live 无点前缀也命中（防御发行版改名去点）', () => {
    assert.equal(isGenerationTarget('X:/app/generations/live/pkg+1.0.0+abc/pkg'), true)
    assert.equal(isGenerationTarget('X:\\app\\generations\\live\\pkg+1.0.0+abc\\pkg'), true)
  })

  it('pnpm 常规虚拟店不命中（官方 web 布局防误判）', () => {
    assert.equal(isGenerationTarget('../.pnpm/dsh-ppt@0.16.0/node_modules/dsh-ppt'), false)
  })

  it('普通相对路径不命中', () => {
    assert.equal(isGenerationTarget('../src/dsh-ppt'), false)
  })
})

describe('isGenerationProjectionPkg：单包探测', () => {
  const dir = 'P:/profiles/web'
  // 键路径必须与被测模块的 node:join 产物一致（win32 反斜杠 / posix 正斜杠）
  const linkPath = join(dir, 'node_modules', 'dsh-ppt')

  it('符号链接指向 .generations → true（issue #6 主案形态）', () => {
    linkTargets = { [linkPath]: '../.generations/live/dsh-ppt+0.16.0+c835/node_modules/dsh-ppt' }
    _setProjectionIoForTests(fakeIo({ links: { [linkPath]: 'link' } }).io)
    assert.equal(isGenerationProjectionPkg(dir, 'dsh-ppt'), true)
  })

  it('符号链接指向 .pnpm → false（官方 web pnpm 布局）', () => {
    linkTargets = { [linkPath]: '../.pnpm/dsh-ppt@0.16.0/node_modules/dsh-ppt' }
    _setProjectionIoForTests(fakeIo({ links: { [linkPath]: 'link' } }).io)
    assert.equal(isGenerationProjectionPkg(dir, 'dsh-ppt'), false)
  })

  it('实体目录（hoisted）→ false，不抛', () => {
    _setProjectionIoForTests(fakeIo({ links: { [linkPath]: 'dir' } }).io)
    assert.equal(isGenerationProjectionPkg(dir, 'dsh-ppt'), false)
  })

  it('条目不存在/读失败 → false（事实不可得 ≠ 投影）', () => {
    _setProjectionIoForTests(fakeIo({}).io)
    assert.equal(isGenerationProjectionPkg(dir, 'ghost'), false)
  })
})

describe('isGenerationProjectionDir：profile 级探测', () => {
  const dir = 'P:/profiles/web'
  const nm = join(dir, 'node_modules')

  it('顶层符号链接命中 .generations → true', () => {
    const link = join(nm, 'dsh-ppt')
    linkTargets = { [link]: '../.generations/live/dsh-ppt+0.16.0+c835/node_modules/dsh-ppt' }
    _setProjectionIoForTests(fakeIo({
      links: { [link]: 'link' },
      dirs: { [nm]: [{ name: 'dsh-ppt', isSymbolicLink: () => true, isDirectory: () => false }] },
    }).io)
    assert.equal(isGenerationProjectionDir(dir), true)
  })

  it('scoped 包一层下探命中 → true', () => {
    const scope = join(nm, '@scope')
    const link = join(scope, 'pkg-a')
    linkTargets = { [link]: '../../.generations/live/pkg-a+1.0.0+abc/node_modules/@scope/pkg-a' }
    _setProjectionIoForTests(fakeIo({
      links: { [link]: 'link' },
      dirs: {
        [nm]: [{ name: '@scope', isSymbolicLink: () => false, isDirectory: () => true }],
        [scope]: [{ name: 'pkg-a', isSymbolicLink: () => true, isDirectory: () => false }],
      },
    }).io)
    assert.equal(isGenerationProjectionDir(dir), true)
  })

  it('全部条目指向 .pnpm → false，且不回退 lockfile（有 node_modules 证据时）', () => {
    const link = join(nm, 'dsh-ppt')
    linkTargets = { [link]: '../.pnpm/dsh-ppt@0.16.0/node_modules/dsh-ppt' }
    const f = fakeIo({
      links: { [link]: 'link' },
      dirs: { [nm]: [{ name: 'dsh-ppt', isSymbolicLink: () => true, isDirectory: () => false }] },
      files: { [join(dir, 'pnpm-lock.yaml')]: 'dsh-ppt: link:../.generations/live/x\n' },
    })
    _setProjectionIoForTests(f.io)
    assert.equal(isGenerationProjectionDir(dir), false)
  })

  it('node_modules 不可读 → 回退 lockfile link: 证据（hoisted 变体）', () => {
    _setProjectionIoForTests(fakeIo({
      files: { [join(dir, 'pnpm-lock.yaml')]: "importers:\n  .:\n    dependencies:\n      dsh-ppt:\n        specifier: 0.16.0\n        version: link:../.generations/live/dsh-ppt+0.16.0+c835\n" },
    }).io)
    assert.equal(isGenerationProjectionDir(dir), true)
  })

  it('node_modules 与 lockfile 全不可得 → false（零证据维持名字判定）', () => {
    _setProjectionIoForTests(fakeIo({}).io)
    assert.equal(isGenerationProjectionDir(dir), false)
  })

  it('扫描有界：超过上限停止（异常大目录不拖死 apply）', () => {
    const many = []
    for (let i = 0; i < 500; i++) many.push({ name: `pkg-${i}`, isSymbolicLink: () => false, isDirectory: () => false })
    let readlinkCalls = 0
    const f = fakeIo({ dirs: { [nm]: many } })
    const orig = f.io.readlinkSync
    f.io.readlinkSync = (p) => { readlinkCalls += 1; return orig(p) }
    _setProjectionIoForTests(f.io)
    assert.equal(isGenerationProjectionDir(dir), false)
    assert.ok(f.calls.lstat.length <= 400, `lstat 次数应有界（实测 ${f.calls.lstat.length}）`)
    assert.equal(readlinkCalls, 0, '非符号链接条目不得触发 readlink')
  })
})
