# Linux 直接运行 / systemd

## 直接运行

```bash
chmod +x deploy/linux/start.sh
./deploy/linux/start.sh
```

首次运行会使用 `npm ci` 安装依赖、构建并安装内置 PostgreSQL。访问 <http://localhost:3000>。

## systemd

假设项目在 `/opt/free-welfare`，运行用户为 `freewelfare`：

```bash
sudo useradd --system --user-group --home /opt/free-welfare --shell /usr/sbin/nologin freewelfare
sudo chown -R freewelfare:freewelfare /opt/free-welfare
sudo cp deploy/linux/free-welfare.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now free-welfare
sudo journalctl -u free-welfare -f
```

如果 Node 不在 `/usr/bin/node`，修改 service 里的 `ExecStart`。

> 生产环境更推荐 Docker Compose；systemd + 内置 PostgreSQL 适合单机、小内存的 Linux 主机。
