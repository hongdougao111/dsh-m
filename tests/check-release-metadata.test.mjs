/**
 * 发版门禁的提交身份核准（retro S1，2026-10-24）：纯函数契约。
 * 运行：node --test tests/check-release-metadata.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { APPROVED_PUBLIC_EMAILS, isApprovedCommitEmail, unapprovedEmails } from '../scripts/commit-identity.mjs'

test('核准身份：GitHub noreply 恒过（web 机默认形态）', () => {
  assert.equal(isApprovedCommitEmail('26645513+iasiv5@users.noreply.github.com'), true)
})

test('核准身份：主人核准名单 iasi@163.com（大小写与首尾空白不敏感）', () => {
  assert.equal(isApprovedCommitEmail('iasi@163.com'), true)
  assert.equal(isApprovedCommitEmail('IASI@163.com'), true)
  assert.equal(isApprovedCommitEmail('  iasi@163.com  '), true)
  assert.equal(APPROVED_PUBLIC_EMAILS.has('iasi@163.com'), true)
})

test('未核准：其它邮箱与非法输入', () => {
  for (const bad of ['developer@example.invalid', '3083636750@qq.com', '', '   ', undefined, null, 42]) {
    assert.equal(isApprovedCommitEmail(bad), false, String(bad))
  }
})

test('unapprovedEmails：保序去重、跳过空行、空输入返回空数组', () => {
  assert.deepEqual(
    unapprovedEmails([
      'iasi@163.com',
      'developer@example.invalid',
      '',
      'iasi@163.com',
      'other@example.invalid',
      '26645513+iasiv5@users.noreply.github.com',
    ]),
    ['developer@example.invalid', 'other@example.invalid'],
  )
  assert.deepEqual(unapprovedEmails([]), [])
  assert.deepEqual(unapprovedEmails(['iasi@163.com']), [])
  assert.deepEqual(unapprovedEmails(undefined), [])
})
