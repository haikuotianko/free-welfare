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

## 2. NAS / Docker（服务器推荐）

使用 GHCR 预构建镜像，不在 NAS 或服务器上编译。

### 一键安装

```bash
mkdir -p free-welfare && cd free-welfare
curl -fsSLO https://raw.githubusercontent.com/haikuotianko/free-welfare/main/deploy/compose/install.sh
bash install.sh
```

脚本会自动：

- 下载 `docker-compose.nas.yml` 和 `.env.example`
- 生成数据库密码、`APP_ENCRYPTION_KEY`、`AUTH_SESSION_SECRET`
- 创建 YYB 共用网络
- 拉取镜像并启动

打开 `http://服务器IP:31888`。YYB 地址和 token 可以在设置页填写。

如果 YYB 已经使用默认网络 `qinglong_default`，可以这样安装：

```bash
YYB_DOCKER_NETWORK=qinglong_default bash install.sh
```

NAS 提示权限不足时使用 `sudo bash install.sh`。

端口冲突时编辑 `.env`：

```ini
API_HOST_PORT=31889
APP_URL=http://服务器IP:31889
```

然后重新启动：

```bash
docker compose -f docker-compose.nas.yml up -d --no-build
```

### YYB 共用网络（重要）

Free Welfare 的 `api` / `worker` 默认加入外部网络 `yyb-go`。YYB 容器必须加入同一个网络。

```bash
docker network inspect yyb-go >/dev/null 2>&1 || docker network create yyb-go
```

YYB 的 `.env`：

```ini
YYB_DOCKER_NETWORK=yyb-go
```

Free Welfare 的 `.env`：

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

### 群晖 / 威联通 / TrueNAS / Portainer

<details>
<summary>用图形界面导入 Compose</summary>

1. 新建目录，例如 `/volume1/docker/free-welfare`。
2. 下载 [`docker-compose.nas.yml`](https://raw.githubusercontent.com/haikuotianko/free-welfare/main/deploy/compose/docker-compose.nas.yml) 和 [`.env.example`](https://raw.githubusercontent.com/haikuotianko/free-welfare/main/deploy/compose/.env.example)。
3. 把 `.env.example` 改名为 `.env`，至少修改：
   - `POSTGRES_PASSWORD` / `DATABASE_URL`
   - `APP_ENCRYPTION_KEY` / `AUTH_SESSION_SECRET`
   - `YYB_DOCKER_NETWORK`
   - `APP_URL`
4. 在 Container Manager / Container Station / Portainer 新建项目，导入 Compose 和 `.env`。
5. 启动后访问 `http://NAS地址:31888`。

</details>

### 手动 Compose / 源码构建

<details>
<summary>不用安装脚本时</summary>

```bash
docker network create yyb-go
cp deploy/compose/.env.example deploy/compose/.env
# 编辑 deploy/compose/.env
docker compose -f deploy/compose/docker-compose.yml pull
docker compose -f deploy/compose/docker-compose.yml up -d --no-build
```

源码构建：

```bash
git clone https://github.com/haikuotianko/free-welfare.git
cd free-welfare
docker network create yyb-go
cp deploy/compose/.env.example deploy/compose/.env
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
- **YYB 不可用**：平台仍可启动；在设置页或 `.env` 填写 YYB 地址和 token，并确认容器在同一网络。
- **拉取镜像慢**：GHCR 国际线路可能较慢；可在网络更好的电脑上 `docker pull` 后 `docker save`，再复制到 NAS `docker load`。
- **Windows 提示未知发布者**：安装包未签名，选择“仍要运行”。
- **数据在哪里**：Docker 使用 `pgdata` 卷和 `data/`；原生方式使用 `data/postgres` 和 `data/`。
