/**
 * 市场查询文法契约（plan Task 1，2026-10-16）：
 * - parseMarketQueryInput：category（精选五桶 ∪ 社区 slug，trim 后校验与透传）、
 *   source（三值枚举，trim 后校验与透传，缺省 all）、limit（floor 先行 + policy 钳制）、
 *   offset（floor）；文法违规 throw MarketQueryError（消息即契约，与今日 host-api/tools 逐字节同串）。
 * - PRIMARY_CATEGORY_LABELS 键集 ≡ registry CATEGORIES（漂移守卫）。
 * - COMMUNITY_SLUG_RE / SEARCH_CORE_DEADLINE_MS / INSTALLED_CORE_DEADLINE_MS 单一事实源。
 * 规则出处：实施计划 Task 1 接口契约 + grill 十决议（D1-D10）+ 评审三轮收敛。
 * 运行：npm run build && node --test tests/market-query.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseMarketQueryInput,
  MarketQueryError,
  COMMUNITY_SLUG_RE,
  PRIMARY_CATEGORY_LABELS,
  SEARCH_CORE_DEADLINE_MS,
  INSTALLED_CORE_DEADLINE_MS,
} from '../lib/core/market-query.js'
import { CATEGORIES } from '../lib/core/registry.js'

const GUI = { limitMax: 96, limitDefault: 32 }
const AGENT = { limitMax: 80, limitDefault: 10 }

describe('category 文法', () => {
  it('精选五桶逐一trim后直通', () => {
    for (const c of CATEGORIES) {
      assert.equal(parseMarketQueryInput({ category: c }, AGENT).category, c)
    }
  })
  it('社区 slug 直通', () => {
    assert.equal(parseMarketQueryInput({ category: 'theme' }, AGENT).category, 'theme')
  })
  it('空 / whitespace / 非字符串 / 缺省 → null', () => {
    assert.equal(parseMarketQueryInput({}, AGENT).category, null)
    assert.equal(parseMarketQueryInput({ category: '' }, AGENT).category, null)
    assert.equal(parseMarketQueryInput({ category: '   ' }, AGENT).category, null)
    assert.equal(parseMarketQueryInput({ category: undefined }, AGENT).category, null)
    assert.equal(parseMarketQueryInput({ category: 42 }, AGENT).category, null)
    assert.equal(parseMarketQueryInput({ category: null }, AGENT).category, null)
  })
  it("带空格值先 trim 再校验（' self-dev ' → 'self-dev'）", () => {
    assert.equal(parseMarketQueryInput({ category: ' self-dev ' }, AGENT).category, 'self-dev')
  })
  it('非法值 throw，消息逐字节锚', () => {
    assert.throws(
      () => parseMarketQueryInput({ category: '非法!!' }, AGENT),
      (e) =>
        e instanceof MarketQueryError &&
        e.name === 'MarketQueryError' &&
        e.message === '非法分类: 非法!!（需精选分类或 [a-z0-9-]{1,32} slug）',
    )
  })
})

describe('source 文法', () => {
  it('三值直通（trim 后值，勿返回未 trim 原值）', () => {
    assert.equal(parseMarketQueryInput({ source: 'primary' }, AGENT).source, 'primary')
    assert.equal(parseMarketQueryInput({ source: 'community' }, AGENT).source, 'community')
    assert.equal(parseMarketQueryInput({ source: 'all' }, AGENT).source, 'all')
  })
  it("trim 透传钉例（' primary ' → 'primary'）", () => {
    assert.equal(parseMarketQueryInput({ source: ' primary ' }, AGENT).source, 'primary')
  })
  it("空 / 非字符串 / 缺省 → 'all'", () => {
    assert.equal(parseMarketQueryInput({}, AGENT).source, 'all')
    assert.equal(parseMarketQueryInput({ source: '' }, AGENT).source, 'all')
    assert.equal(parseMarketQueryInput({ source: '  ' }, AGENT).source, 'all')
    assert.equal(parseMethodSafe({ source: 7 }), 'all')
  })
  it('非法值 throw，消息逐字节锚', () => {
    assert.throws(
      () => parseMarketQueryInput({ source: 'zone' }, AGENT),
      (e) =>
        e instanceof MarketQueryError &&
        e.message === '非法 source: zone（需 primary/community/all）',
    )
  })
})

function parseMethodSafe(raw) {
  try {
    return parseMarketQueryInput(raw, AGENT).source
  } catch {
    return 'THREW'
  }
}

describe('limit 文法（floor 先行 + policy 钳制）', () => {
  it('缺省 / 0 / 负 / NaN / Infinity → policy 默认（AGENT 10 / GUI 32）', () => {
    for (const bad of [undefined, 0, -5, NaN, Infinity, -Infinity]) {
      assert.equal(parseMarketQueryInput({ limit: bad }, AGENT).limit, 10)
      assert.equal(parseMarketQueryInput({ limit: bad }, GUI).limit, 32)
    }
  })
  it("数字串 '10' → 10；空串/null → 默认", () => {
    assert.equal(parseMarketQueryInput({ limit: '10' }, AGENT).limit, 10)
    assert.equal(parseMarketQueryInput({ limit: '' }, AGENT).limit, 10)
    assert.equal(parseMarketQueryInput({ limit: null }, AGENT).limit, 10)
  })
  it('下界：0.5 → 1（floor 后钳到 1）', () => {
    assert.equal(parseMarketQueryInput({ limit: 0.5 }, AGENT).limit, 1)
  })
  it('floor 钉例：80.7 → 80（AGENT）；96.5 → 96（GUI）', () => {
    assert.equal(parseMarketQueryInput({ limit: 80.7 }, AGENT).limit, 80)
    assert.equal(parseMarketQueryInput({ limit: 96.5 }, GUI).limit, 96)
  })
  it('上界：100 → 80（AGENT）', () => {
    assert.equal(parseMarketQueryInput({ limit: 100 }, AGENT).limit, 80)
  })
})

describe('offset 文法', () => {
  it('缺省 / 0 / 负 / NaN → 0；正数与数字串 floor 直通', () => {
    for (const bad of [undefined, 0, -3, NaN, Infinity, null]) {
      assert.equal(parseMarketQueryInput({ offset: bad }, AGENT).offset, 0)
    }
    assert.equal(parseMarketQueryInput({ offset: 5 }, AGENT).offset, 5)
    assert.equal(parseMarketQueryInput({ offset: '7' }, AGENT).offset, 7)
    assert.equal(parseMarketQueryInput({ offset: 3.9 }, AGENT).offset, 3)
  })
})

describe('错误优先级与单一事实源导出', () => {
  it('双违例先 category 后 source（红线 #6 顺序）', () => {
    assert.throws(
      () => parseMarketQueryInput({ category: '非法!!', source: 'zone' }, AGENT),
      /非法分类/,
    )
  })
  it('漂移守卫：PRIMARY_CATEGORY_LABELS 键集 ≡ registry CATEGORIES', () => {
    assert.deepEqual(
      Object.keys(PRIMARY_CATEGORY_LABELS).sort(),
      [...CATEGORIES].sort(),
    )
    assert.equal(PRIMARY_CATEGORY_LABELS['essentials'], '装机必备')
  })
  it('COMMUNITY_SLUG_RE 文法锚 + deadline 常量值锚', () => {
    assert.equal(String(COMMUNITY_SLUG_RE), '/^[a-z0-9-]{1,32}$/')
    assert.ok(COMMUNITY_SLUG_RE.test('theme') && !COMMUNITY_SLUG_RE.test('非法!!'))
    assert.equal(SEARCH_CORE_DEADLINE_MS, 44_000)
    assert.equal(INSTALLED_CORE_DEADLINE_MS, 60_000)
  })
})
