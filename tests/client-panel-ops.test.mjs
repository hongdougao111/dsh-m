/**
 * 面板操作接线（GLOSSARY，ADR-0023 第二刀）纯函数直测：
 * - planReconcileActions(judged, seenKeys)：恢复对账副作用编排的纯计划函数——
 *   先算后写原则从 restoreRecords 延伸到编排层（0.10.7 四轮修复的主战场）。
 *   契约：replacements 对 judged 透传（逐字节等价）；notifications 携
 *   { dedupeKey, i18nKey, params }（纯函数不携成品文案）；shouldKick = 存在 queued。
 * - restartBannerDecision(opKind, res)：五类横幅站点判定单源收拢（评审 R1-1 修正版）——
 *   toggle 委派 toggleNoticeKeys 语义（live→false/restart·缺席→true）、
 *   upgrade 委派 upgradeNotify 三态（client-only→false/unknown·缺席→true）、
 *   self-upgrade 保守默认（?? true）；install/uninstall 字面 true。
 *   conservative 仅供测试断言与诊断，运行时无消费方。
 * 夹具自备（ judged 记录结构照 operations.js restoreRecords 输出），不跨测试文件引用。
 * 运行：npm test 自动发现（node --test tests/）。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { planReconcileActions, restartBannerDecision } from '../src/client/panel-ops.js'

const rec = (over = {}) => ({
  id: 'r1', kind: 'upgrade', target: 'some-pkg', status: 'done',
  meta: { toVersion: '1.2.3', reconciledAfterRestart: true },
  updatedAt: 1, ...over,
  ...(over.meta ? { meta: { toVersion: '1.2.3', reconciledAfterRestart: true, ...over.meta } } : {}),
})

describe('planReconcileActions：恢复对账副作用编排（先算后写）', () => {
  it('done && reconciledAfterRestart 且未读 → 产出补报通知（dedupeKey=id|target|toVersion；params 对齐 :4003 现行拼装）', () => {
    const judged = [rec()]
    const plan = planReconcileActions(judged, new Set())
    assert.deepEqual(plan.notifications, [
      { dedupeKey: 'r1|some-pkg|1.2.3', i18nKey: 'upgrade.reconciled.done', params: { pkg: 'some-pkg', to: 'v1.2.3' } },
    ])
  })

  it('seen 命中 → 不产通知，但记录仍入 replacements（只提醒一次，账面照常恢复）', () => {
    const judged = [rec()]
    const plan = planReconcileActions(judged, new Set(['r1|some-pkg|1.2.3']))
    assert.deepEqual(plan.notifications, [])
    assert.equal(plan.replacements.length, 1)
  })

  it('done 但无 reconciledAfterRestart → 不产通知（正常完成非改判补报）', () => {
    const judged = [rec({ meta: { toVersion: '1.2.3', reconciledAfterRestart: undefined } })]
    const plan = planReconcileActions(judged, new Set())
    assert.deepEqual(plan.notifications, [])
  })

  it('failed / superseded / input 记录不产通知', () => {
    const judged = [
      rec({ id: 'a', status: 'failed', meta: { toVersion: '1.0.0', reconciledAfterRestart: true } }),
      rec({ id: 'b', status: 'superseded', meta: { toVersion: '1.0.0', reconciledAfterRestart: true } }),
    ]
    const plan = planReconcileActions(judged, new Set())
    assert.deepEqual(plan.notifications, [])
  })

  it('replacements 对 judged 透传（逐字节等价：同引用 + 内容一致）', () => {
    const judged = [rec(), rec({ id: 'r2', status: 'queued' }), rec({ id: 'r3', meta: { session: true } })]
    const plan = planReconcileActions(judged, new Set())
    assert.equal(plan.replacements, judged, '透传 = 同一数组引用（计划层零拷贝零改写）')
    assert.deepEqual(plan.replacements, judged)
  })

  it('shouldKick：存在 queued → true；无 queued → false', () => {
    assert.equal(planReconcileActions([rec({ id: 'q', status: 'queued' })], new Set()).shouldKick, true)
    assert.equal(planReconcileActions([rec()], new Set()).shouldKick, false)
  })

  it('空 judged → 空计划', () => {
    assert.deepEqual(planReconcileActions([], new Set()), { replacements: [], notifications: [], shouldKick: false })
  })
})

describe('restartBannerDecision：五类横幅站点判定单源（评审 R1-1 修正版）', () => {
  it('install / uninstall → 字面 true（对齐 :2012/:2543）', () => {
    assert.deepEqual(restartBannerDecision('install', {}), { needsRestart: true, conservative: false })
    assert.deepEqual(restartBannerDecision('uninstall', {}), { needsRestart: true, conservative: false })
  })

  it('toggle → 委派 toggleNoticeKeys 语义：live→false；restart→true；缺席→true 且 conservative（对齐 :2521 + toggle-view.js）', () => {
    assert.deepEqual(restartBannerDecision('toggle', { applied: 'live' }), { needsRestart: false, conservative: false })
    assert.deepEqual(restartBannerDecision('toggle', { applied: 'restart' }), { needsRestart: true, conservative: false })
    assert.deepEqual(restartBannerDecision('toggle', {}), { needsRestart: true, conservative: true })
  })

  it('upgrade → 委派 upgradeNotify 三态：client-only→false；unknown→true；缺席→true 且 conservative（对齐 :2060/:2573 + operations.js）', () => {
    assert.deepEqual(restartBannerDecision('upgrade', { activation: 'client-only' }), { needsRestart: false, conservative: false })
    assert.deepEqual(restartBannerDecision('upgrade', { activation: 'unknown' }), { needsRestart: true, conservative: false })
    assert.deepEqual(restartBannerDecision('upgrade', { activation: 'restart-required' }), { needsRestart: true, conservative: false })
    assert.deepEqual(restartBannerDecision('upgrade', {}), { needsRestart: true, conservative: true })
  })

  it('self-upgrade → res.needsRestart ?? true 保守默认（对齐 :3381；conservative 标记缺席）', () => {
    assert.deepEqual(restartBannerDecision('self-upgrade', { needsRestart: true }), { needsRestart: true, conservative: false })
    assert.deepEqual(restartBannerDecision('self-upgrade', { needsRestart: false }), { needsRestart: false, conservative: false })
    assert.deepEqual(restartBannerDecision('self-upgrade', {}), { needsRestart: true, conservative: true })
  })
})
