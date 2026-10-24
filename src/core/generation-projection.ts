/**
 * generation 投影事实探测（issue #6；ADR-0005 已知官方 Desktop 用
 * `$DSH_HOME/profiles/.generations/…` 代际工作区装插件）。
 *
 * 判定事实（不看 profile 名字——dataelement/dsh-desktop 的日常 profile 就叫 `web`，
 * 名字枚举必然继续漏）：node_modules/<pkg> 是符号链接且目标指向 .generations
 * （或 generations/live 代际目录）。官方 web 的 pnpm 布局链接目标是 .pnpm/…，
 * 不会误命中；hoisted 变体（无符号链接）回退 lockfile `link:` 规格证据。
 *
 * 纪律边界：这是对宿主已声明 profileContext.dir 的**形态**读取（投影 = 宿主代际
 * 系统拥有写路径），不是 ADR-0005 禁止的「按文件存在性猜 profile 身份」——身份
 * 仍唯一来自 profileContext；本模块只回答「这个已确认 profile 由谁管写」。
 *
 * 为什么不用「pluginManager 服务存在性」判桌面：官方 Web 宿主同样提供
 * pluginManager（dsh-m 的 web 开关路径就在委派它，ADR-0001），存在性 ≠ 桌面。
 */
import { lstatSync, readlinkSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

interface DirentLike {
  isSymbolicLink(): boolean
  isDirectory(): boolean
  name: string
}

/** io 缝：全部走注入（测试零真实符号链接——Windows 无特权 symlink EPERM）。 */
export interface ProjectionIo {
  lstatSync(path: string): { isSymbolicLink(): boolean }
  readlinkSync(path: string): string
  readdirSync(path: string, opts: { withFileTypes: true }): DirentLike[]
  readFileSync(path: string, encoding: 'utf8'): string
}

const defaultIo: ProjectionIo = {
  lstatSync: (path) => {
    const st = lstatSync(path)
    return { isSymbolicLink: () => st.isSymbolicLink() }
  },
  readlinkSync: (path) => readlinkSync(path),
  readdirSync: (path, opts) => readdirSync(path, opts),
  readFileSync: (path, encoding) => readFileSync(path, encoding),
}

let io: ProjectionIo = defaultIo

/** 测试注入口（null = 还原默认真实 io）。 */
export function _setProjectionIoForTests(override: Partial<ProjectionIo> | null): void {
  io = override ? { ...defaultIo, ...override } : defaultIo
}

/** 链接目标判定：指向 .generations（或 generations/live 代际目录）即投影。 */
export function isGenerationTarget(target: string): boolean {
  return target.includes('.generations') || /generations[/\\]live/.test(target)
}

/** 单包探测：node_modules/<pkg> 是否为指向 .generations 的符号链接。任何读失败 = 非投影。 */
export function isGenerationProjectionPkg(profileDir: string, pkg: string): boolean {
  try {
    const p = join(profileDir, 'node_modules', pkg)
    if (!io.lstatSync(p).isSymbolicLink()) return false
    return isGenerationTarget(io.readlinkSync(p))
  } catch {
    return false
  }
}

/** 顶层扫描上限（apply 期一次性同步探测，有界防异常大目录拖慢启动）。 */
const SCAN_LIMIT = 400

/**
 * profile 级探测（apply 期一次性）：node_modules 顶层任一条目命中投影即成立；
 * 目录不可读/无条目命中时回退 lockfile 证据（`link:` 规格指向 generations——
 * hoisted 变体）。全部证据不可得 → false（维持名字判定，行为零漂移）。
 */
export function isGenerationProjectionDir(profileDir: string): boolean {
  const nodeModules = join(profileDir, 'node_modules')
  let scanned = 0
  try {
    const stack: string[] = ['']
    while (stack.length > 0 && scanned < SCAN_LIMIT) {
      const rel = stack.shift()!
      const dirents = io.readdirSync(join(nodeModules, rel), { withFileTypes: true })
      for (const dirent of dirents) {
        if (scanned >= SCAN_LIMIT) break
        scanned += 1
        const relEntry = rel === '' ? dirent.name : `${rel}/${dirent.name}`
        if (dirent.isSymbolicLink()) {
          if (isGenerationTarget(io.readlinkSync(join(nodeModules, relEntry)))) return true
        } else if (dirent.isDirectory() && dirent.name.startsWith('@') && rel === '') {
          stack.push(relEntry) // scoped 包下一层
        }
      }
    }
  } catch {
    /* node_modules 不可读 → 落到 lockfile 证据 */
  }
  // 有顶层条目证据（扫描成功且均非投影）→ 不回退 lockfile；零条目/不可读才看 lockfile
  if (scanned > 0) return false
  try {
    // /m：importers 段在文件头部，link: 规格在后续行（锚定必须逐行）
    const lockText = io.readFileSync(join(profileDir, 'pnpm-lock.yaml'), 'utf8')
    return /^[^\n]*link:[^\n]*generations/m.test(lockText)
  } catch {
    return false
  }
}
