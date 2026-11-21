# 14 实现计划

本文把需求拆成可执行的阶段和任务。目标是先跑通一个**真实闭环**，再扩展。

> 当前 Phase 0 落地情况见 [17 脚手架状态](17-scaffold-status.md)。

## 1. 实现原则

1. **先垂直切片**：认证 → YYB → 账号 → 三福登录 → 签到 → 积分 → 运行日志 → 首页。
2. **先能观测**：每个阶段都有日志/错误码/手动运行，不做“黑盒自动化”。
3. **先安全边界**：网络策略、密钥、脱敏、脚本版本从 Phase 0/1 就做，后补成本高。
4. **先单账号**：多账号/并发/抢购后置，避免早期复杂度。
5. **每阶段可发布**：都能 `docker compose up`、有验收标准。

## 2. Phase 0：脚手架与基础设施

**目标**：能启动、登录、连 YYB、看到账号。

### 任务

- [ ] pnpm monorepo：`apps/api`、`apps/web`、`apps/worker`、`packages/*`。
- [ ] TypeScript strict、ESLint/Prettier、Vitest。
- [ ] NestJS + Fastify + Prisma + PostgreSQL 16（Prisma 放 `packages/db`）。
- [ ] pg-boss 初始化 + 健康检查。
- [ ] 环境变量 Zod schema + `.env.example`。
- [ ] 管理员首次创建/登录/会话。
- [ ] 基础布局（PC 侧边栏/手机底部导航）。
- [ ] YYB 配置 + `/integration/accounts` 同步。
- [ ] Docker Compose + Caddy + 多架构镜像。
- [ ] 数据库迁移/备份脚本骨架。
- [ ] CI：lint/typecheck/test/build。

### 验收

- [ ] ARM64 NAS `docker compose up -d` 启动。
- [ ] 浏览器打开，创建管理员，登录。
- [ ] 填 YYB 地址/token，测试连接。
- [ ] 同步并显示微信账号/状态。
- [ ] 健康检查/日志可用。

## 3. Phase 1：三福签到闭环

**目标**：真实账号每天自动签到，手机能看到结果。

### 任务

- [ ] 应用/站点 CRUD + 应用信息（名称/AppID/图标/分类）。
- [ ] 网络配置：`network_mode`、`root_urls`、`allowed_origins`。
- [ ] 脚本模型：`scripts`/`script_versions`（先本地内置三福脚本）。
- [ ] 脚本包：`sanf/common/auth`、`login`、`sign-in`、`points`。
- [ ] Runner：esbuild + worker_threads + vm + ctx。
- [ ] 内部 Runner API：`/internal/runner/yyb/get-code`、`/http`、`/session`、`/log`。
- [ ] 三福登录：code → `sid`/`curCusId`/`sessionKey`。
- [ ] 三福签到：`onSignDetail` → `onSign` → `getPoint`。
- [ ] 三福积分：`getPoint`（余额/即将过期/截止）。
- [ ] 任务：cron/手动/启停/超时/重试。
- [ ] 运行记录/日志/SSE tail。
- [ ] 首页：今日签到、积分、失败、下次任务。
- [ ] Server酱：失败/账号失效；可配置汇总时间。
- [ ] 错误分类/脱敏/幂等。
- [ ] E2E：首次向导 → 绑定 → 手动运行 → 看日志。

### 验收

- [ ] 真实账号签到成功。
- [ ] 重复运行不会重复签到。
- [ ] `sid` 失效自动重登一次；仍失败给 `auth_expired`。
- [ ] 手机首页能看到结果/失败原因/积分。
- [ ] 日志搜不到 `code/sid/sessionKey`。
- [ ] 失败通知到 Server酱。

## 4. Phase 2：订阅源与资产视图

**目标**：脚本可安装/更新/回滚；商品/活动/过期可用。

### 任务

- [ ] `script_sources` + `index.json` 同步。
- [ ] manifest 校验、bundle/hash、版本/回滚。
- [x] 官方脚本仓库 [`free-welfare-scripts`](https://github.com/haikuotianko/free-welfare-scripts) + CI + index 生成。
- [ ] 三福商品：`listPointExchangeCoupon(New)`、详情、字段归一化。
- [ ] 三福活动：勋章/任务/自动化只读。
- [ ] 积分页：余额、即将过期、截止日期、规则。
- [ ] 应用详情：商品/活动 Tab（脚本声明才显示）。
- [ ] 脚本更新提示/changelog/回滚。
- [ ] 多账号初步支持（同应用多账号串行/并发策略）。

### 验收

- [ ] 从订阅源安装/更新/回滚三福脚本。
- [ ] 商品列表/详情可读；库存/限购字段确认。
- [ ] 积分即将过期/年末提醒。
- [ ] 脚本更新不影响进行中的 run。

## 5. Phase 3：兑换、抢购、兼容

**目标**：从“看”到“做”，但保持安全。

### 任务

- [ ] 纯积分兑换：`usePointExchangeCoupon`、`usePointExchange`。
- [ ] 兑换前检查：余额/状态/时间/限购/完善信息。
- [ ] `completeMsg` → `manual_required`。
- [ ] 抢购任务：预热、精确定时、单账号 single-flight、限流/退避。
- [ ] 结果通知：成功/售罄/风控/人工。
- [ ] 旧脚本兼容：`YYB_SERVER` 代理 + run token（仅可信）。
- [ ] 自定义源增强：依赖/隔离（Deno/容器评估）。

### 验收

- [ ] 完成一次纯积分兑换；支付/验证码转人工。
- [ ] 抢购按时间执行并给明确结果。
- [ ] 旧脚本可迁移（可选）。
- [ ] 写操作幂等/复查。

## 6. Phase 4：加固与开源发布

- [ ] 备份/恢复自动化 + 演练。
- [ ] 日志保留/磁盘告警/审计。
- [ ] Prometheus/Grafana（可选）。
- [ ] 更强沙箱（Deno/容器）评估。
- [ ] 文档/贡献指南/安全策略/Issue 模板。
- [ ] 多架构镜像/Release/Changesets。
- [ ] 更多脚本/更多平台。

## 7. 垂直切片任务顺序

```text
1. 环境/DB/迁移
2. 管理员登录
3. YYB 配置 + 账号同步
4. 应用 + 网络配置
5. 脚本模型 + 本地三福脚本
6. Runner + ctx + 内部 API
7. sanf/common/auth + login
8. sanf/sign-in + points
9. 任务/队列/运行/日志
10. 首页/运行详情
11. Server酱
12. E2E + 文档
```

## 8. Definition of Done

每个功能 PR 必须：

- [ ] 有明确的用户价值/验收标准。
- [ ] 类型安全；无 `any`（例外需说明）。
- [ ] 单元/集成测试覆盖关键路径。
- [ ] 错误码/用户提示明确。
- [ ] 日志脱敏。
- [ ] 网络请求走 `ctx.http`/应用白名单。
- [ ] 文档/README/ADR 更新。
- [ ] `pnpm lint && pnpm typecheck && pnpm test` 通过。
- [ ] 不提交敏感数据/生成物。

## 9. 测试门禁

| 阶段 | 必须 |
| --- | --- |
| Phase 0 | 登录/YYB 同步/健康检查 |
| Phase 1 | 三福登录/签到/积分/幂等/脱敏 |
| Phase 2 | 订阅安装/更新/回滚/商品字段 |
| Phase 3 | 兑换幂等/抢购停止条件/人工转交 |
| Phase 4 | 备份恢复/安全扫描/多架构构建 |

## 10. 发布清单

- [ ] `CHANGELOG.md` 更新。
- [ ] 版本号 SemVer。
- [ ] 数据库迁移说明/备份提醒。
- [ ] Docker 镜像 arm64/amd64。
- [ ] 首次部署/升级文档。
- [ ] 已知问题/风险。
- [ ] 安全公告（如有）。

## 11. 风险与缓冲

- 三福接口/字段变化：预留 Phase 2 缓冲。
- YYB 版本差异：启动时健康检查/版本提示。
- ARM64 依赖：优先纯 JS；CI 构建多架构。
- 脚本审核：先官方源，custom 限制。
- 兑换/抢购：不放进 MVP，避免排错面过大。
