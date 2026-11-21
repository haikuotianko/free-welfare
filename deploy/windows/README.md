# Windows 直接运行

这是不依赖 Docker 的 Windows 运行方式：使用内置 PostgreSQL（`embedded-postgres`），不要求预装 PostgreSQL。

## 一键脚本

在项目根目录打开 PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\start.ps1
```

首次运行会自动执行：

1. `npm ci` / `npm install`
2. `npm run npm:build`
3. 安装 `deploy/native` 的内置 PostgreSQL
4. 生成 `.env`、执行数据库迁移、启动 API + Worker
5. 打开 <http://localhost:3000>

数据保存在 `data/`，其中 PostgreSQL 数据在 `data/postgres/`。停止时在控制台按 `Ctrl+C`。

## 前置条件

- Node.js 22+，或使用安装包自带的 `runtime/`
- 首次运行需要联网安装依赖
- 不需要单独安装 PostgreSQL

## 自定义

编辑项目根目录的 `.env`：

```ini
APP_PORT=3000
EMBEDDED_PG_PORT=5433
# 使用外部 PostgreSQL 时设为 false，并填写 DATABASE_URL
EMBEDDED_PG=false
# 可选：自定义数据目录
NATIVE_DATA_DIR=./data
```

修改后重新运行 `start.ps1`。

## 安装包

`deploy/windows/build-installer.ps1` 会生成带 Node 运行时的 `Free-Welfare-Setup-<版本>.exe`：

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\build-installer.ps1
```

生成的安装包安装到 `%LOCALAPPDATA%\Free Welfare`，不需要管理员权限；开始菜单和桌面会创建快捷方式。首次启动会联网安装依赖并构建，之后启动会直接运行。

> 安装包未签名，Windows SmartScreen 可能提示“未知发布者”，选择“仍要运行”即可。

## 卸载

关闭 Free Welfare 控制台窗口，删除 `%LOCALAPPDATA%\Free Welfare`，再删除桌面和开始菜单的 `Free Welfare` 快捷方式。需要保留账号/脚本时，先备份安装目录下的 `data/` 和 `.env`。
