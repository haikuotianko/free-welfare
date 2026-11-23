# Free Welfare

自托管的微信小程序签到 / 积分 / 兑换自动化平台。

官网：<https://haikuotianko.github.io/free-welfare/> · 脚本源：<https://github.com/haikuotianko/free-welfare-scripts>

每个使用者部署自己的实例和 [YYB-Go-Enhanced](https://github.com/525815266/YYB-Go-Enhanced)；应用和脚本通过应用源分发，维护者审核后发布；平台负责账号、应用、脚本、任务、运行、日志、通知和网络策略。

> **状态：应用脚本执行器（平台/青龙）、应用商店/应用源、应用脚本 cron、文件管理、多应用登录/签到/积分、商品/活动/表单页面已接入；已批量接入 100+ 应用脚本，详见 [应用接入目录](docs/21-app-catalog.md) 和 [应用商店](docs/22-app-store.md)。**  
> 先读 [脚手架状态](docs/17-scaffold-status.md)、[总设计](docs/00-project-design.md) 和 [实现计划](docs/14-implementation-plan.md)。

## 特性

- **自托管**：Docker Compose，ARM64/amd64；不做公开注册的 SaaS。
- **YYB 集成**：同步微信账号/状态，取 `wx.login` code，失效引导重扫。
- **应用管理**：一个应用多个功能脚本；支持应用内脚本文件、参数、cron、环境变量和脚本模式。
- **一功能一脚本**：登录/签到/积分/商品/兑换独立；公共模块（auth/catalog/http）复用。
- **应用商店**：订阅多个应用源，统一搜索、下载、更新应用脚本；下载后在应用详情配置环境变量、账号、cron 和测试。
- **平台时间**：顶部本地时间 + 自动/手动校时；下个脚本倒计时，点击展开按时间排序的应用运行列表，Worker 调度使用同一时间偏移。
- **脚本订阅**：GitHub `index.json` + manifest + bundle + SHA-256；版本/安装/回滚/审核状态（高级脚本源保留）。
- **文件管理**：用户空间 + 每个订阅源空间，浏览/编辑/新建/上传/重命名/删除。
- **积分资产**：余额、即将过期、有效期；每个应用可自定义积分名称和过期规则。
- **商品 / 活动 / 表单**：商品/券同步、积分或积分+金额、库存、限购；账号积分与可兑换状态；活动按应用收纳；通用表单字段供账号填写并用于活动资料。
- **网络策略**：应用级根 URL + 白名单/不限制；脚本只能走 SDK `ctx.http`。
- **PC 优先，移动端友好**：桌面侧边栏/多列；手机底部导航/卡片。
- **可观测**：运行记录、日志、错误码、活动/兑换/通知记录、Server酱通知。
- **开源**：MIT；贡献指南、安全策略、ADR、脚本审核流程。

## 部署方式

| 方式 | 适合 | 入口 |
| --- | --- | --- |
| Windows 安装包 | Windows 用户，最省事 | [Releases](https://github.com/haikuotianko/free-welfare/releases) · [说明](deploy/windows/README.md) |
| NAS / Docker | 群晖、飞牛 fnOS、威联通、TrueNAS、Unraid、极空间、绿联、服务器 | [部署文档](docs/26-deployment.md) |
| macOS / Linux | 需要 Node.js 22+ | [部署文档](docs/26-deployment.md) |
| 开发者 / npm | 二次开发、自管 PostgreSQL | [部署文档](docs/26-deployment.md) |

> 所有原生方式都自带内置 PostgreSQL，不需要单独安装数据库；YYB 仍需单独部署。生产实例（NAS）和本地开发实例请使用独立数据库、数据目录和微信账号；更新与冲突说明见 [26 部署方式](docs/26-deployment.md)。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | Vue 3 + TypeScript + Vite + TailwindCSS + Pinia |
| API | NestJS + Fastify + Prisma + PostgreSQL 16 |
| 队列/调度 | PostgreSQL 轮询 + 应用脚本 cron（pg-boss 预留） |
| Worker | NestJS standalone + Node 22 `worker_threads` + `vm` |
| 脚本构建 | esbuild；官方源可依赖，custom 禁用 dependencies/require |
| 部署 | Docker Compose + Caddy；Windows/macOS/Linux 原生启动器 |
| 通知 | Server酱（首期） |

## 项目结构

```text
apps/
  api/        NestJS API
  web/        Vue 3 前端
  worker/     调度 + 脚本执行
packages/
  shared/     Zod/DTO/错误码/常量
  domain/     纯领域逻辑
  db/         Prisma schema/client/repositories
  sdk/        脚本 SDK
analysis/     小程序解包/接口/积分/加密/根 URL
docs/         设计/实现/开源文档
site/         官网静态页（GitHub Pages）
deploy/       Docker/Compose/Caddy/Windows/macOS/Linux/native
```

详细边界见 [13 项目结构与封装](docs/13-project-structure.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [00 总设计](docs/00-project-design.md) | 需求、架构、脚本、网络、部署、安全、开源、路线图 |
| [01 产品范围](docs/01-product-scope.md) | 目标、非目标、用户旅程 |
| [02 微信自动化调研](docs/02-wechat-automation-research.md) | WMPFDebugger、KillWxapkg、YYB、抓包案例 |
| [03 架构设计](docs/03-architecture.md) | 技术栈、组件、数据流、部署 |
| [04 数据模型](docs/04-domain-and-data-model.md) | 实体、积分账本、幂等 |
| [05 脚本系统](docs/05-script-system.md) | manifest、SDK、运行时、订阅 |
| [06 界面设计](docs/06-ui-ux.md) | 信息架构、页面规格 |
| [07 路线图](docs/07-roadmap-and-questions.md) | 阶段、验收、问题 |
| [08 三福脚本](docs/08-sanf-adapter.md) | 接口、流程、错误映射 |
| [09 脚本运行时](docs/09-script-runtime.md) | worker/vm、依赖、HTTP 代理 |
| [10 界面与功能](docs/10-ui-feature-plan.md) | PC/移动页面、功能优先级 |
| [11 脚本结构](docs/11-script-structure.md) | 一功能一脚本、公共模块 |
| [12 网络策略](docs/12-network-policy.md) | 根 URL、白名单、SDK 请求 |
| [13 项目结构](docs/13-project-structure.md) | monorepo、模块边界、封装 |
| [14 实现计划](docs/14-implementation-plan.md) | 阶段任务、DoD、发布 |
| [15 开源治理](docs/15-open-source.md) | 许可、版本、贡献、安全 |
| [16 API 设计](docs/16-api-design.md) | 公共/内部 API、错误、分页、幂等 |
| [17 脚手架状态](docs/17-scaffold-status.md) | 已落地/占位/如何运行/下一步 |
| [18 配置文件](docs/18-configuration.md) | 项目/YYB/PostgreSQL 配置位置 |
| [19 脚本 SDK](docs/19-script-sdk.md) | ctx 全量接口、错误、青龙模式、host 桥接 |
| [20 脚本开发指南](docs/20-script-development-guide.md) | 从零写脚本、调试、发布订阅源 |
| [21 应用接入目录](docs/21-app-catalog.md) | 已接入应用、批量导入、待处理项 |
| [22 应用商店与应用源](docs/22-app-store.md) | 应用源格式、应用包、下载/更新、本机源 |
| [23 平台时间与下个任务倒计时](docs/23-platform-clock.md) | 本地时间、自动/手动校时、下次运行倒计时 |
| [24 账号表单与活动资料](docs/24-account-forms.md) | 表单模板、账号真实数据、活动资料 |
| [26 部署方式](docs/26-deployment.md) | Docker、Windows、macOS、NAS、npm、systemd |
| [文档索引](docs/README.md) | 全部文档入口 |
| [小程序分析](analysis/README.md) | 解包工具、分析包模板、案例文档 |
| [官网源码](site/index.html) | GitHub Pages 静态官网 |
| [决策记录](docs/decisions.md) | ADR |
| [变更记录](CHANGELOG.md) | 版本变更 |

## 首期目标

1. 部署后连接自己的 YYB，同步微信账号。
2. 创建一个应用，安装登录/签到/积分脚本，完成 code 登录 + 签到 + 积分。
3. PC 端看全局/日志，手机端看今日签到、失败原因、积分。
4. 脚本从 GitHub 订阅源安装/更新，版本可回滚。
5. 运行日志可查，失败通过 Server酱通知。
6. ARM64 NAS 上 Docker Compose 可运行。

## 开发（Phase 0 目标）

```bash
pnpm install
cp deploy/compose/.env.example .env
docker network inspect qinglong_default >/dev/null 2>&1 || docker network create qinglong_default
docker compose -f deploy/compose/docker-compose.yml up -d postgres
pnpm db:migrate
pnpm import:apps -- --bind-all   # 可选：导入 data/apps 下的应用清单
pnpm build:app-source            # 可选：生成 data/app-store 本机应用源
pnpm dev
```

> 开发环境默认连接本机 PostgreSQL；首次运行前先执行迁移。
>
> 没有 pnpm 也可以用 npm 部署：`npm ci && npm run npm:build && npm install --prefix deploy/native && npm start`，详见 [26 部署方式](docs/26-deployment.md)。

## 边界

只用于操作本人已授权的账号；不提供批量注册、接码、伪造身份、绕过验证码/风控、自动支付。平台规则、账号风险和当地法律由使用者自行承担。详见 [01 产品范围](docs/01-product-scope.md)。

## 许可证

[MIT](LICENSE)
