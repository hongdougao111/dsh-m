/**
 * 自升级 intent ledger（0.10.0，ADR-0018 合规）：panel 通道零外部日志 ⇒ 自升级 delegated
 * 预写不进 external journal，落独立 ledger——定位为**崩溃兜底网**：D3 正常路径在本进程内
 * 就地 resolve，仅当进程死于 promise 悬垂（活交换中进程死亡）时由下一次 self-check 对账
 * 收口（host-api 挂载）。记录机器本地、单条覆盖写、不含凭据。
 *
 * - 存储文件：`$DSH_HOME/dshm/self-upgrade-intent.json`（`DSHM_UPGRADE_INTENT_FILE`
 *   可整文件覆盖供测试；与 external-operations.json 同基址、不带 profile 维度）。
 * - write：mkdir recursive 先行 → tmp+rename 原子替换（external-journal 同款惯例）。
 * - read：文件缺失 = undefined；损坏 → 改名 `.corrupt-<ts>` 隔离留证后按空处理
 *   （best-effort，隔离失败同样不抛——读路径永不炸）。
 * - resolve：仅收口悬垂（status='delegated'）记录并落盘终态；无悬垂返回 undefined（幂等）。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { dshHome } from './env.js'

export type UpgradeIntentStatus = 'delegated' | 'resolved'

export type UpgradeIntentOutcome = 'ok' | 'failed'

/** intent 记录（字段白名单；超集字段一律不落盘——形状级保证：记录不含凭据）。 */
export interface UpgradeIntentRecord {
  target: string
  version: string
  fromVersion?: string
  at: number
  status: UpgradeIntentStatus
  outcome?: UpgradeIntentOutcome
  resolvedAt?: number
  installedVersion?: string
}

/** ledger 文件路径：env 整文件覆盖优先（测试隔离），缺省 $DSH_HOME/dshm/self-upgrade-intent.json。 */
export function upgradeIntentFile(): string {
  return process.env.DSHM_UPGRADE_INTENT_FILE || join(dshHome(), 'dshm', 'self-upgrade-intent.json')
}

/** 显式字段白名单重组（超集字段一律不落盘）。 */
function normalizeRecord(record: UpgradeIntentRecord): UpgradeIntentRecord {
  return {
    target: record.target,
    version: record.version,
    ...(record.fromVersion !== undefined ? { fromVersion: record.fromVersion } : {}),
    at: record.at,
    status: record.status,
    ...(record.outcome !== undefined ? { outcome: record.outcome } : {}),
    ...(record.resolvedAt !== undefined ? { resolvedAt: record.resolvedAt } : {}),
    ...(record.installedVersion !== undefined ? { installedVersion: record.installedVersion } : {}),
  }
}

async function atomicWrite(path: string, text: string): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, text)
  await rename(tmp, path)
}

/** 损坏文件隔离留证（best-effort，与 external-journal 同款两级重试；失败则放弃隔离按空继续）。 */
async function quarantine(file: string): Promise<void> {
  try {
    await rename(file, `${file}.corrupt-${Date.now()}`)
  } catch {
    try {
      // 同毫秒重入等极小概率命名冲突：换一个带随机尾缀的名字再试一次；仍败则放弃隔离
      await rename(file, `${file}.corrupt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    } catch {
      /* 放弃隔离：按空继续 */
    }
  }
}

/** 读当前记录；文件缺失 → undefined；损坏/形态非法 → 隔离后按空处理（不抛）。 */
export async function readUpgradeIntent(): Promise<UpgradeIntentRecord | undefined> {
  const file = upgradeIntentFile()
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw err
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    await quarantine(file)
    return undefined
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    await quarantine(file)
    return undefined
  }
  return normalizeRecord(parsed as UpgradeIntentRecord)
}

/** 预写一条 delegated 意图（status 由 writer 盖章；调用方不传 status/outcome 等终态字段）。 */
export async function writeUpgradeIntent(input: {
  target: string
  version: string
  fromVersion?: string
  at: number
}): Promise<UpgradeIntentRecord> {
  const file = upgradeIntentFile()
  await mkdir(dirname(file), { recursive: true })
  const record = normalizeRecord({ ...input, status: 'delegated' })
  await atomicWrite(file, `${JSON.stringify(record, null, 2)}\n`)
  return record
}

/**
 * 收口悬垂记录：status → resolved、outcome 按 ok 盖章、resolvedAt 就地取值、
 * installedVersion 可选回填；落盘后返回被收口的记录。无悬垂（缺文件/已 resolved）→
 * undefined（幂等，不冒充收口）。
 */
export async function resolveUpgradeIntent(input: {
  ok: boolean
  installedVersion?: string
}): Promise<UpgradeIntentRecord | undefined> {
  const current = await readUpgradeIntent()
  if (!current || current.status !== 'delegated') return undefined
  const resolved = normalizeRecord({
    ...current,
    status: 'resolved',
    outcome: input.ok ? 'ok' : 'failed',
    resolvedAt: Date.now(),
    ...(input.installedVersion !== undefined ? { installedVersion: input.installedVersion } : {}),
  })
  const file = upgradeIntentFile()
  await mkdir(dirname(file), { recursive: true })
  await atomicWrite(file, `${JSON.stringify(resolved, null, 2)}\n`)
  return resolved
}
