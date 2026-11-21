# 13 项目结构与封装

本文定义开源后的仓库结构、模块边界和封装规则。目标：**别人能读懂、能改、能扩展，而不会把平台改成意大利面。**

## 1. 仓库布局

```text
free-welfare/
├── apps/
│   ├── api/                 # NestJS API
│   ├── web/                 # Vue 3 前端
│   └── worker/              # NestJS Worker + 脚本执行
├── packages/
│   ├── shared/              # Zod schema / DTO / 错误码 / 常量
│   ├── domain/              # 纯领域逻辑
│   ├── db/                  # Prisma schema/client/repositories
│   └── sdk/                 # 脚本 SDK
├── analysis/                # 小程序解包/接口/积分/加密/根 URL
├── docs/                    # 设计/实现/开源文档
├── deploy/
│   ├── docker/              # Dockerfile
│   ├── compose/             # docker-compose.yml / .env.example
│   └── caddy/               # Caddyfile
├── tests/
│   ├── e2e/                 # Playwright
│   └── fixtures/            # 脱敏测试数据
├── .github/
│   ├── workflows/
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

> 脚本放在独立仓库 [`free-welfare-scripts`](https://github.com/haikuotianko/free-welfare-scripts)；如果早期想省事，可以先放本仓库 `scripts/`，后续拆出。

## 2. 包依赖方向

```text
apps/web  ──> packages/shared
apps/api  ──> packages/shared, packages/domain, packages/db
apps/worker ─> packages/shared, packages/domain, packages/db, packages/sdk
packages/sdk ─> packages/shared（只读类型）
packages/domain ─> packages/shared
packages/db ─> packages/shared（只读类型；Prisma 只在这里）
packages/shared ─> 无内部依赖
```

规则：

- **只能向下依赖**；不能循环。
- `packages/*` 不能依赖 `apps/*`。
- `apps/api` 和 `apps/worker` 不能互相导入。
- `apps/web` 不能导入 `apps/api`/Prisma/Node-only 代码。
- `analysis/` 不被运行时导入。
- 脚本不能导入 `packages/*` 之外的平台内部；只能使用 SDK 注入的 `ctx`。

## 3. API 应用结构

```text
apps/api/src/
├── main.ts
├── app.module.ts
├── common/
│   ├── errors/              # AppError、错误码、异常过滤器
│   ├── guards/              # AuthGuard、RunTokenGuard
│   ├── interceptors/        # 日志、审计、响应包装
│   ├── decorators/
│   └── pipes/               # Zod validation
├── config/
│   ├── env.schema.ts
│   └── config.module.ts
├── database/
│   └── prisma.service.ts    # Nest provider，包装 packages/db
├── modules/
│   ├── auth/
│   ├── accounts/
│   ├── sites/
│   ├── scripts/
│   ├── sources/
│   ├── bindings/
│   ├── tasks/
│   ├── runs/
│   ├── points/
│   ├── products/
│   ├── activities/
│   ├── notifications/
│   ├── settings/
│   └── health/
├── internal/
│   ├── runner.controller.ts # /internal/runner/*
│   ├── yyb.controller.ts    # /internal/runner/yyb/*
│   └── http.controller.ts   # /internal/runner/http
└── test/
```

### 3.1 模块标准结构

```text
modules/points/
├── points.module.ts
├── points.controller.ts
├── points.service.ts
├── points.repository.ts
├── dto/
│   ├── points.schema.ts     # Zod
│   └── points.response.ts
├── policies/
│   └── points.policy.ts
├── events/
│   └── points.events.ts
├── __tests__/
│   ├── points.service.spec.ts
│   └── points.controller.spec.ts
└── index.ts                 # 只导出公共 API
```

- Controller：HTTP 入参/出参、鉴权、调用 service；**不写 Prisma**。
- Service：业务编排、事务边界、领域规则。
- Repository：Prisma 查询；返回领域对象/DTO，不返回 Prisma 实体给 controller。
- Policy：权限/归属/幂等/网络策略等可测试规则。
- `index.ts`：模块公共 API；其他模块只能从 `index.ts` 导入。

## 4. Worker 应用结构

```text
apps/worker/src/
├── main.ts
├── worker.module.ts
├── scheduler/
│   ├── scheduler.service.ts # 扫描 tasks / 入队
│   └── scheduler.policy.ts
├── runner/
│   ├── runner.service.ts    # 领取/执行/超时/回收
│   ├── sandbox/
│   │   ├── worker-thread.ts
│   │   ├── vm-context.ts
│   │   ├── require-policy.ts
│   │   └── resource-limits.ts
│   ├── sdk-bridge/
│   │   ├── http-bridge.ts
│   │   ├── yyb-bridge.ts
│   │   ├── session-bridge.ts
│   │   └── log-bridge.ts
│   └── result-normalizer.ts
├── handlers/
│   ├── sign-in.handler.ts
│   ├── points.handler.ts
│   └── ...
├── database/
│   └── prisma.service.ts    # 包装 packages/db
├── integrations/
│   └── yyb/
│       ├── yyb.client.ts
│       └── yyb.types.ts
└── test/
```

- Worker 不直接暴露 HTTP 公网接口；内部 Runner API 在 API 应用。
- Runner 只负责“执行 + 收集”，业务归一化放 handler/service。
- 网络请求统一走 `http-bridge`；不在脚本上下文里放 `fetch`。
- 资源限制/超时/终止在 `sandbox`；业务代码不处理线程细节。

## 5. Web 应用结构

```text
apps/web/src/
├── main.ts
├── App.vue
├── router/
├── layouts/
│   ├── DesktopLayout.vue
│   └── MobileLayout.vue
├── modules/
│   ├── dashboard/
│   ├── accounts/
│   ├── sites/
│   ├── scripts/
│   ├── runs/
│   ├── points/
│   ├── products/
│   ├── activities/
│   └── settings/
├── components/
│   ├── ui/                  # shadcn-vue 包装
│   └── domain/              # StatusChip/PointsBadge/...
├── lib/
│   ├── api/                 # API client（由 shared 类型生成/手写）
│   ├── query/               # TanStack Query
│   ├── format/              # 日期/数字/脱敏
│   └── theme/               # 浅色/深色/主题色
├── stores/
├── styles/
└── test/
```

- 页面只做“取数 + 组合 + 交互”；业务规则放后端。
- API 类型来自 `packages/shared`，不手写重复 DTO。
- `components/ui` 不包含业务；`components/domain` 可组合业务展示。
- 不在组件里直接 `fetch`；统一 API client + Query。
- 移动端/桌面端共用页面，布局层适配；不维护两套业务页面。

## 6. Packages

### 6.1 `packages/shared`

只放：

- Zod schema / DTO
- 错误码枚举
- 常量（能力、状态、网络模式）
- 纯工具类型

禁止：

- NestJS/Prisma/Vue 导入
- 数据库/HTTP/文件系统
- 业务 service

### 6.2 `packages/domain`

只放纯函数/纯类型：

- 积分 FIFO/过期计算
- URL 白名单/路径匹配
- 幂等键生成
- 错误分类
- 状态机（task/run）

禁止：

- Prisma、NestJS、Vue、网络、文件系统
- 直接读环境变量

### 6.3 `packages/db`

- `prisma/schema.prisma`、migrations。
- PrismaClient 创建/关闭。
- 通用 repository 函数（分页、事务 helper）。
- 不包含 NestJS/Vue 依赖；API/Worker 各自包装成 provider。

```text
packages/db/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── client.ts
│   ├── repositories/
│   └── index.ts
└── package.json
```

### 6.4 `packages/sdk`

脚本作者看到的契约：

```ts
export interface Context { ... }
export function defineAdapter<T>(adapter: T): T;
export const errors: { ... };
```

禁止：

- 导入平台内部模块
- 暴露 Prisma/DB/YYB token
- 依赖 Node 内置（尽量保持运行时无关；Node 特定 helper 放 separate export）

### 6.5 根配置（暂不抽包）

- 当前 ESLint/TypeScript/Tailwind 配置放根目录，避免为空配置建包。
- 当出现第 3 个应用或需要共享预设时，再抽 `packages/config`。
- 不包含业务代码。

## 7. 封装规则

1. **模块公共 API 只通过 `index.ts`**；禁止 `../../modules/other/internal/...` 深路径导入。
2. **Controller 不写 Prisma**；Service/Repository 分层。
3. **不把 Prisma 类型暴露给前端**；使用 shared DTO/Zod。
4. **不把平台内部暴露给脚本**；脚本只拿 `ctx`。
5. **不把 YYB token/DB/其他账号**放进脚本上下文。
6. **网络请求只能走 `ctx.http`**；禁止 `fetch`/`http`/`https`。
7. **应用白名单是上限**；脚本 manifest 只能缩小。
8. **错误码统一**；不要抛裸字符串/HTTP 异常给用户。
9. **配置集中**；不要在业务代码里 `process.env`。
10. **日志统一**；不要 `console.log` 敏感数据。
11. **事务在 service 层**；repository 不跨事务编排。
12. **App 之间不互相导入**；共享逻辑下沉到 packages。
13. **analysis 只读**；运行时不能依赖解包文件。
14. **脚本版本固定**；运行中的 run 不受更新影响。
15. **公开 API 变更走 SemVer/ADR**。

## 8. 错误处理

```ts
class AppError extends Error {
  code: string;        // 稳定错误码
  message: string;     // 用户可读
  httpStatus: number;  // API 映射
  retryable: boolean;  // 是否可重试
  details?: unknown;   // 脱敏细节
}
```

- API：异常过滤器统一输出 `{ error: { code, message, details? } }`。
- Worker：脚本错误映射为标准 `error_code`；写 `runs.error_code`。
- 前端：按 `code` 显示下一步，不只显示 message。
- 日志：记录 code/stack（服务端），不记录 token/code/sid/phone。
- 禁止：把上游原始响应/堆栈直接返回给前端。

错误码分组：

```text
auth_*      认证/会话
yyb_*       YYB/取码
network_*   网络/白名单/SSRF
script_*    脚本/构建/沙箱
task_*      调度/队列
business_*  业务失败
manual_*    人工处理
system_*    系统/配置
```

## 9. 配置

- `apps/api/src/config/env.schema.ts` / `apps/worker/...` 用 Zod。
- `.env.example` 列变量，不含真实值。
- 配置只在启动时读取；变更需重启。
- 前端不读 secret；只读公开配置。
- 密钥：`APP_ENCRYPTION_KEY`、YYB token、Server酱 token、数据库密码。
- 配置错误：启动失败并给出明确提示，不带着半配置运行。

## 10. 日志与审计

- 结构化 JSON（pino）。
- 字段：`ts, level, app, module, requestId, runId, accountId, siteId, code, message`。
- 脱敏：`code, sid, sessionKey, token, cookie, authorization, phone, openid, unionid`。
- 运行日志：按 run 存文件；DB 存元数据；SSE tail。
- 审计：脚本安装/更新/回滚、配置修改、账号绑定、任务启停。
- 保留：运行日志 30 天、审计 1 年（可配）。

## 11. API 约定

- 前缀 `/api/v1`。
- JSON；时间 ISO 8601；ID 字符串/数字统一。
- 分页：cursor/limit；列表返回 `{ items, nextCursor }`。
- 错误：`{ error: { code, message, details? } }`。
- 认证：httpOnly session cookie 或 Bearer（内部 runner）。
- 幂等：写操作支持 `Idempotency-Key`（可选）。
- OpenAPI：NestJS Swagger；不暴露内部 runner API 到公开文档。
- 版本：破坏性变更升 `/api/v2` 或兼容层。

## 12. 内部 Runner API

- 仅 API 应用暴露，路径 `/internal/runner/*`。
- 鉴权：短期 run token（opaque/HMAC）；绑定 run/account/site/capability。
- 端点：
  - `POST /internal/runner/http`（网络代理）
  - `POST /internal/runner/yyb/get-code`
  - `POST /internal/runner/yyb/get-phone`
  - `POST /internal/runner/session`
  - `POST /internal/runner/log`
- 不记录敏感 body；限制大小；限流。
- run token 运行结束失效；不能跨账号/站点。

## 13. 数据库与 Repository

- Prisma schema/migrations 在 `packages/db`；迁移走 `prisma migrate`。
- `packages/db` 提供 PrismaClient + 通用 repository 函数；不依赖 NestJS。
- API/Worker 各自用 provider 包装 `packages/db`，不互相导入。
- Repository 返回领域对象/DTO；不把 Prisma model 传到 controller。
- Service 控制事务；跨模块写操作用显式事务/领域事件。
- 积分/订单等关键写操作必须幂等。
- 复杂查询用 `$queryRaw`，但封装在 repository。
- 迁移向后兼容；破坏性变更先备份。

## 14. 测试

| 层 | 工具 | 内容 |
| --- | --- | --- |
| 单元 | Vitest/Jest | domain/service/policy |
| 集成 | Testcontainers + Postgres | repository/事务/队列 |
| API | Supertest | controller/guard/错误 |
| Worker | Vitest + fake runner | 调度/超时/错误归一化 |
| 前端 | Vitest + Testing Library | 组件/页面 |
| E2E | Playwright | 首次向导/账号/脚本/运行 |
| 脚本 | Vitest + mock ctx | 适配器契约 |

- PR 必须跑 lint/typecheck/test。
- 关键路径（登录/签到/积分/网络策略）必须有测试。
- 测试数据脱敏；不提交真实账号/HAR。

## 15. CI/CD

```text
GitHub Actions:
  lint -> typecheck -> unit -> integration -> build -> docker (multi-arch)
  脚本仓库: manifest -> tsc -> test -> esbuild -> hash -> index
```

- PR：lint/typecheck/test/build。
- main：构建镜像（arm64/amd64），打 tag。
- Release：SemVer + changelog + Docker tag + migration note。
- 不在 CI 里使用生产密钥。

## 16. 命名与风格

- TypeScript strict；不用 `any`（必要时 `unknown` + 收窄）。
- 文件：`kebab-case.ts`；类：`PascalCase`；函数/变量：`camelCase`。
- Nest 模块：`points.module.ts`；DTO：`points.schema.ts`。
- Vue 组件：`PascalCase.vue`；页面：`pages/...`。
- 错误码：`snake_case`。
- 数据库：`snake_case` 表/列；Prisma model `PascalCase`。
- 脚本 manifest：`<app>.<capability>`。
- 避免缩写；公开 API 用完整单词。

## 17. 反模式

- Controller 里写 Prisma/事务。
- 前端直接调 YYB/目标站点。
- 脚本里 `fetch`/`require('https')`。
- 把 `APP_ENCRYPTION_KEY`/YYB token 放前端或日志。
- 跨模块深路径导入。
- 在 `packages/shared` 放业务 service。
- 在 `packages/domain` 导入 Prisma/Nest。
- 脚本更新影响进行中的 run。
- 用 `vm` 当安全边界运行未审核脚本。
- 把解包代码/HAR/真实账号提交仓库。
- 用 `console.log` 打 token。
- 失败重试不分类（业务失败也重试）。

## 18. 文档与 ADR

- 设计变更：先 ADR；再改代码/文档。
- 新模块：在本文/README 加结构说明。
- 新脚本：更新 `analysis/packages/<key>` + manifest + README。
- API 变更：更新 OpenAPI/共享 schema/changelog。
- 发布：更新 CHANGELOG + 迁移说明。

## 19. 模块示例

```text
modules/sites/
├── sites.module.ts
├── sites.controller.ts       # GET/POST/PATCH /api/v1/sites
├── sites.service.ts          # 业务编排
├── sites.repository.ts       # Prisma
├── dto/
│   ├── site.schema.ts        # Zod create/update
│   └── site.response.ts
├── policies/
│   └── network.policy.ts     # 复用 packages/domain
├── __tests__/
│   ├── sites.service.spec.ts
│   └── sites.controller.spec.ts
└── index.ts                  # export SitesModule + 公共类型
```

其他模块只能：

```ts
import { SitesService } from '../sites'; // 通过 index.ts
```

不能：

```ts
import { SitesService } from '../sites/sites.service'; // 深路径
```

## 20. 开源注意

- 不提交 `.env`、`data/`、HAR、wxapkg、真实账号、token、手机号。
- 提交前跑 `pnpm lint && pnpm typecheck && pnpm test`。
- 新增依赖需说明用途/许可证；避免不必要的依赖。
- 脚本 PR 必须说明接口来源、权限、幂等、错误处理。
- 安全漏洞走私密渠道，见 `SECURITY.md`。
- 贡献即同意按 MIT 许可证发布。
