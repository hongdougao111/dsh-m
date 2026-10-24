/**
 * 壳接管哨兵判定（DOM-free 纯函数，issue #4 分档；2026-10-13 ds-bot 让位裁定的延续）。
 *
 * 官方契约（dsh-client-ui-sidebar lib/client.js）：「the foot is the
 * `sidebar.workspaces` registrant's」——工作区座位被负 priority 插件接管时，页脚
 * 归接管者。但接管者分两档：
 * - **敌意换壳**：页脚是接管者原生界面、不消费 footer.action 槽（ds-bot 以 -10
 *   接管其原生 bot 侧栏，2026-10-13 实证：市场入口在原生页脚里错乱，裁定整行让位）；
 * - **合作换壳**：接管者页脚自己渲染 footer.action 槽条目（dsh-codex-ui：整壳经
 *   `sidebar` 槽替换官方侧栏，`.dcu-foot` 对 footerActions 台账逐条
 *   `renderSlot(..., { only: id })`，`dshm-market` 自然在列——源码锚
 *   `.dsh-research/dsh-codex-ui` CodexSidebar.tsx footer 段 + footer-actions.ts）。
 *   此时市场入口被接管者正常承载，让位反而让它消失（issue #4 主案）。
 *
 * 判别锚：合作名单按接管条目声明的 locale NS 匹配（codex-ui 注册 workspaces 时
 * `locale: NS`，NS = 'michengai.codexUi'）。fail-safe：未列名的负 priority 接管
 * 一律按敌意处理（让位），保住 2026-10-13 裁定；新合作壳按源码证据补录名单。
 */

/** 合作换壳者的 locale NS 集合（每个条目都须有源码证据锚，见模块头）。 */
export const COOPERATIVE_SHELL_LOCALES = new Set(['michengai.codexUi'])

/**
 * sidebar.workspaces 台账 → 是否敌意换壳（市场入口应整行让位）。
 * 条目形状：{ options?: { priority?, locale? }, locale? }（locale 顶层或 options 内，
 * 与 ui-slots 注册传递一致）。
 */
export function isNativeFootShell(entries) {
  if (!Array.isArray(entries)) return false
  return entries.some((entry) => {
    if (!entry) return false
    const priority = entry.options?.priority ?? 0
    if (priority >= 0) return false
    const locale = entry.locale ?? entry.options?.locale
    return !COOPERATIVE_SHELL_LOCALES.has(locale)
  })
}
