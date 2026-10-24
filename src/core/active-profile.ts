/**
 * ActiveProfile（0.9.0 双 profile，ADR-0005）：宿主当前 profile 的单一事实源。
 *
 * 事实源是官方 `ctx.get('profileContext')`（@deepseek-ai/dsh-app-boot，仅 dsh 启动的
 * profile 存在）；缺席（旧宿主 / 测试 / CLI）时降级 fallback = web 推导目录，且 source
 * 如实标注 'fallback'。kind 决定能力表：desktop 只放行能力表内动作；
 * 未知名一律拒写（报告 §4「对未知 profile 显式拒写」）。不得从页面 Origin、DSH_HOME、
 * process.cwd() 或文件存在性猜 **profile 身份**（报告 §4 同业旁证 #655/#744）——身份
 * 仍唯一来自 profileContext；kind 判定在名字快路径之外叠加 **形态事实**（generation
 * 投影探测，issue #3/#6：桌面发行版 profile 名有 desktop/tauri/web 三种，名字枚举
 * 必然漏，dataelement 的 `web` 名 profile 曾被放行进 web 事务路径撞装后守卫）。
 * 为什么不用「pluginManager 存在性」判桌面：官方 Web 宿主同样提供该服务（dsh-m 的
 * web 开关路径就在委派它，ADR-0001），存在性 ≠ 桌面。
 */
import { webProfileDir, WEB_PROFILE, DESKTOP_PROFILE_NAMES } from './env.js'
import { isGenerationProjectionDir } from './generation-projection.js'

export type ProfileKind = 'web' | 'desktop' | 'unknown'

export interface ActiveProfile {
  /** profileContext.name；fallback 时为 'web' */
  readonly name: string
  readonly kind: ProfileKind
  /** 当前 profile 目录：profileContext.dir；fallback 时为 env 推导的 web 目录 */
  readonly dir: string
  /** 'host' = 官方 profileContext 注入；'fallback' = 缺席降级（旧行为） */
  readonly source: 'host' | 'fallback'
}

/** 受能力表管辖的写动作集合（读操作不设限）。 */
export type ProfileAction = 'install' | 'set-enabled' | 'upgrade' | 'uninstall' | 'self-upgrade' | 'restart'

/**
 * Desktop 能力表：
 * - 0.9.0 首发：install / set-enabled（upgrade/uninstall/self-upgrade 结构化拒绝）
 * - 0.9.8 主人裁决（借鉴 dsh-market 官方市场同机实证：0.9.3→0.9.4/0.9.5 两轮覆盖安装、
 *   removeBundle 卸载均由官方管理器完成）：upgrade（installBundle 覆盖安装）、
 *   uninstall（removeBundle）、self-upgrade（installBundle('dsh-m@latest')）一并放开；
 *   全部走官方管理器委派，服务缺席仍结构化拒绝（fail-closed 红线不动：绝不文件级回退）。
 * - restart 继续拒绝：Electron 进程生命周期归官方壳，dsh-m 不重启宿主。
 */
const DESKTOP_ALLOWED: ReadonlySet<ProfileAction> = new Set<ProfileAction>([
  'install',
  'set-enabled',
  'upgrade',
  'uninstall',
  'self-upgrade',
])

/**
 * 结构化拒绝的官方入口指引（zh；GUI/工具/HTTP 三入口共用同一文案源）。
 * 0.10.11（issue #3）：install / set-enabled 原为空串——unknown profile 拒写时
 * 用户面对一句没有出口的报错；补官方插件页入口。
 */
export const WRITE_GUIDANCE: Record<ProfileAction, string> = {
  install: '请在官方宿主的插件管理界面（Settings → Plugins）安装；或把 dsh-m 安装到 web / desktop profile 后在市场内操作。',
  'set-enabled': '请在官方宿主的插件管理界面（Settings → Plugins）开关该插件。',
  upgrade: 'Desktop 暂不支持在市场内升级插件：请在官方 Desktop 的插件管理（Settings → Plugins）检查更新，或回到 DSH Web 使用 dsh-m 升级。',
  uninstall: 'Desktop 暂不支持在市场内卸载插件：请使用官方 Desktop 的插件管理（Settings → Plugins）卸载。',
  'self-upgrade': '当前宿主形态不支持面板内自更新：请在官方 Settings → Plugins 对 dsh-m 执行 remove + install（精确版本），或完全退出 Desktop 后用 `dsh plugin --profile desktop add dsh-m@<版本>`。',
  restart: 'Desktop 不由 dsh-m 重启：请退出并重新打开 Desktop 应用（关闭窗口可能只是隐藏），让新安装的插件生效。',
}

export class ProfileUnsupportedError extends Error {
  readonly code: 'unsupported-on-profile'
  readonly action: ProfileAction
  readonly profile: string
  readonly guidance: string

  constructor(action: ProfileAction, profile: ActiveProfile) {
    const guidance = WRITE_GUIDANCE[action]
    super(`当前 profile（${profile.name}）不支持该操作（${action}）。${guidance}`)
    this.name = 'ProfileUnsupportedError'
    this.code = 'unsupported-on-profile'
    this.action = action
    this.profile = profile.name
    this.guidance = guidance
  }
}

function kindOf(name: string): ProfileKind {
  if (DESKTOP_PROFILE_NAMES.includes(name)) return 'desktop'
  if (name === WEB_PROFILE) return 'web'
  return 'unknown'
}

/** 事实探测依赖（测试注入探测函数；缺省 = 真实 generation 投影探测）。 */
export interface ResolveProfileDeps {
  generationProbe?: (dir: string) => boolean
}

/**
 * 守卫式解析：宿主注入 profileContext → 事实取宿主；缺席/抛错/畸形 → fallback web。
 * 在 host 生命周期内只应调用一次（host.ts apply 期），结果作为不可变对象传递。
 *
 * kind 判定（issue #3/#6）：名字快路径（desktop/tauri → desktop）之后，host 来源的
 * 非 desktop 名 profile 叠加 generation 投影形态事实——投影成立即按 desktop（委派
 * 官方管理器；代际系统拥有写路径，绝不走 dsh-m 文件级事务）。fallback（无
 * profileContext 的旧宿主）不做探测、恒 web——旧行为零漂移（旧宿主无官方管理器
 * 可委派，误判 desktop 反而把可用路径堵死）。探测抛错按事实不可得处理，维持名字判定。
 */
export function resolveActiveProfile(ctx: unknown, deps?: ResolveProfileDeps): ActiveProfile {
  let pc: { name?: unknown; dir?: unknown } | undefined
  try {
    const getter = (ctx as { get?: unknown } | null | undefined)?.get
    if (typeof getter === 'function') {
      pc = getter.call(ctx, 'profileContext') as { name?: unknown; dir?: unknown } | undefined
    }
  } catch {
    pc = undefined
  }
  const name = typeof pc?.name === 'string' && pc.name.trim() !== '' ? pc.name.trim() : undefined
  const dir = typeof pc?.dir === 'string' && pc.dir.trim() !== '' ? pc.dir.trim() : undefined
  if (pc === undefined || pc === null || name === undefined || dir === undefined) {
    return { name: WEB_PROFILE, kind: 'web', dir: webProfileDir(), source: 'fallback' }
  }
  let kind = kindOf(name)
  if (kind !== 'desktop') {
    // 形态事实升级（issue #3/#6）：探测只对 host 来源做（fallback 旧行为零漂移）；
    // 探测抛错 = 事实不可得，维持名字判定（不把异常当否定）。
    try {
      if ((deps?.generationProbe ?? isGenerationProjectionDir)(dir)) kind = 'desktop'
    } catch {
      /* 维持名字判定 */
    }
  }
  return { name, kind, dir, source: 'host' }
}

/** 能力表守卫：违反即抛结构化 ProfileUnsupportedError（HTTP 409 / 工具 error result 共用）。 */
export function assertWriteAllowed(profile: ActiveProfile, action: ProfileAction): void {
  if (profile.kind === 'web') return
  if (profile.kind === 'desktop' && DESKTOP_ALLOWED.has(action)) return
  throw new ProfileUnsupportedError(action, profile)
}
