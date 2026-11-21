# 18 配置文件与 PostgreSQL

本文说明当前项目、YYB 和 PostgreSQL 的配置在哪里、怎么改。

## 1. 本项目配置

### 1.1 模板

```text
N:\myProject\free-welfare\deploy\compose\.env.example
```

这是模板，不含真实密钥；不要直接改它来部署。

### 1.2 本地开发

复制到项目根目录：

```bash
cp deploy/compose/.env.example .env
```

路径：

```text
N:\myProject\free-welfare\.env
```

API/Worker 会依次查找：

```text
当前目录/.env
../../.env
```

本地开发时 `DATABASE_URL` 用本机 PostgreSQL：

```env
DATABASE_URL=postgresql://welfare:change-me@127.0.0.1:5432/welfare?schema=public
```

### 1.3 Docker Compose

复制到 compose 目录：

```bash
cp deploy/compose/.env.example deploy/compose/.env
```

路径：

```text
N:\myProject\free-welfare\deploy\compose\.env
```

原因：`docker-compose.yml` 里的 `env_file: .env` 是相对 compose 文件目录解析的。

Docker 内 `DATABASE_URL` 用服务名：

```env
DATABASE_URL=postgresql://welfare:change-me@postgres:5432/welfare?schema=public
```

### 1.4 当前生效的变量

| 变量 | 用途 |
| --- | --- |
| `NODE_ENV` | `development` / `production` |
| `APP_URL` | 外部访问地址；HTTPS 时 cookie 才加 Secure |
| `APP_PORT` | API 端口，默认 3000 |
| `APP_ENCRYPTION_KEY` | 加密 YYB/Server酱 token；32 字节 base64 |
| `AUTH_SESSION_SECRET` | 会话 cookie 签名；生产必须强随机 |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | PostgreSQL 初始化 |
| `DATABASE_URL` | Prisma 连接串 |
| `YYB_BASE_URL` | YYB 地址 |
| `YYB_INTEGRATION_TOKEN` | 平台同步账号/取码 |
| `YYB_PROTOCOL_TOKEN` | 扫码添加账号、手机号/operateWxData 等协议调用 |
| `SCRIPT_SOURCE_URL` | 官方脚本 index.json |
| `SERVERCHAN_TOKEN` | 通知（也可在 Web 设置里填，设置优先） |

> `WORKER_CONCURRENCY`、`RUNNER_*`、`SCRIPT_SOURCE_TRUST`、`YYB_HEALTHCHECK_INTERVAL_SECONDS` 目前是预留，代码尚未全部使用。

### 1.5 生成密钥

```bash
openssl rand -base64 32
```

分别填：

```env
APP_ENCRYPTION_KEY=...
AUTH_SESSION_SECRET=...
```

不要把 `.env` 提交到 Git。

## 2. PostgreSQL 配置

### 2.1 Docker Compose（推荐）

`deploy/compose/docker-compose.yml` 的 `postgres` 服务：

```yaml
environment:
  POSTGRES_USER: ${POSTGRES_USER:-welfare}
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-welfare}
  POSTGRES_DB: ${POSTGRES_DB:-welfare}
volumes:
  - pgdata:/var/lib/postgresql/data
ports:
  - '127.0.0.1:5432:5432'
```

- `pgdata` 是 Docker 命名卷，数据不在项目目录。
- 5432 只绑定本机，方便宿主跑 `prisma migrate`/`studio`；不需要可删。
- 修改 `POSTGRES_PASSWORD` 只对**新初始化的数据卷**生效；已有卷不会自动改密码。

### 2.2 初始化

```bash
cp deploy/compose/.env.example deploy/compose/.env
# 编辑 POSTGRES_* 和 DATABASE_URL
docker compose -f deploy/compose/docker-compose.yml up -d postgres
```

执行迁移：

```bash
# 宿主机（需要 DATABASE_URL 指向 127.0.0.1）
pnpm db:migrate

# 或者让 api 容器启动时自动执行（compose 已配置）
docker compose -f deploy/compose/docker-compose.yml up -d api
```

### 2.3 查看/连接

```bash
docker compose -f deploy/compose/docker-compose.yml exec postgres \
  psql -U welfare -d welfare
```

查看配置文件/数据目录：

```sql
SHOW config_file;
SHOW hba_file;
SHOW data_directory;
```

PostgreSQL 官方镜像默认：

```text
/var/lib/postgresql/data/postgresql.conf
/var/lib/postgresql/data/pg_hba.conf
```

一般不需要手改；改用户/密码/库名优先用 `.env`。

### 2.4 修改已有数据库密码

不要只改 `.env` 再重启。进入数据库：

```sql
ALTER USER welfare WITH PASSWORD 'new-password';
```

然后同步修改 `.env` 的 `POSTGRES_PASSWORD` 和 `DATABASE_URL`。

### 2.5 备份

```bash
docker compose -f deploy/compose/docker-compose.yml exec postgres \
  pg_dump -U welfare welfare > backup.sql
```

恢复：

```bash
cat backup.sql | docker compose -f deploy/compose/docker-compose.yml exec -T postgres \
  psql -U welfare -d welfare
```

## 3. YYB 配置

YYB 是**你自己部署的独立服务**，本项目不读它的数据库，只通过 `/integration/*` 和 `/wxapp/*` 调用。

### 3.1 Docker Compose 部署

在 YYB 项目根目录：

```text
<你的 YYB 目录>/.env
```

首次：

```bash
cd <你的 YYB 目录>
cp .env.example .env
# 编辑
docker compose up -d
```

常用变量：

```env
YYB_PORT=8000
YYB_BIND_ADDRESS=0.0.0.0
YYB_AUTH_DRIVER=sqlite
YYB_AUTH_DSN=
YYB_ADMIN_USER=
YYB_ADMIN_PASSWORD=
YYB_COOKIE_SECURE=false
YYB_PROTOCOL_TOKEN=
YYB_INTEGRATION_TOKEN=
YYB_ACCOUNT_LINK_KEY=
```

- `YYB_AUTH_DRIVER=sqlite`：默认，数据在 YYB 的 `data/db`。
- `YYB_AUTH_DRIVER=mysql`：需要 `YYB_AUTH_DSN`。
- `YYB_PROTOCOL_TOKEN`：保护 `/wx/*`、`/wxapp/*`。
- `YYB_INTEGRATION_TOKEN`：保护 `/integration/*`，平台用它同步账号/取码。
- `YYB_ACCOUNT_LINK_KEY`：授权短链接加密密钥，正式使用要设置并保持。
- `YYB_COOKIE_SECURE=true`：只有 HTTPS 时设置。

### 3.2 平台侧对应配置

在本项目 `.env`：

```env
YYB_BASE_URL=http://yyb-go:8000
YYB_INTEGRATION_TOKEN=<和 YYB 的 YYB_INTEGRATION_TOKEN 相同>
YYB_PROTOCOL_TOKEN=<和 YYB 的 YYB_PROTOCOL_TOKEN 相同>
```

- 同 Docker 网络：`http://yyb-go:8000`。
- 不同机器：`http://<NAS/IP>:8000`。
- 不要把 YYB 暴露公网；至少用内网/VPN/防火墙。

### 3.3 扫码

YYB 控制台：

```text
http://<yyb-host>:8000/scan
```

扫码后回平台：

```text
账号 → 同步账号
```

平台不做扫码协议，只同步账号。

### 3.4 验证 YYB 版本/接口

项目自带检查脚本：

```bash
pnpm check:yyb
# 或指定地址
node tools/check-yyb.mjs http://<YYB_HOST>:8000
```

它会检查：

- `/health`
- `/integration/module-manifest.json`
- `/integration/accounts`（带 `YYB_INTEGRATION_TOKEN` 时）

退出码：

- `0`：可达且集成接口可用
- `1`：不可达
- `2`：可达但集成接口未就绪（通常是 YYB 没设置 `YYB_INTEGRATION_TOKEN`）

手动检查：

```bash
curl http://<yyb-host>:8000/health
curl http://<yyb-host>:8000/integration/module-manifest.json
curl http://<yyb-host>:8000/openapi.json
curl http://<yyb-host>:8000/integration/accounts
```

`/integration/accounts` 返回 `503` 表示 YYB 没启用集成接口；返回 `401` 表示 token 不一致；返回 `200` 才算平台可同步账号。

较旧版本可能没有 `/integration/*`，需要升级 YYB。

### 3.5 `/integration/accounts` 返回 503

`503 integration API is disabled` 表示 **YYB 进程里没有读到 `YYB_INTEGRATION_TOKEN`**，不是平台 token 错（token 错会是 401）。

按顺序检查：

```bash
# 1. YYB 容器里到底有没有这个环境变量
docker exec yyb-go printenv YYB_INTEGRATION_TOKEN

# 2. Compose 解析后的值（在 YYB 目录执行）
docker compose config | grep -A1 YYB_INTEGRATION_TOKEN

# 3. 是否只改了文件但没有重建容器
docker compose up -d --force-recreate

# 4. 再查一次
docker exec yyb-go printenv YYB_INTEGRATION_TOKEN
```

注意：

- YYB 的 `.env` 必须放在 `compose.yaml` 同目录；只改平台 `.env` 不会影响 YYB。
- `docker restart` 不会重新读取修改后的 `.env`；要 `up -d --force-recreate`。
- 如果 NAS 用图形界面管理容器，要在“环境变量”里加 `YYB_INTEGRATION_TOKEN`，然后重建容器。
- 确认 8000 端口对应的是你改的这个容器：`docker ps --filter publish=8000`。

### 3.6 YYB 数据/配置位置

Docker Compose 默认：

```text
<YYB 目录>/data/db          # SQLite / 数据库
<YYB 目录>/data/qr          # 二维码缓存
<YYB 目录>/data/avatars     # 头像
```

不要直接改 YYB 的 SQLite；用它的 Web 控制台/API。

原生二进制：`.env` 放程序旁边，或用 `-env-file`。
Magisk：看 YYB 的 `docs/magisk.md`，配置在模块数据目录。

## 4. 常见错误

| 现象 | 原因 |
| --- | --- |
| `DATABASE_URL` 连不上 | Docker 内用 `postgres`，宿主机用 `127.0.0.1` |
| 登录后又回登录页 | `APP_URL=https://...` 但实际用 HTTP，cookie Secure 不发送 |
| YYB 同步 401 | 平台和 YYB 的 `YYB_INTEGRATION_TOKEN` 不一致 |
| YYB 连接超时 | 不在同一 Docker 网络，或地址写成容器名但平台不在该网络 |
| 改了数据库密码但连不上 | 已有 `pgdata` 卷密码没变，需要 `ALTER USER` |
| 旧 YYB 没有 `/integration/*` | 升级 YYB |
| `APP_ENCRYPTION_KEY` 启动报错 | 不是 32 字节 base64，重新生成 |
