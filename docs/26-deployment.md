# 部署

Free Welfare 只需要选一种部署方式，不用把所有方案都看一遍。

| 你的环境 | 推荐方式 | 需要 |
| --- | --- | --- |
| Windows 10/11 | Windows 安装包 | 无；首次启动联网 |
| NAS / 服务器 | Docker 预构建镜像 | Docker + Compose v2 |
| macOS | macOS 双击脚本 | Node.js 22+ |
| Linux | Docker（推荐）或 systemd | Docker 或 Node.js 22+ |

> 前置依赖：[YYB-Go-Enhanced](https://github.com/525815266/YYB-Go-Enhanced)。平台不内置 YYB；Docker 部署时两个项目必须使用同一个网络。
>
> 官网使用 Tab 切换安装方式；GitHub 文档不支持交互式 Tab，下面用折叠块收起高级步骤。

---

## 1. Windows 安装包（最省事）

1. 从 [Releases](https://github.com/haikuotianko/free-welfare/releases) 下载 `Free-Welfare-Setup-<版本>.exe`。
2. 双击安装，从开始菜单启动。
3. 浏览器打开 <http://localhost:3000>，创建管理员。
4. 在设置页填写 YYB 地址和 token。

- 不需要安装 Docker 或 Node。
- 首次启动会下载依赖并初始化内置 PostgreSQL，需要联网。
- 配置和数据在安装目录的 `.env` 和 `data/`；覆盖安装会保留。
- 安装包未签名，SmartScreen 提示时选择“仍要运行”。

<details>
<summary>手动构建 Windows 安装包 / 使用 Windows 脚本</summary>

```powershell
# 已安装 Node.js 22+ 时，直接启动
powershell -ExecutionPolicy Bypass -File deploy\windows\start.ps1

# 构建安装包
powershell -ExecutionPolicy Bypass -File deploy\windows\build-installer.ps1
```

输出：`release\windows\Free-Welfare-Setup-<版本>.exe`。

</details>

---

## 2. NAS / Docker（推荐，无需控制台）

使用 GHCR 预构建镜像，不在 NAS 上编译。新版 Compose **不需要 `.env` 文件**，配置全部从环境变量读取，可以直接粘贴到 NAS 的 Compose 项目。

### 图形界面安装

1. 在 NAS 的 Docker / Compose 入口新建项目（入口见下方）。
2. 下载或复制下面的 `docker-compose.nas.yml`，粘贴到项目编辑器。
3. 在 NAS 的环境变量输入框填写密钥、密码和访问地址。
4. 启动，访问 `http://NAS地址:31888`，创建管理员。

| 环境变量 | 必填 | 说明 |
| --- | --- | --- |
| `APP_ENCRYPTION_KEY` | 是 | 32 字节 base64；`openssl rand -base64 32` |
| `AUTH_SESSION_SECRET` | 是 | 32 字节 base64；`openssl rand -base64 32` |
| `POSTGRES_PASSWORD` | 建议 | 数据库密码，默认 `welfare` |
| `APP_URL` | 建议 | `http://NAS地址:31888` |
| `YYB_DOCKER_NETWORK` | 否 | 默认 `yyb-go`；YYB 实际网络不同时修改 |
| `YYB_BASE_URL` | 否 | 默认 `http://yyb-go:8000` |
| `YYB_INTEGRATION_TOKEN` | 否 | YYB 集成令牌，也可启动后在设置页填写 |
| `API_HOST_PORT` | 否 | 宿主机端口，默认 `31888` |

> 没有终端生成密钥时，可以在官网 NAS / Docker 页点击「生成两个随机密钥」，或使用任意 32 字节 base64 随机值。

<details>
<summary>复制 docker-compose.yml（环境变量版）</summary>

```yaml
# NAS / Docker Compose（预构建镜像，不需要 .env 文件）
# 所有配置从环境变量读取；可在 NAS 的 Compose UI 里填写，或使用同目录 .env。
#
# 必填环境变量：
#   APP_ENCRYPTION_KEY      openssl rand -base64 32
#   AUTH_SESSION_SECRET     openssl rand -base64 32
# 可选环境变量：
#   POSTGRES_PASSWORD       默认 welfare，建议修改
#   DATABASE_URL            默认自动拼接 postgres 地址
#   APP_URL                 默认 http://localhost:31888
#   YYB_DOCKER_NETWORK      默认 yyb-go
#   YYB_BASE_URL            默认 http://yyb-go:8000
#   YYB_INTEGRATION_TOKEN / YYB_PROTOCOL_TOKEN
#   API_HOST_PORT           默认 31888
x-app-environment: &app-environment
  NODE_ENV: production
  TZ: ${TZ:-Asia/Shanghai}
  LOG_LEVEL: ${LOG_LEVEL:-info}
  APP_PORT: '3000'
  APP_URL: ${APP_URL:-http://localhost:31888}
  APP_ENCRYPTION_KEY: ${APP_ENCRYPTION_KEY:?APP_ENCRYPTION_KEY is required}
  AUTH_SESSION_SECRET: ${AUTH_SESSION_SECRET:?AUTH_SESSION_SECRET is required}
  DATABASE_URL: ${DATABASE_URL:-postgresql://welfare:${POSTGRES_PASSWORD:-welfare}@postgres:5432/welfare?schema=public}
  YYB_BASE_URL: ${YYB_BASE_URL:-http://yyb-go:8000}
  YYB_INTEGRATION_TOKEN: ${YYB_INTEGRATION_TOKEN:-}
  YYB_PROTOCOL_TOKEN: ${YYB_PROTOCOL_TOKEN:-}
  YYB_HEALTHCHECK_INTERVAL_SECONDS: ${YYB_HEALTHCHECK_INTERVAL_SECONDS:-60}
  SCRIPT_SOURCE_URL: ${SCRIPT_SOURCE_URL:-https://raw.githubusercontent.com/haikuotianko/free-welfare-scripts/main/index.json}
  SCRIPT_SOURCE_TRUST: ${SCRIPT_SOURCE_TRUST:-official}
  SCRIPT_SOURCE_AUTO_SYNC: ${SCRIPT_SOURCE_AUTO_SYNC:-true}
  SERVERCHAN_TOKEN: ${SERVERCHAN_TOKEN:-}
  WORKER_CONCURRENCY: ${WORKER_CONCURRENCY:-2}
  RUNNER_TIMEOUT_SECONDS: ${RUNNER_TIMEOUT_SECONDS:-120}
  RUNNER_MEMORY_MB: ${RUNNER_MEMORY_MB:-256}
  RUNNER_MAX_LOG_BYTES: ${RUNNER_MAX_LOG_BYTES:-262144}
  CHECKPOINT_DISABLE: ${CHECKPOINT_DISABLE:-1}
  PRISMA_HIDE_UPDATE_MESSAGE: ${PRISMA_HIDE_UPDATE_MESSAGE:-1}
  DATA_DIR: /data

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-welfare}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-welfare}
      POSTGRES_DB: ${POSTGRES_DB:-welfare}
    volumes:
      - fw-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER:-welfare} -d ${POSTGRES_DB:-welfare}']
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    image: ${FW_IMAGE:-ghcr.io/haikuotianko/free-welfare:latest}
    restart: unless-stopped
    environment:
      <<: *app-environment
    command: sh -c "node tools/migrate.mjs && node apps/api/dist/main.js"
    ports:
      - '${API_HOST_PORT:-31888}:3000'
    volumes:
      - fw-data:/data
    networks:
      - default
      - yyb-go
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'node -e "fetch(\"http://127.0.0.1:3000/api/v1/health\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"']
      interval: 10s
      timeout: 5s
      retries: 10

  worker:
    image: ${FW_IMAGE:-ghcr.io/haikuotianko/free-welfare:latest}
    restart: unless-stopped
    environment:
      <<: *app-environment
    command: node apps/worker/dist/main.js
    volumes:
      - fw-data:/data
    networks:
      - default
      - yyb-go
    depends_on:
      postgres:
        condition: service_healthy
      api:
        condition: service_healthy

volumes:
  fw-pgdata:
  fw-data:

networks:
  yyb-go:
    external: true
    name: ${YYB_DOCKER_NETWORK:-yyb-go}
```

</details>

### YYB 共用网络（重要）

Free Welfare 的 `api` / `worker` 默认加入外部网络 `yyb-go`。YYB 容器必须加入同一个网络。

```bash
docker network inspect yyb-go >/dev/null 2>&1 || docker network create yyb-go
```

YYB 的 `.env`：

```ini
YYB_DOCKER_NETWORK=yyb-go
```

Free Welfare 的环境变量或 `.env`：

```ini
YYB_DOCKER_NETWORK=yyb-go
YYB_BASE_URL=http://yyb-go:8000
```

如果 YYB 已经用默认 Compose 启动，网络通常是 `qinglong_default`；把两边的 `YYB_DOCKER_NETWORK` 都改成 `qinglong_default` 即可。

验证：

```bash
docker compose -f docker-compose.nas.yml exec api node -e "fetch('http://yyb-go:8000/health').then(r=>console.log(r.status)).catch(()=>process.exit(1))"
```

> YYB 在另一台机器时，把 `YYB_BASE_URL` 改成 `http://YYB机器IP:8000`；容器名互访只对同一台 Docker 主机有效。

### NAS 品牌入口

- **群晖 DSM**：Container Manager → 项目 → 新增
- **威联通 QTS**：Container Station → 应用程序 → 创建
- **飞牛 fnOS**：Docker → Compose → 新建项目
- **TrueNAS**：Apps → Custom App，或安装 Dockge / Portainer
- **Unraid**：Docker → Compose Manager
- **极空间 / 绿联**：Docker → 项目 / Compose

群晖、飞牛等图形界面都支持直接粘贴 Compose；如果项目只提供 `.env` 上传，也可以把环境变量写进同目录 `.env`。

### 有 SSH 控制台：一键安装（可选）

如果 NAS 开放 SSH，可以自动生成 `.env`、创建网络并启动：

```bash
mkdir -p free-welfare && cd free-welfare
curl -fsSLO https://raw.githubusercontent.com/haikuotianko/free-welfare/main/deploy/compose/install.sh
bash install.sh
```

- 权限不足时使用 `sudo bash install.sh`。
- YYB 已在默认网络时使用 `YYB_DOCKER_NETWORK=qinglong_default bash install.sh`。
- 如果仍使用旧版 Compose 报 `env file .../.env not found`，请换成上面的环境变量版 Compose，或先创建 `.env`。

手动拉取预构建镜像：

```bash
docker pull ghcr.io/haikuotianko/free-welfare:latest
docker compose -f docker-compose.nas.yml up -d --no-build
```


### 源码构建（开发者）

<details>
<summary>从源码构建镜像</summary>

```bash
git clone https://github.com/haikuotianko/free-welfare.git
cd free-welfare
docker network inspect yyb-go >/dev/null 2>&1 || docker network create yyb-go
cp deploy/compose/.env.example deploy/compose/.env
# 编辑 deploy/compose/.env
docker compose up -d --build
```

根目录 `docker-compose.yml` 需要 Docker Compose v2.20+；旧版本使用 `docker compose -f deploy/compose/docker-compose.yml ...`。

</details>

---

## 3. macOS / Linux

<details>
<summary>macOS 双击启动</summary>

需要 Node.js 22+。

```bash
brew install node@22
git clone https://github.com/haikuotianko/free-welfare.git
cd free-welfare
chmod +x deploy/macos/start.command
./deploy/macos/start.command
```

也可以下载源码 ZIP，双击 `deploy/macos/start.command`。首次运行会自动安装依赖和内置 PostgreSQL。数据在 `data/`。

</details>

<details>
<summary>Linux 原生 / systemd</summary>

需要 Node.js 22+ 和 git。服务器更推荐 Docker。

```bash
git clone https://github.com/haikuotianko/free-welfare.git
cd free-welfare
chmod +x deploy/linux/start.sh
./deploy/linux/start.sh
```

长期运行见 [`deploy/linux/free-welfare.service`](../deploy/linux/free-welfare.service)。

</details>

---

## 4. 开发者：npm / 源码

<details>
<summary>使用 npm 或外部 PostgreSQL</summary>

```bash
git clone https://github.com/haikuotianko/free-welfare.git
cd free-welfare
npm ci
npm run npm:build
npm install --prefix deploy/native
npm start
```

默认使用内置 PostgreSQL。连接外部数据库时在 `.env` 设置：

```ini
EMBEDDED_PG=false
DATABASE_URL=postgresql://用户:密码@127.0.0.1:5432/welfare?schema=public
```

修改代码后重新执行 `npm run npm:build`，再 `npm start`。

</details>

---

## 5. 升级、备份和端口

<details>
<summary>Docker 升级与备份</summary>

升级预构建镜像：

```bash
docker compose -f docker-compose.nas.yml pull
docker compose -f docker-compose.nas.yml up -d --no-build
```

备份数据库和 `data/`：

```bash
docker exec -t <postgres容器> pg_dump -U welfare welfare > backup-$(date +%F).sql
```

数据库迁移是向前执行的，升级前先备份。回滚镜像不一定能回滚 schema。

</details>

<details>
<summary>端口和反向代理</summary>

- `API_HOST_PORT`：宿主机端口，默认 `31888`。
- `APP_PORT`：容器内部端口，默认 `3000`，通常不改。
- 源码 Compose 还包含 Caddy，可用 `CADDY_HTTP_PORT` / `CADDY_HTTPS_PORT` 修改 80/443。
- NAS 上 80/443 被占用时，直接使用 `API_HOST_PORT`，或让已有反向代理转发。

</details>

---

## 6. 常见问题

- **启动报 `network yyb-go declared as external, but could not be found`**：先执行 `docker network create yyb-go`，或把 `YYB_DOCKER_NETWORK` 改成 YYB 实际网络名。
- **启动报 `env file .../.env not found`**：这是旧版/源码 Compose 的错误。新版 `docker-compose.nas.yml` 不需要 `.env`；如果使用旧版，请创建同目录 `.env`，或改用上面的环境变量版 Compose。
- **YYB 不可用**：平台仍可启动；在设置页或 `.env` 填写 YYB 地址和 token，并确认容器在同一网络。
- **拉取镜像慢**：GHCR 国际线路可能较慢；可在网络更好的电脑上 `docker pull` 后 `docker save`，再复制到 NAS `docker load`。
- **Windows 提示未知发布者**：安装包未签名，选择“仍要运行”。
- **数据在哪里**：Docker 使用 `pgdata` 卷和 `data/`；原生方式使用 `data/postgres` 和 `data/`。
