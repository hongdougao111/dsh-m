# 搜索归一化冷路径单遍化 + CLI 位置参数修复 实施计划

## 目标

- 把每个物化世代首次搜索的 ~324–364ms 同步 CPU（阻塞 DSH 宿主事件循环）压到**硬线 p50 ≤150ms**（期望 ~110ms）。成本归属实测：`normalizeSearchText` 本体 ~257ms（29,251 条字段串 / 170 万字符，逐字符双 `regex.test` + 收尾全量 regex replace 两遍扫描）+ `fieldText` 装配 ~70–100ms（每字段 filter/map/join 三次数组分配）；NFKC 仅 13.6ms。
- 手段（grill 共识 2026-10-16）：① `normalizeSearchText` 激进单遍化——ASCII 查表 + CJK 稳定核区间直判（洞与版本敏感缘回退 regex，评审 R1-P2 修正）+ 非词符运行就地折叠（消灭收尾 replace 全量扫）+ astral 词对透明规则；② `fieldText` 单元素快路。原型已验证：纯函数 256.8ms → 46.3ms（5.5×），真实语料 + 3000 条种子 fuzz 零 mismatch（该轮 fuzz 池未含 astral 与 FA 洞——已由评审 R1 揭示并在 Task 1 补池，最终数字以 Task 4 实测为准）。
- 等价红线：**字节等价**，astral 转角 quirk 原样保留（语义修复不在本任务）。
- 搭载：修复 `dshm search 位置参数被静默忽略`（[src/cli.ts:64-80](../../src/cli.ts) parseArgs 只认 `--` 前缀，`dshm search 主题` 落成无评分浏览路径）。
- 发版 0.9.90：实现+测试完成后**先停工作区待主人验收**（口径=验收四条），通过后再执行发版任务。

## 架构快照

- `src/core/search-relevance.ts` 是搜索归一化的唯一属主（127 行）：`normalizeSearchText`（NFKC+lower → 逐字符转角插空 → 收尾 `[^\p{L}\p{N}]+` 归单空格 → trim）、`fieldsOf` 按条目 WeakMap memo（世代冷→热 330ms→3ms 的护栏本体）、`fieldText` 字段装配。本次只动 `normalizeSearchText` 与 `fieldText` 的**实现内部**，导出面（`normalizeSearchText` / `tokenizeSearchText` / `relevanceScore` / `ID_EXACT_SCORE` / `SearchableEntry`）与语义逐字节不变。
- 单遍化的发射模型（对旧两遍语义的等价重写，已逐 case 推演 + 原型差分验证）：
  - 分类 `k`：0=非词，1=词非 CJK，2=词 CJK。`code<128` 查 128 项 `Uint8Array`（词符仅 `[0-9A-Za-z]`，ASCII 赋值跨版本稳定）；CJK **稳定核四区间**直判 k=2：0x4E00–0x9FA5 / 0x3400–0x4DB5 / 0xF900–0xFA6D / 0xFA70–0xFAD9——按段自 Unicode 1.1（4E00–9FA5、F900–FA2F）/ 3.0（3400–4DB5 全赋值）/ 3.2（FA30–FA6A）/ 4.1（FA6B–FA6D、FA70–FAD9）起全部赋值（Unicode 稳定政策：已赋值永不负赋值；**≥4.1 运行时四段必全赋值**），与运行时 Unicode 版本无关；合法代理对以 `WORD_RE.test(pair)`（/u 按码点判）判词性；**其余一切非 ASCII**——含 FA 段未赋值洞（U+FA6E/FA6F/U+FADA–FAFF，实测 40 码点 CJK_RE 命中而 WORD_RE 不命中、旧实现折叠它们）、版本敏感缘（U+4DB6–4DBF、U+9FA6–9FFF 等，旧运行时可能未赋值）、kana/hangul 等——一律回退 `WORD_RE`/`CJK_RE` regex：回退与旧实现同谓词同运行时，等价由构造保证（评审 R1-P2）。
  - 发射：k=0 → `pendingSpace = out !== ''`（不吃前导，内建 trim 左）；词符发射前冲刷 pendingSpace（分隔由空格承担，`lastWordKind` 归 0）；相邻词符中西文类别翻转才插空（转角判定）；结尾未冲刷的 pendingSpace 自然丢弃（trim 右）；非词符运行折叠为单空格（内建收尾 replace）。
  - **astral 词对规则（quirk 保真）**：`WORD_RE` 命中的代理对（须 NFKC 稳定者，如 𠀀 U+20000；数学字母 𝕏 等被 NFKC 先折成 ASCII 到不了本分支——实测 `'a𝕏管'`→`'ax 管'`）→ 冲刷 pendingSpace 后原样输出两半字符、`lastWordKind` 置 0、跳 2 个单元——精确复刻旧实现「代理项对半按非词参与转角判定（不触发插空）、但收尾 replace 按码点保留 astral 词符」的两遍合成行为（实测钉：`'a𠀀管'`→`'a𠀀管'`、`'a,𠀀'`→`'a 𠀀'`、`'管𠀀a'`→`'管𠀀a'`、`'𠀀𠀀管'`→`'𠀀𠀀管'`）；`WORD_RE` 不命中的对（emoji 等）按两个非词半区折叠（`'a😀b'`→`'a b'`）；孤立代理半区（lone surrogate）走非词折叠（实测 `'a\uD800b'`→`'a b'`）。
- `fieldText` 单元素快路：`parts.length === 1` 且为非空字符串时直接 `normalizeSearchText(p)`（`join([n]) === n` 恒等，空/全符号串返回 `''` 同旧路径）；多元素（仅 tags）走原路径。
- CLI 修复：`parseArgs` 增收集 `positionals`（未被 flag 取值消费的非 `--` 词元）；`search` 分支 query 取 `flags.query`（字符串时）否则 `positionals[0]`；flag 优先、多余位置参数忽略。help 用法行同步（[src/cli.ts:176](../../src/cli.ts)）。
- 不动：`fieldsOf`/WeakMap 制度、ADR-0016 世代设计与决策 8（预归一化进代/预热均不重开）、两段加载、探测模式、客户端 bundle（本任务零 src/client 改动，无 bundle 锚影响）。

## 全局约束

- 等价红线（grill Q2）：golden 差分语料 + 种子 fuzz + 手写 quirk 钉全部**零 mismatch**；astral 转角 quirk 保真不修——含 NFKC×astral 交互（𝕏 折叠）、FA 段未赋值洞折叠、lone surrogate 折叠等一切已实测钉住的现行为。
- 范围红线（grill Q1）：只做纯函数优化 + fieldText 快路；不引入预热调度器、不动 merged-market/世代。
- 验收口径（grill Q4）：① `npm test` 全绿 + `npm run typecheck` 0 error；② 差分零 mismatch；③ 冷搜索计时（4472 条 fieldsOf+score 全量，真实目录）p50 ≤150ms；④ E2E 强制换代+世代首搜合并 spike 复测并记录数字。计时验收走脚本**不入 CI**（仓库无计时断言先例，已核实）。
- 测试纪律：core 测试跑 `lib/` 产物，改完必须 `npm run build` 再跑测试（`npm test` 的 pretest 已含 build）；fixture 冻结不自动再生，再生=手动跑生成脚本且仅在**有意**语义变更时。
- 发版纪律（know-how 018）：publish workflow 绿 ≠ 已上架（OIDC staged 2–12 分钟窗口）；核验一律 `--registry=https://registry.npmjs.org/`；窗口内绝不重推同版本 tag；版本三处一致（package.json / package-lock.json 根版本字段 / CHANGELOG 双语条目，CI 门禁 bd14ac0 在案）。
- 分支：按仓库先例直接在 main 工作（0.9.86–0.9.89 均 main 直提）；实现期不 commit，改动留工作区待验收（FP1 先例），提交序列在发版任务执行。
- 实测基线留档（本机 node v24.20.0，catalog-2026.1015.5458，4472 adapted 条目）：纯函数全语料 256.8ms；冷 fieldsOf+score 324–364ms（×3 稳定）；NFKC 13.6ms；fixture 标定（评审 R1 实测）：去重字段串 21,336 条、平均 77 字符，「分类 23 + 最长 30 + 随机 1500」三桶 input+expected JSON ≈366KB——预算与条数下限的自洽依据。

## 输入工件

- grill 共识（2026-10-16 对话，Q1–Q8 全按推荐）：范围/等价/形态/验收/文档发版八项裁决。
- 原型差分验证（主审实测）：单遍原型真实语料 + 3000 条 fuzz 零 mismatch、46.3ms。
- 三路走查实测（2026-10-16）：冷搜索 285–363ms 双路独立复测；换代频率 ≈ 每小时（registry SWR fetchedAt 无条件 bump）+ 每次重启 + 每日目录换版；计时脚本 `/tmp/dshmbench/`、`/tmp/dshm-perf/`（一次性，不复用）。
- CLI 误报排除与 quirk 推演记录（对话内）；[docs/adr/0016-merged-market-materialization.md](../adr/0016-merged-market-materialization.md) 决策 8 划界。

## 文件结构与职责

- Modify: `src/core/search-relevance.ts` — `normalizeSearchText` 单遍重写（模块私有 `ASCII_WORD` 表与分类逻辑内联其体或紧邻私有函数）；`fieldText` 单元素快路；导出面与 JSDoc 语义描述不变（实现注释更新为单遍模型 + astral 规则说明）。
- Create: `scripts/gen-search-normalize-corpus.mjs` — golden 生成器：读本地目录缓存（缺省取 `~/.dsh/dshm/cache/host/awesome/` 下 `catalog-*.json` 中**文件名内嵌版本数值最新者**——按 `.` 分段数值比较，**不得字典序**（实测字典序会错选 `catalog-2026.930` 覆盖 `catalog-2026.1015`），argv[2] 可覆盖路径）→ `adaptCommunityCatalog`（import `../lib/core/community-adapter.js`）→ 抽全部字段串去重 → 分层抽样 + 种子 fuzz + 手写边界 → 用**当前实现**算 expected → 写 fixture（`catalogVersion` 取自所选**文件名**内的版本串——目录 JSON 顶层无 version 字段，评审 R2-R3）。打印分桶计数与字节大小。
- Create: `tests/fixtures/search-normalize-corpus.json` — 冻结 golden：`{ generator, catalogVersion, generatedAt, seed: 20261016, cases: [{input, expected}] }`；预算**硬顶 1MB、目标 ≤800KB**，总条数 **≥3800**（依据基线留档的 fixture 标定实算；评审 R1-P3 修正：原「≥4500 且 ≤500KB」互斥）。**预算优先于条数下限**：超预算先砍随机桶（唯一旋钮），随机桶砍尽仍超预算 → 停下如实报告，不静默降 fuzz。
- Modify: `tests/search-relevance.test.mjs` — 新增 describe：golden 差分（读 fixture、断言 `normalizeSearchText(input) === expected`，mismatch 报 index+截断现场）；astral/边界 quirk 钉（手写断言）。
- Create: `scripts/probe-search-normalize.mjs` — 计时探针（手动跑不进 CI，产物落 `node_modules/.dshm/search-probe/results.json`，render-probe 惯例）：语料全量 pass（暖后 ×5 取 p50）、冷搜索复现（条目深克隆 ×5：第 1 次含 JIT 冷单独记录、p50 取第 2–5 次——口径以 Task 4 Step 1 为准）、`--e2e` 换代模式（独立进程；deps 注入包裹真实 loadRegistry/fetchCommunityCatalog/listInstalledPlugins：第 1 次 `listMarket(query)` = 冷进程建代+JIT 冷首搜〔重启场景〕，随后改克隆 loaded 的 fetchedAt 再调第 2 次 = 换代重建+首搜〔小时场景，JIT 已暖〕，两数字分别记录并在结果 JSON 标注测量口径；builds 增量 = 每次 `listMarket` 返回后各取一次 `_mergedMarketStatsForTests()` 快照、相邻差分〔不 reset，保 L1/L2 温态；口径以 Task 4 Step 1 为准〕）。
- Modify: `src/cli.ts` — `parseArgs` 收集 `positionals`（`Parsed` 接口增字段）；`search` 分支 query 接位置参数；help 用法行（:176 用法与相关帮助文本）。
- Modify: `tests/cli-search.test.mjs` — 位置参数用例（注入 mock 捕获 listMarket opts，断言 query 透传）+ flag 优先用例。
- Modify（仅发版任务）: `package.json`、`package-lock.json`（根版本两字段）、`CHANGELOG.md`（双语 0.9.90 条目，性能主 + CLI 修复子条目，对齐 0.9.85 双事项先例）。

## 任务清单

### Task 1: golden fixture 与生成器（先冻结 oracle，再动实现）

- 目标：在任何实现改动之前，用**当前实现**生成并冻结差分语料；差分测试在旧实现上先绿（钉住基线）。
- 涉及文件：`scripts/gen-search-normalize-corpus.mjs`、`tests/fixtures/search-normalize-corpus.json`、`tests/search-relevance.test.mjs`
- 接口契约
  - Consumes: `adaptCommunityCatalog`（`lib/core/community-adapter.js` 导出）、`normalizeSearchText`（`lib/core/search-relevance.js` 导出，当前实现）。
  - Produces: fixture 文件（结构见文件结构节，seed 恒 20261016）；测试新 describe `normalizeSearchText — golden 差分语料` 与 `normalizeSearchText — astral 与边界 quirk 钉`（后续任务依赖其作为等价护栏）。
- 验证范围：生成器跑通、fixture 尺寸达标、差分测试在**未改动**的实现上全绿（含手写 quirk 钉）。

- [ ] Step 1: 写生成器脚本
  - Change: `scripts/gen-search-normalize-corpus.mjs`：抽串字段 = id/name/npm/owner/description/descriptionEn/category/tags（同 `fieldsOf` 消费面），**目录 JSON 原序遍历、去重 Set 插入序不排序**；确定性 PRNG = mulberry32(20261016)（同 seed 再生同语料，评审 R1-P7）；目录版本选择与 `catalogVersion` 来源见文件结构节（评审 R2-R3）。分桶 = 全部分类串（~23）+ 最长 30 条（单条 >1024 字符跳取下一条）+ 种子随机 **800**（预算旋钮，触发线见 Expected）+ **fuzz 目标 3000 条（参数钉死，评审 R2-R1）**：
    - 池与定额：**纯池合计 60%（八个纯池均分）**——BMP 0x0001–0x2FFF、CJK 0x3400–0x9FFF、**0xF900–0xFAFF**（含 U+FA6E/U+FADA 等洞码点，R1-P2）、NFKC 变换串（全角/连字 `ﬁﬂ`/罗马 `ⅷⅧ`/单位 `㎏㎡`/上标/数学字母 `𝕏`/astral 数字——后两者测 **NFKC→ASCII 折叠路径**，非 astral 分支，R1-P1）、ASCII 符号空白、astral emoji U+1F600 段（非词对）、astral CJK 扩展 B U+20000 段（词对）、**lone surrogate**（`\uD800`/`\uDC00` 孤半，JSON 转义承载）；**混合池 40%**（全部源均等混抽）。
    - 长度：**纯池条目 1–4 字符；混合池条目 1–40 字符**。
    - 去重与补足：fuzz 案例与真实桶进同一去重 Set；kept <3000 时以同 seed **续抽混合池**确定性补足（混合池空间近乎无重复），连续 5 轮无新增即停并如实记录 kept。
    - 手写边界 ~35（含 `''`、`'   '`、`'——!!'`、`'MCP管理'`、`'ＭＣＰ'`、`'中文English中文'`、`'a𝕏管'`、𠀀 四钉 `'a𠀀管'`/`'a,𠀀'`/`'管𠀀a'`/`'𠀀𠀀管'`、`'a😀b'`、FA 洞 `'a\uFA6Eb'`/`'\uFA6E一'`、lone surrogate `'a\uD800b'`/`'\uDC00x'`）；去重后逐条 `expected = normalizeSearchText(input)`；写 JSON。
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run build && node scripts/gen-search-normalize-corpus.mjs`
  - Expected: 打印各桶计数（fuzz 打「目标 3000 / kept 实际数」）、总条数（≥3800）、文件字节数与判定行——**>1MB 硬顶 → 砍随机桶后重写；>800KB 目标 → 不动作仅如实报告**（R2-R1 触发线；实测预估 ≈0.65–0.7MB〔三桶 215KB + fuzz ~470KB，按本参数合成〕，落 800KB 目标内属预期正常态；若显著高于此，先核对纯池是否误用 1–40 长度——R3-R1）；`catalogVersion` 字段 = 所选文件名版本串。
- [ ] Step 2: 写差分测试与 quirk 钉（旧实现上必须先绿）
  - Change: `tests/search-relevance.test.mjs` 新增两个 describe：① 读 fixture（`readFileSync(new URL('./fixtures/search-normalize-corpus.json', import.meta.url))`），单 `it` 循环断言，mismatch 时报 index 与截断 120 字符现场；② 手写 quirk 钉（全部经现实现实测核验，评审 R1-P1/P2/P9）——𠀀 四钉：`'a𠀀管'`→`'a𠀀管'`（转角不触发）、`'a,𠀀'`→`'a 𠀀'`、`'管𠀀a'`→`'管𠀀a'`、`'𠀀𠀀管'`→`'𠀀𠀀管'`；NFKC 交互钉 `'a𝕏管'`→`'ax 管'`（astral 数学字母被 NFKC 先折）；emoji 非词对 `'a😀b'`→`'a b'`；FA 洞 `'a\uFA6Eb'`→`'a b'`、`'\uFA6E一'`→`'一'`；lone surrogate `'a\uD800b'`→`'a b'`、`'\uDC00x'`→`'x'`；`'MCP管理'`→`'mcp 管理'`；附一行注释指向「字节等价红线：quirk 保真不修」。
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run build && node --test tests/search-relevance.test.mjs`
  - Expected: 全绿（旧实现即 oracle，此时差分必然零 mismatch；此步钉的是护栏本身）。

### Task 2: `normalizeSearchText` 单遍重写

- 目标：按架构快照的发射模型重写实现，差分语料零 mismatch。
- 涉及文件：`src/core/search-relevance.ts`
- 接口契约
  - Consumes: Task 1 的差分测试与 quirk 钉（护栏）；`WORD_RE`/`CJK_RE` 保留（非 ASCII 回退与代理对判词用）。
  - Produces: 新 `normalizeSearchText`（签名/导出不变）；模块私有 ASCII 表与分类逻辑；后续任务（probe/发版）依赖其性能数字。
- 验证范围：search-relevance 全文件绿（差分零 mismatch）；性能数字不在本任务量，统一由 Task 4 探针出。

- [ ] Step 1: 重写实现
  - Change: `normalizeSearchText` 体内：`input.normalize('NFKC').toLowerCase()` 后单遍扫描；128 项 `Uint8Array` ASCII 词符表（模块级常量）；**CJK 稳定核四区间直判（0x4E00–0x9FA5 / 0x3400–0x4DB5 / 0xF900–0xFA6D / 0xFA70–0xFAD9），其余非 ASCII 一律回退 `WORD_RE`/`CJK_RE`**（洞与版本敏感缘的等价保真，见架构快照）；代理对规则与发射规则逐条按架构快照实现；删去收尾 `.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()`；实现注释写明单遍模型、稳定核取舍依据（Unicode 赋值稳定性）、astral 词对规则与 quirk 保真依据。
- [ ] Step 2: 差分验证
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run build && node --test tests/search-relevance.test.mjs`
  - Expected: 全绿，差分零 mismatch（任何 mismatch = 实现偏离，修实现不改 fixture）。

### Task 3: `fieldText` 单元素快路

- 目标：砍掉单字符串字段（name/npm/owner/description/descriptionEn/category/id）的三次数组分配。
- 涉及文件：`src/core/search-relevance.ts`
- 接口契约
  - Consumes: Task 2 产物（新 normalizeSearchText）。
  - Produces: `fieldText` 内部快路（签名不变、模块私有不变）；多元素路径（tags）逐字节原样。
- 验证范围：search-relevance 既有 relevanceScore 断言全绿（fieldsOf 消费面回归保护）。

- [ ] Step 1: 实现快路
  - Change: `fieldText` 首行加 `if (parts.length === 1) { const p = parts[0]; if (typeof p === 'string' && p.trim() !== '') { const n = normalizeSearchText(p); return n === '' ? '' : n } return '' }`；注释注明 `join([n]) === n` 恒等依据。
- [ ] Step 2: 回归
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run build && node --test tests/search-relevance.test.mjs tests/market-golden.test.mjs`
  - Expected: 全绿。

### Task 4: 计时探针与验收测量

- 目标：`scripts/probe-search-normalize.mjs` 落地并产出验收口径 ③④ 的数字。
- 涉及文件：`scripts/probe-search-normalize.mjs`
- 接口契约
  - Consumes: `lib/core/` 的 `adaptCommunityCatalog`、`relevanceScore`、`normalizeSearchText`、`listMarket` 及其可注入 deps（registry.js / community.js / installed.js 真实实现）；builds 统计钩子 `_mergedMarketStatsForTests()`（`tests/market.test.mjs` 同款，grep 即得）。
  - Produces: 探针脚本（手动验收工具）+ 验收数字记录（对话内汇报，进 CHANGELOG 引用）。
- 验证范围：脚本三种模式跑通；冷搜索 p50 ≤150ms 达标或如实报告。

- [ ] Step 1: 写探针（语料 pass + 冷搜索复现 + `--e2e` 换代）
  - Change: 按文件结构节规格实现；冷搜索复现的 5 次克隆中**第 1 次（含 JIT 冷）单独记录输出，p50 取第 2–5 次（剔除首跑）**（评审 R1-P4/R2-R2：p50 为验收门槛，首跑值如实呈报不改门槛）；`--e2e` 独立进程、两数字（重启场景 JIT 冷首搜 / 小时场景换代+首搜）分别记录并在结果 JSON 标注测量口径；builds 增量 = **每次 `listMarket` 返回后各取一次** `_mergedMarketStatsForTests()` 快照、取相邻两快照差分（即第 1 次调用后→第 2 次调用后差分 =1；不 reset，保 L1/L2 温态）；目录缺失时打印提示并以已跑模式收尾（exit 0）；结果写 `node_modules/.dshm/search-probe/results.json`。
- [ ] Step 2: 测量验收 ③
  - Run: `cd /home/ubuntu/workspace/dsh-m && node scripts/probe-search-normalize.mjs`
  - Expected: 冷搜索 p50 ≤150ms（基线 324–364ms）；语料 pass p50 ≤60ms；首跑值单独记录（若显著高于 p50 如 >150ms，如实呈报主人再定夺，不改门槛）。不达标 → 停下报告差距，不猜。
- [ ] Step 3: 测量验收 ④
  - Run: `cd /home/ubuntu/workspace/dsh-m && node scripts/probe-search-normalize.mjs --e2e`
  - Expected: 两口径数字出炉（重启场景：冷进程建代+JIT 冷首搜，对照基线冷 listMarket 173ms wall + 首搜 ~330ms；小时场景：换代重建+首搜，对照基线 42–63ms + ~330ms）；小时场景 builds 快照差分 =1（换代确实发生）。

### Task 5: CLI 位置参数修复

- 目标：`dshm search 主题` 等价 `--query 主题`；flag 优先。
- 涉及文件：`src/cli.ts`、`tests/cli-search.test.mjs`
- 接口契约
  - Consumes: 既有 `runCli(argv, deps, io)` 注入测试面（tests/cli-search.test.mjs 既有 `runSearch` 形态）。
  - Produces: `Parsed.positionals: string[]`（parseArgs 增集，未被 flag 取值消费的非 `--` 词元）；search 分支 query 接线；help 用法行更新。
- 验证范围：新增两例 + cli-search 全文件绿；其余子命令行为不变（全量回归兜底）。

- [ ] Step 1: 写失败测试
  - Change: `tests/cli-search.test.mjs` 新增三例：① `runCli(['search', '主题'], { listMarket: 捕获 opts 的 mock })` → 断言捕获 `opts.query === '主题'` 且输出含条目行；② `runCli(['search', '主题', '--query', 'x'], …)` → 断言 `opts.query === 'x'`（flag 优先）；③ `runCli(['search', '主题', '--query'], …)` → 断言 `opts.query === '主题'`（**flag 缺值=true 非字符串 → 宽容回退 positional**，评审 R1-P8 选定语义并钉住；旧实现此处走无评分浏览，属本次有意微改）。
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run build && node --test tests/cli-search.test.mjs`
  - Expected: 例①③红（③现状：`--query` 缺值落 `true`、非字符串 → query=undefined，同①走无评分浏览）；例②绿（现状 flag 已生效）（评审 R2-R5）。
- [ ] Step 2: 实现
  - Change: `parseArgs` 循环记录 positionals（被消费为 flag 值的词元不计）；`Parsed` 接口增字段；search 分支 `query: typeof flags.query === 'string' ? flags.query : positionals[0]`（多余位置参数忽略，help 注明取首个、`--query` 缺值时回退首个位置参数）；:176 用法行改 `dshm search [关键词] [--query 关键词] …` 并同步该帮助段落其余提及处。
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run build && node --test tests/cli-search.test.mjs`
  - Expected: 全绿。
- [ ] Step 3: 手工冒烟
  - Run: `cd /home/ubuntu/workspace/dsh-m && node lib/cli.js search 主题 --limit 3`
  - Expected: 输出按相关性排序的条目（对照 `--query 主题 --limit 3` 输出一致）；不再是「无评分浏览」整页。

### Task 6: 全量回归 + 停工作区待验收

- 目标：验收口径 ① 全量绿；汇总四条口径数字，停下等主人验收。
- 涉及文件：无新改动。
- 接口契约
  - Consumes: Task 1–5 全部产物。
  - Produces: 验收汇报（对话内）：测试/typecheck、差分、冷搜索 p50+首跑两行、E2E 两口径 spike——四项数字。
- 验证范围：最终回归。

- [ ] Step 1: 全量验证
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm test && npm run typecheck`
  - Expected: 全绿、0 error（基线 1496 + 新增约 4–6 例）。
- [ ] Step 2: 汇报并停
  - Change: 无（对话内汇报四项数字，等主人验收；通过后才进 Task 7）。

### Task 7: 发版 0.9.90（仅主人验收通过后执行）

- 目标：按仓库惯例提交、打 tag、push 触发 OIDC 可信发布。
- 涉及文件：`package.json`、`package-lock.json`、`CHANGELOG.md`、git 提交/tag/push。
- 接口契约
  - Consumes: Task 1–6 已验收产物 + 本计划文档。
  - Produces: npm 上的 dsh-m@0.9.90。
- 验证范围：版本三处一致门禁、workflow 绿、npm 定稿核验。

- [ ] Step 1: 版本与 CHANGELOG
  - Change: `package.json` 0.9.89→0.9.90；`package-lock.json` 根 `version` 与 `packages[""].version` 两字段同步；`CHANGELOG.md` 中英各一条 0.9.90：性能主条目（冷搜索 ~330ms→**Task 4 实测数字填入**、单遍模型一句话、探针与 golden 入库）+ CLI 修复子条目（位置参数等价 --query、flag 优先）。
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run build && node -e "const p=require('./package.json'),l=require('./package-lock.json');console.log(p.version,l.version,l.packages[''].version)"`
  - Expected: `0.9.90 0.9.90 0.9.90`。
- [ ] Step 2: 提交序列（逐条核对 diff 后执行）
  - Run:
    ```bash
    cd /home/ubuntu/workspace/dsh-m
    git add src/core/search-relevance.ts scripts/gen-search-normalize-corpus.mjs scripts/probe-search-normalize.mjs tests/fixtures/search-normalize-corpus.json tests/search-relevance.test.mjs
    git commit -m "perf(core): 搜索归一化单遍化——ASCII查表+CJK区间直判+非词折叠+astral词对规则，世代冷搜索 ~330ms→<Task 4 实测 p50>ms（golden差分+探针入库）"
    git add src/cli.ts tests/cli-search.test.mjs
    git commit -m "fix(cli): search 位置参数接通 --query 等价语义（flag 优先，help 同步）"
    git add docs/plans/2026-10-16-search-normalize-cold-path-implementation-plan.md
    git commit -m "docs(plan): 搜索归一化冷路径单遍化 + CLI 位置参数修复实施计划入库"
    git add package.json package-lock.json CHANGELOG.md
    git commit -m "chore(release): 0.9.90 搜索冷路径单遍化 + CLI search 位置参数修复"
    ```
  - Expected: 4 个提交，`git status` 干净；每步 `git diff --cached --stat` 核对文件清单。
- [ ] Step 3: tag 与 push
  - Run: `cd /home/ubuntu/workspace/dsh-m && git tag v0.9.90 && git push origin main && git push origin v0.9.90`
  - Expected: push 成功；Actions `Publish to npm` 启动且过版本一致门禁。
- [ ] Step 4: 发布核验（know-how 018）
  - Run: `gh run list --repo iasiv5/dsh-m --limit 1`；随后 ≤20 分钟内每 2 分钟 `npm view dsh-m@0.9.90 --registry=https://registry.npmjs.org/`
  - Expected: workflow 绿；dist-tags.latest=0.9.90（staged 窗口 2–12 分钟，绿 ≠ 已上架，不重推 tag）；超 20 分钟未定稿 → 报告主人再决策。

## 执行纪律

- 开始实现前先批判性复查整份计划；行号漂移以符号锚点为准。
- 按任务顺序执行（Task 1 的 oracle 冻结必须先于 Task 2 的实现改动），不无声跳步、不合并步。
- 每任务验证不过不进下一任务；差分 mismatch 一律修实现、绝不改 fixture。
- 遇阻（计时不达标、锚点漂移、门禁红）立即停下说明，不猜。
- 当前在 main 分支：按仓库先例 main 直提，但实现期不 commit（发版任务统一提交序列）；若主人要求分支或中途 checkpoint，先确认再动。

## 最终验证

- `npm test` 全绿 + `npm run typecheck` 0 error。
- `node scripts/probe-search-normalize.mjs`：冷搜索 p50 ≤150ms（首跑值另记录）、语料 pass ≤60ms。
- `node scripts/probe-search-normalize.mjs --e2e`：重启/小时两口径 spike 数字记录在案。
- `node lib/cli.js search 主题 --limit 3` 与 `--query 主题 --limit 3` 输出一致。
- 发版后 `npm view dsh-m@0.9.90 --registry=https://registry.npmjs.org/` 定稿核验。
