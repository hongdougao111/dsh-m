/**
 * Vendored atomic file replacement + cross-process writer lock（issue #7 方案 2）。
 *
 * 出处：@deepseek-ai/dsh-atomic-write@0.2.1-rc.1（MIT，deepseek-ai/deepseek-harness
 * `packages/util/atomic-write`，本地锚 `.dsh-research/asar-extract-0.2.1-rc.1/`）。
 * 逐字保真移植：锁文件 `<file>.lock`、锁记录 `<pid>\n`（mode 0o600）、wx 独占、
 * 死亡持有者接管（claim 文件 = sha256(record) 前 16 hex）、Windows 瞬态 rename 重试
 * （EACCES/EBUSY/EPERM；20ms 起步倍增、200ms 封顶、8 次上限）、默认等待 2000ms——
 * 与宿主及官方 UI 的并发互操作协议完全一致（dshmarket #914 直接按 PID 读该锁）。
 *
 * 为什么 vendor 而不是 peerDependencies（issue #7）：`dependencies` 携带
 * `@deepseek-ai/*` 包会被 profile pnpm 提升到顶层、按「同名目录必赢」遮蔽应用
 * 自带核心包，官方 health 判危、启动壳拦重启；peer 在跨代际宿主上解析面不可控
 * （0.1.x/0.2.x 版本漂移即复现）。本实现零依赖、MIT，与上游 diff 即可跟版。
 */
import { createHash, randomBytes } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { setTimeout as sleepAbortable } from 'node:timers/promises'

export interface AtomicWriteOptions {
  /** 权限位（随 rename 落到替换后 inode，如 cordis.patch.yml 的 0o600） */
  mode?: number
  /** 递归建父目录时的目录权限位 */
  dirMode?: number
}

export interface FileLockOptions {
  /** 竞争等待上限（毫秒）；缺省 2000，超时抛错而非猜测锁归属 */
  waitMs?: number
  signal?: AbortSignal
}

const WINDOWS_TRANSIENT_RENAME_ERRORS = new Set(['EACCES', 'EBUSY', 'EPERM'])
const WINDOWS_RENAME_RETRY_INITIAL_MS = 20
const WINDOWS_RENAME_RETRY_MAX_MS = 200
const WINDOWS_RENAME_RETRY_LIMIT = 8
const LOCK_RETRY_INITIAL_MS = 20
const LOCK_RETRY_MAX_MS = 200
const DEFAULT_LOCK_WAIT_MS = 2_000

/** Windows 是否报告了对原子替换的瞬态干扰。 */
function isTransientWindowsRenameError(error: unknown): boolean {
  if (process.platform !== 'win32') return false
  return WINDOWS_TRANSIENT_RENAME_ERRORS.has((error as NodeJS.ErrnoException | null)?.code ?? '')
}

/** 有界重试后完成替换（Windows 瞬态干扰场景；完整 temp 始终是 rename 源）。 */
async function renameAtomicTemp(temp: string, filename: string): Promise<void> {
  let delay = WINDOWS_RENAME_RETRY_INITIAL_MS
  for (let retries = 0; ; retries += 1) {
    try {
      await rename(temp, filename)
      return
    } catch (error) {
      if (!isTransientWindowsRenameError(error)) throw error
      if (retries >= WINDOWS_RENAME_RETRY_LIMIT) throw error
    }
    await new Promise((resolve) => setTimeout(resolve, delay))
    delay = Math.min(delay * 2, WINDOWS_RENAME_RETRY_MAX_MS)
  }
}

/**
 * 一步原子替换 `filename` 为 `content`（必要时递归建父目录）：随机后缀兄弟 temp
 * 以 `wx` 独占创建（拒绝跟随栽在 temp 路径上的符号链接；新 inode 携带 mode 穿过
 * rename，收窄权限无 chmod 竞态；rename 直接替换符号链接本身而非写穿 referent），
 * 同目录兄弟保证 rename 在同一文件系统上。残余失败时清理 temp 并重抛。
 */
export async function writeFileAtomic(filename: string, content: string | Buffer, options?: AtomicWriteOptions): Promise<void> {
  await mkdir(dirname(filename), {
    recursive: true,
    ...(options?.dirMode === undefined ? {} : { mode: options.dirMode }),
  })
  const temp = `${filename}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(temp, content, { mode: options?.mode, flag: 'wx' })
    await renameAtomicTemp(temp, filename)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

/** 独占创建撞上既有锁即竞争；EPERM 仅在 lstat 确认锁在场时算竞争（Windows 语义）。 */
async function isLockContention(error: unknown, lockPath: string): Promise<boolean> {
  const code = (error as NodeJS.ErrnoException | null)?.code
  if (code === 'EEXIST') return true
  if (code !== 'EPERM') return false
  try {
    await lstat(lockPath)
    return true
  } catch {
    return false
  }
}

/** `<pid>\n` 记录的持有者已被证实不存在：信号 0 探针得 ESRCH。 */
function holderExited(record: string): boolean {
  if (!/^\d+\n$/.test(record)) return false
  const pid = Number(record.trim())
  if (pid === 0 || pid > 2147483647) return false
  if (pid === process.pid) return false
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH'
  }
}

/** 锁文件内容；读不到 = undefined。 */
async function readLockRecord(lockPath: string): Promise<string | undefined> {
  try {
    return await readFile(lockPath, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * 移除记录持有者已退出的锁：竞争者在按 record 命名的 claim 文件上串行，拿到
 * claim 后复读锁并复探 PID，仍持同一 record 且 PID 仍不存在才移除——持有者
 * PID 被复用的锁不会被误删，后来者拿到的锁也不会被删除。
 */
async function takeOverExitedLock(lockPath: string): Promise<boolean> {
  const record = await readLockRecord(lockPath)
  if (record === undefined || !holderExited(record)) return false
  const claim = `${lockPath}.takeover-${createHash('sha256').update(record).digest('hex').slice(0, 16)}`
  try {
    await writeFile(claim, `${process.pid}\n`, { mode: 0o600, flag: 'wx' })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EEXIST' || code === 'EPERM') return false
    throw error
  }
  try {
    if ((await readLockRecord(lockPath)) !== record || !holderExited(record)) return false
    try {
      await rm(lockPath, { force: true })
    } catch {
      return false
    }
    return true
  } finally {
    await rm(claim, { force: true }).catch(() => {})
  }
}

/**
 * 持有 `filename` 的跨进程写者锁执行一次操作：锁是 `wx` 创建的 `<filename>.lock`
 * 兄弟文件，记录持有者 PID；配对 rename 提交后读者免锁、唯写者竞争。竞争指数
 * 退避、超 deadline 抛错；锁记录的持有进程已退出（ESRCH）则接管并立即重试。
 * 无论成败 finally 释放锁。
 */
export async function withFileLock<T>(filename: string, operation: () => Promise<T> | T, options?: FileLockOptions): Promise<T> {
  const lockPath = `${filename}.lock`
  const deadline = Date.now() + (options?.waitMs ?? DEFAULT_LOCK_WAIT_MS)
  let delay = LOCK_RETRY_INITIAL_MS
  let retriedUnconfirmedPermissionError = false
  for (;;) {
    options?.signal?.throwIfAborted()
    try {
      await writeFile(lockPath, `${process.pid}\n`, { mode: 0o600, flag: 'wx' })
      break
    } catch (error) {
      if (!(await isLockContention(error, lockPath))) {
        if (process.platform !== 'win32' || (error as NodeJS.ErrnoException).code !== 'EPERM' || retriedUnconfirmedPermissionError) throw error
        retriedUnconfirmedPermissionError = true
      } else if (await takeOverExitedLock(lockPath)) continue
    }
    if (Date.now() >= deadline) throw new Error(`atomic-write: timed out waiting for the writer lock at ${lockPath}`)
    await sleepAbortable(delay, undefined, { signal: options?.signal })
    delay = Math.min(delay * 2, LOCK_RETRY_MAX_MS)
  }
  try {
    options?.signal?.throwIfAborted()
    return await operation()
  } finally {
    await rm(lockPath, { force: true })
  }
}
