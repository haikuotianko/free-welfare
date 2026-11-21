# 16 API 设计

本文定义平台 HTTP API 的契约、封装和版本规则。目标是：前端、脚本、贡献者都能按同一套约定开发。

## 1. 原则

1. **Contract-first**：请求/响应用 Zod schema 定义，放 `packages/shared`。
2. **不泄露内部**：不把 Prisma 实体、数据库字段、YYB token 暴露给前端。
3. **错误稳定**：错误码是契约；message 可改，code 不改。
4. **分页统一**：cursor/limit；列表返回 `items + nextCursor`。
5. **时间统一**：ISO 8601 UTC；前端按本地时区展示。
6. **幂等**：写操作支持 `Idempotency-Key`（可选）。
7. **内部 API 独立**：Runner API 不放进公开 OpenAPI。

## 2. 基础

- Base path：`/api/v1`
- Content-Type：`application/json`
- 认证：httpOnly session cookie（SameSite=Lax/Secure）；内部 Runner 用 Bearer run token。
- CSRF：同源 SPA + `Origin` 校验；如需跨站，使用 CSRF token。
- 请求 ID：`X-Request-Id`（可选），日志关联。
- 响应压缩：Caddy/Nest 处理。

## 3. 错误

```json
{
  "error": {
    "code": "network_denied",
    "message": "域名不在白名单：example.com",
    "details": {}
  }
}
```

- `code`：稳定 snake_case。
- `message`：用户可读，中文优先。
- `details`：脱敏；不要放 stack/token/原始上游响应。
- HTTP 状态：
  - 400 参数/校验
  - 401 未认证
  - 403 无权限/策略拒绝
  - 404 不存在
  - 409 冲突/状态不允许
  - 422 业务校验
  - 429 限流
  - 500 系统错误

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

## 4. 分页/筛选

```http
GET /api/v1/runs?limit=20&cursor=...&status=failed&siteId=1
```

```json
{
  "items": [],
  "nextCursor": null
}
```

- `limit` 默认 20，最大 100。
- `cursor` 不透明；不要暴露 offset 语义。
- 筛选参数用 camelCase；空值忽略。
- 排序默认 `createdAt desc`；需要时 `sort=...`。

## 5. 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/auth/status` | 是否已初始化/登录 |
| POST | `/api/v1/auth/setup` | 首次创建管理员（仅空库） |
| POST | `/api/v1/auth/login` | 登录 |
| POST | `/api/v1/auth/logout` | 登出 |
| GET | `/api/v1/auth/me` | 当前管理员 |
| POST | `/api/v1/auth/password` | 修改密码 |
| POST | `/api/v1/auth/totp` | 启用/验证 TOTP |
| GET | `/api/v1/auth/sessions` | 会话列表 |
| DELETE | `/api/v1/auth/sessions/:id` | 注销会话 |

## 6. 账号 / YYB

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/yyb/health` | YYB 健康检查 |
| POST | `/api/v1/yyb/sync` | 同步账号 |
| GET | `/api/v1/accounts` | 账号列表 |
| GET | `/api/v1/accounts/overview` | 账号 + 应用 + 积分 + 签到状态 |
| GET | `/api/v1/dashboard` | 首页统计聚合（账号/运行/积分/商品/活动/订单/通知） |
| GET | `/api/v1/accounts/:id` | 账号详情 |
| POST | `/api/v1/accounts/:id/refresh` | 刷新状态 |
| PATCH | `/api/v1/accounts/:id` | 修改账号配置，当前支持 `timeOffsetMinutes`（执行偏移分钟） |
| POST | `/api/v1/accounts/:id/disable` | 停用本地记录 |
| DELETE | `/api/v1/accounts/:id` | 删除本地记录（不删 YYB） |

## 7. 应用 / 网络

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/sites` | 应用列表 |
| POST | `/api/v1/sites` | 创建应用 |
| GET | `/api/v1/sites/:id` | 应用详情 |
| PATCH | `/api/v1/sites/:id` | 更新应用信息 |
| PUT | `/api/v1/sites/:id/network` | 更新网络模式/根 URL/白名单（http/https） |
| GET/PUT | `/api/v1/sites/:id/icon` | 读取本地图标 / 上传图标 |
| GET | `/api/v1/sites/:id/icon-files` | 应用目录内可用图标列表 |
| GET/PUT | `/api/v1/sites/:id/env` | 应用环境变量（青龙兼容） |
| POST | `/api/v1/sites/:id/accounts` | 绑定应用账号 |
| DELETE | `/api/v1/sites/:id/accounts/:accountId` | 解绑应用账号 |
| PATCH | `/api/v1/sites/:id/accounts/:accountId` | 启用/禁用该账号在此应用的自动运行（`disabled`） |
| POST | `/api/v1/sites/:id/accounts/:accountId/refresh` | 只运行该账号在此应用的签到脚本并刷新状态 |
| POST | `/api/v1/sites/:id/scripts/:scriptId/run` | 手动运行应用脚本 |
| GET/POST | `/api/v1/sites/:id/scripts` | 应用内脚本列表 / 添加 |
| PATCH/DELETE | `/api/v1/sites/:id/scripts/:scriptId` | 编辑 / 删除脚本 |
| GET | `/api/v1/app-scripts` | 所有应用脚本总览（含应用、积分名称、上次运行） |
| GET | `/api/v1/sites/:id/script-files` | 脚本文件列表 |
| GET/PUT | `/api/v1/sites/:id/script-files/content` | 读取 / 写入脚本文件 |
| DELETE | `/api/v1/sites/:id/script-files` | 删除脚本文件 |

应用注册信息通过 `Site.registrationMode` 和 `Site.registrationNote` 记录；`registrationMode` 取值 `unknown / none / auto / one_click / manual`，随 `GET /sites` 和 `PATCH /sites/:id` 返回/更新。
| GET | `/api/v1/sites/:id/points` | 积分汇总 |
| GET | `/api/v1/sites/:id/products` | 商品 |
| GET | `/api/v1/sites/:id/activities` | 活动 |

网络配置请求：

> UI 只要求用户填写根 URL（如 `crm.sanfu.com; api.sanfu.com`）；不写协议时自动补 `https://`，显式写 `http://` 会保留。`purpose/pathPrefix/usedBy/required` 是可选的扩展字段。

```json
{
  "mode": "whitelist",
  "rootUrls": [
    {
      "id": "crm",
      "url": "https://crm.sanfu.com",
      "purpose": "登录/签到/积分/商品",
      "pathPrefix": "",
      "usedBy": ["auth", "sign_in", "points", "products"],
      "required": true
    }
  ],
  "allowedOrigins": ["https://crm.sanfu.com"],
  "notes": ""
}
```

## 7.1 文件管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/files/spaces` | 文件空间：用户空间 + 每个订阅源 |
| GET | `/api/v1/files/list?space=&path=` | 目录列表 |
| GET | `/api/v1/files/content?space=&path=` | 读取文本文件 |
| PUT | `/api/v1/files/content` | 新建/保存文本文件 |
| POST | `/api/v1/files/directory` | 新建目录 |
| POST | `/api/v1/files/rename` | 重命名/移动 |
| DELETE | `/api/v1/files?space=&path=` | 删除文件或目录 |
| GET | `/api/v1/files/download?space=&path=` | 下载/预览原始文件 |
| POST | `/api/v1/files/upload` | base64 上传（≤2MB） |

- 文件路径只能是空间内相对路径；拒绝 `..`、绝对路径和符号链接逃逸。
- 用户空间根目录是 `data/apps`；订阅源空间是 `data/sources/<sourceId>`。

## 8. 脚本 / 订阅源

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/script-sources` | 源列表 |
| POST | `/api/v1/script-sources` | 添加源（custom） |
| POST | `/api/v1/script-sources/:id/sync` | 同步 index |
| GET | `/api/v1/script-sources/:id/available` | 可用版本 |
| GET | `/api/v1/scripts` | 已安装 |
| POST | `/api/v1/scripts/:id/install` | 安装指定版本 |
| POST | `/api/v1/scripts/:id/update` | 更新 |
| POST | `/api/v1/scripts/:id/rollback` | 回滚 |
| GET | `/api/v1/scripts/:id/versions` | 版本 |
| PATCH | `/api/v1/scripts/:id` | 启停/更新策略 |

安装请求：

```json
{
  "version": "0.1.0",
  "sourceId": 1
}
```

## 9. 绑定 / 任务

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/bindings` | 绑定列表 |
| POST | `/api/v1/bindings` | 绑定应用+账号+脚本 |
| PATCH | `/api/v1/bindings/:id` | 配置/启停 |
| DELETE | `/api/v1/bindings/:id` | 解绑 |
| GET | `/api/v1/tasks` | 任务列表 |
| POST | `/api/v1/tasks` | 创建任务 |
| PATCH | `/api/v1/tasks/:id` | 修改 cron/超时/重试 |
| POST | `/api/v1/tasks/:id/run` | 手动运行 |
| POST | `/api/v1/tasks/:id/disable` | 停用 |

任务创建：

```json
{
  "bindingId": 1,
  "capability": "sign_in",
  "cron": "43 8 * * *",
  "timezone": "Etc/UTC",
  "timeoutSeconds": 120,
  "maxAttempts": 3,
  "enabled": true
}
```

## 10. 运行 / 日志

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/runs` | 运行列表；始终包含 `starting` / `queued` / `running` |
| GET | `/api/v1/runs/:id` | 运行详情（含日志）；排队中会附带实时 `queue` 信息 |
| POST | `/api/v1/runs/:id/cancel` | 取消（设计） |
| POST | `/api/v1/runs/:id/retry` | 重跑（重新入队） |
| GET | `/api/v1/runs/stream` | SSE 实时运行状态 + 日志 |
| GET | `/api/v1/runs/:id/logs` | 日志分页（设计） |
| GET | `/api/v1/queue` | 队列配置、运行/启动/排队数量和队首任务 |
| PATCH | `/api/v1/queue/config` | 修改队列配置 |

SSE 当前实现为全局流，所有页面共用一条连接：

```text
event: run
data: {"id":"...","status":"running", ...完整 Run 关联数据}

event: log
data: {"id":"...","runId":"...","ts":"...","level":"info","message":"..."}

event: ping
data: {"at":"..."}
```

服务端每 500ms 聚合一次新增/变更的运行和日志，按数据库时间排序后推送；客户端先通过 REST 拉取初始数据，再接收增量。运行状态变化会同时更新列表和详情，日志直接追加到当前选中的运行。

### 运行队列

所有创建 Run 的入口统一走 `QueueService.enqueue()`，返回 Run 字段并附带 `queue`：

```json
{
  "id": "run_...",
  "status": "starting",
  "queue": {
    "position": 0,
    "ahead": 0,
    "running": 0,
    "starting": 1,
    "queued": 0,
    "concurrency": 1,
    "perAccountConcurrency": 1,
    "perSiteConcurrency": 1,
    "willStartImmediately": true,
    "startsAt": "2026-11-17T02:22:11.098Z"
  }
}
```

- `starting`：已分配到执行槽位，等待 Worker 认领（通常会直接显示为启动中）。
- `queued`：排队中；`position` 从 1 开始，`ahead` 为前方排队数量。
- `skipped`：队列已满时跳过，`errorCode` 为 `queue_full`，不计为脚本失败。
- 队列配置键为 `queue.config`：`concurrency`、`perAccountConcurrency`、`perSiteConcurrency`、`runTimeoutMinutes`、`maxQueueSize`。
- `runTimeoutMinutes` 是脚本最长运行时间，默认 2 分钟；应用可设置 `Site.runTimeoutMinutes` 覆盖，留空使用系统值。
- 计划任务按账号 `timeOffsetMinutes` 写入 `Run.notBefore`；`SiteScript.nextRunAt` 和界面上的计划时间不变，只在执行前延迟。

## 11. 积分 / 商品 / 活动

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/points` | 总览 |
| GET | `/api/v1/points/accounts/:id` | 账号积分 |
| GET | `/api/v1/points/lots` | 批次/过期 |
| GET | `/api/v1/products` | 商品列表（`?kind=grab` 抢购） |
| POST | `/api/v1/products/sync` | 立即同步抢购商品（创建 Run） |
| GET | `/api/v1/products/:id` | 商品详情 |
| GET | `/api/v1/activities` | 活动列表 |
| GET | `/api/v1/orders` | 兑换/抢购订单记录 |

> 兑换/抢购 API 在 Phase 3 设计；写操作必须幂等/可人工转交。

## 12. 通知 / 设置

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/notifications` | 通知记录 |
| POST | `/api/v1/notifications/test` | 测试发送 |
| GET | `/api/v1/settings` | 设置（secret 只返回已配置） |
| PATCH | `/api/v1/settings` | 更新设置 |
| GET | `/api/v1/health` | 健康检查 |
| GET | `/api/v1/system/info` | 版本/磁盘/Worker |

## 13. 内部 Runner API

只在 API 应用内部暴露，不写入公开 OpenAPI：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/internal/runner/http` | 网络代理 |
| POST | `/internal/runner/yyb/get-code` | 取码 |
| POST | `/internal/runner/yyb/get-phone` | 手机号 |
| POST | `/internal/runner/session` | 写回 session |
| POST | `/internal/runner/log` | 结构化日志 |

鉴权：短期 run token；绑定 run/account/site/capability；运行结束失效。

## 14. 幂等

- 写操作支持 `Idempotency-Key` header。
- 服务端存 key + 结果（TTL 24h）。
- 重复请求返回相同结果，不重复执行。
- 签到/兑换/抢购任务内部另有幂等键，不依赖客户端。

## 15. 限流

- 登录：按 IP/用户名。
- 普通 API：按会话。
- Runner API：按 run/账号/站点。
- YYB 取码：按账号串行 + 全局预算。
- 返回 `429` + `Retry-After`。

## 16. OpenAPI / 版本

- NestJS Swagger 生成 `/api/docs`（公开 API）。
- 内部 Runner API 不展示。
- 破坏性变更：`/api/v2` 或兼容层；至少保留一个 minor 周期。
- 共享 Zod schema 是单一事实源；前端类型由 shared 导出。
- 变更记录：`CHANGELOG.md` + ADR。

## 17. 封装检查

- Controller 不出现 Prisma 类型。
- 响应 DTO 不包含 `session_enc`/`password_hash`/token。
- `settings` 的 secret 只返回 `{ configured: true }`。
- 日志/错误不包含 code/sid/sessionKey/token/phone/openid。
- 前端不拼 SQL/不直连 DB。
- 脚本不调用公开 API 的写接口；脚本只走 Runner API。
