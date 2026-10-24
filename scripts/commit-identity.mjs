/**
 * 提交元数据身份核准（retro S1，2026-10-24）：发版即公开历史，未推提交的
 * author/committer 必须是核准公开身份。与 dsh-quota-watch 的
 * `scripts/check-public-package.mjs`（isApprovedCommitEmail）同口径——两仓各自
 * 持有本名单，是刻意的（无共享发包，宁重复勿耦合）；改名单两处同步。
 *
 * 口径（主人 2026-10-24 裁决）：`iasi@163.com` 是有意的公开邮箱；GitHub noreply
 * 形态（web 机默认）恒核准。
 */

const GITHUB_NOREPLY = /^[^@\s]+@users\.noreply\.github\.com$/i

export const APPROVED_PUBLIC_EMAILS = new Set(['iasi@163.com'])

/** 提交元数据门禁的核准身份：GitHub noreply，或主人核准的公开邮箱（大小写不敏感）。 */
export function isApprovedCommitEmail(value) {
  return typeof value === 'string'
    && (GITHUB_NOREPLY.test(value) || APPROVED_PUBLIC_EMAILS.has(value.trim().toLowerCase()))
}

/**
 * 从 `git log --format=%ae%n%ce` 的输出行中筛出未核准邮箱（保序去重）。
 * @param lines - 已按行切分的邮箱序列（空行/空白行跳过）。
 * @returns 未核准邮箱数组；空数组 = 全部核准。
 */
export function unapprovedEmails(lines) {
  const seen = new Set()
  for (const raw of lines ?? []) {
    const email = typeof raw === 'string' ? raw.trim() : ''
    if (email === '' || isApprovedCommitEmail(email)) continue
    if (!seen.has(email)) seen.add(email)
  }
  return [...seen]
}
