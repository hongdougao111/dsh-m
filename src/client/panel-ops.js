/**
 * 面板操作接线（Panel Ops Wiring，GLOSSARY / ADR-0023 第二刀）：
 * 操作泵在面板侧的显式装配与恢复对账判定的收拢模块。
 * - store/pump 保持模块级存活（ToolCardRow 面板外写入事实，ADR-0023 决策 3）；
 *   泵上下文经 bindPanelOps/unbindPanelOps 显式装配（取代 main.jsx 模块级可变单例 opsPumpCtx），
 *   未绑定 = 现行降级语义原样保留（含恢复 queued 无执行上下文 → failed 路径，见 operations.js）。
 * - 恢复对账的副作用编排纯化为 planReconcileActions（先算后写：判定阶段零副作用，
 *   副作用阶段不再判定）；展示 JSX 不在其内。
 * - 横幅判定收拢为 restartBannerDecision：判定单源本函数，文案装配留 op-outcome
 *   （upgradeOkText）与 toggle-view（textKey），经 import 委派不重复实现。
 * 运行：npm test 直测（tests/client-panel-ops.test.mjs）；main.jsx CJS require 经 esbuild interop。
 */

import { createOperationsStore, createOpsPump, upgradeNotify } from './operations.js'
import { toggleNoticeKeys } from './toggle-view.js'

/** 模块级单例（审计碰撞·洞1，迁自 main.jsx）：per-hook 实例会让关面板后的旧 runOp 闭包
 *  与新面板各自全量 persist 互相覆盖丢记录——排队窗口越长越恶性。 */
const opsStore = createOperationsStore(typeof window !== 'undefined' && window.localStorage ? window.localStorage : null)

/** 泵上下文持有者（模块私有）：MarketPanel 挂载时经 bindPanelOps 注册、卸载时置空——
 *  记录本体持久在 localStorage。未绑定 = 设计内降级（泵各回调判空静默跳过）。 */
let holder = null

/** 单一执行泵（0.7.0 评审 P4：实现与测试都在 operations.js——createOpsPump）。 */
const opsPump = createOpsPump(opsStore, () => holder)

/** 面板外写入方（ToolCardRow）与 MarketPanel 的显式取用口——裸单例变量消灭（ADR-0023 Q15）。 */
export function getSharedOpsStore() {
  return opsStore
}
export function getSharedOpsPump() {
  return opsPump
}

/** 泵上下文装配（MarketPanel 挂载 effect 调用）：deps = { stillApplies, dispatchRestored, syncOps }
 *  （无 refreshViews——死字段已删，ADR-0023 Q16）。 */
export function bindPanelOps(deps) {
  holder = deps
}
export function unbindPanelOps() {
  holder = null
}

/**
 * 设置类操作记录（2026-10-10，verbatim 迁自 main.jsx）：终态直落——不入泵、不排队、
 * 不参与恢复重放；恢复/清除语义天然兼容（done/failed 终态原样保留、TERMINAL_CLEARABLE
 * 可清、failed 点红点）。与泵 finalize 同源触发 syncOps；面板未挂载时静默
 * （记录本体已落 localStorage）。口径 = 面板发起的供给面/信任边界设置变更（DESIGN §2.6
 * 修订）；参数进 meta，target 只承载身份。
 */
export function recordSettingsOp(kind, target, status, meta, error) {
  opsStore.upsert({ kind, target, status, ...(meta ? { meta } : {}), ...(error ? { error } : {}) })
  if (holder && holder.syncOps) holder.syncOps()
}

/**
 * 恢复对账副作用编排（纯计划函数，ADR-0023 Q17）：给定 restoreRecords 的判定输出与
 * 已读集合，产出副作用计划——适配器按序执行 replaceAll → 逐条[seen.add →
 * writeReconcileNotified → notify] → syncOps → kick（与 0.10.7 现行崩溃窗口语义
 * 逐字节一致）。不落账、不通知、不碰 DOM。
 */
export function planReconcileActions(judged, seenKeys) {
  const list = Array.isArray(judged) ? judged : []
  const notifications = []
  for (const r of list) {
    if (r && r.status === 'done' && r.meta && r.meta.reconciledAfterRestart) {
      const key = `${r.id}|${r.target}|${r.meta.toVersion}`
      if (seenKeys && seenKeys.has(key)) continue
      notifications.push({ dedupeKey: key, i18nKey: 'upgrade.reconciled.done', params: { pkg: r.target, to: `v${r.meta.toVersion}` } })
    }
  }
  return { replacements: list, notifications, shouldKick: list.some((r) => r && r.status === 'queued') }
}

/**
 * 横幅判定单源（评审 R1-1 修正版）：needsRestart 的一处判定。
 * - install / uninstall → 字面 true（:2012 / :2543）
 * - toggle → 委派 toggleNoticeKeys（live→false；restart/缺席→true，toggle-view.js:45-54）
 * - upgrade → 委派 upgradeNotify（client-only→false；unknown/缺席/其他→true，operations.js:82-86）
 * - self-upgrade → res.needsRestart ?? true（保守默认，:3381）
 * conservative 标记「判定依赖缺席回退」——仅供测试断言与诊断，运行时无消费方。
 */
export function restartBannerDecision(opKind, res) {
  const r = res || {}
  if (opKind === 'toggle') {
    return { needsRestart: toggleNoticeKeys(r).needsRestart, conservative: r.applied == null }
  }
  if (opKind === 'upgrade') {
    return { needsRestart: upgradeNotify(r.activation).needsRestart, conservative: r.activation == null }
  }
  if (opKind === 'self-upgrade') {
    return { needsRestart: r.needsRestart ?? true, conservative: r.needsRestart == null }
  }
  // install / uninstall
  return { needsRestart: true, conservative: false }
}
