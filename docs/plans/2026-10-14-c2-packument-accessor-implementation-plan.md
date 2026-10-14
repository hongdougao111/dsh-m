# C2 packument 访问器：登记网络腿出锁 + 三消费端共享缓存 实施计划

> 修订 v2（2026-10-14，评审 G1-1～G1-9 全接受）：① 出锁补「锁前廉价文件存在性预读」保「本地检查先行」钉子（G1-1）；② 发版号 0.9.85→0.9.86（0.9.85 已于当日 18:07 发布占用，G1-2）；③ warm 腿策略裁决为「生效源单腿直取」保持现状语义（G1-3）；④ 失败负缓存同 TTL 入缓存（G1-4）；⑤ 访问器签名统一位置式 + deps 线到两腿 + 用例间清缓存隔离（G1-5）；⑥ npmPackumentTimes 薄委托化（G1-6）；⑦ 取数层拆 strict/lenient 双面保 readme 阶梯错误透传（G1-7）；⑧ onRouteSwitch 注册归一 + 缓存键钉死（G1-8）；⑨ GLOSSARY 与本计划入 Task 1 checkpoint（G1-9）。
> 修订 v3（2026-10-14，评审 G2-1～G2-4 全接受）：⑩ 锁内零网络断言的锁入口标记改为「第 2 次 readFile（锁内重读）」并断言完整时序（G2-1）；⑪ readme 隐式 registry 兜底腿改走访问器**新增「生效源单腿带缓存」面**（与 warm 同腿策略，共享缓存不换腿；负缓存条目仅 lenient 面消费，strict 面视 null 为 miss 以保原始错误透传；补 URL host 锚治 versions.test.mjs 路由盲）（G2-2，采方案 a）；⑫ versions.test.mjs 隐式 registry 用例前清访问器缓存（G2-3）；⑬ extractGithubRepo 随 readme 函数迁入 packument.ts，versions.ts 如旧 re-export（防反向 import 成环）（G2-4）。

## 目标

- 钢人报告 C2 卡（`docs/architecture-review-20261010-0300-steelman.html`）：「registry 元数据」没有 owning module——三个 adapter 各自取、各自解释、各自缓存（或没有）；登记（Register）只为读一个发布时戳，却在官方文件锁内发起 8MiB 级网络取，网络腿的墙钟直接加进每次装机的关键路径（镜像机器 ~10s 白等）。
- 修法（grill 2026-10-14 七问全锁定 + 评审 v2 修订）：新建 packument 访问器属主模块；登记 times 出锁（发布时戳 = 不可变历史事实，零 TOCTOU；锁前廉价预读保「本地检查先行」钉子）；预检/登记/B3 预热共享 (pkg, registry) 键缓存（失败负缓存同 TTL）；warm bypass 缓存、生效源单腿真发请求暖 CDN；latest 小端点与 ADR-0006 制度不并入。
- 发布约束（需求方指示）：执行完 → 独立评审 → **需求方放行前不 tag 不发版**。

## 架构快照

- 新模块 `src/core/packument.ts` = 全量 packument 取数的唯一属主。取数层双面：内部 `fetchDocThrowing(pkg, timeoutMs, signal?, deps?)` 两腿取数（npmjs 首腿 `Math.min(timeoutMs,5_000)` → 生效源备腿，**终末腿失败抛原始错误**）；公开 `fetchPackumentDoc(...)` = 同阶梯 catch → null（times 语义，失败不抛）。视图层纯函数 `packumentViews(doc)` → `{times, versions, distTags, readme, repo}`。缓存层 `packumentTimes(pkg, timeoutMs?, signal?, deps?)` / `packumentDocViews(pkg, timeoutMs?, signal?, deps?)`（**位置式签名，deps 线到取数层**——与既有 stub 族注入形态逐字兼容）：键 = `(pkg, await activeNpmRegistry() 判定后的生效源字符串)`，条目 `{at, views|null}`（**失败与 regex-invalid 的确定性 null 同按 5min TTL 负缓存**——保「预检刚拉过（含失败）登记不二次打网」），single-flight（in-flight promise 记忆化），cap=4 淘汰最旧写入（C1 L2 先例）。`warmPackumentFor(pkg, timeoutMs, signal?)`：**bypass 缓存 + 生效源单腿直取 + 成功回填缓存**（G1-3：现状 `npmPackument` 无显式 registry 即生效源单腿，镜像机直达——warm 暖的正是 B3 重试要打的 CDN；两腿会让镜像机每次多付 npmjs 5s 且暖错对象，故不采用）+ abort 异常向上传播（R4c）。`clearPackumentAccessorCache()`；模块级**唯一**注册 `onRouteSwitch(() => clearPackumentAccessorCache())`（release-age.ts 旧注册随本地缓存退役删除）。
- 消费端改接：① 登记 `registerExclusion`——锁前先做一次**未加锁的文件存在性预读**（缺席 → 零探测直返 `no-file`，钉子测试与代码注释契约双保）；在场 → 锁外取 times → 进锁 → **重读 YAML** 续走（读的 TOCTOU 无害，锁保护的是写）→ 判窗 → 写；deps.packumentTimes 注入点与签名不变；② 预检——`cachedPackumentTimes` 改为 `packumentTimes` 薄委托（导出/签名不变），`npmPackumentTimes` 改为 `fetchPackumentDoc → views.times` 薄委托（两腿阶梯单份活代码），本地 Map/TTL/`fetchPackumentTimes`/onRouteSwitch 注册全部删除；③ B3 预热 `makeNpmWarmPackument`——缺省 fetcher 换 `(pkg, timeoutMs, signal) => warmPackumentFor(pkg, timeoutMs, signal)`。
- 小端点函数纯搬家：`npmVersion`/`npmLatest`/`npmPackument`/`npmPackumentReadme` + `extractGithubRepo`（G2-4：repo 派生依赖，留守会成环）实现迁入 packument.ts，`versions.ts` 原名 re-export（全部 import 位零改动）；`npmPackument`/`npmPackumentReadme` 无显式 registry 参数时：npmPackument 走访问器缓存（lenient 面；该隐式路径在 B3 改用 warm 后已无生产消费方，仅测试触达，两腿化无生产影响——备案 G3-2）、readme 兜底腿走 `packumentDocViewsActive`（生效源单腿带缓存，G2-2——腿策略与现状单腿一致，不换两腿；`tests/versions.test.mjs` 阶梯用例的错误形态契约保全，mock 补 URL host 锚治路由盲）；显式 registry 直取不走缓存；github 族（`githubTagSha`/`githubLatestTag`）留守 versions.ts（非 npm registry 域）。
- 不动面：latest-cache.ts（ADR-0006）零触碰；ADR-0009 登记判定分支与 fail-open 语义逐字不动（仅取数时机与前置预读变化）；ADR-0012 两腿时序/onRouteSwitch/生效源键入缓存三件全保。

## 全局约束

- 术语遵循 GLOSSARY「packument 访问器（Packument Accessor）」词条（已落盘，随 Task 1 入库）。
- 登记语义红线：`registerExclusion` 判定分支（not-young/not-file/unparseable/up-to-date/applied）与 fail-open 逐字不变；「文件缺席零探测」契约保全（G1-1）。
- warm 红线：生效源单腿真发请求（bypass 缓存）+ 回填 + abort 传播（R4c）——单腿不是新决策，是现状 `npmPackument` 缺省行为的保持（G1-3 裁决）。
- ADR-0012：两腿时序、onRouteSwitch 作废、生效源字符串入键——三件全保（访问器是消费端不是替代品）。
- 环境：bash + Node，命令在 `dsh-m/` 仓库根；执行基线 `npm test` = **1443 全绿 + typecheck exit 0**（2026-10-14 实测，评审亲测复核）。
- 版本：发版号 **0.9.86**（0.9.85 已被当日 18:07 发布占用——`96303a1`；发版件随放行后落，G1-2 修正）。

## 输入工件

- 设计共识：2026-10-14 grill 七问（Q1 出锁/Q2 边界收窄 latest 不并入/Q3 warm bypass/Q4 路由双保险/Q5 测试契约/Q6 ADR-0019+GLOSSARY/Q7 流程）全部按推荐锁定；评审第 1 轮 G1-1～G1-9 全接受修订 v2。
- 病灶证据：exclude-governance.ts:285-293（锁内 await 12s）、release-age.ts:241-297（两消费端 5min Map，含负缓存现状）、versions.ts:78/136/185/235 + profile-transaction.ts:189-203（B3 取回即弃，缺省生效源单腿）。
- 参考：ADR-0016（cap/身份键/single-flight 纪律）、latest-cache.ts（ADR-0006 边界）。

## 文件结构与职责

- Create: `src/core/packument.ts` — 属主模块（strict/lenient 取数双面 + 视图 + 缓存/single-flight/cap/负缓存 + warm 单腿 + 唯一路由作废注册 + 迁入四函数 + extractGithubRepo）。
- Create: `tests/packument.test.mjs` — 访问器单测（TDD；用例间 `clearPackumentAccessorCache()` 隔离）。
- Modify: `src/core/release-age.ts` — `cachedPackumentTimes`/`npmPackumentTimes` 双薄委托；本地 Map/TTL/阶梯/路由注册删除。
- Modify: `src/core/exclude-governance.ts` — 锁前存在性预读 + times 出锁（锁体重读 YAML 纯 fs）。
- Modify: `src/core/profile-transaction.ts` — `makeNpmWarmPackument` 缺省 fetcher 换 `warmPackumentFor`。
- Modify: `src/core/versions.ts` — 四函数 + `extractGithubRepo` 迁出改 re-export；github 族留守。
- Create: `docs/adr/0019-packument-accessor.md`。
- Modify: `tests/exclude-governance.test.mjs` — 新增锁内零网络断言；既有用例（含「本地检查先行」钉子）保绿。
- 入库面：本计划文档 + `GLOSSARY.md` 词条随 Task 1 checkpoint 一并入库（G1-9）。
- 不变边界：latest-cache.ts、market.ts、host-api.ts、cli 侧及全部 import 位（re-export 兜住）。

## 任务清单

### Task 1: packument 访问器模块 + 单测（TDD）

- 目标：属主模块的全部语义先在 node:test 钉死，主工程未动一行即绿。
- 涉及文件：Create `src/core/packument.ts`、`tests/packument.test.mjs`；入库本计划 + GLOSSARY.md。
- 接口契约（Produces，Task 2 按名按签名消费，**全部位置式**）:
  `fetchDocThrowing(pkg, timeoutMs, signal?, deps?)`（内部导出供测试/strict 消费：两腿，终末失败抛原始错误）；
  `fetchPackumentDoc(pkg, timeoutMs?, signal?, deps?)`→doc|null（lenient：catch → null）；
  `packumentViews(doc)`→`{times, versions, distTags, readme, repo}`（纯函数：times=doc.time 合法字符串映射、versions=Object.keys(doc.versions)、distTags=doc['dist-tags']、readme=非空字符串否则''、repo=GitHub owner/repo 归一含 .git 剥离）；
  `packumentTimes(pkg, timeoutMs?, signal?, deps?)`→`Record<string,string>|null`（缓存命中直回；未命中 single-flight 取数+派生）；
  `packumentDocViews(pkg, timeoutMs?, signal?, deps?)`（同缓存返回全视图）；
  `packumentDocViewsActive(pkg, timeoutMs?, signal?, deps?)`→views（**生效源单腿带缓存**（G2-2 方案 a）：命中直回；miss → 生效源单腿 strict 取数（失败抛原始错误）+ 回填——readme 隐式 registry 兜底腿专用；**负缓存 null 条目仅 lenient 面（times）消费，本 strict 面视 null 为 miss 重取**以保错误透传）；
  `warmPackumentFor(pkg, timeoutMs, signal?, deps?)`→Promise<void>（bypass + **生效源单腿**直取 + 回填；abort 传播；deps 注入口与其余访问器函数同款——Task 1 实现中补，warm 单测需零网络）；
  `clearPackumentAccessorCache()`；
  搬迁函数 `npmVersion`/`npmLatest`/`npmPackument`/`npmPackumentReadme`（签名逐字不变）。
- 缓存语义：键 `(pkg, await activeNpmRegistry())`；条目 `{at, views|null}`；TTL 5min；**失败 null 与 regex-invalid null 同 TTL 负缓存**；in-flight Map 同键并发共享同一 promise；cap=4 淘汰最旧写入。
- 验证范围：`node --test tests/packument.test.mjs` 全绿。

- [ ] Step 1: 写失败用例（注入 fetchJsonLimited stub，零真网络；每用例前 `clearPackumentAccessorCache()`）：① 两腿降级（首腿 5s 失败→备腿成功；两腿全败→lenient 得 null / strict 抛原始错误）；② single-flight（并发同键 3 调用 fetch 计数=1 + builds 哨兵）；③ TTL（命中免取、过期重取）；④ cap=4（第 5 键淘汰最旧）；⑤ 负缓存（取数失败后 TTL 内同键零 fetch；regex-invalid 同理零 fetch 直返 null）；⑥ route-switch（回调清空缓存）；⑦ 视图派生（times 过滤/versions/distTags/readme 空↔非空/repo 归一）；⑧ warm：缓存已有命中仍真发请求（fetch 计数=1）、**只打生效源单腿**（fetch URL 断言不含 npmjs 首腿）、成功后缓存可命中、abort stub 抛 AbortError → 向上抛；⑨ readme 阶梯三态（leg1 命中短路 / leg1-ok+leg2-strict-败→空 readme 成功返回 / 两腿败→抛终末腿原始错误；**mock 带 URL host 锚**——leg2 只打生效源、无 npmjs 首腿，G2-2 治路由盲）；⑩ `packumentDocViewsActive` 专测（miss 走生效源单腿 strict + 回填；**负缓存命中时视 null 为 miss 重取并抛原始错误**）；⑪ 搬迁函数回归（npmLatest/npmPackument/npmPackumentReadme/npmVersion 各 1 例形状断言）。
- [ ] Step 2: Run `node --test tests/packument.test.mjs` → Expected：导入失败全套红（模块不存在）。
- [ ] Step 3: 实现 `src/core/packument.ts`（两腿阶梯平移自 release-age.ts:241-259 成 `fetchDocThrowing`；四函数平移自 versions.ts；缓存/warm/路由注册新写）。
- [ ] Step 4: Run 同上 → Expected 全绿。
- [ ] Step 5: checkpoint commit（含本计划文档 + GLOSSARY.md 词条，G1-9）。

### Task 2: 三消费端改接 + 锁内零网络断言

- 目标：登记锁体纯 fs；预检/B3 共享访问器；既有语义（含钉子）全保绿。
- 涉及文件：Modify `exclude-governance.ts`、`release-age.ts`、`profile-transaction.ts`、`versions.ts`；Test `tests/exclude-governance.test.mjs`、`tests/versions.test.mjs`（隐式用例隔离）。
- 接口契约：Consumes Task 1 全部导出（位置式签名）；Produces 无（行为变更 + re-export 面）。
- 验证范围：`npm test` 全量 ≥ 1443 + 新增；typecheck 零错误。

- [ ] Step 1: 写失败断言：`tests/exclude-governance.test.mjs` 新增「锁内零网络」用例——在场文件 + 计数 `packumentTimes` + `readFile` spy；**锁入口标记 = 第 2 次 readFile（锁内重读）**（首调是锁前预读，G2-1），断言完整时序「预读 → fetch → 锁内重读」且第 2 次读之后 fetch 计数增量=0；既有用例（含「本地检查先行」钉子）一行不动。
- [ ] Step 2: Run `node --test tests/exclude-governance.test.mjs` → Expected：仅新用例红（times 仍在锁内）。
- [ ] Step 3: 改接四文件：① `registerExclusion`——锁前未加锁存在性预读（doRead 试探：缺席 → `no-file` 零探测）→ 在场 → 锁外 `await (deps.packumentTimes ?? packumentTimes)(pkg, 12_000)` → `withFileLock` 内重读 YAML 续走（判定分支逐字不动）；② `release-age.ts`——`cachedPackumentTimes`/`npmPackumentTimes` 双薄委托，删本地 Map/TTL/`fetchPackumentTimes`/`onRouteSwitch` 注册（`clearPackumentCache` 保名转委托）；③ `makeNpmWarmPackument` 缺省 fetcher → `warmPackumentFor`；④ `versions.ts` 四函数 + `extractGithubRepo` 删除实现改 re-export（github 族不动）；⑤ `tests/versions.test.mjs` 隐式 registry 用例前补 `clearPackumentAccessorCache()` 隔离（G2-3）。
- [ ] Step 4: Run `npm test` → Expected 全量绿（≥1443+新增，0 fail）；`npm run typecheck` exit 0。
- [ ] Step 5: checkpoint commit。

### Task 3: ADR-0019（发版件推迟）

- 目标：决策记录随代码同步沉淀。
- 涉及文件：Create `docs/adr/0019-packument-accessor.md`。
- 内容八点：① 出锁依据 = 发布时戳不可变（TOCTOU 零险）+ 锁前存在性预读保「文件缺席零探测」钉子；② 边界 = latest 不并入（/latest 小端点 + ADR-0006 定向失效制度）——报告 sketch「latest/version/times/warm」的收窄记录；③ warm = bypass + 生效源单腿 + 回填（G1-3 裁决：单腿系现状保持，两腿会让镜像机暖错 CDN 且多付 5s）；④ readme 兜底腿同腿策略（G2-2 方案 a：生效源单腿带缓存面，共享而不换腿；负缓存仅 lenient 面消费）；⑤ 负缓存同 TTL（故障窗口不双倍停顿）；⑥ 键/TTL/cap/single-flight 取值与 ADR-0012 双保险（onRouteSwitch 唯一注册在属主模块）；⑦ strict/lenient 双面保 readme 阶梯终末错误透传；⑧ 钢人修正存档（锁竞争论据被驳、存活腿 = 网络墙钟）。
- 验证范围：`npm test` 仍全绿；ADR 与代码零出入。
- [ ] Step 1-3: 写 ADR → `npm test` → checkpoint commit。

## 执行纪律

- 按任务顺序执行；每任务跑其验证；改动前重读锚点区（main 热区 + 当日多次发版，行号会漂移；**版本号落笔前先 grep 当前值**）；遇阻即停。

## 最终验证

- `npm run typecheck` exit 0；`npm test` 全绿且 ≥ 1443 + 本批新增；`node -e` 冒烟：访问器 times 冷/热各一（热=零 fetch 计数）、warm 在缓存命中下仍发请求且只打生效源。
- 手工移交（需求方/评审）：真机 `dsm install` 冷缓存一次——登记阶段无秒级停顿；镜像路由场景可选复测。

## 审阅 Checkpoint

- 计划评审闭环后执行；执行完成后再交执行结果评审；需求方放行前不 tag 不发版（发版号 0.9.86，落笔前复核未被占用）。
