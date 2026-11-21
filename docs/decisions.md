# 决策记录（ADR）

## ADR-0001：自托管单实例，不做多租户

- 日期：2026-11-13
- 状态：接受
- 背景：最初考虑公开注册的多用户平台，但账号归属、YYB 扫码、滥用、合规和运维复杂度都很高。
- 决策：每个使用者部署自己的实例，管理自己的账号和 YYB；项目本身开源。
- 影响：不需要用户/租户/配额/跨用户隔离；数据库和 API 更简单。后续如需家庭共享，可加只读成员，但不做公开 SaaS。

## ADR-0002：NestJS + Vue3 + TailwindCSS

- 日期：2026-11-13
- 状态：接受
- 背景：希望前后端分离、TypeScript 全栈、移动端友好。
- 决策：
  - 后端 NestJS + Fastify。
  - 前端 Vue 3 + Vite + TypeScript + TailwindCSS + reka-ui/shadcn-vue。
- 影响：类型/Zod schema 可共享；部署为 Node 容器；ARM64 支持良好。

## ADR-0003：PostgreSQL + Prisma + pg-boss

- 日期：2026-11-13
- 状态：接受
- 背景：需要任务队列、调度、JSONB、积分流水、可靠事务；NAS 上不想再多一个 Redis。
- 决策：PostgreSQL 16 + Prisma + pg-boss。
- 影响：少一个 Redis 容器；Prisma 迁移与 pg-boss schema 分开；复杂 SQL 用 `$queryRaw`。

## ADR-0004：Node worker_threads + vm，官方源审核 + custom 限制

- 日期：2026-11-13
- 状态：接受
- 背景：脚本形态选择 JS/TS；公开多用户已排除，但脚本供应链仍有风险。
- 决策：
  - 脚本在 `worker_threads` + `vm` 上下文中执行。
  - 不注入真实 `process/fs/child_process/fetch`；`require` 受控，custom 禁用；网络走平台代理。
  - 只默认运行 `reviewed` 订阅脚本；`vm` 不作为安全边界。
- 影响：实现简单、ARM64 友好；不能运行不可信脚本；后续可升级 Deno/容器。

## ADR-0005：GitHub 订阅源 + 维护者审核

- 日期：2026-11-13
- 状态：接受
- 背景：其他用户会提交脚本；平台不能做任意脚本市场。
- 决策：
  - 官方脚本仓库提供 `index.json`、manifest、bundle、hash。
  - 贡献者提 PR；CI 校验；维护者审核合并。
  - 平台支持官方源 + 自定义源；自定义源标记 `custom`，强警告。
  - `custom` 脚本不允许 `dependencies/require`，只能用 `ctx` API。
- 影响：官方脚本可用依赖、可审核；自定义源灵活但限制运行时能力；审核仍是主要安全控制。

## ADR-0006：YYB 每个部署自己部署

- 日期：2026-11-13
- 状态：接受
- 背景：YYB 是微信账号授权/取码服务，集中托管会有账号归属和合规问题。
- 决策：使用者自己部署 YYB；平台通过 `/integration/*` 连接；不直接读 YYB 数据库。
- 影响：平台配置需要 YYB 地址 + integration token；账号扫码在 YYB 控制台完成。

## ADR-0007：首个脚本为三福会员签到

- 日期：2026-11-13
- 状态：接受
- 背景：已有 `sanf.js` 可参考，接口简单，适合跑通链路。
- 决策：
  - AppID `wxfe13a2a5df88b058`。
  - 首版能力：`login`、`sign_in`、`points`。
  - 解包后确认 `getPoint` 返回 `restMoney`/`historyPoint`/`nextYear`；福币年末过期。
  - 商品/活动接口已定位（`listPointExchangeCoupon*`、`badge/*` 等），作为 Phase 2。
- 影响：MVP 可在较短时间内跑通真实签到 + 福币余额；商品/活动/兑换后续。

## ADR-0008：Node vm 不是安全边界

- 日期：2026-11-13
- 状态：接受
- 背景：Node `vm` 可被逃逸；但当前定位是自托管 + 审核脚本。
- 决策：官方源脚本审核后运行；自定义源 `custom` 只允许 `ctx` API、禁用 `dependencies/require`；不提供公开上传/执行任意代码。
- 影响：自定义源仍有 vm 逃逸风险，但攻击面小于任意 Node 代码；如果未来允许自定义依赖/公开脚本市场，必须升级到 Deno/容器/gVisor。

## ADR-0009：许可证 MIT

- 日期：2026-11-13
- 状态：接受
- 背景：希望别人自由部署、修改、二次开发。
- 决策：项目使用 MIT License。
- 影响：允许闭源商用；如果后续更在意“修改后提供服务需开源”，再评估 AGPL。

## ADR-0010：首期只做三福签到 + 福币

- 日期：2026-11-13
- 状态：接受
- 背景：三福已有 `sanf.js`，登录/签到/福币链路清晰；商品/活动接口尚未确认。
- 决策：
  - 首期能力：`login`、`sign_in`、`points`。
  - 商品/活动/会员信息 Phase 2 用 KillWxapkg + WMPFDebugger 补。
  - 不虚报未实现能力。
- 影响：能最快跑通真实链路；但首期资产视图不完整。

## ADR-0011：ARM64 NAS + 内网/VPN 优先

- 日期：2026-11-13
- 状态：接受
- 背景：部署目标是 ARM64 NAS；暴露面越小越安全。
- 决策：Docker Compose 多架构镜像；默认内网/VPN 访问；公网必须 HTTPS + 强认证。
- 影响：Caddy 可选；YYB 不暴露公网；备份/资源限制要考虑 ARM64。
