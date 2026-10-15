# 已装枚举并行化 + toMarketItem 索引化 实施计划

## 目标

- 把 `listInstalledPlugins` 的逐依赖串行文件读改为按依赖并发，消除热路径上每次市场查询/已装页刷新都重复支付的一半时间预算（本机 14 依赖实测：串行 13.75ms → 并行原型 2.58ms，5.3×）。
- 顺手完成 FP5 清尾：`toMarketItem` 的逐页条目线性扫描改为每查询一次的已装索引（与 0.9.68 评审 R1-7 已改的 `instByPkg` 同构），`matchInstalledByEntry` 内联正则复用模块级 `GITHUB_SPEC_RE`。
- 全程接口零变化：`InstalledPluginsResult` 形状、`complete`/`others` 语义、输出按依赖键排序，全部原样。
- **不发版**：不 bump `package.json` version，不改 `CHANGELOG.md`，不 `npm publish`，不打 release 提交；实现与测试完成后停在工作区待用户验收。

## 架构快照

- `installed.ts` 是「已装枚举」的唯一属主模块，消费者为 `listMarket`（market.ts:512）、`listInstalledWithMeta`（market.ts:736）、`dsh-cli.ts:710`、`profile-ops.ts`、`toggle.ts:134`。本次只改其实现内部的并发形态：每条依赖的分类逻辑（读 package.json → `dsh` 判定 → 读 cordis.patch.yml → patchRows 解析）彼此独立、无跨条目数据依赖，`Promise.all` 对排序键数组并发执行后按原序折叠，语义与串行版逐点等价。
- `toMarketItem`（market.ts:451）当前对每页条目做 O(page×installed) 的 `matchInstalledByEntry` 线性扫描；改为在 `listMarket` 分页映射前构建一次 `InstalledIndex`（byPkg/byName/byGithub 三张 first-wins 映射 + ord 取最小），条目侧 O(1) 查表。等价性论证与 ADR-0016 决策 5 的 `lookupInIndex` 相同：旧语义 = installed 数组序中首个命中任一准则者；索引版 = 三域各自 first-wins，再跨 ≤3 候选取 ord 最小。github spec 解析复用 merged-market.ts 的 `GITHUB_SPEC_RE`（本次将其导出，market.ts 引入——单一事实源，不在 market.ts 内联第三份字面量）。
- 不动 ADR-0016 的 L2 代存储、ADR-0008/0013 的两段加载、`communityOutcome` 无 memo 形态——本次不涉及。

## 全局约束

- 接口约束（2026-10-15 执行中修订）：返回形状与既有调用点零变化；`listInstalledPlugins` 新增**可选**第二参 `opts?: { patchRows?: boolean }`（缺省 `true` = 现行为，所有既有调用不受影响），仅 `listMarket` 热路径显式传 `{ patchRows: false }`。修订动因：实测并行化后 IO 仅 ~2.5ms，真实大头是每插件 `cordis.patch.yml` 的 YAML CST 解析（~0.55ms/文件，CPU 串行，并发不可救）；`patchRows` 唯二消费方是 enablement.ts / toggle.ts（`listInstalledWithMeta` 路径），市场查询全程不碰。选择退出时**省略 `patchRows` 字段**（类型本就可选，消费方全程 `?.` 链）——不伪造 `readable:false`（那是「多行插件」的语义谎报）。
- 分类语义逐字沿用现状（installed.ts 现行注释为契约）：
  - 依赖键不安全或目录无法解析 → `complete:false` 且不计 `others`（「无法判断 ≠ 非 DSH」）；
  - package.json 读不到/坏 JSON/根非对象 → 同上；
  - 合法 manifest 无 `dsh` 字段 → `others += 1`；
  - patch 读取上限 `PATCH_MAX_BYTES = 256 * 1024`，缺失 → `{ inserts: [], configRows: 0, readable: false }`；
  - `link:` spec 解析真实目标、其余从 `node_modules/<pkg>` 读（`resolvePluginDir` 原样）。
- FP5 等价性红线：`toMarketItem` 的匹配结果必须与现行 `matchInstalledByEntry(entry, installedItems)` 逐点一致，含 installed 数组序的 first-wins 语义与 `source === 'github'` 守卫。
- 仓库测试纪律：core 测试跑 `lib/` 产物，改完必须 `npm run build` 再跑测试（`npm test` 的 pretest 已含 build）。
- 不发版约束见「目标」最后一条。

## 输入工件

- 本对话 2026-10-15 的架构走查结论与实测数据（FP1/FP5，含子代理独立复核）。
- 语义锚点：`src/core/installed.ts` 现行实现与头注释、`src/core/merged-market.ts:89-99`（`matchInstalledByEntry`）、`market.ts:691-692`（`instByPkg` 先例）。
- 测试锚点：`tests/installed.test.mjs`（complete/others 契约 36 例全绿基线）、`tests/market.test.mjs`（`fakeDeps` 注入缝隙）。

## 文件结构与职责

- Modify: `src/core/installed.ts` — `listInstalledPlugins` 循环并行化；新增模块私有 `classifyDep`；唯一职责变更点。
- Modify: `src/core/market.ts` — 新增模块私有 `InstalledIndex`/`buildInstalledIndex`/`lookupInstalledByIndex`；`toMarketItem` 第二参从 `installedItems` 改为索引；`listMarket` 分页映射前建一次索引。
- Modify: `src/core/merged-market.ts` — `matchInstalledByEntry` 内联正则 `/^github:([^#]+)/` 改用模块级 `GITHUB_SPEC_RE`；`GITHUB_SPEC_RE` 增加 `export`（供 market.ts 引入，一处字面量替换 + 一个关键字）。
- Test: `tests/installed.test.mjs` — 新增输出排序钉住用例。
- Test: `tests/market.test.mjs` — 新增 FP5 匹配等价用例（name 域命中 + pkg 域碰撞取数组序在前者 + github 守卫）。
- Create: 无新文件。

## 任务清单

### Task 1: `listInstalledPlugins` 并行化（FP1）

- 目标：串行 for-await 改为 `Promise.all` 并发分类 + 按序折叠；新增排序钉住测试。
- 涉及文件：`src/core/installed.ts`、`tests/installed.test.mjs`
- 接口契约
  - Consumes: `readProfileDepsResult` / `resolvePluginDir` / `readPkgJsonResult` / `sanitizePkgJson` / `readTextLimited` / `readBundlePatchRows` / `parseSpecSource` / `githubRepoFromRepository`（均为本文件既有私有或导出符号，原样复用）。
  - Produces: 重写后的 `listInstalledPlugins`（外部签名不变）；新增模块私有 `classifyDep(root: string, pkg: string, spec: string): Promise<'unknown' | 'other' | { item: InstalledPlugin }>`。
- 验证范围：`tests/installed.test.mjs` 全绿（含新增排序用例）；真实 web profile 计时：`{ patchRows: false }` 形态 ≥3× 提升（≤5ms），缺省形态如实记录（IO 并行收益 ~1.25×，YAML 解析按需保留是设计行为）。

- [x] Step 1: 采集基线计时（改动前）
  - Run:
    ```bash
    cd /home/ubuntu/workspace/dsh-m && node --input-type=module -e "
    import { listInstalledPlugins } from './lib/core/installed.js'
    const profile = process.env.HOME + '/.dsh/profiles/web'
    await listInstalledPlugins(profile)
    const N = 20
    const t0 = performance.now()
    for (let i = 0; i < N; i++) await listInstalledPlugins(profile)
    console.log('avg', ((performance.now()-t0)/N).toFixed(2), 'ms')
    "
    ```
  - Expected: 约 13-14ms（2026-10-15 本机基线 13.75ms；暖页缓存前提）。若显著偏离（>25ms 或 <5ms），记录实际值并照常继续——验收看的是前后倍数。
- [x] Step 2: 新增排序钉住测试（先写测试）
  - Change: `tests/installed.test.mjs` 在「单包 manifest 分类」describe 后新增一组：临时 profile 写入 5 个依赖（键序刻意乱序写入，如 `zeta`、`alpha`、`mid`、`beta`、`omega`，其中 1 个为合法非 DSH 包），断言 `items.map(i => i.pkg)` deep-equal 字典序数组的 DSH 子集、`others === 1`、`complete === true`。复用该文件既有的 tmp profile 夹具写法。
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run build && node --test tests/installed.test.mjs`
  - Expected: 新用例在串行版上即绿（它钉住的是重构必须保持的不变量，不是新行为）；37/37 pass。
- [x] Step 3: 并行化重构
  - Change: `src/core/installed.ts` 的 `listInstalledPlugins`：
    1. 新增私有 `classifyDep(root, pkg, spec)`：完整搬运现行循环体（目录解析失败 / `readPkgJsonResult` 失败 → `'unknown'`；无 `dsh` 字段 → `'other'`；否则读 patch、组 `InstalledPlugin` → `{ item }`）。`githubRepo` 取 `sanitizePkgJson` 已算好的 `info.githubRepo`（现行代码算了两次、值恒等，属冗余清除）。
    2. 主函数改为 `const keys = Object.keys(deps).sort()`；`const classified = await Promise.all(keys.map((pkg) => classifyDep(root, pkg, deps[pkg])))`；单遍顺序折叠：`{ item }` → push item，`'other'` → `others += 1`，`'unknown'` → `complete = false`。`complete` 初值**来自 `readProfileDepsResult` 的返回值**（顶层 manifest 完整性先入账），再被 `'unknown'` 结果下压。
    3. 不引入并发上限（本地 fs 读由 uv 线程池自然排队，几十依赖量级无放大风险；网络用的 `mapWithConcurrency` 先例不适用）。
- [x] Step 3b: patchRows 按需采集（执行中修订，见「全局约束」第一条）
  - Change: `src/core/installed.ts`：`listInstalledPlugins` 签名扩为 `(profileDir?: string, opts?: { patchRows?: boolean })`；`classifyDep` 增加 `wantPatch` 形参——`false` 时不做 `readTextLimited`/`readBundlePatchRows`，产出的 item **省略 `patchRows` 字段**（不伪造 `readable:false`）。缺省 `true` 行为逐字节同旧。
  - Change: `src/core/market.ts:512` 的 `d.listInstalledPlugins(opts.profileDir)` → `d.listInstalledPlugins(opts.profileDir, { patchRows: false })`（`MarketDeps.listInstalledPlugins` 类型随 `typeof defaultListInstalledPlugins` 自动跟进；测试注入的假实现少参会丢给结构兼容，无需改）。
  - Change: `tests/installed.test.mjs` 新增钉住用例：同一含 `cordis.patch.yml` 的 DSH 插件，缺省调用 `items[0].patchRows.readable === true` 且 inserts 非空；`{ patchRows: false }` 调用 `items[0].patchRows === undefined`、其余字段（pkg/name/version）与缺省一致。
  - 依据：`patchRows` 消费方全清单 = enablement.ts:102/118/123、toggle.ts:138/231/283，全部经 `listInstalledWithMeta`/toggle 路径取得 items（该路径保持缺省 `true`）；`listMarket` 路径的 `toMarketItem`/outdated 判定只用 pkg/name/version/spec。
- [x] Step 4: 验证
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run build && node --test tests/installed.test.mjs`
  - Expected: 37/37 pass（complete/others/排序全部保持）。
  - Run: Step 1 的同款计时脚本
  - Expected: ≤5ms（原型 2.58ms），相对 Step 1 基线 ≥3×。
- [ ] Step 5: 可选 checkpoint（本次按「不发版」纪律跳过 commit，改动留在工作区）

### Task 2: `toMarketItem` 索引化与正则清尾（FP5）

- 目标：每查询一次建已装索引，页内条目 O(1) 查表；`matchInstalledByEntry` 复用 `GITHUB_SPEC_RE`。
- 涉及文件：`src/core/market.ts`、`src/core/merged-market.ts`、`tests/market.test.mjs`
- 接口契约
  - Consumes: Task 1 的产物无依赖（本任务独立于 Task 1）；`matchInstalledByEntry`（merged-market.ts 导出，保留不动其签名）；`InstalledPlugin` 类型。
  - Produces: market.ts 模块私有 `interface InstalledIndex`、`buildInstalledIndex(installedItems: InstalledPlugin[]): InstalledIndex`、`lookupInstalledByIndex(index: InstalledIndex, entry: Pick<RegistryEntry, 'npm' | 'github'>): InstalledPlugin | undefined`；`toMarketItem(entry, index: InstalledIndex)`（第二参改型，模块内唯一调用点同步更新）。
- 验证范围：`tests/market.test.mjs` 全绿（含新增等价用例）；后续 Task 3 全量回归兜底。

- [x] Step 1: 新增 FP5 匹配等价测试（先写测试）
  - Change: `tests/market.test.mjs` 新增用例，经 `fakeDeps` 注入 `listInstalledPlugins` 返回固定 installed 数组（数组序即语义契约；字段补齐到 `InstalledPlugin` 合法形状，`description`/`homepage` 空串、`path` 任意占位路径即可）：
    ```js
    const installed = {
      items: [
        { pkg: 'x-pkg', name: 'alpha', version: '1.0.0', source: 'npm', spec: '^1.0.0', dsh: true, description: '', homepage: '', path: '/tmp/x-pkg' },
        { pkg: 'alpha', name: 'z-name', version: '2.0.0', source: 'npm', spec: '^2.0.0', dsh: true, description: '', homepage: '', path: '/tmp/alpha' },
        { pkg: 'gh-plugin', name: 'gh-plugin', version: '3.0.0', source: 'github', spec: 'github:owner/repo#abc', dsh: true, description: '', homepage: '', path: '/tmp/gh-plugin' },
        // spec 形如 github 但 source=npm → github 域不得命中（守卫用例，repo 用 other/repo 与上条隔离）
        { pkg: 'npm-lookalike', name: 'npm-lookalike', version: '4.0.0', source: 'npm', spec: 'github:other/repo#abc', dsh: true, description: '', homepage: '', path: '/tmp/npm-lookalike' },
      ],
      others: 0, complete: true, profileDir: '/tmp/p',
    }
    ```
    registry（经 `readyLoaded` 直给 `LoadedRegistry`）四条覆盖全部匹配路径（`listMarket` 调用传 `withLatest: false`，对齐本文件 matching-only 用例惯例，避免 fake `npmLatest` 噪音）：
    1. `{ id: 'e-alpha', source: 'npm', npm: 'alpha', ... }` → name 域序 0（`x-pkg`）压过 pkg 域序 1（`alpha`）→ 断言 `installed === true && installedPkg === 'x-pkg'`；
    2. `{ id: 'e-xpkg', source: 'npm', npm: 'x-pkg', ... }` → pkg 域序 0 直接命中 → 断言 `installedPkg === 'x-pkg'`；
    3. `{ id: 'e-github', source: 'github', github: 'owner/repo', ... }` → 断言 `installedPkg === 'gh-plugin'`；
    4. `{ id: 'e-guard', source: 'github', github: 'other/repo', ... }` → 仅 `npm-lookalike` 的 spec 字符串像 github 但 `source !== 'github'` → 断言 `installed === false`。
    条目其余必填字段（name/description/category/tags）按 `makeThousand` 同款补齐。
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run build && node --test tests/market.test.mjs`
  - Expected: 新用例在现行线性扫描实现上即绿（钉住等价基线）；全文件 pass。
- [x] Step 2: 实现索引化
  - Change: `src/core/market.ts`：
    1. 新增 `InstalledIndex`（三张 `Map<string, { inst: InstalledPlugin; ord: number }>`：byPkg、byName、byGithub——byGithub 仅收 `source === 'github'` 且 `GITHUB_SPEC_RE.exec(spec)` 命中者，键为 owner/repo）。每键 first-wins（`ord` 取更小者不覆盖）。
    2. `lookupInstalledByIndex`：候选 = `entry.npm` 真值时 byPkg[entry.npm] 与 byName[entry.npm]、`entry.github` 真值时 byGithub[entry.github]（truthiness 守卫与旧谓词 `entry.npm &&` / `entry.github &&` 逐字一致），取 ord 最小者；空候选 → undefined。
    3. `toMarketItem` 第二参改 `index: InstalledIndex`，内部 `matchInstalledByEntry(entry, installedItems)` → `lookupInstalledByIndex(index, entry)`；`listMarket` 在 `ordered.slice(...).map(...)` 前建一次 `const installedIndex = buildInstalledIndex(installedItems)` 并传入。
  - Change: `src/core/merged-market.ts` `matchInstalledByEntry` 内 `/^github:([^#]+)/.exec(it.spec)` → `GITHUB_SPEC_RE.exec(it.spec)`；`GITHUB_SPEC_RE` 声明加 `export`；`src/core/market.ts` 自 `./merged-market.js` 的既有 import 列表补入 `GITHUB_SPEC_RE`（buildInstalledIndex 的 byGithub 键提取复用同一正则）。
- [x] Step 3: 验证
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run build && node --test tests/market.test.mjs`
  - Expected: 全部 pass（含 Step 1 新用例与既有 installed-badge 用例）。
  - Run: `node --test tests/merged-market.test.mjs`
  - Expected: 全部 pass（`matchInstalledByEntry` 正则替换不伤及导出语义）。

### Task 3: 最终验证与变更摘要

- 目标：全量回归 + 类型检查 + 性能总结；确认未触发任何发版动作。
- 涉及文件：无新改动（只读验证）
- 接口契约
  - Consumes: Task 1、Task 2 的全部产物。
  - Produces: 最终验证结论与改动摘要（对话内输出，不落新文件）。
- 验证范围：全仓测试 + typecheck + 计时复测。

- [x] Step 1: 全量测试与类型检查
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm test`
  - Expected: 全部 pass（`npm test` 的 pretest 自动 `npm run build`）。
  - Run: `cd /home/ubuntu/workspace/dsh-m && npm run typecheck`
  - Expected: 0 error。
- [x] Step 2: 性能终测
  - Run: Task 1 Step 1 的同款计时脚本 + `git diff --stat`
  - Expected: 计时 ≤5ms；diff 仅覆盖「文件结构与职责」列出的三个 src 文件与两个测试文件，无 `package.json`/`CHANGELOG.md` 变更。
- [x] Step 3: 输出变更摘要
  - Expected: 摘要含前后计时、改动文件、测试结果；明确声明未 bump 版本、未动 CHANGELOG、未 publish，工作区改动待用户验收。

## 执行纪律

- 开始实现前先批判性复查整份计划；发现缺项、矛盾、命名不一致或验证命令无效，先修计划再动手。
- 按任务顺序执行（Task 1 → Task 2 → Task 3），不无声跳步、合并步或改变任务目标。
- 每完成一个任务，运行该任务定义的验证；验证不过不进入下一任务。
- 遇阻塞、重复失败或计划与仓库现实不符（行号漂移以符号锚点为准），立即停下说明，不猜。
- 本次在 `main` 分支上执行（用户已明确指示「评审完后执行」）；改动停留在工作区，不做任何 commit / bump / publish。
- 全部任务完成后运行最终验证并输出修改摘要。

## 最终验证

- `cd /home/ubuntu/workspace/dsh-m && npm test` 全绿；`npm run typecheck` 0 error。
- 计时脚本（Task 1 Step 1 同款）相对基线（13.75ms）≥3× 提升。
- `git diff --stat` 仅触及计划列出的 5 个文件；`git status` 确认 `package.json` 与 `CHANGELOG.md` 无变更。

## 审阅 Checkpoint

- 本计划按用户指示由评审 agent 对齐后执行；评审意见回帖并修订计划后再动手。
- 发版（版本 bump、CHANGELOG、npm publish）不在本计划范围，需用户后续单独指示。
