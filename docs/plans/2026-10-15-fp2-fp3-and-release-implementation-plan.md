# FP2 收藏 stale 批量化 + FP3 社区 summary 接入 L2 + 0.9.87 发版 实施计划

## 目标

- **FP2**：收藏分区 stale 检测从「每收藏一条完整 `market` 查询（≤8 并发扇出）」改为**单次批量 id 存在性查询**——F 个收藏从 F×全管线（枚举+社区+4445 条评分+排序+分页）降为 1×轻查询（registry+社区+合并市场的 id Set）。
- **FP3**：`getCommunitySummary` 从无 memo 的全量 adapt+merge（每次设置页打开 ~10-50ms CPU）改经 ADR-0016 的 `mergedOutcome` L2 代存储——同身份命中免算，「summary 永不入代」不变量保持。
- **发版 0.9.87**：携带本工作区已完成的 FP1/FP5（已装枚举并行化 + toMarketItem 索引化，已经独立评审通过）与本次 FP2/FP3，按仓库惯例提交、打 tag、push 触发 OIDC 可信发布（know-how 018 纪律）。

## 架构快照

- **FP2 新增三段**：
  - core：`market.ts` 新增 `existingMarketIds(ids, cfg, opts, deps)` —— 复用 `loadRegistry` + `fetchCommunityCatalog` 并发装载与 `mergedOutcome` 物化合并市场（与 `listMarket` 同款接线：namespace 'host'、profile 透传），对 `merged` 域（**不含 displaced**，与今日 source:'all' 搜索域一致）建原始 id `Set`，按输入序过滤返回 `{ present }`。**不调用 `listInstalledPlugins`、不做 latest 探测、不分页**——这是与 `listMarket` 的接口差异点，也是性能来源。
  - host-api：新 method `market-ids-exist`（body `{ ids: string[] }` → `{ present: string[] }`），ids 校验：数组、每项非空字符串（trim 后非空，透传 trim 值）、≤500 项，违例 400；走 `HostApiOverrides.existingMarketIds` 注入位。
  - client：`main.jsx` FavoriteZone 的 800ms debounce 回调内改为**单次** `api("market-ids-exist", { ids })`，失败/形态异常 → 空 Set（全 stale，与今日逐条 catch→false 语义一致）；`partitionStale` 纯函数接口不动，lookup 换为本地 Set 成员判定。
- **FP3 改道**：`community.ts` `getCommunitySummary(primaryEntries, cfg, opts)` 签名改 `(registry: LoadedRegistry, cfg, opts)`（`opts` 增 `namespace?`/`profile?`），内部 `communityOutcome` → `mergedOutcome`。调用方唯一：host-api 'registry' 臂改传 `snap.loaded` + `namespace: 'host'`（profile 缺省 `WEB_PROFILE`，与今日 `awesomeDir(namespace, undefined→'web')` 缓存目录逐字节同路）。`communityOutcome` 无 memo 形态保留（market.ts registry-deadline 降级臂继续用）。
- **发版链**：版本 0.9.86→0.9.87；CHANGELOG 中英双语各一条（覆盖 FP1/FP5+FP2/FP3）；提交序列 feat×2 + docs(plan) + chore(release)；tag `v0.9.87` push 触发 `publish.yml`（OIDC trusted publishing，本机无 npm 凭据，E401 属预期）。

## 全局约束

- FP2 语义等价红线（与今日逐收藏 `market {query:id, source:'all', limit:8, probeMode:'cache-only'}` 扇出对照，**除一处自觉差异外逐点一致**）：
  - 存在性 = **merged 域原始 id 相等**（今日客户端 `items.some(x => x.id === fav.id)` + ID_EXACT 排首必入页 ⇒ 等价于原始 id Set 成员判定）；
  - **已知边界差异（评审第 1 轮问题 3，如实记录）**：host-api 'market' 臂恒传 `curatedFirst:true`，`listMarket` 对 source='all'+query 非空把 primary 命中**全部稳定前置**——社区收藏的 id-exact 条目在 primary 域同词命中 ≥limit(8) 条时被挤出前 8，**今日实现会误判 stale**；批量版 Set 判定在该边界上判 live（= 产品语义「已从目录消失」的正确答案）。此差异是修复而非回归，须在 `existingMarketIds` JSDoc 记录并用测试钉住（Task 2 Step 1 ④）；
  - 社区 unavailable/disabled → merged=primary-only → 社区收藏判 stale（同今日）；registry 装载 deadline 逃逸/reject → 空结果/异常（host-api 统一 500）→ 客户端 catch → 全 stale（同今日 market 超时空页/500→逐条 catch→false）；
  - 客户端 API 失败 → 全 stale（同今日逐条 catch→false）。
- FP3 语义等价红线：summary 各字段口径不变（status/checkedAt/errors 每调用现算，「summary 永不入代」）；disabled/unavailable/deadline 透传形态不落 L2；缓存目录与 L2 身份键中 profile 段取 `WEB_PROFILE`（显式，与今日隐式默认同值）。**自觉取舍注记（评审第 1 轮问题 5）**：'registry' 臂恒不传 profile → 社区缓存目录恒 web 段（保 parity 优先）；desktop host 下 registry 臂与 market 臂（传 profile.name）各建各的 L2 代（多一次 build，语义无害）——这是有意为之，勿当「漏传」修复；JSDoc 同步注明。
- 不动 ADR-0008/0013 两段加载、不动 ADR-0019 packument 访问器、不动 `communityOutcome` 本体。
- 发版纪律（know-how 018）：publish workflow 绿 ≠ 已上架（OIDC staged，无 scope 的 dsh-m 实测 2-12 分钟窗口）；核验一律 `--registry=https://registry.npmjs.org/`（本机 `~/.npmrc` 默认 npmmirror 会假 404）；窗口内**绝不重推同版本 tag**（409 + 失败护栏删 tag）。
- 测试纪律：core 测试跑 `lib/` 产物，改完先 `npm run build`。

## 输入工件

- 2026-10-15 性能走查报告（FP2/FP3 定义与证据）与 FP1/FP5 评审通过结论（工作区改动 + [2026-10-15-installed-parallel-enumeration-implementation-plan.md](./2026-10-15-installed-parallel-enumeration-implementation-plan.md)）。
- 语义锚点：`market.ts` listMarket 装载段（loadRegistry/fetchCommunityCatalog/mergedOutcome 接线）、`merged-market.ts` mergedOutcome、`community.ts:609` getCommunitySummary、`host-api.ts` 'registry' 臂（:395-405）与 deps `d`（:281-）、`main.jsx:3058-3086` FavoriteZone、`favorites.js` partitionStale。
- 发版锚点：`CHANGELOG.md` 头部双语格式、`v0.9.86` release commit 形态（CHANGELOG+package.json 二文件）、`.github/workflows/publish.yml`（tag `v*` 触发）、know-how `01_docs/dsh-intall-know-how/018-npm-oidc-staged-publish-409.md`。

## 文件结构与职责

- Modify: `src/core/market.ts` — 新增 `existingMarketIds`（含其 opts 类型与 deps 注入位；export 供 host-api）。
- Modify: `src/core/community.ts` — `getCommunitySummary` 签名改 `registry: LoadedRegistry` + `opts.namespace/profile`，内部改道 `mergedOutcome`；import `mergedOutcome`、`WEB_PROFILE`。
- Modify: `src/core/host-api.ts` — import + `HostApiOverrides.existingMarketIds` + deps `d` 接线 + 新 case `'market-ids-exist'`（ids 校验/400）；'registry' 臂改传 `snap.loaded` + `namespace:'host'`。
- Modify: `src/client/main.jsx` — FavoriteZone stale 检测改单次批量调用。
- Test: `tests/market.test.mjs` — `existingMarketIds` 单元（存在/缺席/顺序/空 ids 快路 + `calls.listInstalled===0` 性能钉 + 同身份 L2 命中钉）。
- Test: `tests/community.test.mjs` — getCommunitySummary 两处调用点改最小 `LoadedRegistry` 假件 + L2 build-once 断言。
- Test: `tests/host-api-profile.test.mjs` — `market-ids-exist` 正常/400 两例（setupTrust 注入桩）。
- Modify（执行中发现，2026-10-15）: `tests/client-market-state.test.mjs` — C3 源串锚原钉「逐收藏 market cache-only 扇出」，随 FP2 接线更新为「单发 market-ids-exist + catch 全 stale + 不得回退扇出」三锚；`tests/host-api.test.mjs` — ⑥/⑥b 原钉 getCommunitySummary 旧签名（primaryEntries 数组），随 FP3 更新为 LoadedRegistry 引用断言。两处均为接口契约演进的钉住迁移，非语义放松。
- Modify: `tests/merged-market.test.mjs` — :224 注释中「getCommunitySummary / 降级路径专用」的过时表述修正（FP3 后 getCommunitySummary 不再走 communityOutcome）。
- Modify: `package.json`（0.9.87）、`CHANGELOG.md`（双语条目）——仅发版任务触碰。

## 任务清单

### Task 1 (FP3): getCommunitySummary 接入 mergedOutcome L2

- 涉及文件：`src/core/community.ts`、`src/core/host-api.ts`、`tests/community.test.mjs`、`tests/merged-market.test.mjs`
- 接口契约
  - Consumes: `mergedOutcome`（merged-market.ts 既有导出）、`LoadedRegistry` 类型（registry.js）、`WEB_PROFILE`（env.js）。
  - Produces: `getCommunitySummary(registry: LoadedRegistry, cfg?: CommunityConfig, opts: CommunitySummaryOptions & { namespace?: 'host'|'cli'; profile?: string }): Promise<CommunityRegistrySummary>`；`CommunitySummaryOptions` 扩两可选字段。
- 验证范围：community/host-api 测试全绿；新增 L2 build-once 断言过。

- [ ] Step 1: 更新既有测试（先改测试钉新签名）
  - Change: `tests/community.test.mjs` getCommunitySummary 两例的 `[]` 实参改为最小 LoadedRegistry 假件 `fakeReg()`（`{ configuredAddress: '', fetchedAt: '2026-10-15T00:00:00.000Z', registry: { version: 1, plugins: [] }, status: 'ready' }` 形状，字段以 mergedOutcome/identityKey 实际读取为准：configuredAddress/fetchedAt/registry.plugins）；断言不变（disabled/unavailable 两路径）。同 describe 增第三例冒烟：cfg 用 `{ communityCatalog: false }`（disabled 形态零网络——本文件直调 lib 无注入位，cfg 缺省会真触网，评审第 1 轮问题 4），同 `fakeReg()` 连续两次调用 → 两次 `summary.status` 均 `'disabled'` 且不抛。文件顶部 import `_resetMergedMarketForTests` 并在该 describe `beforeEach` 重置（L2 跨用例隔离，market.test.mjs 同款纪律）。
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run build && node --test tests/community.test.mjs`
  - Expected: 新签名下旧实现（尚未改道）编译失败/测试红——**签名先行**：本步与 Step 2 连续执行，一起转绿（TDD 变体：测试与签名同改，行为断言不动）。
- [ ] Step 2: 实现改道
  - Change: `src/core/community.ts`：签名 `primaryEntries: RegistryEntry[]` → `registry: LoadedRegistry`；`CommunitySummaryOptions` 增 `namespace?: 'host' | 'cli'; profile?: string`；函数体：`const task = fetchCommunityCatalog(cfg, { namespace: opts.namespace, signal: opts.signal, force: opts.force, profile: opts.profile })`（namespace/profile 显式透传，缺省值与 fetchCommunityCatalog/awesomeDir 现默认逐字节同路）；`const outcome = await mergedOutcome({ namespace: opts.namespace ?? 'host', profile: opts.profile ?? WEB_PROFILE, cfg, registry, communityTask: task, deadlineAt: opts.deadlineAt }); return outcome.summary`。import 行补 `mergedOutcome`（自 './merged-market.js'）与 `WEB_PROFILE`（自 './env.js'）。
  - Change: `src/core/host-api.ts` 'registry' 臂：`d.getCommunitySummary(snap.loaded.registry.plugins, cfg(), {...})` → `d.getCommunitySummary(snap.loaded, cfg(), { force: false, signal, deadlineAt: Date.now() + 3_000, namespace: 'host' })`；就地注释补一句 FP3 改道说明。
  - Change: `tests/merged-market.test.mjs` :224 注释「（getCommunitySummary / 降级路径专用）」→「（降级路径专用；getCommunitySummary 0.9.87 起改道 mergedOutcome）」。
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run build && node --test tests/community.test.mjs tests/host-api-profile.test.mjs tests/merged-market.test.mjs`
  - Expected: 全部 pass（host-api-profile 的 getCommunitySummary 桩为少参箭头函数，结构兼容新签名无需改）。

### Task 2 (FP2): existingMarketIds + market-ids-exist + 客户端批量化

- 涉及文件：`src/core/market.ts`、`src/core/host-api.ts`、`src/client/main.jsx`、`tests/market.test.mjs`、`tests/host-api-profile.test.mjs`
- 接口契约
  - Consumes: Task 1 无依赖（可并行）；`mergedOutcome`、`MarketDeps` 的 `loadRegistry`/`fetchCommunityCatalog` 槽位、`DEFAULT_DEADLINE_MS`、`WEB_PROFILE`、`RegistryCacheNamespace`。
  - Produces: `export interface ExistingMarketIdsOptions { namespace?: RegistryCacheNamespace; profile?: string; signal?: AbortSignal; force?: boolean; deadlineMs?: number }`；`export async function existingMarketIds(ids: string[], cfg: RegistryConfig = {}, opts: ExistingMarketIdsOptions = {}, deps?: Partial<Pick<MarketDeps, 'loadRegistry' | 'fetchCommunityCatalog'>>): Promise<{ present: string[] }>`；host method `'market-ids-exist'`。
- 验证范围：market/host-api 测试全绿（含性能钉与 L2 命中钉）；render-smoke 全绿（FavoriteZone 改线不抛）。

- [ ] Step 1: core 单元测试（先写）
  - Change: `tests/market.test.mjs` 新增 describe。①②用 fakeDeps（disabled 社区默认形态）：①`existingMarketIds(['p-0','nope','p-999','p-0'], cfg, {}, deps)` → `present` deep-equal `['p-0','p-999','p-0']`（输入序保持、缺席剔除、重复保留）且 `calls.listInstalled === 0`（不枚举已装——性能钉）；②空 ids → `{present: []}` 且 `calls.loadRegistry.length === 0`（快路不装载）。③**同身份 L2 命中钉（评审第 1 轮问题 1，必须走 ready 社区形态——disabled 透传分支不读不写 store，builds 恒 0 是恒真断言）**：`withCommunity(fakeDeps({ loadRegistry: async () => readyLoaded(primary) }), communityLoaded([communityRaw('keep','o2')]))` 形态（复用文件内既有 helper，社区条目合成 id = `o2--keep`）；先 `listMarket(cfg, { withLatest: false }, deps)` → `_mergedMarketStatsForTests().builds === 1`；再 `existingMarketIds(['p-0','o2--keep'], cfg, {}, deps)`（同一 deps 实例、同 registry 身份）→ `builds` 仍 1 **且 `hits` ≥1**（命中代的直接证据）且 `present` 两 id 均在。④**curatedFirst 挤出边界钉（评审第 1 轮问题 3）**：ready 社区 + primary 10 条 name/description 含同一常见词（如 `market`）+ 社区条目 id 含该词；断言批量版 `present` 含该社区 id（今日搜索页扇出在该构造下会因 primary 前置挤掉 id-exact 社区条目——本用例钉住「不回归回旧行为」的正确语义）。
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run build && node --test tests/market.test.mjs`
  - Expected: 红（existingMarketIds 未导出）。
- [ ] Step 2: core 实现
  - Change: `src/core/market.ts` 新增（listMarket 之后的独立导出段）：deadline 默认 `DEFAULT_DEADLINE_MS`；空 ids 立即 `return { present: [] }`；`loadRegistry` 与 `fetchCommunityCatalog` 并发启动（listMarket 同款，force/signal/namespace/profile 透传，profile 缺省 `WEB_PROFILE`）；registry 装载 deadline 逃逸 → 空结果 `{ present: [] }`、`loadRegistry` reject → 原样抛出（host-api 统一 500 → 客户端 catch 空 Set 全 stale，与今日 market 同路径等价，评审第 1 轮问题 7b）；`mergedOutcome` 取 `merged`，`const ids_ = new Set(merged.map(e => e.id))`，`present = ids.map(id => id.trim()).filter(id => id !== '' && ids_.has(id))`；返回 `{ present }`。JSDoc 写明：三不原则（不枚举已装/不探测 latest/不分页）、merged 域边界（不含 displaced）、**curatedFirst 挤出边界差异**（相对旧逐收藏搜索扇出，本接口在该边界判 live 属正确语义，勿「修复」回搜索页行为）、registry 臂/市场臂 profile 取舍注记（同「全局约束」FP3 条）。
  - Run: 同 Step 1 命令
  - Expected: 新增用例全绿、既有用例不回归。
- [ ] Step 3: host method + 测试
  - Change: `src/core/host-api.ts`：import `existingMarketIds`；`HostApiOverrides` 增 `existingMarketIds?: typeof existingMarketIds`；deps `d` 增接线；新 case `'market-ids-exist'`：`body.ids` 非数组 / 项数 >500 / 任一项非字符串或 trim 空 → `ApiProtocolError(400, '非法 ids: 需非空字符串数组（≤500）')`；合法 → `payload = { present: result.present }`；调用参数 `{ namespace: 'host', profile: profile.name, signal }`（与 'market' 臂 profile 接线一致）。
  - Change: `tests/host-api-profile.test.mjs`：setupTrust deps 增 `existingMarketIds: async (ids) => { calls.existingIds.push(ids); return { present: ids.filter(i => i !== 'gone') } }`（calls 台账增字段）；新两例：合法 `['a','gone','b']` → 200 + `present:['a','b']` + 桩收到 trim 后数组；malformed（`{ids: ['a', 1]}` 与 `{ids: 'x'}`）→ 400。
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run build && node --test tests/host-api-profile.test.mjs`
  - Expected: 全部 pass。
- [ ] Step 4: 客户端接线
  - Change: `src/client/main.jsx` FavoriteZone useEffect：debounce 回调内改单次 `const res = await api("market-ids-exist", { ids: list.map((f) => f.id) })`；`present = new Set(Array.isArray(res?.present) ? res.present : [])`；外层 try/catch → catch 时 `present = new Set()`（全 stale，今日逐条 catch→false 同语义）；`lookupLive = async (fav) => present.has(fav.id)`；`partitionStale` 调用与后续 setCheck 不变；就地注释更新（C3 注记保留，注明 0.9.87 起批量单发）。
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run build && node --test tests/client-favorites.test.mjs tests/client-render-smoke.test.mjs`
  - Expected: 全部 pass（FavoriteZone 渲染锚不抛；partitionStale 纯函数未动）。

### Task 3: 全量验证与性能复核

- 涉及文件：无新改动
- 接口契约
  - Consumes: Task 1、Task 2 全部产物。
  - Produces: 最终验证结论（对话内）。
- [ ] Step 1: 全量回归
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm test && npm run typecheck`
  - Expected: 全绿、0 error（基线 1465 + 新增约 8-10 例）。
- [ ] Step 2: 性能复核
  - Run: 真实 profile 计时（node --input-type=module，同前几轮脚本风格）：`listMarket({probeMode:'cache-only'})` 预热后连续 20 次 `existingMarketIds(20 个真实条目 id)` 计均值；对照口径按**批次**表述（评审第 1 轮问题 7a）：旧路径 = partitionStale 8 并发池，20 收藏 ≈ ⌈20/8⌉=3 批 × 单次 listMarket(~6-7ms) 墙钟 + 20 次全管线 CPU；新路径 = 单次 existingMarketIds。
  - Expected: 新路径单次 ≤5ms，墙钟与 CPU 均下降一个数量级级。

### Task 4: 发版 0.9.87

- 涉及文件：`package.json`、`CHANGELOG.md`、git 提交/tag/push
- 接口契约
  - Consumes: 工作区 FP1/FP5 改动 + Task 1-3 产物 + 本计划文档（已存在）+ 前一份计划文档。
  - Produces: npm 上的 dsh-m@0.9.87（OIDC staged 定稿后）。
- [ ] Step 1: 版本与 CHANGELOG
  - Change: `package.json` version `0.9.86` → `0.9.87`；`CHANGELOG.md` 中文区与英文区**各**置顶一条——中文标题 `### 0.9.87 性能：热路径四连——已装枚举并行化 + patchRows 按需采集 + 收藏 stale 批量化 + 设置页社区 summary 接入 L2`，英文区自拟对译标题（如 `### 0.9.87 Performance: hot-path quartet — parallel installed enumeration, on-demand patchRows, batched favorites stale check, settings community summary via L2`；评审第 1 轮问题 6），内容覆盖：FP1（枚举并行 + patchRows:false 可选参，市场路径实测 ~5×）、FP5（toMarketItem O(1) 索引 + GITHUB_SPEC_RE 单一事实源）、FP2（批量 market-ids-exist，F×全管线→1×轻查询；curatedFirst 挤出边界修复注记）、FP3（getCommunitySummary 改道 mergedOutcome，同身份免 adapt+merge）、验证（测试总数、typecheck、评审轮次）。
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run build && node -e "console.log(require('./package.json').version)"`
  - Expected: `0.9.87`；build 绿。
- [ ] Step 2: 提交序列（2026-10-15 执行修订：market.ts 同时承载 FP1/FP5 调用点与 FP2 新函数、market.test.mjs 同时承载 FP5/FP2 用例——文件级 add 无法按 hunk 拆分，按**文件归属**重组为两组 feat，每组自洽完整）
  - Run（逐条核对 diff 后执行）:
    ```bash
    cd /home/ubuntu/workspace/dsh-m
    git add src/core/installed.ts src/core/market.ts src/core/merged-market.ts tests/installed.test.mjs tests/market.test.mjs
    git commit -m "feat(core): 已装枚举并行化 + patchRows 按需 + toMarketItem 索引化 + 批量 id 存在性 existingMarketIds（FP1/FP5/FP2-core，热路径 ~5×）"
    git add src/core/community.ts src/core/host-api.ts src/client/main.jsx tests/community.test.mjs tests/host-api.test.mjs tests/host-api-profile.test.mjs tests/merged-market.test.mjs tests/client-market-state.test.mjs
    git commit -m "feat(core): market-ids-exist host method + 收藏 stale 批量接线 + 设置页社区 summary 接入 merged-market L2（FP2/FP3）"
    git add docs/plans/2026-10-15-installed-parallel-enumeration-implementation-plan.md docs/plans/2026-10-15-fp2-fp3-and-release-implementation-plan.md
    git commit -m "docs(plan): 已装枚举并行化 + FP2/FP3 与 0.9.87 发版两份实施计划入库"
    git add package.json CHANGELOG.md
    git commit -m "chore(release): 0.9.87 热路径四连——枚举并行化/patchRows 按需/收藏 stale 批量/社区 summary 接入 L2"
    ```
  - Expected: 4 个提交，`git status` 干净；每步提交前 `git diff --cached --stat` 核对文件清单与计划一致。
- [ ] Step 3: tag 与 push
  - Run: `cd /home/ubuntu/workspace/dsh-m && git tag v0.9.87 && git push origin main && git push origin v0.9.87`
  - Expected: push 成功；GitHub Actions `Publish to npm` run 启动。
- [ ] Step 4: 发布核验（know-how 018 纪律）
  - Run: `gh run list --repo iasiv5/dsh-m --limit 1`（或 `gh run watch`）确认 workflow 绿；随后轮询（≤20 分钟内每 2 分钟一次）：`npm view dsh-m@0.9.87 --registry=https://registry.npmjs.org/`
  - Expected: workflow 绿后 per-version 200 / dist-tags.latest=0.9.87（dsh-m 无 scope，实测窗口 2-12 分钟）。**绿 ≠ 已上架**：日志含 `Your package is being processed` 属 staged 正常，不重推 tag；超 20 分钟未定稿 → 报告用户再决策。

## 执行纪律

- 开始实现前先批判性复查整份计划；行号漂移以符号锚点为准。
- 按任务顺序执行（Task 1 → 2 → 3 → 4），每任务验证不过不进下一任务。
- 发版提交前逐条 `git diff --cached --stat` 核对，防计划外文件混入。
- 发版窗口内绝不重推同版本 tag（409 风险）；npm 核验一律显式 `--registry=https://registry.npmjs.org/`。
- 遇阻立即停下说明，不猜。

## 最终验证

- `npm test` 全绿 + `npm run typecheck` 0 error。
- `existingMarketIds` 真实 profile 单次 ≤5ms。
- `git log --oneline -5` 呈现 feat×2 + docs + chore(release) 四提交；`git status` 干净；tag `v0.9.87` 已推。
- `npm view dsh-m@0.9.87 --registry=https://registry.npmjs.org/` 返回 200（staged 定稿后）。

## 审阅 Checkpoint

- 本计划送独立评审 Agent 对齐后执行；评审意见逐条回应（修复或反驳），全部闭环后进入发版。
