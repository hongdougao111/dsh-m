# packument 访问器：registry 元数据的属主模块与登记网络腿出锁（0.9.86，ADR-0019）

「registry 元数据」自钢人报告（2026-10-10 `docs/architecture-review-20261010-0300-steelman.html` C2 卡）起被定为**没有 owning module** 的病灶：三个 adapter（登记 exclude-governance、预检/时戳 release-age、B3 预热 versions+profile-transaction）各自取、各自解释、各自缓存（或没有）。最痛的一条腿：登记（Register）只为读一个发布时戳，却在官方文件锁（`withFileLock(package.json)`）内发起 8MiB 级全量 packument 网络取——镜像机器上 npmjs 首腿 5s 超时 + 生效源备腿至 12s，纯等待直接计入每次装机的关键路径；B3 重试再经 versions.ts 无缓存通道把同一全量取付第二次。钢人修正存档：本卡原以「锁竞争串行化写者」立论——被驳（单用户点不出并发写，竞争罕见）；存活腿是网络墙钟（happy path 秒级白等实测可感）。

设计走 grill 七问（2026-10-14，Q1–Q7 全按推荐锁定）；实施计划 `docs/plans/2026-10-14-c2-packument-accessor-implementation-plan.md` 经独立评审 Agent 三轮对抗审核（G1-1～G1-9、G2-1～G2-4 共 13 条全闭环 + G3-1/G3-2 清单备注；含一个真阻断：times 出锁与「本地检查先行」钉子测试的冲突，以锁前廉价存在性预读化解）。

## 决策

1. **属主模块 = `src/core/packument.ts`**：npm 全量 packument 取数的唯一属主（GLOSSARY「packument 访问器」）。一次取回派生视图包 `{times, versions, distTags, readme, repo}`（纯函数 `packumentViews`，畸形字段回落默认值）；缓存键 `(pkg, await activeNpmRegistry() 判定后的生效源字符串)`，条目 `{at, views|null}`，TTL 5min，single-flight（in-flight promise 记忆化，并发同键共享一次取数），cap=4 超限淘汰最旧写入（C1/ADR-0016 同款纪律）；`onRouteSwitch → clear` 作废与生效源入键双保险（ADR-0012 消费端，注册点唯一在属主模块）。
2. **出锁依据 = 发布时戳不可变**：`times[version]` 是不可变历史事实，锁外预取零 TOCTOU——登记改为「锁前廉价存在性预读（文件缺席零探测直返 no-file，保『本地检查先行』钉子与离线测试契约）→ 锁外取 times → 进锁纯 fs（重读 YAML → 判窗 → 原子写）」。取数失败仍判 `not-young`，fail-open 口径与 ADR-0009 全部判定分支逐字不动；锁保护的是写，读的 TOCTOU 无害。
3. **latest 不并入（边界收窄）**：报告 sketch 的「latest/version/times/warm 共享」收窄为「times/versions/warm」——latest 走 `/latest` KB 级小端点（`npmLatest`），并入全量 packument 访问器要么让 latest 探测付 8MiB、要么名不副实；latest-cache（ADR-0006 纯内存制度 + 按 itemId 定向失效）零触碰。
4. **warm = bypass + 生效源单腿 + 回填（G1-3 裁决）**：B3 预热的目的是真发网络请求暖 CDN——B3 重试打的正是生效源，两腿会让镜像机器先付 npmjs 5s 且暖错对象；单腿系现状 `npmPackument` 缺省行为的保持而非新决策。失败/abort 向上传播（R4c：abort rethrow、其余由包装吞错——预热尽力而为）。**readme 兜底腿同款腿策略（G2-2 方案 a）**：`packumentDocViewsActive` = 生效源单腿带缓存（命中直回、miss 单腿 strict 重取 + 回填），与 warm 共享缓存不换腿。
5. **负缓存仅 lenient 面消费**：取数失败与 regex-invalid 的确定性 null 同按 TTL 入缓存（故障窗口内预检/登记不二次打网——现状性质保持）；strict 面（readme 兜底/warm）视 null 为 miss 重取，保终末腿原始错误透传（readme 阶梯 0.9.50 语义：latest-ok-空-readme + packument 败 → 降级空 readme 不抛；两腿全败 → 抛终末腿错误）。
6. **取数双面 = strict/lenient**：`fetchDocThrowing`（两腿，npmjs 首腿 `min(timeoutMs,5s)` 收紧 → 生效源备腿，终末失败抛原始错误）与 `fetchPackumentDoc`（同阶梯 catch → null，times 的 fail-open 口径）。两腿阶梯单份活代码——release-age 的 `npmPackumentTimes`/`cachedPackumentTimes` 与 versions 的四函数（`npmVersion`/`npmPackument`/`npmPackumentReadme`/`npmLatest`）+ `extractGithubRepo` 全部薄委托/re-export 自属主（import 位零改动；`isNewerVersion` 改用 `isExactVersion` 导入，versions→packument 单向无环）。
7. **隐式 npmPackument 两腿化备案（G3-2）**：`npmPackument` 无显式 registry 时从「生效源单腿」变为访问器 lenient 两腿面——B3 改用 `warmPackumentFor` 后该路径已无生产消费方（仅测试触达），两腿化无生产影响；测试契约同步更新。

## Considered Options

- **锁内竞争论据（原报告立论）**：被钢人驳回（单用户无并发写）——不采。
- **times 留锁内、只加共享缓存**：镜像机器锁内白等依旧——被否（网络墙钟是存活腿）。
- **latest 并入访问器**：见决策 3——被否（端点量级错配 + ADR-0006 制度边界）。
- **warm/readme 走两腿**：见决策 4——被否（镜像机暖错 CDN + 多付 5s；两腿是 times 新鲜度敏感读的契约，不是普适默认）。
- **失败不入缓存**：故障窗口预检（≤17s）+ 登记（再 ≤17s）双倍停顿——被否（负缓存是现状性质，必须保持）。
- **strict 面消费负缓存（返回 null/抛通用错误）**：丢失终末腿原始错误，readme 阶梯契约破——被否（不对称消费：null 只喂 lenient）。
- **常驻大缓存/无 cap**：8MiB 级解析对象驻内存无上界——被否（cap=4 防理论爆炸，身份组合常态 ≤2）。

## Consequences

- **性能预期**：镜像机器装机登记阶段 −（5s 首腿 + 至 12s 备腿）锁内白等，锁体回归纯 fs 毫秒级；B3 预热的取数并入共享缓存（同一安装操作里预检/登记/预热最多付一次全量取）；预检与登记共享 single-flight。
- **验收门**：1461 项测试全绿（执行基线 1443 + 新增 18：packument 17 + 锁内零网络 1）+ typecheck 零错误；锁内零网络断言（第 2 次 readFile 后 fetch 增量 = 0 + 完整时序预读→fetch→锁内重读）；访问器全语义单测（两腿降级/strict-lenient/single-flight builds 哨兵/TTL/cap/负缓存/route-switch 作废/warm 单腿 bypass+回填/Active 面负缓存视 miss/readme 阶梯三态含 URL host 锚）。
- **行为零变化承诺**：ADR-0009 登记判定分支与 fail-open、ADR-0012 两腿时序与路由作废、R4c abort 语义、readme 阶梯 0.9.50 语义（含 latest-ok-空 + packument-败的降级不抛）、`「本地检查先行」`钉子、既有 release-age/profile-transaction 用例全部保持；唯一明示契约变化 = 决策 7（隐式 npmPackument 两腿化，无生产消费方）。
- **GLOSSARY**：「packument 访问器（Packument Accessor）」词条已入档。
- **发布形态**：0.9.86（发版件随需求方放行后落，OIDC tag 流程）。
