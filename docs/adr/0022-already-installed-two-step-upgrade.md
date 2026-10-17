# already-installed 两步升级与自升级专用通道（0.2.1 宿主安装守卫适配）

DSH 0.2.1-rc.1 起官方 `dsh-plugin-manager` 给 `installBundle()` 加了安装守卫（宿主源码 `lib/index.js:1989-1991`）：宿主挂载 HMR 时，spec 解析出的包名已存在于 profile manifest（无论目标版本新旧）就在 pnpm 之前抛 `ManagementFailure("already-installed")`——官方语义从「覆盖安装 = 升级」改为「先 `removeBundle` 再 `installBundle`」（`lib/types/tools.js:12`、README.zh.md:100）。tarball / git 形态的 spec 包名在 pnpm 前不可知，不受守卫约束。影响面：dsh-m 产品内的 desktop 升级 / 自升级全断（首腿 `already-installed` → `install-refused`）；卸载、开关、全新安装（名字不在 manifest）与 web 路径（自编排 pnpm）不受影响。

真机 spike（2026-10-17，官方插件页粘贴 npmjs tarball URL 覆盖安装已装的 dsh-m 0.9.91→0.9.94）实证：URL 覆盖安装成功、供应链策略对 2 小时新的 URL 依赖未拦截、激活形态 `restart-required`。宿主 0.2.1-rc.2 与 rc.1 的 `dsh-plugin-manager` 逐文件哈希字节级相同，结论原样传导。

我们决定（2026-10-17，grill 决议 R1–R15 + 独立评审三轮，实施计划见 `docs/plans/2026-10-17-host-021-already-installed-adaptation-implementation-plan.md`）：

1. **install-first 自适应两步（第三方路径）**：不做宿主版本探测——先单步 `installBundle(spec)`，收到 `error.code === 'already-installed'` 才转 `removeBundle(pkg)` + 重试一次（至多一次、无循环）；0.2.0 及更旧宿主上守卫不存在，单步语义原样（自适应 = 错误码驱动，零探测成本）。release-age / build-blocked / cancelled 形态先于 already-installed 判定（等待期与审批语义优先）。
2. **兜底回装**：两步化后 add 腿终态失败（旧版已卸、新版未成，插件缺席）→ 自动回装 `pkg@previousVersion`（remove 后旧名不在 manifest，守卫不适用）。回装成功 = **降级恢复**新结局（成功形态 + `degraded:true` + `restoredTo`）；回装再失败 = `rollback-failed` 缺席硬错误（details 携带 `pendingBuilds` 时为回装腿自身 build-blocked，降级失败真相优先）。cancelled 回装成功后不冒充降级——抛「已恢复旧版 / 未做升级」；build-blocked 回装成功后仍抛审批请求。无 previousVersion（无旧版即无回装能力）不两步化。
3. **通道分治**：第三方升级走官方两步；**dsh-m 自升级独享 tarball 直覆盖专用通道（D3）**——`desktopUpgradeLocked` / `desktopInstallLocked` 入口检测 `pkg === SELF_PKG('dsh-m')` 即改道 `desktopSelfUpgradeViaTarball`（core 缝单点收敛，host-api / Agent 工具 / 客户端零特判）。desktop 上任何「升级 dsh-m 自身」的动作绝不落入通用两步——remove+add 对调用者自身是破坏性路径。install 路径撞守卫同样静默两步化（已装态 install = 升级）；dsh-m 全新安装走既有单步。
4. **D3 管线**：`npmLatest` 精确版本 → 生效 registry packument 的 `dist.tarball`（`npmTarballUrl`，复用 ADR-0012 履约阶梯）→ 预写 intent → `installBundle(tarballUrl, {enabled:true})` 直覆盖 → 终态收口。恒 panel 语义零外部日志（ADR-0018 不变量）；生效语义忠实透传宿主 `application`（`applied` → 无需重启、`restart-required` → 提示重启，0.9.22 `classifyUpgradeActivation` 降级为参考）。同版本 no-op；URL 构造失败发生在预写之前（零落盘）；install 终态失败旧版不受影响（spike 实证）。
5. **开机对账（崩溃兜底网）**：intent ledger（`$DSH_HOME/dshm/self-upgrade-intent.json`，env `DSHM_UPGRADE_INTENT_FILE` 隔离测试）记录 delegated 预写；D3 正常路径在本进程内就地 resolve，仅当进程死于 promise 悬垂（活交换中进程死亡）时由下一次 `self-check` 每进程一次比对收口（版本相符 → `intentResolved.ok`，不符 → failed）。定位为兜底网而非常规通道——不引入宿主启动装配点。
6. **D3 通道的两项豁免（评审 R1-1/R1-6 增补，2026-10-17）**：①**不做 release-age 等待期预检**——pnpm 的 minimumReleaseAge 校验作用于 registry 解析面，tarball URL 依赖不受其约束（spike 实证：2 小时新的 URL 依赖未被供应链策略拦截），预检在 D3 上没有可触发的拦截点；自升级另经确认框显式授权、单一包、即时性即通道目的。两臂形态如实记载：upgrade 臂改道点在通用预检**之前**（有意为之），install 臂改道点在通用预检**之后**——dsh-m 已装态的 install 调用照常过闸，两臂不对称是入口位置的自然结果、非语义分叉（同落 D3 管线）。②**不做 ADR-0009 挂点2 排除块登记**——登记的对象是「registry 解析出的 young 版本」，tarball 直装不产生该对象；通道分治下 dsh-m 后续升级恒走 D3，排除块缺登记不产生后果。
7. **0.10.2 实证修订（D3 dogfood，0.10.0→0.10.1 真机事件）**：①**「tarball 不受守卫约束」的 spike 推断修正**——守卫经 `specPackageName` 对 tarball URL 同样可解析包名；dogfood 实录 installBundle(tarballUrl) **写穿三面账后**宿主完成路径自触 already-installed（自指操作伪影：写完后 manifest 含该名）→ 回传 failed，即 **post-write 伪失败**（spike 经官方插件页执行，页面本就先 remove 后 install，未对「在装 + tarball 直装」验证守卫）。②**D3 终态失败一律账实复读改判**——listInstalled 见目标版已写入 = 升级事实成立，按成功改判（needsRestart=true 提示重启激活）；未到目标 = 真失败原语义。「自升级绝不落入通用两步」收窄为「绝不落入 registry-spec 通用两步」——tarball 直装遇守卫/伪失败时的账实改判属通道自洽，非通道降级。③**确认框撤除（主人 UX 裁决）**——0.10.1 引入的自升级确认框破坏既有「点击即升级」体验，0.10.2 回归静默：角标点击直接升级，结局由横幅如实报告（失败无损语义由 D3 通道本体保证，不以确认框前置）。

## Considered Options

- **直连两步（不做错误码自适应）**：0.2.0 及更旧宿主没有守卫，remove+add 会把原本一步成功的操作变成两步（多一次卸载窗口、多一截缺席风险）；且 0.2.0 宿主上 `removeBundle` 后旧名重装同样触发无守卫环境的覆盖安装语义——纯多余。错误码自适应让两步只在守卫真实命中时发生。
- **D1 双投递（先 remove 再 install，无守卫感知）**：remove 成功、install 失败 = 插件缺席且无兜底执行者（下一操作者未知）——否决。
- **web 式自编排（dsh-m 自行 pnpm 编排覆盖升级）**：desktop profile 归宿主独占，自编排造成账实分裂（ADR-0005 红线：零文件级 fallback、不做 pnpm 自编排）——否决。
- **D2 拒绝式（desktop 自升级维持结构化拒绝）**：被需求方否决（「dsh-m 不能更新自己，这样的设定完全不能接受」）——spike 实证 tarball 直覆盖可行后定为 D3。

## Consequences

- **降级恢复成为新结局**：升级失败但已自动恢复旧版以「成功形态 + degraded 标记」返回，客户端投影为 warn（`op.degraded`，不入「升级成功 vX→vY」成功臂）；操作泵复用 `'warned'` 状态落账（零新状态），meta 携带 `{degraded, restoredTo}`，设置页红点沿用 `opsAttention` 对 warned 的既有统计；× 删除走既有通道（删除不改真实状态）。结果的 `version` 字段落账为回装后实际版本（= restoredTo，账实相符优先），`spec` 字段保留尝试目标（评审 R1-2）。
- **URL 形态 spec 限于自升级通道**：第三方升级仍走 registry 精确 spec（两步化），manifest 中第三方条目保持干净形态；仅 dsh-m 自身的 manifest spec 允许 URL 形态（0.10.0 装机走官方插件页 remove + install 精确版本后重钉为干净形态）。
- **intent ledger 是 ADR-0018 的正交件**：面板通道零外部日志不变——delegated 预写不进 external journal，落独立单条覆盖写的 ledger；损坏容错（改名 `.corrupt-<ts>` 隔离后按空处理）与 external journal 同款纪律。
- **宿主行为锚**：若未来宿主改变守卫语义（如允许覆盖安装），两步化不再被触发（错误码不再出现），D3 通道与两步化互不依赖、可独立退役。
- **文档连带**：GLOSSARY 七词条（两步升级 / 宿主安装守卫 / install-first 自适应 / 兜底回装 / 降级恢复 / 自升级专用通道 / 开机对账）；know-how 020 增补 §10（交付后动作）。
