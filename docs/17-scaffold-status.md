# 17 脚手架状态（Phase 0）

本文记录当前脚手架实际落地的内容、如何运行、哪些是占位。

## 1. 已落地

### 1.1 Monorepo

```text
apps/api      NestJS + Fastify API
apps/worker   NestJS standalone + 轮询 Runner
apps/web      Vue 3 + Vite + TailwindCSS
packages/shared  Zod schema / DTO / 常量
packages/domain  URL 白名单 / 积分 FIFO / 测试
packages/db      Prisma schema / client / migration
packages/sdk     脚本 Context / defineAdapter / 错误
```

### 1.2 API

已实现：

- `GET /api/v1/health`（含数据库检查）
- `GET /api/v1/auth/status`
- `POST /api/v1/auth/setup`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET /api/v1/settings` / `PATCH /api/v1/settings`
- `GET /api/v1/yyb/health` / `POST /api/v1/yyb/sync`
- `POST /api/v1/yyb/qr` / `GET /api/v1/yyb/qr/:sessionId`（YYB 扫码添加账号）
- `GET /api/v1/accounts` / `POST /api/v1/accounts/:id/refresh` / `PATCH /api/v1/accounts/:id`（执行偏移）
- `GET /api/v1/accounts/overview`（账号 + 应用 + 积分 + 签到状态）
- `GET /api/v1/dashboard`（首页统计聚合）
- `GET/POST /api/v1/sites` / `GET/PATCH/DELETE /api/v1/sites/:id` / `PUT /api/v1/sites/:id/network`
- `GET/POST /api/v1/sites/:id/scripts` / `PATCH/DELETE /api/v1/sites/:id/scripts/:scriptId`
- `GET /api/v1/sites/:id/script-files` / `GET/PUT /api/v1/sites/:id/script-files/content` / `DELETE /api/v1/sites/:id/script-files`
- `GET/PUT /api/v1/sites/:id/icon` / `GET /api/v1/sites/:id/icon-files`
- `GET/PUT /api/v1/sites/:id/env`
- `POST /api/v1/sites/:id/accounts` / `DELETE /api/v1/sites/:id/accounts/:accountId`
- `POST /api/v1/sites/:id/scripts/:scriptId/run`
- `GET /api/v1/queue` / `PATCH /api/v1/queue/config`
- `GET /api/v1/points`
- `GET /api/v1/products`
- `POST /api/v1/products/sync`（抢购立即同步）
- `GET /api/v1/activities` / `POST /api/v1/activities/:id/participate`
- `GET /api/v1/orders`
- `GET /api/v1/notifications`
- `GET /api/v1/files/spaces` / `GET /api/v1/files/list`
- `GET/PUT /api/v1/files/content` / `POST /api/v1/files/directory` / `POST /api/v1/files/rename`
- `DELETE /api/v1/files` / `GET /api/v1/files/download` / `POST /api/v1/files/upload`
- `GET /api/v1/scripts` / `GET /api/v1/scripts/:id` / `GET /api/v1/scripts/:id/versions`
- `POST /api/v1/scripts/:id/install` / `POST /api/v1/scripts/:id/update` / `POST /api/v1/scripts/:id/rollback` / `PATCH /api/v1/scripts/:id`
- `GET/POST /api/v1/script-sources` / `POST /api/v1/script-sources/:id/sync` / `GET /api/v1/script-sources/:id/available`
- `GET/POST /api/v1/bindings` / `PATCH/DELETE /api/v1/bindings/:id`
- `GET/POST /api/v1/tasks` / `POST /api/v1/tasks/:id/run`
- `GET /api/v1/runs` / `GET /api/v1/runs/:id` / `POST /api/v1/runs/:id/retry` / `POST /api/v1/runs/:id/action`（一键注册等后续动作）
- `GET /api/v1/notifications` / `POST /api/v1/notifications/test`

安全：

- 首次创建管理员，之后不可重复 setup
- scrypt 密码哈希
- httpOnly session cookie + DB session
- `SessionGuard`
- 设置里的 YYB/Server酱 token AES-256-GCM 加密
- 日志/响应不返回 secret

### 1.3 Worker

- 启动后每 1 秒轮询可执行 Run；按全局/单账号/单应用并发限制 claim
- 原子 claim，写 `RunLog`；脚本超过执行超时自动终止并标记 `timeout`
- 已支持应用脚本运行：`worker_threads` + `vm`，平台模式注入 SDK `ctx`，青龙模式注入应用环境变量与 `process.env`
- 应用脚本从 `data/apps/<siteKey>/scripts/<filePath>` 加载；支持相对模块、SDK `ctx`、HTTP 白名单、YYB、缓存、日志、商品/抢购、积分、活动、订单、通知、产物、状态、会话
- 应用脚本支持 cron（5 段）按绑定账号自动创建 Run；订阅源 bundle 运行走 `Run.scriptVersion`
- 计划任务按账号 `timeOffsetMinutes` 写入 `Run.notBefore` 延迟执行，不改变 `SiteScript.nextRunAt` 和界面计划时间
- 签到脚本会写入 `activities`；签到后不再自动同步商品
- 商品/抢购脚本默认停用，避免测试期持续请求；需要时手动运行或在应用详情启用
- 运行超时/异常会写 `Run.errorCode` / `errorMessage` / `summary`

### 1.4 Web

页面：

- 首次初始化 / 登录
- 总览（统计卡片可点击跳转；多应用积分只显示总数）
- 账号（同步 YYB、扫码添加微信账号、顶部用户筛选、按账号显示应用/积分/签到；账号卡片显示账号状态，不可用时点击状态标签刷新；配置弹窗管理执行偏移和表单资料；下方应用可收起；应用列表带全部/待运行/成功/失败/禁用筛选和分页，每个应用可单独刷新状态、单独启用/禁用自动运行；签到成功/失败可查看日志，失败可重试；订阅/取消订阅应用；表单资料填写）
- 应用（创建、详情、编辑信息、图标（在线/应用目录/上传）、脚本模式（平台/青龙）、注册方式与注册说明、应用配置 JSON、环境变量、网络配置（只填根 URL，http/https）、删除）
- 应用商店（订阅多个应用源、查看全部源应用、搜索、下载/更新、更新检测、可选绑定账号/启用脚本）
- 顶部本地时间 + 下一次脚本倒计时（点击展开按时间排序的应用列表）；时间设置页支持自动校时网址和手动设置
- 应用详情右侧页面导航（应用信息/环境变量/网络配置/应用脚本/脚本文件/应用账号），点击平滑滚动到对应分区并高亮；返回按钮使用浏览器后退，直接打开时回到应用列表
- 应用脚本（名称/简介/文件/参数/可视化定时/启用/编辑/删除/运行）+ 脚本文件查看/新建/编辑/删除
- 应用账号（绑定/解绑微信账号，脚本按账号运行）
- 应用注册状态：支持“无需注册 / 自动注册 / 支持一键注册 / 需手动注册 / 未确认”；应用卡片和详情显示标签，详情可编辑注册说明。手动注册清单见 [25 应用注册状态](25-registration-status.md)。
- 表单配置（自定义字段：名称/key/类型/默认值/备注；账号可填写多套表单）
- 文件管理（用户空间 + 每个订阅源空间；浏览、查看、编辑、新建文件/目录、上传、重命名、删除、图片预览、下载；文件类型着色和 VS Code 风格编辑器）
- 商品 / 兑换（商品/券、积分价格、积分+金额、库存、限购、活动时间；账号积分与可兑换状态、商品名称/类型/状态筛选、可兑换筛选、分页、可选小程序码）
- 活动 / 任务（按应用分组、紧凑列表，分组默认收起、点击展开；签到/打卡活动不在活动页展示；类型与同步时间在应用头部；账号已保存表单自动带入；脚本通过 SDK 定义参加表单，点击“参加”排队运行；未解析接口的活动提示手动参与并显示应用小程序码）
- 兑换记录（脚本产生的订单）
- 通知记录（Server酱/脚本通知）
- 运行（应用筛选、账号名区分、列表/详情/日志/错误详情/重跑/一键注册；显示排队序号、前方数量、启动/运行/排队实时状态；运行中自动刷新并滚动日志；手机端日志弹窗）
- 一键注册支持弹窗表单：脚本在 `details.formSchema` 声明字段后，运行详情和账号页会弹出注册表单，提交内容通过 `ctx.input` 传入下一次 Run。
- 设置（YYB、脚本源、Server酱、运行队列并发/执行超时/队列上限、测试通知、时间/表单/SDK 文档入口）
- SDK 文档（独立页面 `/sdk`：Context、日志/错误详情、YYB、HTTP、商品/积分/订单、活动表单、返回值）

布局：

- PC 侧边栏 + 内容区
- 手机底部 8 Tab
- 浅色/深色切换

### 1.5 数据库

`packages/db/prisma/schema.prisma`：

- Admin / Session
- WechatAccount / Site / SiteScript / SiteEnvVar / SiteAccount
- PointAccount / PointLot / PointTransaction
- Product / Activity / Order
- ScriptSource / Script / ScriptVersion
- Binding / Task / Run / RunLog
- Setting / Notification / AuditLog

初始迁移：

```text
packages/db/prisma/migrations/0001_init/migration.sql
```

脚本存储约定：

- DB（`Script`/`ScriptVersion`）存身份、版本、manifest、hash、review、`bundle_path` 相对路径。
- 代码本体放 `data/scripts/<script>/<version>/`；依赖放 `data/deps/<depsHash>/`。
- 不把 JS bundle 存 DB；`data/` 是 Docker 持久化卷。
- 用户文件空间：`data/apps/<siteKey>/...`（脚本、图标、应用文件）。
- 订阅源文件空间：`data/sources/<sourceId>/...`，每个脚本源一个目录。
- 文件管理页从这两个根目录浏览；`SiteEnvVar` 值 AES-256-GCM 加密存储。
- 运行产物：`data/artifacts/<runId>/`；缓存：`data/cache/`；脚本状态：`data/state/<siteId>/<siteAccountId>.json`。

## 2. 如何运行

### 2.1 本地

```bash
pnpm install
pnpm db:generate
cp deploy/compose/.env.example .env
# 启动 PostgreSQL（本机或 Docker）
pnpm db:migrate
pnpm dev
```

开发地址：

- Web：`http://localhost:5173`
- API：`http://localhost:3000`
- Vite 已代理 `/api` 到 API

> 开发态说明：NestJS 的 DI 依赖 `emitDecoratorMetadata`，而 `tsx`/esbuild 不生成 `design:paramtypes`。所以 API/Worker 的 `dev` 用 `tsc --watch + node --watch`，不要改回 `tsx watch src/main.ts`。

### 2.2 Docker

```bash
cp deploy/compose/.env.example deploy/compose/.env
docker network inspect yyb-go >/dev/null 2>&1 || docker network create yyb-go
docker compose -f deploy/compose/docker-compose.yml up -d --build
```

打开 `http://localhost`。

> 首次启动 API 会执行 `prisma migrate deploy`。

## 3. 当前占位/未实现

| 项 | 状态 |
| --- | --- |
| 应用脚本执行器 | 已接入 `worker_threads + vm`；支持平台 SDK / 青龙模式 |
| 订阅源脚本 | index 同步、bundle 下载、安装/更新/回滚已接入；依赖安装未接 |
| 应用脚本 cron | 已接入 5 段 cron，默认按本地时区（服务器/浏览器时区），按绑定账号自动创建 Run；支持可视化定时编辑 |
| 运行队列 | 已接入数据库队列：全局/单账号/单应用并发、执行超时（应用可覆盖）、队列上限、账号时间偏移；pg-boss 未接入 |
| 三福脚本包 | 已落地 `login.js` / `sign-in.js` / `points.js` / `products.js` / `grab.js` / `exchange.js`；商品/抢购脚本当前停用 |
| 积分/商品/活动聚合 API | 积分、商品、活动列表与活动参加已实现 |
| 任务级 cron | Task 表有字段；调度器目前只处理应用脚本 cron |
| 内部 Runner API | 未使用；worker 通过 RPC 直接在进程内调用宿主能力 |
| 网络代理 | worker 已实现应用白名单 HTTP 代理；API 侧 `/internal/runner/http` 未接 |
| Server酱事件通知 | 脚本 `ctx.notify` 已接；任务失败自动通知未接 |
| TOTP/限流/审计 | 未实现 |
| `packages/config` | 暂缓；当前用根 tsconfig/tailwind |

## 4. 已验证 / 未验证

已验证：

- `pnpm install`
- `pnpm db:generate`
- `pnpm build`
- `pnpm typecheck`
- `pnpm test`（domain 6 个 + SDK 7 个测试）
- `prisma validate`（schema 有效）
- 初始 migration SQL 已生成
- 实际 PostgreSQL 迁移已应用；`/api/v1/health` 返回 `database: ok`
- API 可启动；`/` 与 `/api/v1/health` 可访问；SPA fallback 正常
- YYB 真实连接：`/health`、`/integration/module-manifest.json`、`/integration/accounts` 均为 200
- YYB 账号同步返回 1 个 `alive` 账号
- 管理员初始化/登录、应用账号绑定、文件管理、应用脚本运行 UI 流程
- 应用脚本 smoke：平台模式返回结果、青龙模式注入 `process.env`
- Runner 宿主：HTTP 白名单请求、缓存、状态、商品/抢购、积分、活动、订单
- 三福真实登录：YYB 取 code → CRM `wxMiniAppLogin` → session 加密保存
- 三福福币：同步余额 148、即将过期 19、截止 2026-12-31
- 三福商品：真实同步 2 个券商品（400/800 福币、库存、限购、活动时间）
- 三福兑换：预检余额/状态/时间段/库存，默认不提交；`--confirm` 才执行
- 三福签到：已签到识别（服务端 10001）并返回 `alreadyDone`
- 签到活动：写入 `sanf.daily_sign`，活动页显示进度 1/1
- 多账号：账号页展示每个应用账号的积分和今日签到状态；顶部可切换当前账号，积分/运行/订单/首页按账号过滤
- 首页聚合：今日运行/成功率、积分、商品/抢购库存、账号、应用/脚本、活动、订单、通知、下次定时
- 多应用积分按 `pointsName` 分组展示（福币/巢币/奇豆等不混加）；应用列表支持搜索，显示脚本数/账号数- 三福抢购：同步 2 个抢购商品；抢购页默认手动刷新，可选 3-60 秒自动刷新，不后台轮询上游
- 通知/兑换记录页面已接入列表 API
- 运行失败自动生成通知；Worker 重启会回收遗留 running Run
- 404 页面和首页积分/商品/活动统计
- 应用脚本 cron：`43 8 * * *` / `0 9 * * *` 已计算 `nextRunAt`
- 应用级积分别名：`Site.pointsName` 默认“积分”；三福数据设为“福币”。统计默认显示“积分”，选中账号后按应用显示“福币”
- 多应用通用性：创建/修改/删除临时应用并设置积分别名“金币”“成长值”通过；商品/抢购脚本停用，无后台商品 API 轮询
- 重新跑通真实流程：登录成功、积分同步 185、签到返回“今天已签到，已连签 3 天”；账号页显示今日已签到，运行页可查日志
- 批量导入 16 个应用（`pnpm import:apps -- --bind-all`），创建应用、根 URL、脚本、环境变量并绑定测试账号；详见 [21 应用接入目录](21-app-catalog.md)
- 11 个新应用签到成功：浓五的酒馆、风云再起、天牛旧衣、大参林、金巴厘、绿鼻子、五个女博士、爱玛、雀巢、华住、比亚迪海洋
- 待处理：Babycare 接口 401、飞鹤任务接口失败、好人家不符合条件；爱裹注册需用户点击一键注册；创维 RSA 配置与 token 过期重登已修复
- 新增 BLUE DASH 布鲁大师签到（`bluedash`）、CASETiFY（`casetify`）、活力伊利（`hlyili`）、铛铛一下（`ddyx`）、国乐酱酒（`gyjj`）、顾家家居（`gujiajiaju`）、海天美味馆（`haitian`）、洽洽会员俱乐部（`qqhyjlb`）；新增 `analysis/tools/wechat/fetch-mini-program.ps1`，按名称搜索/打开小程序、等待包下载并关闭窗口，支持同名结果选择和 AppID 校验、缓存跳过
- 青龙脚本批量接入：`gujiajiaju`、`qqhyjlb` 用 YYB 手机号授权自动注册成功；`haitian` 手机号授权登录成功；`ajier`、`baimazhixuan`、`dks`、`guyu`、`fafa`、`haier` 卡在注册/授权/签名，脚本暂停用；已批量抓取 `ddyx`、`fafa`、`gyjj`、`haitian`、`qqhyjlb`、`gujiajiaju`、`haier` 等包，进度见 [23 青龙脚本接入进度](23-qlscript-integration.md)
- 新增 `GET /api/v1/app-scripts` 和脚本页“应用脚本”总览；首页显示应用脚本数；应用列表显示积分别名/脚本数/账号数
- 积分页默认隐藏没有积分数据的应用，可手动展开
- 运行日志自动脱敏手机号和 JWT；空环境变量加密存储/读取已修复
- 解包本机 13 个小程序；爱玛新增积分/积分商品/会员任务脚本（商品/任务默认停用），浓五的酒馆和金巴厘新增积分脚本；商品页增加状态筛选
- `docker compose config` 语法通过
- 最新小程序复测：麦富迪改用 `authorizeV2` 的 `status/phone/accessToken`（不再依赖 `memberId`），签到成功并启用；顺丰改用 `integralSignV2Service~sign` 并补齐 H5 会话 Cookie，签到成功并启用；杰士邦改用新版有赞店铺 AppID `wxacda8953c4c431bc`，签到成功并启用；上美广场改用新版单商场 AppID `wxd63e2335d44317ea`，签到成功并启用；汤星球签到活动已结束、米其林分享任务已移除、美孚仍要求完善资料，保持停用；海澜之家找到新版包 `wx3c0de42fb467063e` 待接入
- `ctx.http` 响应新增 `setCookies`，解决多条 `Set-Cookie` 只保留最后一条的问题

未验证：

- Docker 镜像构建/多架构（本机 Docker Engine 未运行）
- 订阅源 index 同步/安装与 bundle 运行
- cron 自动调度

## 5. 下一步（Phase 1）

1. 订阅源依赖安装、签名/审核策略与安装 UI 完善。
2. 任务级 cron 调度 + 任务创建 UI。
3. 接入第二个应用脚本，验证多应用脚本、积分别名和能力隔离。
4. 活动聚合 API 与页面、商品兑换流程。
5. 通知自动触发、审计日志、TOTP/限流。
6. 首页/积分页显示真实积分数据。
7. 任务失败自动 Server酱。
