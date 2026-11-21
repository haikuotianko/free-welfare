# Docker Compose 部署

## 服务

| 服务 | 说明 |
| --- | --- |
| `caddy` | 反向代理，对外 80/443（可改端口） |
| `api` | NestJS API + 静态前端 |
| `worker` | 定时队列 + 脚本执行 |
| `postgres` | PostgreSQL 16，持久化卷 |
| `yyb-go` | 可选，也可以连接外部 YYB |

## 快速启动

```bash
cp deploy/compose/.env.example deploy/compose/.env
# 编辑 .env：加密密钥、数据库密码、YYB 地址/token、APP_URL
docker compose -f deploy/compose/docker-compose.yml up -d --build
```

- 首次启动/升级会自动执行 `prisma migrate deploy`。
- 数据目录：仓库根目录 `data/`。
- 数据库卷：`pgdata`。
- 只暴露 Caddy 的 80/443；API 的 3000 端口也直接映射，方便调试。

## 使用预构建镜像（NAS / 服务器）

镜像由 GitHub Actions 构建并推送到：

```text
ghcr.io/haikuotianko/free-welfare:latest
```

```bash
docker compose -f deploy/compose/docker-compose.yml pull
docker compose -f deploy/compose/docker-compose.yml up -d --no-build
```

NAS 请使用 [`docker-compose.nas.yml`](docker-compose.nas.yml)，它不依赖仓库相对路径，使用命名卷，具体步骤见 [26 部署方式](../../docs/26-deployment.md#3-docker-预构建镜像--nas)。

## 端口

在 `.env` 中修改：

```ini
CADDY_HTTP_PORT=80
CADDY_HTTPS_PORT=443
APP_PORT=3000
```

NAS 上 80/443 常被系统占用，可改成 `8080` / `8443`。

## 数据与备份

- `pgdata`：PostgreSQL
- `./data/scripts`、`./data/logs`、`./data/artifacts`、`./data/uploads`
- `.env`

备份：

```bash
docker exec -t <postgres容器> pg_dump -U welfare welfare > backup.sql
```

升级：

```bash
git pull
docker compose -f deploy/compose/docker-compose.yml up -d --build
```

更多方式见 [26 部署方式](../../docs/26-deployment.md)。
