# 市场查询文法（三端统一 intake）+ CLI 非法 category 吞错修复 实施计划

## 目标

- 把散落在 host-api / tools / cli 三处的市场查询参数文法（分类 = 精选五桶 ∪ 社区 slug、source 三值枚举、offset/limit 解析）收敛为单一模块 `src/core/market-query.ts`，作为 GLOSSARY「合并市场」条目「三端同源同语义」承诺的执行机制。
- 修复现存活 bug：`dshm search --category <非法>` 今日静默返回「没有匹配的收录条目」+ exit 0（2026-10-16 实测），改与 GUI（400）/agent 工具（throw）同语义：`错误：非法分类: …` + exit 1。
- 顺手单源化同一邻域的三类影子拷贝：slug 正则 ×3、精选标签表 ×2（外加 deadline 常量 ×2）。口径注记：「×3 / ×2」指三端接线层口径；client 层（`src/client/main.jsx` :40/:161 i18n 标签、:1717 硬编码五桶数组）另有浏览器展示层拷贝，无法 import core 模块，不接入本计划，标签漂移守卫亦不覆盖 client 数组（既有现状，如实注记）。

## 架构快照

- 新模块 `src/core/market-query.ts` 是纯文法模块：单一入口 `parseMarketQueryInput(raw, policy)` 一次吃下 `{category?, source?, limit?, offset?}`，文法违规 throw `MarketQueryError`（消息即契约）；`limit` 的各端差异（GUI 96/32、tools/cli 80/10）通过 policy 参数表达，文法本身单点。
- 三端各一行信封映射：host-api catch → `ApiProtocolError(400, e.message)`；tools 让 throw 直接飞（与今日 `throw new Error` 同通道）；cli 让 throw 飞到既有 dispatch 统一 catch（`错误：${msg}` + exit 1）。
- 依赖方向纪律：market-query.ts 仅 import `registry.js`（取 `CATEGORIES`）；**禁止值引用 community.ts**（`community → merged-market → community-adapter` 已是值链，adapter 接入 market-query 后再引 community 即成环）。`categoryLabelOf` 的社区段合并（`?? COMMUNITY_CATEGORY_LABELS[cat] ?? cat`）因此留在 tools/cli 各一行（展示层组合）。
- sort / probeMode / force / primaryOnly / query 均不入模块：前四者仅 GUI 暴露（单消费者），query 三端语义确实不同（host-api `strArg` 会 trim、tools 不 trim、cli 位置参数合并在前）。

## 全局约束

- **文案规则**：两条错误消息逐字节不变——`非法分类: <v>（需精选分类或 [a-z0-9-]{1,32} slug）`、`非法 source: <v>（需 primary/community/all）`。现有 `tests/tools-search.test.mjs`（`/非法 source/`）与 `tests/host-api.test.mjs`（`非法 source` :334、`非法分类` :848）锚零迁移。
- **命名规则**：模块 `market-query.ts`；导出 `parseMarketQueryInput` / `MarketQueryError` / `MarketQueryPolicy` / `MarketQueryIntake` / `COMMUNITY_SLUG_RE` / `PRIMARY_CATEGORY_LABELS` / `SEARCH_CORE_DEADLINE_MS` / `INSTALLED_CORE_DEADLINE_MS`；GLOSSARY 词条名「市场查询文法」。
- **依赖限制**：market-query.ts 的 import 白名单 = `./registry.js`（仅此一项）。
- **发版**：版本 0.9.91 → 0.9.92；版本三处一致（`package.json` / `package-lock.json` 根两字段 / `CHANGELOG.md` 两语言区块顶条）；tag `v0.9.92` push 触发 OIDC 可信发布（know-how 018：staged 延迟，绿 ≠ 上架，勿重推 tag；装机冒烟走 know-how 026 §① `dshm_upgrade` 宿主通道）。
- **平台**：验证命令均为 bash（本机 Linux），沿用 `npm run build && npm test`（`pretest` 自动 build）惯例。

## 输入工件

- grill 共识（本对话 2026-10-16，Round 1 Q1-Q8 + Round 2 Q9-Q10 全按推荐落定，决策记录见下节）。
- 活 bug 证据：`node lib/cli.js search --category '非法分类!!' --limit 3` → 「没有匹配的收录条目」exit 0；根因 `src/cli.ts` search 臂 category 直传未校验（当前 :267），core `listMarket` 对 category 不设防（`src/core/market.ts` 仅当过滤键，当前 :633）。
- 重复度证据：slug 正则 ×3（`src/tools.ts` :49 / `src/core/host-api.ts` :115 / `src/core/community-adapter.ts` :21）；source+limit+offset 解析 ×3（`src/tools.ts` :172-187 / `src/cli.ts` :255-264 / `src/core/host-api.ts` :440-462）；精选标签表 ×2（`src/tools.ts` `CATEGORY_LABELS` :26-32 / `src/cli.ts` `CLI_CATEGORY_LABELS` :31-37，键集 ≡ `registry.ts` `CATEGORIES` :14）；deadline 常量 ×2（`src/tools.ts` :45/:47 / `src/cli.ts` :100-101；tools 的 :44/:46 两个 TOOL_TIMEOUT 常量为各端信封专属，不迁移）。

## 决策记录（grill 十决议）

| # | 决议 |
|---|---|
| D1 | 文法归属：category(+slug)/source/offset/limit + 标签表 + slug 正则（含 adapter 第 3 份）；sort/probeMode/force/query 不入 |
| D2 | 单一入口 `parseMarketQueryInput(raw, policy)` throw 型；不拆散装函数 |
| D3 | throw `MarketQueryError`（无 code 字段，YAGNI），消息即契约、逐字节保现状 |
| D4 | CLI 非法 category 走 dispatch 统一 catch（`错误：` 前缀 + exit 1）；limit 统一 floor 先行 |
| D5 | 模块 `src/core/market-query.ts` + GLOSSARY 词条「市场查询文法」 |
| D6 | 不单开 ADR；决策记录以本节入档 |
| D7 | 发版 0.9.92，fix(cli)+refactor 合一条，双语 CHANGELOG |
| D8 | deadline 常量由 market-query.ts 一并导出，两端改 import |
| D9 | 测试 = 模块文法矩阵 + 标签键集 ≡ CATEGORIES 漂移守卫 + CLI 回归钉例（非法 category/非法 source 各一）；不加跨端 meta-test |
| D10 | `tools.ts` 的 `export const CATEGORY_LABELS` 直接删除不留 re-export（全库零外部消费者已证）；`clamp()` 随接线删除（唯一调用者即被改写的 limit 行） |

## 语义等价红线

1. 两条错误消息逐字节不变（见全局约束）；现有锚零迁移。
2. host-api limit/offset 公式逐字节等价（今日即为 floor 先行 `Math.min(96, Math.max(1, Math.floor(n)))`）；GUI 单违例请求行为零变化。
3. tools limit floor 微调（自觉差异注记）：今日 tools 的 `clamp`（`Math.min(80, Math.max(1, n))`）对超顶值已钳制（80.7 → 80），(1, 80) 开区间内的小数（如 `10.5`）今日以小数直传 core、由 core `clampLimit`（`src/core/market.ts` 入口的 `Math.floor`）钳为 10；改后在 intake 层显式 floor 为 10——floor 发生的位置从 core 前移到入口，值域结果逐点相同；两端输出对象均不含 limit 字段，无可见行为差异。
4. **CLI category 是本任务的目的性变更**：静默空结果 + exit 0 → `错误：非法分类: …`（stderr）+ exit 1。顺带微调（修复向，注记）：category 会先 trim 再校验（对齐 host-api/tools；今日 CLI 不 trim，带空格值匹配不到任何条目）。同一 trim 微调对称作用于 source：今日 CLI 校验用原始 `flags.source` 不 trim（`--source ' all '` 报非法），改后按共享文法 trim 后校验（`' all '` 接受）——对齐 host-api/tools 现状（两端今日即 trim 后校验、trim 后值透传），错误消息中的违规值也由原始形态变为 trim 后形态。
5. CLI source 校验从内联 `err()+return 1` 改经 throw → dispatch catch：输出格式（`错误：非法 source: …`、stderr、exit 1）逐字节同款。
6. 双违例 pathological 请求（同一请求携带多种非法参数）host-api 400 消息归属顺序统一为 category → source →（端本地）primaryOnly/sort/probeMode；今日为 category → primaryOnly → source。单违例请求逐字节不变；此注记不改判。CLI 对称注记：今日 CLI 只查 source、category 不查，改后 intake 先 category 后 source——双违例请求的报错归属由 source 变为 category（信封同款，病理输入）。
7. core `listMarket` 内部 source 静默归一（`src/core/market.ts` 当前 :555-557）**不动**——内部调用方的纵深防御，非本任务范围。
8. community-adapter 的正则单源化只换正则本体，其条目层宽松校验策略（`src/core/community-adapter.ts` 当前 :153）不变。

## 文件结构与职责

- Create: `src/core/market-query.ts` —— 三端市场查询文法单一事实源（解析 + 标签 + 正则 + deadline 常量）
- Create: `tests/market-query.test.mjs` —— 文法矩阵 + 漂移守卫 + 消息锚
- Modify: `src/core/host-api.ts` —— market 臂（当前 :435-502）：limit/offset/category/source 四段替换为单次 intake 调用 + catch 映射
- Modify: `src/tools.ts` —— search execute 四段替换；`CATEGORY_LABELS` 删本地定义改 import；`COMMUNITY_SLUG_RE`/deadline 常量改 import；删 `clamp()`
- Modify: `src/cli.ts` —— search 命令四段替换（category 校验补上）；`CLI_CATEGORY_LABELS` 删本地定义改 import；deadline 常量改 import
- Modify: `src/core/community-adapter.ts` —— 删 `COMMUNITY_CATEGORY_RE` 本地定义（当前 :21），改 import `COMMUNITY_SLUG_RE`（消费点当前 :153）
- Modify: `tests/cli-search.test.mjs` —— 补非法 category / 非法 source 回归钉例
- Modify: `GLOSSARY.md` —— 「市场查询文法」词条
- Modify: `CHANGELOG.md` / `package.json` / `package-lock.json` —— 0.9.92 发版三处

## 任务清单

### Task 1: market-query 文法模块 + 文法矩阵单测（TDD）

- 目标：新模块与单测先立起来（此刻三端尚未接线，纯增量）。
- 涉及文件：`src/core/market-query.ts`（Create）、`tests/market-query.test.mjs`（Create）。
- 接口契约：
  - Consumes: `CATEGORIES`（`src/core/registry.ts` :14，`readonly ['essentials','cui-picks','self-dev','tencent-lighthouse','watchlist']`）。
  - Produces（后续任务全部依赖，此处为完整定义）：
    - `export const COMMUNITY_SLUG_RE = /^[a-z0-9-]{1,32}$/`
    - `export const PRIMARY_CATEGORY_LABELS: Record<string, string>`：五桶中文标签 `{ essentials: '装机必备', 'cui-picks': '崔添翼精选', 'self-dev': 'iasi自研', 'tencent-lighthouse': '腾讯轻量云专区', watchlist: '观察区' }`
    - `export const SEARCH_CORE_DEADLINE_MS = 44_000`；`export const INSTALLED_CORE_DEADLINE_MS = 60_000`
    - `export class MarketQueryError extends Error`（构造只收 message，`this.name = 'MarketQueryError'`，无 code 字段）
    - `export interface MarketQueryPolicy { limitMax: number; limitDefault: number }`
    - `export interface MarketQueryIntake { category: string | null; source: 'primary' | 'community' | 'all'; limit: number; offset: number }`
    - `export function parseMarketQueryInput(raw: { category?: unknown; source?: unknown; limit?: unknown; offset?: unknown }, policy: MarketQueryPolicy): MarketQueryIntake`，文法（错误检查顺序 category → source）：
      - category：非字符串或 trim 后为空 → `null`；`(CATEGORIES as readonly string[]).includes(v) || COMMUNITY_SLUG_RE.test(v)` → `v`（trim 后值）；否则 throw `MarketQueryError(\`非法分类: ${v}（需精选分类或 [a-z0-9-]{1,32} slug）\`)`
      - source：非字符串或 trim 后为空 → `'all'`；trim 后为 `'primary'|'community'|'all'` → **trim 后值**（与 host-api/tools 今日「trim 后校验、trim 后值透传」逐字节同语义，勿返回未 trim 原值）；否则 throw `MarketQueryError(\`非法 source: ${v}（需 primary/community/all）\`)`（`v` = trim 后值，同今日两端消息形态）
      - limit：`const n = Number(raw.limit)`；`Number.isFinite(n) && n > 0 ? Math.min(policy.limitMax, Math.max(1, Math.floor(n))) : policy.limitDefault`
      - offset：`const n = Number(raw.offset)`；`Number.isFinite(n) && n > 0 ? Math.floor(n) : 0`
- 验证范围：模块单测全绿；`npm run typecheck` 零错误。

- [ ] Step 1: 写失败测试 `tests/market-query.test.mjs`
  - Change: 按 D9 矩阵落例——category（五桶逐一直通 / `'theme'` slug 直通 / 空·whitespace·非字符串 → null / `' self-dev '` → `'self-dev'` / `'非法!!'` throw 且消息含 `非法分类: 非法!!（需精选分类或 [a-z0-9-]{1,32} slug）`）；source（三值直通 / 空·非字符串 → `'all'` / `' primary '` → `'primary'`（trim 透传钉例）/ `'zone'` throw 且消息含 `非法 source: zone（需 primary/community/all）`）；limit（policy `{limitMax:80,limitDefault:10}`：缺省/`0`/`-5`/`NaN`/`Infinity` → 10、`'10'` 数字串 → 10、`0.5` → 1、`80.7` → 80（floor 钉例）、`100` → 80；policy `{96,32}`：缺省 → 32、`96.5` → 96）；offset（缺省 → 0、`5` → 5、`'7'` → 7、`0`/`-3`/`NaN` → 0、`3.9` → 3）；漂移守卫 `Object.keys(PRIMARY_CATEGORY_LABELS).sort()` 深等于 `[...CATEGORIES].sort()`；错误类 `e instanceof MarketQueryError` 且 `e.name === 'MarketQueryError'`。
- [ ] Step 2: 确认失败
  - Run: `node --test tests/market-query.test.mjs`
  - Expected: 模块不存在导致 import 失败，全部 case 红。
- [ ] Step 3: 写最小实现 `src/core/market-query.ts`（按上方接口契约逐字实现；import 白名单仅 `./registry.js`）。
- [ ] Step 4: 确认通过
  - Run: `npm run build && node --test tests/market-query.test.mjs && npm run typecheck`
  - Expected: 新套件全绿、typecheck 零错误（此时尚未接线，全套件也应绿）。
- [ ] Step 5: checkpoint commit
  - Run: `git add src/core/market-query.ts tests/market-query.test.mjs && git commit -m "feat(core): 市场查询文法模块 parseMarketQueryInput——三端共享文法/标签/正则/deadline 单一事实源（文法矩阵+漂移守卫单测）"`

### Task 2: community-adapter 正则单源化

- 目标：消灭第 3 份 slug 正则；文法规则全部归位 market-query。
- 涉及文件：`src/core/community-adapter.ts`。
- 接口契约：
  - Consumes: `COMMUNITY_SLUG_RE`（Task 1 产出）。
  - Produces: 无下游依赖（独立收口）。
- 验证范围：`tests/community-adapter.test.mjs` 现状全绿（条目层宽松校验行为零变化，红线 #8）。

- [ ] Step 1: 删 `src/core/community-adapter.ts` 当前 :21 的 `const COMMUNITY_CATEGORY_RE = /^[a-z0-9-]{1,32}$/`，顶部加 `import { COMMUNITY_SLUG_RE } from './market-query.js'`，消费点（当前 :153）`COMMUNITY_CATEGORY_RE.test` → `COMMUNITY_SLUG_RE.test`，就地注释一句「正则单源于 market-query（0.9.92）」。
- [ ] Step 2: 验证
  - Run: `npm run build && node --test tests/community-adapter.test.mjs tests/community.test.mjs`
  - Expected: 全绿（无环：market-query 只依赖 registry）。
- [ ] Step 3: 并入 Task 3 的接线 commit（无独立 commit，reviewer 可单独拒绝本任务而接受相邻任务）。

### Task 3: host-api market 臂接线

- 目标：GUI 通道改走共享文法；单违例行为零变化（红线 #2/#6）。
- 涉及文件：`src/core/host-api.ts`。
- 接口契约：
  - Consumes: `parseMarketQueryInput` / `MarketQueryError` / `MarketQueryIntake`（Task 1）；既有 `ApiProtocolError`。
  - Produces: 无下游依赖。
- 验证范围：`tests/host-api.test.mjs` 现状全绿、锚零迁移（`非法 source` :334、`非法分类` :848 原样通过）。

- [ ] Step 1: market 臂（当前 :435-502）替换：删 limit/offset 解析段（:440-443）、category 校验段（:445-453）、source 校验段（:458-462），改为——
  ```ts
  let intake: MarketQueryIntake
  try {
    intake = parseMarketQueryInput(
      { category: body.category, source: body.source, limit: body.limit, offset: body.offset },
      { limitMax: 96, limitDefault: 32 },
    )
  } catch (e) {
    if (e instanceof MarketQueryError) throw new ApiProtocolError(400, e.message)
    throw e
  }
  ```
  `primaryOnly` 显式拒绝（当前 :455-457）、sort（:463-474）、probeMode（:475-479）三段原样保留在 intake 之后；`listMarket` 调用参数改用 `intake.category/intake.source/intake.limit/intake.offset`；policy 就地注释保留今日 96/32 决策原文（0.7.0 Task 7 探测预算决策）。双违例顺序注记（红线 #6）就地补一行注释。同时删除因替换而死代码化的两处：本地 `COMMUNITY_SLUG_RE`（:115）与 `import { CATEGORIES }`（:32——唯一消费点即被替换的 :448；删除前 grep 全文件复核无其它消费）。「slug 正则 ×3 → ×1」在此收口。
- [ ] Step 2: 验证
  - Run: `npm run build && node --test tests/host-api.test.mjs`
  - Expected: 全绿，含既有 `非法 source`/`非法分类` 断言。

### Task 4: tools.ts 接线（标签/正则/deadline 单源化 + 删 clamp）

- 目标：agent 工具通道改走共享文法；`CATEGORY_LABELS` 导出与 `clamp()` 清退。
- 涉及文件：`src/tools.ts`。
- 接口契约：
  - Consumes: `parseMarketQueryInput`（Task 1）；`PRIMARY_CATEGORY_LABELS` / `SEARCH_CORE_DEADLINE_MS` / `INSTALLED_CORE_DEADLINE_MS`（Task 1）；既有 `COMMUNITY_CATEGORY_LABELS`（`src/core/community.ts`）。（`MarketQueryError` / `COMMUNITY_SLUG_RE` 不进 tools：throw 直飞无需 catch、正则消费点随四段替换消灭，勿留死 import。）
  - Produces: 无下游依赖（`CATEGORY_LABELS` 全库零外部消费者已证，删除安全）。
- 验证范围：`tests/tools-search.test.mjs` 现状全绿——含 `/非法 source/` 锚与 :110 `categoryLabel='装机必备'` 精选标签锚（tests/ 中唯一的标签断言）；⑤ 的 systemPrompt/description 改动为纯改名（输出零变化），以源结构锚复核：`grep -En '\bCATEGORY_LABELS\b' src/tools.ts` 零命中（`PRIMARY_CATEGORY_LABELS` / `COMMUNITY_CATEGORY_LABELS` 因前置下划线不构成词边界匹配）。`tests/tools-summary.test.mjs` 无 systemPrompt 断言，不在本任务护栏内（如实注记）。

- [ ] Step 1: `src/tools.ts` 六处改动——① 顶部 import 增补 market-query 四名导出，删除本地 `SEARCH_CORE_DEADLINE_MS`（:45）与 `INSTALLED_CORE_DEADLINE_MS`（:47）——**保留** :44/:46 两个 TOOL_TIMEOUT 常量（各端信封专属、不迁移）——与 `COMMUNITY_SLUG_RE`（:49）定义；② 删 `export const CATEGORY_LABELS`（:26-32）；③ `categoryLabelOf` 函数体改 `PRIMARY_CATEGORY_LABELS[category] ?? COMMUNITY_CATEGORY_LABELS[category] ?? category`（保留一行社区段合并，环纪律）；④ dshm_search execute（:172-187 区段）category/source/limit/offset 四段删，改 `const intake = parseMarketQueryInput({ category: args.category, source: args.source, limit: args.limit, offset: args.offset }, { limitMax: 80, limitDefault: 10 })`（throw 直接飞，与今日同通道）；listMarket 调用改用 intake 字段与 `deadlineMs: SEARCH_CORE_DEADLINE_MS`；⑤ description（:145）`Object.keys(CATEGORY_LABELS)` → `PRIMARY_CATEGORY_LABELS`；systemPrompt（:534）`Object.entries(CATEGORY_LABELS)` → `PRIMARY_CATEGORY_LABELS`；⑥ 删 `clamp()`（:727 区段，唯一调用者已被替换）。
- [ ] Step 2: 验证
  - Run: `npm run build && node --test tests/tools-search.test.mjs tests/tools-summary.test.mjs tests/tools-install.test.mjs && npm run typecheck`
  - Expected: 全绿 + typecheck 零错误（删导出无残余引用）。

### Task 5: cli.ts 接线 + 吞错修复 + 回归钉例

- 目标：修复活 bug；CLI 与 GUI/工具同语义（红线 #4/#5）。
- 涉及文件：`src/cli.ts`、`tests/cli-search.test.mjs`。
- 接口契约：
  - Consumes: `parseMarketQueryInput`（Task 1）；`PRIMARY_CATEGORY_LABELS` / `SEARCH_CORE_DEADLINE_MS` / `INSTALLED_CORE_DEADLINE_MS`（Task 1）；既有 `COMMUNITY_CATEGORY_LABELS`；既有 dispatch 统一 catch（当前 :211-214：`错误：${e.message}` + return 1，仅 `e instanceof Error` 判断）。（`MarketQueryError` 不进 cli：无 catch 点、零引用，勿留死 import。）
  - Produces: 无下游依赖。
- 验证范围：`tests/cli-search.test.mjs` 全绿（含新增两钉例）；真机 CLI 预网络拒绝实测。

- [ ] Step 1: 先写失败测试（`tests/cli-search.test.mjs` 追加两例，走既有 fake-deps 注入惯例；注意既有 harness 的 `io.err` 目前丢弃 stderr，需先给捕获器补 err 行收集——两例都要断言 stderr 内容）：① `search --category '非法!!'` → stderr 含 `错误：非法分类: 非法!!`、退出码 1（今日实际静默空结果——失败先行）；② `search --source 'zone'` → stderr 含 `错误：非法 source: zone`、退出码 1（现状补钉，防 rewiring 回退）。
  - Run: `npm run build && node --test tests/cli-search.test.mjs`
  - Expected: 例 ① 红（今日吞错）、例 ② 绿。
- [ ] Step 2: `src/cli.ts` 四处改动——① 顶部 import market-query 四名导出（`parseMarketQueryInput`/`PRIMARY_CATEGORY_LABELS`/`SEARCH_CORE_DEADLINE_MS`/`INSTALLED_CORE_DEADLINE_MS`；cli 不 catch `MarketQueryError`，throw 直飞 dispatch），删本地 `SEARCH_CORE_DEADLINE_MS`/`INSTALLED_CORE_DEADLINE_MS`（:100-101）；② 删 `CLI_CATEGORY_LABELS`（:31-37）与本地 `categoryLabelOf`（:39-41），改 `PRIMARY_CATEGORY_LABELS[category] ?? COMMUNITY_CATEGORY_LABELS[category] ?? category` 同款一行（import `COMMUNITY_CATEGORY_LABELS` 已在）；③ search 命令（:255-268 区段）source/limit/offset 三段删、`category` 直传行删，改 `const intake = parseMarketQueryInput({ category: flags.category, source: flags.source, limit: flags.limit, offset: flags.offset }, { limitMax: 80, limitDefault: 10 })`（throw 飞给 dispatch catch，输出与今日 source 校验 `错误：` 前缀逐字节同款）；listMarket 调用改用 intake 字段与 `deadlineMs: SEARCH_CORE_DEADLINE_MS`；④ help 文案（:182-183）同步：category 列表由 0.9.16 前旧五分类残留（`market|tools|ui|search|other`——今日恰好因匹配 slug 文法而「合法但必然空结果」）改为现行策展五桶枚举，与本任务统一文法直接配套（0.9.90 `fix(cli)` help 同步同款先例）。
- [ ] Step 3: 验证
  - Run: `npm run build && node --test tests/cli-search.test.mjs && node lib/cli.js search --category '非法分类!!' --limit 3; echo "exit=$?"`
  - Expected: 套件全绿（例 ① 转绿）；真机输出 stderr `错误：非法分类: 非法分类!!（需精选分类或 [a-z0-9-]{1,32} slug）`、`exit=1`（校验先于任何网络调用）。

### Task 6: 三端接线 commit + GLOSSARY + 发版 0.9.92

- 目标：入库、词条、双语 CHANGELOG、版本三处一致、tag 发版。
- 涉及文件：`GLOSSARY.md`、`CHANGELOG.md`、`package.json`、`package-lock.json`。
- 接口契约：
  - Consumes: Task 2-5 的全部改动（一并提交）；发版门禁（typecheck + tests + 版本三处一致）。
  - Produces: npm 上的 0.9.92（OIDC）。
- 验证范围：全套件绿 + 门禁过 + tag push 后 GitHub Actions 绿。

- [ ] Step 1: 接线 commit（Task 2-5 改动按文件归属一组，自洽完整）
  - Run: `git add src/core/host-api.ts src/tools.ts src/cli.ts src/core/community-adapter.ts tests/cli-search.test.mjs && git commit -m "refactor(api,tools,cli,core): 三端市场查询入口统一接线 market-query——CLI 非法 category 显式报错（吞错修复）+ slug 正则/精选标签/deadline 常量单源化（floor 钉例与双违例顺序注记见计划）"`
- [ ] Step 2: GLOSSARY「市场查询文法」词条（插入 Language 区、「物化合并市场」条目之后——「合并市场 → 物化合并市场」是强相邻词条对，勿拆开）
  - Change: **市场查询文法（Market Query Intake）**：三端（面板 API / agent 工具 / CLI）市场查询参数的共享校验与归一模块：精选五桶（≡ registry `CATEGORIES`）∪ 社区 slug、source 枚举、offset/limit（各端 policy）；非法输入统一抛 `MarketQueryError`，由各端映射自身信封（400 / throw / stderr+exit 1）。「合并市场」条目「三端同源同语义」承诺的执行机制。_Avoid_: 参数校验（过泛）、query parser（实现口吻）。
- [ ] Step 3: CHANGELOG 双语顶条（两语言区块各一条，问题/方案/验证三段式，引本计划与 GLOSSARY 词条；覆盖：CLI 吞错修复、三端文法单源化、tools 区间内小数 floor 微调注记（超顶值今日已被 clamp 钳制，勿写错旧版行为）、CLI category/source trim 对齐注记）
- [ ] Step 4: 版本三处 `0.9.91` → `0.9.92`：`package.json` `version`；`package-lock.json` 根 `version` 与 `packages[""].version` 两字段；CHANGELOG 顶条版本号。（注：publish 门禁只机器核对 package.json + lockfile 字段，CHANGELOG 顶条版本号是人工核对项。）
- [ ] Step 5: 终验 + 发版
  - Run: `npm run build && npm test && npm run typecheck`
  - Expected: 全套件绿（基线 = Task 1 前的全量通过数 + 新增钉例）、typecheck 零错误。
  - Run: `git add -A && git commit -m "chore(release): 0.9.92 三端市场查询文法统一 + CLI 非法 category 吞错修复" && git tag v0.9.92 && git push origin main v0.9.92`（单 tag 推送，勿 `--tags` 全量推）
  - Expected: publish workflow 触发（OIDC 可信发布；know-how 018：staged 延迟绿 ≠ 上架，勿重推 tag）。
- [ ] Step 6: 装机冒烟（know-how 026 §①）
  - Run: 通过宿主通道升级本机 dsh-m 后，`node <profile 内 cli.js> search --category '非法!!'`；面板市场页一次正常搜索 + 一次非法分类（应弹错误提示而非空列表）。
  - Expected: 两端报错语义一致，市场页正常浏览回归无损。

## 执行纪律

- 开始实现前，先批判性复查整份计划；发现缺项、矛盾、命名不一致或验证命令无效，先修计划再动手。
- 按任务顺序执行（Task 1 → 6），不无声跳步、合并步或改变任务目标；Task 2/3/4/5 的验证各自独立通过后才进 Task 6。
- 每完成一个任务运行该任务定义的验证；任何任务红了先停下归因，不带病推进。
- 遇阻塞、重复失败或计划与仓库现实不符（如行号漂移导致锚点对不上——一律以符号/区段锚为准重新定位），立即停下说明，不猜。
- 当前分支非 main 时的发版 push 步骤先与主人确认；本机 3080 红线与本任务无关（无服务进程改动）。
- 全部任务完成后运行最终验证并输出修改摘要。

## 回退预案

- **本地验证期（Task 1-5 全部验证 + Task 6 Step 5 push 之前）发现行为差异**：不 push tag、不发版；在接线 commit 上修复后重跑全量门禁（`npm run build && npm test && npm run typecheck`），必要时 revert 三端接线 commit 重来——Task 1 的模块+单测 commit 纯增量、无行为面，可独立保留。
- **发版后（tag 已推、npm 已上架）发现三端行为差异**：tag 不可重推、npm 版本不可撤（know-how 018）；正确动作 = revert 三端接线 commit（Task 6 Step 1 那枚）+ 修复 + 发 `0.9.93` 修复版；market-query 模块与单测（Task 1 commit）保留不回退。
- **装机冒烟（Task 6 Step 6）失败**：不重推 tag；同上走 0.9.93 修复版，冒烟失败不改变 npm 上架事实，只决定修复版节奏。

## 最终验证

- Run: `npm run build && npm test && npm run typecheck`
- Expected: 全套件绿（含 `tests/market-query.test.mjs` 新矩阵、`tests/cli-search.test.mjs` 两钉例；现有 `非法 source`/`非法分类` 锚零迁移全绿）；typecheck 零错误。
- Run: `node lib/cli.js search --category '非法分类!!'; echo "exit=$?"` → stderr `错误：非法分类: …` + `exit=1`；`node lib/cli.js search --limit 80.7 dsh` 正常返回（floor 无感，走真实网络，可选）。
- 发版门禁（publish 前置）：typecheck + tests + 版本三处一致全过；tag `v0.9.92` 单次推送。

## 审阅 Checkpoint

- 计划正文结束。请主人审阅：边界（六任务 + 十决议）、语义等价红线（尤其 #4 目的性变更与 #6 双违例顺序注记）、发版形态（0.9.92）。
- 审阅通过前不进入实现；执行方默认为普通编码 agent 或人工，按任务顺序消费。
