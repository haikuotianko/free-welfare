# 部署方式

Free Welfare 支持 Docker、Windows 安装包、macOS/Linux 直接运行和 NAS。下面按使用场景选择。

## 1. 怎么选

| 方式 | 适合 | 需要 | 数据库 |
| --- | --- | --- | --- |
| Docker Compose（源码构建） | 有 Docker 的 Windows/macOS/Linux | Docker Desktop / Docker Engine | 容器 PostgreSQL |
| Docker 预构建镜像 | NAS、ARM64、服务器 | Docker，能拉取 GHCR | 容器 PostgreSQL |
| Windows 安装包 | 不想装 Docker/Node 的 Windows 用户 | 无；首次运行联网 | 内置 PostgreSQL |
| Windows 脚本 | 已装 Node 的 Windows 用户 | Node.js 22+ | 内置 PostgreSQL |
| macOS 双击启动 | Mac 用户 | Node.js 22+ | 内置 PostgreSQL |
| Linux systemd | 单机 Linux | Node.js 22+ | 内置 PostgreSQL |
| npm 手动安装 | 想自己控制依赖/反向代理 | Node.js 22+ / npm | 内置或外部 PostgreSQL |

> 所有方式都需要一个可用的 YYB-Go-Enhanced 实例；平台不内置 YYB。YYB 可以跑在同一台机器或局域网另一台机器。

## 2. Docker Compose（推荐）

仓库根目录已提供 `Dockerfile` 和 `docker-compose.yml`，在仓库根目录执行：

```bash
cp deploy/compose/.env.example deploy/compose/.env
# 编辑 deploy/compose/.env：APP_ENCRYPTION_KEY、AUTH_SESSION_SECRET、POSTGRES_PASSWORD、
# DATABASE_URL、YYB_BASE_URL、YYB_INTEGRATION_TOKEN、APP_URL
docker compose up -d --build
```

- 根目录的 `docker-compose.yml` 通过 Compose `include` 引用 `deploy/compose/docker-compose.yml`，需要 Docker Compose v2.20+；旧版本仍可用 `docker compose -f deploy/compose/docker-compose.yml up -d --build`。
- 镜像由根目录 `Dockerfile` 构建，CI 也使用同一个文件。
- 入口：Caddy `http://服务器IP/`；API 通过宿主机 `API_HOST_PORT`（默认 31888）暴露。
- 数据：仓库根目录 `data/`；数据库卷 `pgdata`。
- `api` 容器启动时会自动执行 `prisma migrate deploy`。
- 修改 `CADDY_HTTP_PORT` / `CADDY_HTTPS_PORT` 可避开 NAS 上被占用的 80/443。

### 升级

```bash
git pull
docker compose up -d --build
```

旧版 Compose 可继续使用：

```bash
git pull
docker compose -f deploy/compose/docker-compose.yml up -d --build
```

## 3. Docker 预构建镜像 / NAS

GitHub Actions 会构建 `linux/amd64` + `linux/arm64` 镜像：

```text
ghcr.io/haikuotianko/free-welfare:latest
```

如果镜像包是私有的，先在 NAS/服务器上登录：

```bash
echo <GitHub PAT> | docker login ghcr.io -u <GitHub 用户名> --password-stdin
```

或到 GitHub 的 Package 设置里把镜像改为 public。

### 通用服务器 / Portainer

```bash
cp deploy/compose/.env.example deploy/compose/.env
# 编辑 .env
docker compose -f deploy/compose/docker-compose.yml pull
docker compose -f deploy/compose/docker-compose.yml up -d --no-build
```

### Synology / QNAP / TrueNAS

NAS 上建议用不依赖仓库相对路径的 `deploy/compose/docker-compose.nas.yml`：

1. 在 NAS 的 Docker/Container Manager 里新建项目，目录例如 `/volume1/docker/free-welfare`。
2. 把 `docker-compose.nas.yml` 内容粘贴到项目编辑器，把 `.env` 放在同一目录。
3. 修改 `.env`：
   - `API_HOST_PORT=31888`（NAS 上有冲突时改成其他空闲端口）
   - `APP_PORT=3000`（容器内部端口，一般不用改）
   - `POSTGRES_PASSWORD` / `DATABASE_URL`
   - `APP_ENCRYPTION_KEY` / `AUTH_SESSION_SECRET`
   - `YYB_BASE_URL=http://你的YYB地址:8000`
   - `APP_URL=http://NAS地址:31888`（如果改了 `API_HOST_PORT`，这里也要改）
4. 启动项目，访问 `http://NAS地址:31888/`。

NAS compose 使用命名卷 `fw-pgdata`、`fw-data`，不依赖 `../../data` 路径；如果要备份，映射到 NAS 共享目录也可以，把 `volumes` 改成 `/volume1/docker/free-welfare/data:/data`。

> ARM64 群晖/威联通会直接拉取 arm64 镜像；如果拉取失败，先在 GitHub Actions 看 Docker workflow 是否成功。

## 4. Windows 安装包

从 [Releases](https://github.com/haikuotianko/free-welfare/releases) 下载 `Free-Welfare-Setup-<版本>.exe`。

- 安装到 `%LOCALAPPDATA%\Free Welfare`，不需要管理员权限。
- 自带 Node.js 运行时；首次启动会联网 `npm ci`、构建并安装内置 PostgreSQL，需要几分钟。
- 自动创建开始菜单和桌面快捷方式，启动后打开 <http://localhost:3000>。
- 数据在安装目录的 `data/`；升级安装不会删除 `.env` 和 `data/`。
- 未签名，SmartScreen 提示时选择“仍要运行”。

自己构建安装包：

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\build-installer.ps1
```

输出在 `release\windows\Free-Welfare-Setup-<版本>.exe`。

## 5. Windows 脚本（已有 Node）

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\start.ps1
```

首次运行会自动安装依赖、构建、安装内置 PostgreSQL，然后启动。详见 [deploy/windows/README.md](../deploy/windows/README.md)。

## 6. macOS

```bash
chmod +x deploy/macos/start.command
./deploy/macos/start.command
```

也可以直接双击 `deploy/macos/start.command`。首次运行需要联网安装依赖。详见 [deploy/macos/README.md](../deploy/macos/README.md)。

## 7. Linux / systemd

```bash
chmod +x deploy/linux/start.sh
./deploy/linux/start.sh
```

长期运行：

```bash
sudo useradd --system --user-group --home /opt/free-welfare --shell /usr/sbin/nologin freewelfare
sudo chown -R freewelfare:freewelfare /opt/free-welfare
sudo cp deploy/linux/free-welfare.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now free-welfare
```

详见 [deploy/linux/README.md](../deploy/linux/README.md)。

## 8. npm 手动安装

仓库同时支持 `pnpm` 和 `npm`。全新克隆后可以直接用 npm：

```bash
npm ci
npm run npm:build
npm install --prefix deploy/native
npm start
```

`npm start` 会启动内置 PostgreSQL、执行迁移、启动 API + Worker，并打开浏览器。

如果使用外部 PostgreSQL，先在 `.env` 设置：

```ini
EMBEDDED_PG=false
DATABASE_URL=postgresql://用户:密码@127.0.0.1:5432/welfare?schema=public
```

再执行 `npm start`。修改代码后重新执行 `npm run npm:build`。

## 9. 数据与备份

| 内容 | 位置 |
| --- | --- |
| 数据库（Docker） | `pgdata` 卷 |
| 数据库（原生） | `data/postgres/` |
| 脚本/上传/日志 | `data/` |
| 配置 | 根目录 `.env` |

Docker 备份：

```bash
docker exec -t <postgres容器> pg_dump -U welfare welfare > backup.sql
# 卷名用 docker volume ls 查看，Compose 项目通常生成 compose_pgdata
docker run --rm -v <pgdata卷名>:/data -v "$PWD":/backup alpine tar czf /backup/pgdata.tar.gz -C /data .
```

原生模式备份：

```bash
# Windows 的 pg_dump 在 deploy/native/node_modules/@embedded-postgres/windows-x64/native/bin/
pg_dump "postgresql://welfare:密码@127.0.0.1:5433/welfare" > backup.sql
```

同时备份 `data/` 和 `.env`。

## 10. 常见问题

- **Windows `EPERM ... query_engine-windows.dll.node`**：先停止 API/Worker，再执行 `npm run npm:build`；Prisma 生成时会替换引擎文件。
- **NAS 80/443 被占用**：设置 `CADDY_HTTP_PORT=8080`、`CADDY_HTTPS_PORT=8443`。
- **GHCR 拉取 401/403**：镜像默认可能是私有，执行 `docker login ghcr.io` 或在 Package 设置里改为 public。
- **首次启动很慢**：Windows 安装包/macOS/Linux 脚本首次会下载 npm 依赖和 PostgreSQL 二进制。
- **Docker 启动失败 `job failed without details`**：Docker Desktop 的 Hyper-V 虚拟机内存不足；关闭一些程序或给 Docker 分配至少 2GB。
- **YYB 不可用**：平台仍可启动，但取码/手机号授权/同步账号会失败；在设置页或 `.env` 配好 YYB 地址和 token。

## 11. 生产实例和开发实例同时运行

推荐做法：**NAS 只跑生产实例，本地电脑跑开发实例**。不要直接修改 NAS 上正在运行的代码目录。

| | 生产（NAS） | 开发（本地） |
| --- | --- | --- |
| 代码 | 固定镜像 tag 或 release | `main` + 本地修改 |
| 数据库 | 生产 PostgreSQL / `fw-pgdata` | 独立开发数据库 |
| `data/` | 生产目录 / `fw-data` | 独立目录 |
| 端口 | 3000 / 80 / 443 | 5173 / 3000 或 3100 |
| 微信账号 | 真实账号 | 测试账号，或禁用定时 |
| 定时任务 | 正常运行 | 建议关闭 |

必须分开的东西：

- **不要两个 Worker 连同一个数据库**：两个实例会抢同一个队列，造成重复执行、重复签到、积分/订单重复同步。
- **不要共用 `data/`**：脚本缓存、token、上传文件会互相覆盖。
- **不要让开发实例对生产数据库执行迁移**：开发中的 schema 可能把生产库改坏。
- **不要用同一个微信账号同时跑生产与开发**：很多应用的登录 token/cookie 会互踢，签到任务也可能重复。
- **YYB 可以共用，但要小心**：YYB 本身可以被多个平台调用，但取码、手机号授权、账号同步都作用在同一个微信账号上；开发实例如果也跑真实账号，会和生产抢会话。建议开发用单独的测试微信账号，或在开发实例里关闭定时任务。

### YYB 在同一台 NAS

- YYB 和平台在同一个 Docker 网络：`YYB_BASE_URL=http://yyb-go:8000`。
- YYB 是独立容器/独立 compose：用 NAS 局域网 IP，例如 `YYB_BASE_URL=http://192.168.1.10:8000`，并确认 NAS 防火墙允许该端口。
- 不要把 YYB 端口映射到公网；只给局域网或平台容器访问。

### 如果非要在同一台 NAS 上再跑一套开发实例

不要复用生产 compose 项目，至少分开：

```ini
# .env.dev
COMPOSE_PROJECT_NAME=fw-dev
APP_URL=http://NAS地址:3100
APP_PORT=3000
API_HOST_PORT=3100
CADDY_HTTP_PORT=8080
CADDY_HTTPS_PORT=8443
POSTGRES_PASSWORD=dev-only-password
APP_ENCRYPTION_KEY=<32 字节 base64>
AUTH_SESSION_SECRET=<32 字节 base64>
```

并使用独立的数据库卷 / `data/` 目录。即使端口分开了，也不要让两套实例同时操作同一个微信账号。

## 12. 更新已经运行的实例

### Docker（推荐）

更新前先备份：

```bash
docker exec -t <postgres容器> pg_dump -U welfare welfare > backup-$(date +%F).sql
# 同时备份 data/ 和 deploy/compose/.env
```

生产环境建议在 `.env` 里固定镜像版本，而不是永远用 `latest`：

```ini
# 在 GitHub Actions 的构建记录里找 sha-xxxx 或 release tag
FW_IMAGE=ghcr.io/haikuotianko/free-welfare:sha-<commit>
```

然后更新：

```bash
cd deploy/compose
./update.sh
# NAS 专用 compose：
# COMPOSE_FILE=docker-compose.nas.yml ./update.sh
```

脚本会执行 `docker compose pull api worker` 和 `up -d --no-build`。`api` 启动时先执行迁移，`worker` 会等 `api` 健康后再启动，避免旧 Worker 在新 schema 上跑。

手动执行等价于：

```bash
docker compose -f deploy/compose/docker-compose.yml pull api worker
docker compose -f deploy/compose/docker-compose.yml up -d --no-build
```

更新后检查：

```bash
curl http://127.0.0.1:31888/api/v1/health
docker compose -f deploy/compose/docker-compose.yml logs --tail=100 api worker
```

回滚：

1. 把 `FW_IMAGE` 改回上一个 `sha-` 版本。
2. `docker compose pull api worker && docker compose up -d --no-build`。
3. 如果新版本已经执行了不兼容的数据库迁移，回滚镜像不够，需要恢复备份数据库。**所以升级前必须备份。**

### 源码构建的 Docker

```bash
git pull
docker compose -f deploy/compose/docker-compose.yml up -d --build
```

### Windows 安装包

下载新版本 exe，直接覆盖安装。安装包不会删除 `.env` 和 `data/`；首次启动新版本时按提示完成依赖/迁移。

### macOS / Linux / npm 原生方式

```bash
# 先停止当前进程（Ctrl+C 或 systemctl stop free-welfare）
git pull
npm ci
npm run npm:build
npm install --prefix deploy/native
npm start
```

`npm start` 会先执行数据库迁移，再启动 API/Worker。升级前同样备份 `data/` 和 `.env`。

