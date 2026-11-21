# Docker Compose 部署（计划）

Phase 0 目标服务：

| 服务 | 说明 |
| --- | --- |
| `caddy` | 反向代理/HTTPS；只暴露 80/443 |
| `api` | NestJS API + 静态前端 |
| `worker` | 调度 + 脚本执行 |
| `postgres` | PostgreSQL 16；持久化卷 |
| `yyb-go` | 可选；也可用外部 YYB |

## 网络

- 创建内部网络 `welfare_internal`。
- `api`/`worker`/`postgres`/`yyb-go` 互通。
- 只有 `caddy` 映射宿主端口。
- YYB 不暴露公网。

## 卷

- `pgdata`
- `./data/scripts`
- `./data/logs`
- `./data/artifacts`
- `./data/uploads`

## 环境

复制 `.env.example` 为 `.env`，至少填：

- `APP_ENCRYPTION_KEY`
- `AUTH_SESSION_SECRET`
- `POSTGRES_PASSWORD` / `DATABASE_URL`
- `YYB_BASE_URL` / `YYB_INTEGRATION_TOKEN` / `YYB_PROTOCOL_TOKEN`
- `SCRIPT_SOURCE_URL`
- `SERVERCHAN_TOKEN`（可选）
- `CADDY_DOMAIN`

## 启动（脚手架完成后）

```bash
docker compose -f deploy/compose/docker-compose.yml up -d
```

## 备份

- `pg_dump` + `data/`。
- 升级前备份；镜像回滚不等于数据库回滚。
