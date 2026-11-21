# macOS 直接运行

## 双击启动

1. 先安装 Node.js 22+（[nodejs.org](https://nodejs.org/) 或 `brew install node@22`）。
2. 双击 `deploy/macos/start.command`。
3. 如果 macOS 提示“无法打开”，右键 → 打开，或在终端执行：

```bash
chmod +x deploy/macos/start.command
./deploy/macos/start.command
```

首次运行会安装依赖、构建平台、安装内置 PostgreSQL，然后启动 <http://localhost:3000>。

## 数据

- 应用数据：`data/`
- 内置 PostgreSQL：`data/postgres/`
- 配置：项目根目录 `.env`（首次运行自动生成）

## 可选：登录时自动启动

创建 `~/Library/LaunchAgents/com.freewelfare.app.plist`，把 `ProgramArguments` 指向本机 Node 和项目里的 `deploy/native/launcher.mjs`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.freewelfare.app</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/你的用户名/free-welfare/deploy/native/launcher.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/你的用户名/free-welfare</string>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/Users/你的用户名/free-welfare/data/launchd.out.log</string>
  <key>StandardErrorPath</key><string>/Users/你的用户名/free-welfare/data/launchd.err.log</string>
</dict>
</plist>
```

然后执行：

```bash
launchctl load ~/Library/LaunchAgents/com.freewelfare.app.plist
```

> 不熟悉 launchd 的话，建议使用 Docker 或双击启动脚本即可。
