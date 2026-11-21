# 12 网络策略：根 URL、白名单与 SDK 请求

## 1. 目标

每个应用（小程序）可能有多条网络根 URL；平台需要：

- 在分析文档里记录所有根 URL，说明用途、是否脚本需要、是否已加入白名单；
- 在应用级配置**白名单模式**或**不限制模式**；
- 脚本只能通过 SDK 的 `ctx.http` 发请求，不能直接 `fetch`/`http`/`https`；
- 代理层统一做白名单、SSRF 防护、限流、审计、日志脱敏。

## 2. 术语

| 术语 | 含义 |
| --- | --- |
| 根 URL / root URL | 一个协议 + 域名 + 端口，如 `https://api.example.com` |
| Origin | `scheme://host[:port]` |
| Path prefix | 可选的路径前缀，如 `/api/v1` |
| 应用网络模式 | `whitelist`（默认）或 `unrestricted` |
| 脚本声明域名 | manifest `allowed_domains`，声明脚本需要访问哪些 host |
| 有效策略 | 应用策略 ∩ 脚本声明（应用不限制时，仍受脚本声明限制） |

## 3. 应用配置

### 3.1 `root_urls`

记录在 `analysis/packages/<key>/metadata.yaml`，并同步到平台 `sites.root_urls`：

```yaml
network:
  mode: whitelist
  root_urls:
    - id: api
      url: https://api.example.com
      purpose: 登录/签到/积分/商品/兑换
      path_prefix: ""
      used_by: [auth, sign_in, points, products, redeem]
      required: true
    - id: img
      url: https://img.example.com
      purpose: 商品图片/静态资源
      path_prefix: ""
      used_by: []
      required: false
  allowed_origins:
    - https://api.example.com
  notes: "脚本只允许 api；img 仅页面展示，不加入脚本白名单。"
```

字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 内部标识 |
| `url` | 根 URL（scheme + host + port） |
| `purpose` | 用途 |
| `path_prefix` | 可选；只允许该前缀下的请求 |
| `used_by` | 哪些脚本/功能需要 |
| `required` | 脚本是否必须 |
| `notes` | 备注 |

### 3.2 模式

| 模式 | 行为 | 使用场景 |
| --- | --- | --- |
| `whitelist` | 只允许 `allowed_origins` + 可选 path prefix | 默认，推荐 |
| `unrestricted` | 允许任意公网 http(s)，仍拦截私网/回环/元数据/危险端口 | 自定义源/临时调试，强警告 |

`unrestricted` 不是“完全放开”：

- 仍禁止 `localhost`、私网 IP、链路本地、云元数据地址；
- 仍禁止非 http(s) 协议；
- 仍限制端口（默认 80/443，可配置）；
- 仍记录 URL/method/status；
- UI 必须显示红色警告。

## 4. 脚本声明

manifest：

```json
{
  "allowed_domains": ["api.example.com"]
}
```

- `allowed_domains` 是脚本的**最小声明**。
- 应用 `whitelist` 时：脚本只能访问应用白名单内的域名；manifest 不能扩大应用白名单。
- 应用 `unrestricted` 时：脚本仍只能访问 manifest 声明的域名。
- 脚本需要新域名：更新 manifest + 在应用网络配置里加入/确认。

## 5. SDK 请求

脚本只能：

```ts
await ctx.http.get(url, options);
await ctx.http.post(url, options);
await ctx.http.request(method, url, options);
```

禁止：

- `fetch`
- `http` / `https` / `net` / `tls` / `dns`
- `XMLHttpRequest` / `WebSocket`
- 任何绕过 SDK 的网络库

> 官方脚本可以使用依赖，但依赖也会走 Node 网络；审核时要检查。自定义源脚本不允许 `dependencies/require`，只能 `ctx.http`。

## 6. 代理层校验顺序

```text
1. run token 有效，账号/站点/能力匹配
2. URL 解析，必须 http(s)
3. host 在有效策略内
4. path prefix 匹配（如配置）
5. DNS 解析，拒绝私网/回环/链路本地/元数据
6. 端口检查（默认 80/443）
7. 禁止/限制重定向
8. 限流（账号/站点/run）
9. 发请求（按账号代理）
10. 记录审计：url/method/status/耗时；敏感 header/body 脱敏
```

失败返回标准错误：

```json
{
  "ok": false,
  "error_code": "network_denied",
  "message": "域名不在白名单：example.com"
}
```

## 7. 根 URL 记录示例（通用）

| id | 根 URL | 用途 | 脚本需要 | 加入白名单 |
| --- | --- | --- | --- | --- |
| `api` | `https://api.example.com` | 登录/签到/积分/商品/兑换 | 是 | 是 |
| `img` | `https://img.example.com` | 图片/静态资源 | 否 | 否 |
| `track` | `https://track.example.com` | 埋点 | 否 | 否 |

> 不把“页面会用到的图片/埋点”都放进脚本白名单；只放脚本真正请求的 API 根 URL。

## 8. UI

### 8.1 应用详情 → 网络

```text
网络模式：● 白名单   ○ 不限制（警告）
根 URL：
  api.example.com; img.example.com
```

- 只填域名/根地址，多个用换行、逗号或分号分隔。
- 支持 `http://` 和 `https://`；不写协议时默认补 `https://`，显式 `http://` 会保留。
- 系统自动生成 `allowed_origins`。
- 从 `metadata.yaml` 导入根 URL 保留为后续功能。
- 脚本安装时显示“需要域名”，检查是否被应用策略覆盖。
- `unrestricted` 显示红色警告 + 二次确认。

### 8.2 脚本详情

```text
允许域名：api.example.com
应用策略：白名单（已覆盖）
最近请求：GET api.example.com/... 200
```

## 9. 数据模型

`sites` 增加：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `network_mode` | text | `whitelist` / `unrestricted` |
| `root_urls` | jsonb | 根 URL 列表（id/url/purpose/path_prefix/used_by/required） |
| `allowed_origins` | text[] | 白名单 origin |
| `network_notes` | text | 备注 |

脚本 manifest 的 `allowed_domains` 保持文本数组；平台计算有效策略，不直接把 manifest 当全局白名单。

## 10. 安全边界

- 白名单降低脚本外联/SSRF 风险，但不能替代脚本审核。
- `unrestricted` 只适合可信脚本/临时调试；默认关闭。
- 私网/回环/元数据拦截始终开启。
- 重定向可能绕过白名单：默认禁止跨 origin 重定向，或每一跳重新校验。
- DNS rebinding：MVP 做解析后 IP 检查 + 禁止重定向；后续可固定解析 IP。
- 日志不记录 token/cookie/手机号/code/sid。

## 11. 已确定

- 根 URL 记录多个，放 `analysis/packages/<key>/metadata.yaml` 和平台 `sites.root_urls`。
- 应用级模式：`whitelist`（默认）/ `unrestricted`（需二次确认）。
- 白名单首期只支持**精确 origin + 可选 path prefix**，不做通配子域。
- 非 80/443 端口默认拒绝；需要时在应用网络配置里显式放行。
- `unrestricted` 仅管理员可开；仍拦截私网/回环/元数据/危险端口。
- 脚本 manifest 只能缩小应用白名单，不能扩大。
- 脚本只能走 SDK `ctx.http`；禁止 `fetch`/`http`/`https`/`net` 等直连。
- 失败统一 `network_denied`，并记录审计（URL/method/status/原因，不记录敏感 body）。
