# 22 应用商店与应用源

应用商店把“订阅源”从脚本仓库升级为**应用源**：一个源可以发布多个应用，每个应用带元数据、根 URL、环境变量和一组功能脚本。用户订阅多个源后，可以统一搜索、下载、配置、启用和测试。

## 1. 概念

| 概念 | 说明 |
| --- | --- |
| 应用源 | 一个 `index.json`，列出该源提供的应用 |
| 源应用 | 应用源里的一个条目，包含 AppID、积分别名、脚本清单等 |
| 下载 | 把源应用的脚本写入本机 `data/apps/<key>/scripts/`，并创建/更新 `Site`、`SiteScript`、`SiteEnvVar` |
| 更新 | 重新下载脚本；保留用户已配置的 cron、参数、启停状态 |
| 应用 | 下载后的本机应用，继续使用现有的应用详情、账号绑定、运行、积分、商品等页面 |

## 2. 应用源 index.json

```json
{
  "schema_version": 2,
  "generated_at": "2026-11-16T10:00:00.000Z",
  "scripts": [],
  "apps": [
    {
      "key": "demo",
      "name": "示例应用",
      "appId": "wx0000000000000000",
      "platform": "wechat_miniprogram",
      "description": "示例应用简介",
      "icon_url": "https://example.com/icon.png",
      "points_name": "积分",
      "category": "会员",
      "version": "1.0.0",
      "root_urls": ["api.example.com"],
      "network_notes": "脚本只访问 api.example.com",
      "env": [
        {
          "key": "EXAMPLE_KEY",
          "description": "示例密钥",
          "secret": true
        }
      ],
      "scripts": [
        {
          "name": "签到",
          "file_path": "sign-in.js",
          "description": "登录并签到",
          "cron": "30 8 * * *",
          "timezone": "Etc/UTC",
          "args": "",
          "capabilities": ["sign_in", "points"],
          "enabled": false
        }
      ],
      "bundle_url": "https://example.com/bundles/demo.json"
    }
  ]
}
```

说明：

- `key` 只能包含小写字母、数字、`.`、`_`、`-`，且不能以 `.` 开头。
- `appId` 必填；`platform` 默认 `wechat_miniprogram`。
- `root_urls` 可以写字符串或 `{ "url": "...", "purpose": "...", "pathPrefix": "..." }`；只写域名会自动补 `https://`。
- `scripts[].file_path` 相对于应用的 `scripts/` 目录，例如 `sign-in.js`、`common.js`。
- `capabilities` 取值：`login`、`register`、`sign_in`、`points`、`products`、`activities`、`redeem`、`grab`。
- 下载时默认不自动启用脚本；需要用户确认环境变量后再启用。
- `bundle_url` 可使用 `http(s)://` 或 `local://`。也支持在条目里内联 `"files": { "sign-in.js": "..." }`。

## 3. 应用包 bundle

默认格式是 JSON，避免额外解压依赖：

```json
{
  "files": {
    "sign-in.js": "module.exports = { async run(ctx) { ... } };",
    "points.js": "module.exports = { async run(ctx) { ... } };",
    "common.js": "module.exports = { ... };"
  }
}
```

也接受数组：

```json
{
  "files": [
    { "path": "sign-in.js", "content": "..." }
  ]
}
```

限制：

- 单包最大 4MB；
- 最多 100 个文件；
- 只允许 `js/ts/mjs/cjs/json/md/txt`；
- 文件只能写入应用的 `scripts/` 目录，路径不能包含 `..`。

## 4. 本机应用源

把当前 `data/apps/*` 打包成本机应用源：

```bash
pnpm build:app-source
```

输出：

```text
data/app-store/index.json
data/app-store/bundles/<key>.json
```

然后在应用商店里点“本地目录”，或手动添加：

```text
名称：本地应用目录
index.json：local://app-store/index.json
仓库地址：local://app-store
```

`local://` 路径相对于 `data/` 目录，适合自托管单机使用。

## 5. HTTP API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/app-store/sources` | 已订阅应用源（含应用数、脚本版本数） |
| `POST` | `/api/v1/app-store/sources` | 添加应用源 |
| `POST` | `/api/v1/app-store/sources/:id/sync` | 同步应用源 |
| `DELETE` | `/api/v1/app-store/sources/:id` | 取消订阅；已下载应用保留 |
| `GET` | `/api/v1/app-store/apps` | 应用列表；支持 `q`、`sourceId`、`installed`、`category` |
| `GET` | `/api/v1/app-store/apps/:id` | 应用详情（含原始 manifest） |
| `POST` | `/api/v1/app-store/apps/:id/install` | 下载应用；body `{ "bindAll": false, "enableScripts": false }` |
| `POST` | `/api/v1/app-store/apps/:id/update` | 更新应用脚本，保留用户配置 |

## 6. 下载流程

1. 读取 `SourceApp.manifest`。
2. 从 `bundle_url` 下载 JSON 包（或使用内联 `files`）。
3. 校验文件路径、扩展名、大小。
4. 写入 `data/apps/<key>/scripts/`。
5. `Site.upsert`：名称、AppID、积分别名、根 URL、白名单、来源元数据。
6. `SiteScript` upsert：新脚本按源清单创建；已有脚本更新名称、描述、能力，保留 cron/参数/启停。
7. `SiteEnvVar`：缺失的环境变量创建为空加密值，不覆盖已有值。
8. 可选 `bindAll`：绑定所有 `alive` 微信账号。
9. 重新计算应用能力列表。

下载默认不启用脚本；只有安装时传 `enableScripts: true`（界面勾选“下载后启用脚本”）才会按源清单启用。

下载完成后，用户到应用详情：

- 填写环境变量；
- 绑定账号；
- 检查/修改 cron；
- 启用脚本；
- 手动运行测试，确认无误后再开启定时。

## 7. 小程序码

商品页和应用详情只有在拿到小程序码地址时才显示“小程序码”按钮，不伪造普通二维码。

支持来源：

- 商品 `raw.qrCodeUrl` / `raw.qrcode` / `raw.qr_code` / `raw.miniprogramCode`
- 应用 `metadata.qrCodeUrl` / `metadata.qrcode`
- 应用配置 `config.qrCodeUrl` / `config.qrcode`

没有真实小程序码时，按钮会自动隐藏。需要时可以在应用详情 → 应用配置 JSON 里填写：

```json
{ "qrCodeUrl": "https://.../miniprogram-code.png" }
```

## 8. 安全与信任

- 应用源内容会写入本机并作为脚本执行，只订阅可信来源。
- `trustLevel` 仅作 UI 提示，不限制执行。
- 下载不会自动启用脚本，避免配置未完成就定时运行。
- 远程源应使用 HTTPS；自托管本地源可用 `local://`。
- 公开源不应包含账号、Cookie、密钥等敏感数据；环境变量只放空值，由用户填写。
