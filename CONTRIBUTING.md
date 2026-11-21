# 贡献指南

感谢参与 Free Welfare。本文说明本地开发、代码结构、PR 和脚本贡献流程。

> 项目仍在设计/脚手架阶段；以下命令以 Phase 0 目标结构为准，落地后保持同步。

## 1. 环境

- Node.js 22 LTS
- pnpm 9+
- Docker + Docker Compose v2
- PostgreSQL 16（或 Docker）
- Git

## 2. 本地启动

```bash
git clone https://github.com/<your-org>/free-welfare.git
cd free-welfare
pnpm install
cp deploy/compose/.env.example .env
# 编辑 .env：数据库、APP_ENCRYPTION_KEY、YYB 地址/token
docker compose -f deploy/compose/docker-compose.yml up -d postgres
pnpm db:migrate
pnpm dev
```

开发服务：

```bash
pnpm dev:api      # NestJS API
pnpm dev:web      # Vue 3
pnpm dev:worker   # Worker
```

首次打开 Web：

1. 创建管理员。
2. 配置 YYB 地址 + integration token。
3. 在 YYB 控制台扫码添加微信账号。
4. 同步账号。
5. 创建/选择三福应用。
6. 安装/绑定脚本。
7. 手动运行。
8. 配置 Server酱。

## 3. 目录

```text
apps/api        NestJS API
apps/web        Vue 3 + Tailwind
apps/worker     调度 + 脚本执行
packages/shared DTO/Zod/错误码
packages/domain 纯领域逻辑
packages/sdk    脚本 SDK
analysis/       小程序分析文档
docs/           设计文档
deploy/         Docker/Compose/Caddy
```

详细边界见 [docs/13-project-structure.md](docs/13-project-structure.md)。

## 4. 代码规范

- TypeScript strict；避免 `any`。
- ESLint + Prettier；提交前 `pnpm lint`。
- 模块公共 API 只从 `index.ts` 导出；禁止跨模块深路径导入。
- Controller 不写 Prisma；Service/Repository 分层。
- 网络请求：后端用统一 client；脚本只用 `ctx.http`。
- 日志统一 pino；不要 `console.log` 敏感数据。
- 错误用统一 `AppError`/错误码；不要抛裸字符串。

## 5. 测试

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

PR 必须通过 CI；关键路径（登录/签到/积分/网络策略/脚本运行时）需要测试。

## 6. 提交与 PR

- 分支：`feat/...`、`fix/...`、`docs/...`。
- Commit：Conventional Commits，例如：
  - `feat(api): add site network policy`
  - `fix(worker): retry only network errors`
  - `docs(script): document sanf getPoint`
- PR 小而聚焦；描述：
  - 做了什么/为什么；
  - 测试方式；
  - 影响范围/迁移；
  - 截图（UI）。
- 不直接 push `main`；至少 1 个维护者审核。

## 7. 脚本贡献

脚本仓库建议独立：`free-welfare-scripts`。

```text
scripts/<app>/<function>/
  manifest.json
  adapter.ts
  README.md
  tests/
```

步骤：

1. 读 `analysis/packages/<app>/docs/`。
2. 一功能一脚本；公共逻辑放 `common/`。
3. manifest 声明 `capability`、`allowed_domains`、依赖、配置 schema。
4. 只通过 `ctx.http`/`ctx.yyb`/`ctx.session` 访问外部。
5. 写幂等/错误处理/测试。
6. 提 PR；CI + 维护者审核。

审核清单见 [docs/15-open-source.md](docs/15-open-source.md)。

## 8. 分析贡献

- 复制 `analysis/packages/_template/`。
- 填 `metadata.yaml`（名称/AppID/图标/根 URL/加密/登录/积分/商品/活动）。
- 解包文件放 `unpacked/`（gitignore）。
- 脱敏 HAR 放 `fixtures/`（gitignore）。
- 文档区分“已验证/待确认”。
- 不提交解包代码/真实账号/token/手机号。

## 9. 安全

- 漏洞不要公开 Issue；见 [SECURITY.md](SECURITY.md)。
- 不提交 `.env`、`data/`、HAR、wxapkg、真实凭据。
- 脚本 PR 视为代码执行，按 [docs/09-script-runtime.md](docs/09-script-runtime.md) 审核。

## 10. 许可证

贡献即同意按 MIT License 发布。见 [LICENSE](LICENSE)。
