/**
 * 搜索相关性管线（0.7.0 Task 3 / DESIGN.md §2.6「搜索：相关性加权管线」）：
 * NFKC 归一化 + 中西文边界插空格 + 标点归空格 → 分词 → 字段加权评分。
 *
 * - id 为单列最高优先：normalized id 与整条 query 精确相等 → ID_EXACT_SCORE（收藏 stale 检测
 *   依赖此语义，豁免「多词同字段全命中」约束）；
 * - 字段权重：name/npm 700 · owner 400 · 首选描述 280 · 次选描述 240 · 分类 180 · tags 150
 *   （tags 为 dsh-m 主清单召回保留——dsh-market 目录无 tags 概念，主清单 tags 有文案标准）；
 * - 命中类型加分：精确 +300 / 前缀 +250 / 包含 +200 / 多词全命中 +150；
 *   多词要求**同字段全命中**，否则该字段 0 分；
 * - 按条目 WeakMap memoize 归一化字段串——4,400+ 条 × 每次搜索请求全量归一化的性能护栏
 *   （条目对象随每次 adapt 重建，缓存随条目代际自然失效，无陈旧风险）。
 */

export interface SearchableEntry {
  id: string
  name: string
  npm?: string
  owner?: string
  description: string
  descriptionEn?: string
  category: string
  tags?: string[]
}

/** id 整串精确匹配得分：恒高于一切字段组合分，保证排首且必命中。 */
export const ID_EXACT_SCORE = 10_000

const W_NAME = 700
const W_OWNER = 400
const W_DESC = 280
const W_DESC_EN = 240
const W_CATEGORY = 180
const W_TAGS = 150

const B_EXACT = 300
const B_PREFIX = 250
const B_CONTAINS = 200
const B_MULTI = 150

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
const WORD_RE = /[\p{L}\p{N}]/u

/** ASCII 词符查表（code<128）：[0-9A-Za-z]=1（\p{L}\p{N} 在 ASCII 区间恰为字母数字），其余=0。 */
const ASCII_WORD = new Uint8Array(128)
for (let c = 48; c <= 57; c++) ASCII_WORD[c] = 1
for (let c = 65; c <= 90; c++) ASCII_WORD[c] = 1
for (let c = 97; c <= 122; c++) ASCII_WORD[c] = 1

/**
 * 归一化：NFKC + 小写 + 中西文边界插空格（`MCP管理` ≈ `MCP 管理`）+ 标点/符号/空白归单空格。
 *
 * 单遍实现（2026-10-16 冷路径优化）：一次扫描同时完成旧「转角插空 + 收尾 `[^\p{L}\p{N}]+` 归单空格 +
 * trim」三件事，输出与旧两遍实现**逐字节等价**（golden 差分语料 3888 条 + quirk 钉钉死；mismatch 一律修实现不改 fixture）。
 * - 分类：ASCII 走查表；CJK 稳定核四区间（4E00–9FA5 / 3400–4DB5 / F900–FA6D / FA70–FAD9）直判词符 CJK——
 *   按段自 Unicode 1.1 / 3.0 / 3.2 / 4.1 起赋值且永不负赋值（≥4.1 运行时必全赋值，与运行时版本无关）；
 *   其余非 ASCII（FA 段未赋值洞 U+FA6E/FA6F/FADA–FAFF、版本敏感缘 U+4DB6+/U+9FA6+ 等）一律回退
 *   WORD_RE/CJK_RE——回退与旧实现同谓词同运行时，等价由构造保证。
 * - astral 词对：代理对整体经 WORD_RE 按码点判词（命中者必 NFKC 稳定，如 U+20000；数学字母 𝕏 等已被
 *   NFKC 折成 ASCII 到不了这里）→ 原样保留、冲刷待定分隔、重置转角状态——精确复刻旧实现「代理项对半按
 *   非词参与转角判定（不触发插空）、但收尾 replace 按码点保留 astral 词符」的合成行为；emoji 等非词对与
 *   孤立代理半区走通用非词折叠。
 */
export function normalizeSearchText(input: string): string {
  const nfk = input.normalize('NFKC').toLowerCase()
  let out = ''
  let lastWordKind = 0 // 0=尚无词符，1=词非 CJK，2=词 CJK
  let pendingSpace = false
  for (let i = 0; i < nfk.length; i++) {
    const code = nfk.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const code2 = i + 1 < nfk.length ? nfk.charCodeAt(i + 1) : 0
      if (code2 >= 0xdc00 && code2 <= 0xdfff && WORD_RE.test(nfk.slice(i, i + 2))) {
        if (pendingSpace) {
          out += ' '
          pendingSpace = false
        }
        out += nfk[i]
        out += nfk[i + 1]
        lastWordKind = 0
        i++
        continue
      }
      // 非词对（emoji 等）或孤立前导半区：落入通用路径按非词处理
    }
    let k: 0 | 1 | 2
    if (code < 128) {
      k = ASCII_WORD[code] ? 1 : 0
    } else if (
      (code >= 0x4e00 && code <= 0x9fa5) ||
      (code >= 0x3400 && code <= 0x4db5) ||
      (code >= 0xf900 && code <= 0xfa6d) ||
      (code >= 0xfa70 && code <= 0xfad9)
    ) {
      k = 2
    } else if (!WORD_RE.test(nfk[i])) {
      k = 0
    } else {
      k = CJK_RE.test(nfk[i]) ? 2 : 1
    }
    if (k === 0) {
      if (out !== '') pendingSpace = true
      continue
    }
    if (pendingSpace) {
      out += ' '
      pendingSpace = false
      lastWordKind = 0
    }
    if (lastWordKind !== 0 && (k === 2) !== (lastWordKind === 2)) out += ' '
    out += nfk[i]
    lastWordKind = k
  }
  return out
}

/** 分词（输入应为 normalizeSearchText 产物）。 */
export function tokenizeSearchText(normalized: string): string[] {
  return normalized.split(/\s+/).filter((t) => t !== '')
}

/** 多段字段（如 tags）归一化为单空格连接的 token 串。 */
function fieldText(parts: Array<string | undefined>): string {
  // 单元素快路（2026-10-16 冷路径优化）：单字符串字段（name/npm/owner/description/…占绝大多数）
  // 的 join([n]) === n 恒等，免 filter/map/filter 三次数组分配；空/全符号串归 '' 与旧路径一致。
  if (parts.length === 1) {
    const p = parts[0]
    if (typeof p === 'string' && p.trim() !== '') return normalizeSearchText(p)
    return ''
  }
  return parts
    .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
    .map((p) => normalizeSearchText(p))
    .filter((p) => p !== '')
    .join(' ')
}

interface NormalizedFields {
  id: string
  fields: Array<{ text: string; weight: number }>
}

const fieldsCache = new WeakMap<object, NormalizedFields>()

function fieldsOf(entry: SearchableEntry): NormalizedFields {
  const cached = fieldsCache.get(entry)
  if (cached) return cached
  const fields: Array<{ text: string; weight: number }> = [
    { text: fieldText([entry.name]), weight: W_NAME },
    ...(entry.npm !== undefined ? [{ text: fieldText([entry.npm]), weight: W_NAME }] : []),
    ...(entry.owner !== undefined ? [{ text: fieldText([entry.owner]), weight: W_OWNER }] : []),
    { text: fieldText([entry.description]), weight: W_DESC },
    ...(entry.descriptionEn !== undefined ? [{ text: fieldText([entry.descriptionEn]), weight: W_DESC_EN }] : []),
    { text: fieldText([entry.category]), weight: W_CATEGORY },
    ...(entry.tags !== undefined && entry.tags.length > 0 ? [{ text: fieldText(entry.tags), weight: W_TAGS }] : []),
  ]
  const value: NormalizedFields = { id: fieldText([entry.id]), fields }
  fieldsCache.set(entry, value)
  return value
}

function hitBonus(field: string, term: string): number {
  if (field === term) return B_EXACT
  if (field.startsWith(term)) return B_PREFIX
  if (field.includes(term)) return B_CONTAINS
  return 0
}

/** 单字段评分：全部词命中才得分（取最弱命中类型 + 多词加成）；任一词未命中 → 0。 */
function scoreField(text: string, weight: number, terms: string[]): number {
  if (text === '') return 0
  let min = Number.POSITIVE_INFINITY
  for (const term of terms) {
    const b = hitBonus(text, term)
    if (b === 0) return 0
    if (b < min) min = b
  }
  return weight + min + (terms.length > 1 ? B_MULTI : 0)
}

/** 相关性评分（>0 = 命中）：id 整串精确匹配最高优先且豁免多词约束；否则取各字段最大分。 */
export function relevanceScore(entry: SearchableEntry, terms: string[]): number {
  if (terms.length === 0) return 0
  const f = fieldsOf(entry)
  if (f.id !== '' && f.id === terms.join(' ')) return ID_EXACT_SCORE
  let best = 0
  for (const field of f.fields) {
    const s = scoreField(field.text, field.weight, terms)
    if (s > best) best = s
  }
  return best
}
