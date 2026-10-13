# 外部通道操作审计：机器本地直落日志 + 与操作泵分离（ADR-0018；v1 = 0.9.79）

dsh-m 的全局操作记录（DESIGN §2.6）长期明示口径 = **面板发起**的变更：「CLI、`dsh plugin add`、DSH 设置表单与配置文件直改不留痕」。这条边界在 Agent 工具成为一等操作入口后失效：quota-watch 0.1.28 经 `dshm_upgrade`（host tool）升级装机成功，市场面板「已结束」列表零记录——操作审计面与真实系统状态脱节，用户无法回看「谁在何时动了 profile」。本卡为非面板通道（`dshm` CLI、Agent 工具）补上终态事实记录，同时**不碰操作泵的七态/重放语义**。设计经 `/grill-with-docs` 收敛（2026-10-13；Q1–Q8 + Q2b + Q5 逐条锁定）；实施计划 `docs/plans/2026-10-13-external-operations-journal-implementation-plan.md` 经独立评审 Agent 三轮对抗评审（R1-1..R1-8、R2-1..R2-4、R3-1）收敛后执行——计划文本中可追溯的落点标注为 R1-1/R1-2/R1-3/R1-4/R1-6/R1-7/R1-8、R2-2/R2-3/R2-4、R3-1，其余条目为评审过程性收敛、未在计划中单独标注。

## 决策

1. **记录载体 = 机器本地 JSON 日志，不进操作泵**：新增 `$DSH_HOME/dshm/external-operations.json`（`DSHM_EXTERNAL_JOURNAL_FILE` 可覆盖供测试；与 `dshm/cache` 同基址、不带 profile 维度、不被缓存清理波及）。core 变更入口按调用通道判定：`channel ∈ {cli, host-tool}`（或缺省 `external` 兜底）→ 操作终态后直落一条记录（成功与失败都记，滚动上限 200 条，tmp+rename 原子写）；`channel === 'panel'` → 零记录。append 任何失败被钩子吞掉（至多 stderr 一行），**绝不反噬操作终态与返回值**（R1-1）。
2. **通道判定 = 独立显式 `channel` 参数，不复用 cache 的 namespace**：九个公共入口（market.ts 四入口、togglePlugin、desktop 四入口）增 `channel?: 'panel' | 'cli' | 'host-tool'`，缺省 `'external'`——审计上漏报比误报糟，未知调用方落兜底值而非丢弃。不复用 `namespace`（`'host'|'cli'`）的原因：那是缓存分区键，语义是「隔离」不是「来源」，且 desktop 路径、selfUpgrade 等调用点的 namespace 取值与通道不一一对应（R2-2）。调用点标注：host-api 五个 mutation case（install/uninstall/set-enabled/upgrade/**self-upgrade**）全标 `'panel'`（self-upgrade 漏标 = 面板自升级落 external 记录，确定性语义错误）；cli.ts 标 `'cli'`；tools.ts 标 `'host-tool'`。
3. **desktop 四入口口径（R1-2）**：`desktopToggle` 是 togglePlugin 的唯一嵌套对——**透传** `channel` 给 togglePlugin，单笔事务只产生一条记录；`desktopInstall`/`desktopUninstall`/`desktopUpgrade` 内部委派 `service.installBundle`/`removeBundle`、不经 market.ts 已插桩入口——**自记**（kind 用 `desktop-*`）。entry 链审计（Task 3 call-graph audit）确认：desktopInstall/Uninstall/Upgrade/selfUpgrade 的内部调用路径均不经过任何已插桩公共入口，无第二嵌套对。
4. **面板消费 = 内存 overlay 并读，不写 localStorage**：host-api 新增 `external-operations`（list）与 `external-operations-clear` 两 method；「已结束」列表 = 本地操作泵（localStorage `dshm-operations`，现状不动）+ 外部日志 overlay。外部记录**只存服务端**、fetch 后并入渲染 state（R1-3）——写 localStorage 会在服务端滚动淘汰/清除后被本地副本「复活」，且每浏览器各留一份。渠道徽标：**Agent 工具** / **命令行** / 兜底**外部**（R1-4）；失败记录点亮红点（Q4）；外部行不渲染单条 ✕——移除出口仅「清除已结束」（R2-3，否则 ✕ 移除后下次 fetch 按 id 复活）。
5. **语义边界 = 终态直落，与泵正交**：外部记录永不 queued/running、不参与恢复重放、宿主重启后原样保留（Q7）；与 community-toggle/registry-url 的「创建即终态、不入泵」直落先例同构（operations.js 2026-10-10 修订），新增的只是一类同构 record + 服务端存储。记录不含凭据与原始命令输出（Q3），`reason` 截断 ≤300 字符（R1-8）。**一期不做 UI 操作的服务端镜像**——面板发起的变更仍只存浏览器 localStorage，不跨机、不上服务端（范围明示）。

## Considered Options

- **并入操作泵（localStorage）**：CLI 与 Agent 工具是独立进程，写不到浏览器 localStorage；泵的 queued/running/恢复重放语义对「已发生的事实」属语义错配——被否。
- **不入账（维持现状）**：quota-watch 0.1.28 经 host tool 升级后面板零记录为本卡实证起点，审计面脱节不可接受——被否。
- **跨机同步（服务端集中）**：日志的价值在「这台机器上发生过什么」；跨机聚合引入存储/隐私/冲突语义，一期无需求——被否（机器本地，Q5 用户确认；Windows desktop 机与本机互不相干）。
- **channel 复用 cache namespace**：见决策 2——语义错位且映射不全，被否（R2-2）。
- **外部记录镜像进 localStorage**：见决策 4——复活问题 + 每浏览器一份，被否（R1-3）。

## Consequences

- **并发边界（明示局限）**：append 为整文件读-改-写 + tmp+rename——原子性保证「文件不损坏、条目不半写」，但**同机多进程**（CLI 与宿主进程各为独立进程）并发 append 存在丢更新窗口（可能静默丢失一条审计记录；不损坏、不反噬操作终态）。进程内经 mutation session 串行；跨进程串行化（文件锁）不在一期范围，如未来出现实际丢记录事件再评估。
- **验收门**：全量测试与 0.9.78 基线同绿（无新增失败）；通道单测钉住「panel 零记录 / cli、host-tool 各一条 / desktopToggle 单条 / 失败记 failed / append 失败不反噬」。
- **行为了解边界**：面板常驻期间他终端的变更不做轮询，fetch 时机 = 面板初始化 + 每次操作完成后 + 打开操作记录卡时（R1-6，一期明示）；「已结束」标题计数改用合并后总数，最近 50 条渲染截断照旧（R1-7）。
- **GLOSSARY**：「外部通道（External Channel）」「外部操作记录（External Operation Record）」两词条已入档（随本 ADR 同批入库）。
- **发布形态**：v1 = 0.9.79；npm 发版与 dsh-m 自升级另行经用户确认，不在实施计划内。

## 修订（0.9.82，2026-10-14）

- **外部 failed 行开放单条 ✕（修订决策 4 / R2-3）**：原裁决「外部行不渲染单条 ✕」的实现前提（服务端只有 list/clear 两 method）已补齐——新增 core `removeExternalOperation(id)`（幂等，id 不存在静默 no-op）与 host-api `external-operations-remove`（body.id string 校验 400；鉴权同 list/clear，零新增特例）。翻案动因：外部失败记录点亮红点却无单条出口，唯一消除手段「清除已结束」附带清空全部终态——红点死锁 + 警报疲劳；且展示层（渠道徽标/按日分组/计数）0.9.79 起已同构，操作层掉队。范围收敛：仅 `failed` 行放行（与面板 ✕ 的问题态集合 input/failed/superseded 语义对齐，done 同样不给）；事务顺序强于 clear（先 api 成功、再动 overlay，失败行保留 + err toast；在途 fetch 窗口由客户端墓碑 `removedIds` 兜住，「清除已结束」时重置）；幂等 no-op；并发纪律与 append 同款读-改-写（Consequences 既有明示局限覆盖本路径）。「清除已结束」行为不变。计划 `docs/plans/2026-10-14-external-ops-single-remove-implementation-plan.md` 经独立评审 Agent 三轮评审（R1-C1..C8、R2-C1..C3）收敛后执行。
