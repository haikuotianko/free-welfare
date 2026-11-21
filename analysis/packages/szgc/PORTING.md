# 深圳春茧未来荟（szgc）迁移记录

## 基本信息

- 应用 key：`szgc`
- 名称：深圳春茧未来荟
- AppID：`wx6b10d95e92283e1c`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\szgc.js`
- 平台脚本：`data/apps/szgc/scripts/sign-in.js`
- 应用清单：`data/apps/szgc/app.json`
- API Base：`https://program.springcocoon.com`
- 框架：ABP / ASP.NET Boilerplate，Cookie 会话鉴权（不返回 token）
- 账号来源：平台 `ctx.account`（YYB），一个 Run 只处理一个账号
- 解包目录：无（按要求未依赖缓存的小程序包）
- 当前状态：已迁移，`node --check` 通过；本地 mock 覆盖登录、Cookie/XSRF、签到、缓存会话、鉴权失效重登、已签到、未绑定会员；**真实网络受 TLS 阻塞**
- 是否启用：`enabled: false`（原因见“阻塞项”）

## 接口清单

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 微信登录 | `POST /szbay/Weixin/Home/MiniProgramLoginAsync` | JSON `{ Code, TenancyName:"szbay", AppId:"wx6b10d95e92283e1c" }` | `success===true`；服务端下发鉴权 Cookie，不返回 token。`result.bindEmpID` 为空表示未绑定/未注册会员 |
| 获取 XSRF | `GET /szbay/AppInteract/SignIn/Index` | 无 | 响应下发 `XSRF-TOKEN` Cookie，回填到 `X-XSRF-TOKEN` 请求头 |
| 执行签到 | `POST /szbay/api/services/app/SignInRecord/SignInAsync` | JSON `{ id:"6c3a00f6-b9f0-44a3-b8a0-d5d709de627d", webApiUniqueID:"404e4880-25da-255b-f6e3-cded50d2cb52" }` | `success===true`；`result.listSignInRuleData[0].point` 为本次积分。已签/失败时 `success===false`，看 `error.message` |

`TenancyName`、`AppId`、`id`、`webApiUniqueID` 均为该小程序固定应用常量（青龙脚本硬编码，
非个人凭证）。

登录成功判定：

- `body.success === true`
- 且 `result.bindEmpID || result.bindEmpId || result.BindEmpID` 非空
- 否则视为未绑定会员，抛 `ctx.manualRequired(..., { details: { action: 'register' } })`

已签到判定：失败文案命中 `/已签|已经签|签到过|重复|已完成|签过|today|already/i`。

鉴权失效判定（与青龙脚本一致）：

- HTTP `401` / `403`
- `body.unAuthorizedRequest === true`
- `error.message` / `message` 命中 `/未登录|登录已过期|重新登录|未授权|无权|尚未登录|会话|身份|token/i`

## Cookie 会话流程

青龙脚本没有使用 axios 默认 cookie jar，而是 `maxRedirects: 0` + 手动跟随重定向，
逐跳累积 `Set-Cookie`，复刻 Python `requests.Session`：

1. `login()`：清空 CookieJar，POST 登录；响应 `Set-Cookie` 写入 jar。
2. `prepareXsrf()`：GET 签到页，读取 jar 里的 `XSRF-TOKEN`，后续请求带 `X-XSRF-TOKEN`。
3. `sign()`：带 `Cookie` + `X-XSRF-TOKEN` POST 签到。
4. 301/302/303/307/308 且存在 `location` 时手动跟随，最多 5 跳；307/308 保留原方法和 body，
   其余转 GET。与青龙脚本一致。
5. 签到失败（鉴权错误或首次业务失败）时重新登录、重新取 XSRF，再重试一次。

平台实现：

- 使用 `ctx.http.request({ followRedirects: false })` 手动跟随，因为 `createLegacyAdapter`
  固定 `followRedirects: true`，会丢失中间跳转的 Cookie。
- CookieJar 自行维护，登录/取 XSRF 后写入 `ctx.cache`，下次运行优先复用。
- CookieJar 同时兼容 `Set-Cookie` 为数组或合并成一行的情况（按
  `,(?=\s*[^;,]+=)` 拆分）。

## 请求头

```text
Host: program.springcocoon.com
User-Agent: Mozilla/5.0 (Linux; Android 12; M2012K11AC ...) ... MiniProgramEnv/android
Accept: application/json, text/plain, */*
Accept-Language: zh-CN,zh;q=0.9
Cookie: <CookieJar 累积值>
X-XSRF-TOKEN: <XSRF-TOKEN Cookie 值>   # 获取后
Content-Type: application/json          # 仅带 body 的请求
```

- 无签名、无加密，不依赖 `ctx.crypto`。
- 取码：`ctx.yyb.getCode({ appId: 'wx6b10d95e92283e1c' })`；使用缓存会话时不会重新取码。
- 平台 `fetch` 会忽略脚本设置的 `Host`（由 URL 决定），保留该头只为与原脚本一致。

## 缓存

- 缓存 key：`auth`（平台按账号隔离）
- 内容：`{ cookies: { "<name>": "<value>" }, updatedAt }`
- TTL：7 天
- 有缓存 Cookie 时直接复用，先取 XSRF 再签到；签到失败会清缓存并重新登录一次。
- 登录成功后立即写入缓存；取到 XSRF 后再次写回更新后的 Cookie。

## 注册

青龙脚本没有注册/绑定会员接口，只在 `bindEmpID` 为空或登录文案命中
`/未注册|未绑定|完善|注册会员|绑定手机|激活/` 时提示先在小程序登录/注册。因此：

- 抛 `ctx.manualRequired(..., { details: { action: 'register' } })`。
- 无手机号授权/注册流程可迁移。

## 积分

- 签到成功响应里的 `point` 是“本次签到获得积分”，不是账户余额。
- 青龙脚本没有积分余额查询接口，因此不调用 `ctx.points.sync`，避免编造余额。
- 本次获得的积分写入 `metrics.earned` 和 `data.pointsGained`（有数值时）。
- `capabilities` 只声明 `sign_in`，未声明 `points`。

## 商品 / 优惠券

未新增 `products.js`。青龙脚本没有商品/优惠券列表或兑换接口。

## 验证情况

- `node --check data/apps/szgc/scripts/sign-in.js` 通过
- `app.json` JSON 解析通过
- 本地 mock 覆盖：
  - 登录下发 `.AspNetCore.Cookies` → 取 `XSRF-TOKEN` → 签到成功 `point: 8`
  - 缓存 Cookie + 签到返回 `unAuthorizedRequest`：清缓存、重登、重取 XSRF、重试成功
  - `bindEmpID` 为空：抛 `manualRequired(action=register)`
  - 今日已签到文案：`alreadyDone: true`，不重复提交
  - TLS 握手错误：转为带排查提示的 `ApiError`
- Cookie 解析、XSRF 头、签到 body 的固定 `id` / `webApiUniqueID` 均由 mock 断言

## 阻塞项 / 待验证

1. **TLS 握手（阻塞，脚本停用）**：目标服务器要求旧版 TLS 重协商。青龙脚本使用
   `https.Agent({ secureOptions: SSL_OP_LEGACY_SERVER_CONNECT, ciphers: 'DEFAULT@SECLEVEL=1' })`，
   平台 `ctx.http` 固定使用全局 `fetch`，无法传自定义 Agent。实测 Node 24.21.0：
   `fetch('https://program.springcocoon.com/...')` 报
   `SSL routines:final_renegotiate:unsafe legacy renegotiation disabled`；
   加 `--openssl-legacy-provider` 仍失败。需要平台给 HTTP 客户端增加自定义 TLS Agent/连接选项，
   或在 worker 侧为该域名启用 `SSL_OP_LEGACY_SERVER_CONNECT` + `SECLEVEL=1`，才能启用本脚本。
2. **多 Cookie 丢失风险**：平台 runner 把响应头扁平化成
   `Record<string, string>`，同名 `Set-Cookie` 只保留最后一条。当前 ABP 登录/取 XSRF 预计
   各只下发一条关键 Cookie；若服务端一次下发多条（如分块身份 Cookie + XSRF），脚本只能拿到
   最后一条。需要平台保留 `set-cookie` 数组，或在网关层处理。
3. 未使用真实 YYB 账号 + 真实会员账号联调；`bindEmpID` 字段名兼容了三种大小写，仍以实际返回为准。
4. 登录若由服务端 302 到 HTML 页面，青龙脚本与当前实现都会把最终 HTML 当作登录响应解析而失败；
   需要真实抓包确认登录接口是否直接返回 JSON。当前按青龙逻辑保留手动重定向。
5. 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
