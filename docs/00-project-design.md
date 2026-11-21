# 00 项目总设计

> 本文是 Free Welfare 的总设计文档，面向使用者、贡献者和未来的维护者。  
> 详细实现分别见 [01 产品范围](01-product-scope.md)、[03 架构](03-architecture.md)、[04 数据模型](04-domain-and-data-model.md)、[05 脚本系统](05-script-system.md)、[11 脚本结构](11-script-structure.md)、[12 网络策略](12-network-policy.md)、[13 项目结构](13-project-structure.md)。

## 1. 项目定位

Free Welfare 是一个**自托管的微信小程序签到 / 积分 / 兑换自动化平台**。

- 每个使用者部署自己的实例。
- 每个使用者部署自己的 YYB-Go-Enhanced，平台通过集成 API 连接。
- 脚本通过 GitHub 订阅源分发，维护者审核，版本/hash 可追溯。
- 通用模型：一个应用对应一个小程序；积分默认叫“积分”，每个应用可自定义名称。
- 首个真实应用：三福会员中心（登录、签到、积分）；后续接入更多应用。
- 后续扩展：兑换、抢购、更多小程序、更多平台。
- 开源、MIT、可二次开发。

### 1.1 一句话架构

```text
Vue 3 Web (PC 优先/移动友好)
        │ HTTP
NestJS API ── PostgreSQL
        │
NestJS Worker ── Node worker_threads + vm ── 脚本 SDK ── 平台 HTTP 代理
        │                                              │
        └────────────── YYB / 目标小程序 API ──────────┘
```

## 2. 需求

### 2.1 功能需求

优先级：P0 = MVP 必须；P1 = 首版后尽快；P2 = 后续。

| ID | 需求 | 优先级 | 验收标准 |
| --- | --- | --- | --- |
| FR-001 | 首次启动向导 | P0 | 创建管理员、连接 YYB、同步账号、安装首个脚本 |
| FR-002 | 管理员认证 | P0 | 用户名/密码登录；会话安全；可选 TOTP |
| FR-003 | YYB 连接 | P0 | 配置地址/token；健康检查；错误可读 |
| FR-004 | 微信账号同步 | P0 | 同步账号、状态、渠道；失效可跳转重扫 |
| FR-005 | 应用管理 | P0 | 应用信息（名称/AppID/图标/分类）；多脚本；网络配置 |
| FR-006 | 脚本订阅源 | P0 | 同步 index；显示版本/能力/审核状态 |
| FR-007 | 脚本安装/更新/回滚 | P0 | 校验 hash；版本固定；可回滚 |
| FR-008 | 绑定与配置 | P0 | 应用+微信账号+脚本；JSON Schema 表单；secret 加密 |
| FR-009 | 任务调度 | P0 | cron/一次性；手动运行；启停；超时/重试 |
| FR-010 | 应用登录 | P0 | YYB code → 业务会话；会话缓存 |
| FR-011 | 应用签到 | P0 | 状态判断→签到→复查；幂等 |
| FR-012 | 积分同步 | P0 | 应用积分余额、即将过期、截止日期 |
| FR-013 | 商品/活动读取 | P1 | 商品列表/详情；活动入口；只读 |
| FR-014 | 运行记录/日志 | P0 | 状态、耗时、错误码、实时 tail |
| FR-015 | Server酱通知 | P0 | 失败/账号失效/脚本更新；可配置多个汇总时间 |
| FR-016 | 网络策略 | P0 | 应用根 URL；白名单/不限制；脚本只走 `ctx.http` |
| FR-017 | 分析文档 | P0 | 解包/接口/积分/加密/根 URL 可查 |
| FR-018 | PC/移动界面 | P0 | PC 侧边栏/多列；手机底部导航/卡片 |
| FR-019 | 备份/恢复 | P1 | 数据库+data 目录备份；恢复文档 |
| FR-020 | 脚本贡献流程 | P1 | PR/CI/审核/发布 index |
| FR-021 | 兑换 | P2 | 纯积分兑换；支付/验证码转人工 |
| FR-022 | 抢购 | P2 | 预热、定时、限流、结果通知 |
| FR-023 | 旧脚本兼容 | P2 | `YYB_SERVER` 代理；仅可信脚本 |
| FR-024 | 多平台 | P2 | 架构预留，非首期 |

### 2.2 非功能需求

| 类别 | 要求 |
| --- | --- |
| 安全 | 密钥加密；日志脱敏；HTTPS；最小权限；SSRF 拦截；脚本审核 |
| 可靠性 | 任务幂等；失败重试分类；Worker 崩溃可回收；数据库备份 |
| 性能 | 本地 API p95 < 300ms；普通任务调度误差 < 5s；抢购后续单独设计 |
| 可移植 | Docker Compose；ARM64/amd64；PostgreSQL 16 |
| 可维护 | TypeScript strict；模块边界；ADR；测试；CI |
| 可观测 | 结构化日志；运行记录；健康检查；审计 |
| 可用性 | PC 优先；手机友好；44px 触控；深浅色 |
| 隐私 | 只存必要数据；可删除；日志保留可配；不提交敏感数据 |
| 开源 | MIT；贡献指南；安全策略；Issue/PR 模板；版本发布 |

### 2.3 非目标

- 公开注册的多租户 SaaS。
- 批量注册、接码、伪造身份。
- 绕过验证码/风控/设备指纹。
- 自动支付/代付/绑卡。
- 保证抢购成功。
- 执行任意未审核 Node 代码。
- 伪造微信/业务返回值。

## 3. 总体架构

### 3.1 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | Vue 3 + TypeScript + Vite + TailwindCSS + reka-ui/shadcn-vue + Pinia + TanStack Query |
| API | NestJS + Fastify + Prisma + PostgreSQL 16 |
| 队列 | pg-boss |
| Worker | NestJS standalone + Node 22 `worker_threads` + `vm` |
| 脚本构建 | esbuild（应用公共模块打包；第三方依赖 external） |
| 部署 | Docker Compose + Caddy；ARM64/amd64 |
| 通知 | Server酱（首期） |

### 3.2 组件

```text
apps/web        PC 优先 / 移动友好 PWA
apps/api        认证、账号、应用、脚本、任务、运行、查询、内部 Runner API
apps/worker     调度、执行、脚本沙箱、HTTP/YYB 代理、结果归一化
packages/shared Zod schema、DTO、错误码、常量
packages/domain 纯领域逻辑（积分、URL 策略、幂等、错误分类）
packages/db     Prisma schema/client/repositories
packages/sdk    脚本 SDK（ctx 类型、defineAdapter、helper）
analysis/       小程序解包/接口/积分/加密/根 URL 文档
docs/           设计/实现/开源文档
deploy/         Docker/Caddy/Compose
```

### 3.3 关键边界

| 边界 | 规则 |
| --- | --- |
| Web ↔ API | 只通过 HTTP/JSON；不导入后端代码/Prisma 类型 |
| API ↔ Worker | 共享 `packages/shared`/`packages/domain`；不互相导入 app 内部 |
| API/Worker ↔ DB | 通过 repository/service；controller 不直接写 Prisma |
| 平台 ↔ 脚本 | 只通过 `ctx` SDK；不暴露 Prisma/DB/YYB token/其他账号 |
| 脚本 ↔ 网络 | 只通过 `ctx.http`；应用白名单 + 脚本声明 |
| analysis ↔ 运行时 | 文档只读；运行时不依赖解包文件 |

## 4. 领域模型

核心实体：

- `admins` / `sessions`
- `wechat_accounts`
- `sites`（应用）：`network_mode`、`root_urls`、`allowed_origins`
- `site_accounts`：业务身份、加密 session
- `point_accounts` / `point_lots` / `point_transactions` / `point_rules`
- `products` / `product_snapshots` / `activities`
- `scripts` / `script_sources` / `script_versions`（`kind=action/common`）
- `bindings` / `tasks` / `jobs` / `runs` / `run_logs`
- `orders` / `notifications` / `settings` / `audit_logs` / `artifacts`

详见 [04 数据模型](04-domain-and-data-model.md)。

## 5. 脚本系统

### 5.1 一功能一脚本

```text
sanf/
  common/         # auth/session/crypto/http（不直接运行）
  login/          # 一个功能
  sign-in/
  points/
  products/
  redeem/
  activities/
  register/
```

- `kind=action`：一个脚本一个 `capability`。
- `kind=common`：公共模块，不创建任务。
- 平台按“应用 → 功能脚本 → 公共模块”管理。
- 每个功能脚本可独立启停/更新/回滚/调度。

### 5.2 SDK

脚本只能使用：

```ts
ctx.yyb.getCode()
ctx.http.get/post/request()
ctx.session.get/set/delete()
ctx.log.*
ctx.sleep()
ctx.time.now()
ctx.businessError/authExpired/manualRequired()
```

- 不注入真实 `process`/`fs`/`child_process`/`fetch`。
- 官方脚本可用受控 `require` + 声明依赖；自定义源脚本不允许 `dependencies/require`。
- `vm` 不是安全沙箱；官方源靠审核，custom 限制能力。

### 5.3 订阅源

- 脚本仓库提供 `index.json`、manifest、bundle、SHA-256。
- 贡献者 PR；CI 校验；维护者审核；合并后发布版本。
- 平台同步、安装、更新、回滚；进行中的 run 固定旧版本。
- 不做 index 签名（首期）；依赖 HTTPS + GitHub + hash + 审核。

详见 [05 脚本系统](05-script-system.md)、[11 脚本结构](11-script-structure.md)、[09 运行时](09-script-runtime.md)。

## 6. 网络策略

### 6.1 应用级根 URL

每个应用记录多个根 URL：

```yaml
network:
  mode: whitelist
  root_urls:
    - id: crm
      url: https://crm.sanfu.com
      purpose: 登录/签到/福币/商品
      used_by: [auth, sign_in, points, products]
      required: true
  allowed_origins:
    - https://crm.sanfu.com
```

### 6.2 模式

- `whitelist`（默认）：只允许应用 `allowed_origins` + 可选 path prefix。
- `unrestricted`：允许公网，但仍拦截私网/回环/元数据/危险端口；管理员二次确认。

### 6.3 脚本请求

- 只能 `ctx.http`。
- 应用白名单是上限；脚本 manifest `allowed_domains` 只能缩小。
- 代理层做白名单、SSRF、端口/重定向、限流、审计、脱敏。
- 失败统一 `network_denied`。

详见 [12 网络策略](12-network-policy.md)。

## 7. 三福首版

### 7.1 接口

| 功能 | 接口 |
| --- | --- |
| 登录 | `POST /ms-sanfu-wechat-customer-core/customer/core/wxMiniAppLogin` |
| 福币 | `GET /ms-sanfu-wechat-customer/customer/getPoint` |
| 签到状态 | `GET /ms-sanfu-wechat-common/customer/onSignDetail` |
| 签到日历 | `GET /ms-sanfu-wechat-common/customer/getSignLogsList` |
| 签到 | `POST /ms-sanfu-wechat-common/customer/onSign` |
| 商品列表 | `GET /ms-sanfu-wechat-coupon/coupon/listPointExchangeCoupon(New)` |
| 商品详情 | `GET /ms-sanfu-wechat-coupon/coupon/getPointExchangeCoupon` |
| 兑换 | `POST /ms-sanfu-wechat-coupon/coupon/usePointExchangeCoupon` |

### 7.2 关键字段

- `getPoint`：`restMoney`（余额）、`historyPoint`（即将过期）、`nextYear`（截止）。
- `onSignDetail`：`signIn`（1 可签/3 已签）、`onKeepSignDay`。
- `onSign`：`giftMoneyAdd`、`giftMoneyKeep`、`daysForGift`、券/包邮卡。
- 年末过期。
- 普通接口无签名；`Sf-Authorization: sid` + `cusId`。

详见 [08 三福脚本规格](08-sanf-adapter.md) 和 [analysis/packages/sanf](../analysis/packages/sanf/README.md)。

## 8. 界面

- PC 优先：侧边栏、多列/表格、批量操作。
- 手机友好：底部导航、单列卡片、安全区、44px。
- 首页全部卡片：今日任务、待处理、积分、下次任务、最近运行。
- 应用详情：应用信息 → 多个功能脚本 → 公共模块 → 网络。
- 脚本页：订阅源、安装/更新/回滚、绑定、任务、日志。
- 浅色 + 深色 + 自定义主题色。
- Server酱：可配置多个汇总时间，无信息不发送。

详见 [10 界面与功能](10-ui-feature-plan.md)、[06 界面设计](06-ui-ux.md)。

## 9. 部署与运维

```text
Caddy (80/443)
  ├── api:3000
  ├── worker
  └── postgres:5432
       └── yyb-go:8000（可选/外部）
```

- Docker Compose；ARM64/amd64 多架构。
- 只有 Caddy 暴露公网；YYB 不暴露。
- `data/` 存脚本/日志/附件；`pgdata` 存数据库。
- 每日备份；恢复演练；健康检查。
- 迁移启动时执行或独立 job。
- 资源建议：2GB 最低，4GB 推荐。

## 10. 安全与隐私

- 单管理员；首次创建；关闭注册。
- 密码 Argon2id；会话 httpOnly/Secure/SameSite；可选 TOTP。
- `APP_ENCRYPTION_KEY` 加密 YYB token、Server酱 token、手机号等。
- 日志脱敏：code/sid/token/cookie/phone/openid/sessionKey。
- 脚本只走 SDK；白名单/SSRF/限流/审计。
- 官方脚本审核；custom 禁用 dependencies/require；vm 不是安全边界。
- 备份加密/权限；数据删除；保留策略。
- 不提交 `.env`、`data/`、HAR、wxapkg、真实账号。

## 11. 开源设计

### 11.1 仓库

- 主仓库：平台代码 + 文档 + 分析目录。
- 脚本仓库：`free-welfare-scripts`（建议独立），提供 index/manifest/bundle。
- 分析目录：`analysis/`，只放文档/模板，不放解包代码/HAR。

### 11.2 结构与封装

- `apps/api`、`apps/web`、`apps/worker` 不互相深层导入。
- `packages/shared` 只放纯类型/Zod/错误码/常量。
- `packages/domain` 只放纯领域逻辑，不依赖 NestJS/Prisma/Vue。
- `packages/sdk` 只放脚本契约，不依赖平台内部。
- 模块通过 `index.ts`/Nest module exports 暴露公共 API；禁止跨模块深路径导入。
- Controller 不写 Prisma；Service/Repository 分层。
- 前端不导入后端实体/Prisma 类型；使用 shared DTO。
- 脚本不导入平台内部；只使用 `ctx`。

详见 [13 项目结构](13-project-structure.md)。

### 11.3 许可证与治理

- MIT。
- ADR 记录决策；SemVer；Changesets；Docker 镜像 tag。
- PR/Issue 模板；CI；安全策略；贡献指南。
- 脚本贡献有独立审核清单。

详见 [15 开源治理](15-open-source.md)、[CONTRIBUTING](../CONTRIBUTING.md)、[SECURITY](../SECURITY.md)。

## 12. 风险

| 风险 | 应对 |
| --- | --- |
| 三福接口变更 | 版本化脚本、错误分类、快速回滚、告警 |
| YYB 授权失效 | 状态同步、409 识别、重扫引导 |
| 验证码/风控 | 暂停、通知人工、不绕过 |
| 脚本供应链 | 审核、hash、最小注入、custom 限制 |
| Node vm 逃逸 | 不运行未审核脚本；未来 Deno/容器 |
| ARM64 资源 | 2GB 最低/4GB 推荐；限制 worker |
| 账号封禁 | 保守频率、只操作本人账号、风险提示 |
| 开源被滥用 | 明确边界、许可证、安全策略、审核 |

## 13. 路线图

| 阶段 | 目标 |
| --- | --- |
| Phase 0 | 脚手架、认证、YYB、账号同步、Docker |
| Phase 1 | 三福 login/sign_in/points、任务、日志、首页、Server酱 |
| Phase 2 | 订阅源、更新/回滚、商品/活动、积分过期 |
| Phase 3 | 兑换、抢购、旧脚本兼容、自定义源增强 |
| Phase 4 | 加固、备份、开源发布、更多脚本 |

详见 [14 实现计划](14-implementation-plan.md)。

## 14. 文档索引

| 文档 | 内容 |
| --- | --- |
| [01 产品范围](01-product-scope.md) | 目标、非目标、用户旅程 |
| [02 微信自动化调研](02-wechat-automation-research.md) | WMPFDebugger、KillWxapkg、YYB、三福 |
| [03 架构](03-architecture.md) | 技术栈、组件、数据流、部署 |
| [04 数据模型](04-domain-and-data-model.md) | 实体、积分账本、幂等 |
| [05 脚本系统](05-script-system.md) | manifest、SDK、运行时、订阅 |
| [06 界面设计](06-ui-ux.md) | 信息架构、页面规格 |
| [07 路线图与问题](07-roadmap-and-questions.md) | 阶段、验收、问题 |
| [08 三福脚本](08-sanf-adapter.md) | 接口、流程、错误映射 |
| [09 脚本运行时](09-script-runtime.md) | worker/vm、依赖、HTTP 代理 |
| [10 界面与功能](10-ui-feature-plan.md) | PC/移动页面、功能优先级 |
| [11 脚本结构](11-script-structure.md) | 一功能一脚本、公共模块 |
| [12 网络策略](12-network-policy.md) | 根 URL、白名单、SDK 请求 |
| [13 项目结构](13-project-structure.md) | monorepo、模块边界、封装 |
| [14 实现计划](14-implementation-plan.md) | 阶段任务、DoD、发布 |
| [15 开源治理](15-open-source.md) | 许可、版本、贡献、安全 |
| [16 API 设计](16-api-design.md) | 公共/内部 API、错误、分页、幂等 |
| [17 脚手架状态](17-scaffold-status.md) | 已落地/占位/如何运行 |
| [18 配置文件](18-configuration.md) | 项目/YYB/PostgreSQL 配置位置 |
| [19 脚本 SDK](19-script-sdk.md) | 脚本 ctx、缓存、YYB、商品/抢购、青龙模式 |
| [20 脚本开发指南](20-script-development-guide.md) | 从零写脚本、调试、发布订阅源 |
| [决策记录](decisions.md) | ADR |
| [分析目录](../analysis/README.md) | 解包/接口/积分/加密/根 URL |

## 15. 术语

| 术语 | 含义 |
| --- | --- |
| YYB | YYB-Go-Enhanced，微信扫码授权/取码 |
| `wx.login` code | 一次性小程序登录凭证 |
| 应用 / Site | 一个目标小程序 |
| 功能脚本 / Action | 一个能力（登录/签到/积分/商品...） |
| 公共模块 / Common | 登录/加密/HTTP 等复用代码 |
| 绑定 / Binding | 应用 + 微信账号 + 功能脚本 + 配置 |
| 任务 / Task | 可调度能力 |
| 运行 / Run | 一次执行 |
| 根 URL | 协议+域名+端口 |
| `ctx.http` | 脚本唯一允许的网络请求方式 |
