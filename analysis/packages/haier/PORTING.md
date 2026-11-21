# 海尔智家（haier）迁移说明

## 基本信息

- AppID：`wxe24b2f1f4e378891`
- 应用 key：`haier`
- 源脚本：`N:\myProject\QLScriptPublic\wxapp\haier.js`
- 平台脚本：`data/apps/haier/scripts/sign-in.js`
- 应用配置：`data/apps/haier/app.json`
- 解包目录：`analysis/packages/haier/unpacked`（wxapkg 版本 514）
- 账号来源：平台 `ctx.account`（YYB 账号），不再读取青龙变量/本地 token 缓存文件
- 当前状态：已迁移，`node --check` 通过，使用本地 mock 走通登录、状态查询、签到、token 失效重登、未注册分支
- 是否启用：`enabled: true`（已注册会员可正常运行）

## 接口清单

域名：`https://zj.haier.net`

### 登录

- `POST /api-gw/oauthserver/applet/v1/jscode2session`
  - body：`{ "code": "<wx code>" }`
  - 请求头不带 token，带 `sign`
  - 响应 `retCode="00000"`，`data.tokenInfo.accountToken` 为后续 token
  - 若没有 `accountToken` 但返回 `openId`/`unionId`，表示该微信号未注册海尔智家会员

### 用户信息

- `POST /api-gw/oauthserver/applet/v1/userinfo/query`
  - body `{}`，带 token
  - 源脚本登录后调用一次，失败忽略；平台脚本同样只记录警告

### 签到状态（来自解包）

- `GET /api-gw/zjBaseServer/daily/getSignStatus`
  - 返回 `retCode="00000"`，`data.signStatus`、`data.totalSignDay`
  - 用于避免重复签到；解包页面 `pages/activity` 使用同一接口

### 签到

- `POST /api-gw/zjBaseServer/daily/sign`
  - body `{}`，带 token
  - 成功 `retCode="00000"`，`data.totalSignDay`、`data.haibeiCount`
  - 失败信息包含「已签 / 签到过 / 重复 / 已完成」时按今日已签到处理

### 注册

- 源脚本没有自动注册；只会在 `jscode2session` 返回 openId/unionId 但没有 `accountToken` 时提示用户先在小程序注册。
- 解包中存在短信登录/注册接口：
  - `POST /api-gw/oauthserver/applet/v1/sms`
  - `POST /api-gw/oauthserver/applet/v3/login/sms`
  - 但都需要短信验证码，无法用 `ctx.yyb.getPhoneAuth()` 完成，未接入。
- 遇到未注册账号时抛 `ctx.manualRequired(..., { details: { action: 'register' } })`。

### 积分 / 商品

- 未新增 `points.js`：小程序内「我的积分」跳到 H5
  `https://zjrs.haier.net/zjapp/memberPoints/index.html`，没有可确认的积分余额接口。
  解包 API 表中虽有 `/wing/member/point/query`，但当前代码没有调用，host 归属（`m.ehaier.com` / `zjhx.haier.net`）和返回结构无法确认，故不接入。
- 签到返回的 `haibeiCount` 是本次获得的海贝，仅作为 `metrics.earned` 和提示信息，不当作余额写入 `ctx.points`。
- 未新增 `products.js`：小程序内「积分商城」跳到 H5
  `https://jf.haier.com/m/?needShare=0#/index2`，没有可确认的积分商品列表接口。

## 请求头与签名

```
Content-Type: application/json;charset=UTF-8
appId: MB-SHEZJAPPWXXCX-0000
appKey: 79ce99cc7f9804663939676031b8a427
timestamp: <毫秒时间戳>
platForm: sc-mp-wx-zjapp
ENV: (空)
accessToken: <token>
accountToken: <token>
ak: <token>
clientId: <时间戳 + 12 位随机字母数字>
accept: */*
user-agent: Mozilla/5.0 ... MicroMessenger/7.0.20.1781 ... WindowsWechat/WMPF
referer: https://servicewechat.com/wxe24b2f1f4e378891/475/page-frame.html
sign: <仅 jscode2session>
```

- `sign = sha256(path + JSON.stringify(body) + appId + appKey + timestamp)`，只在 `jscode2session` 请求上携带。
- 登录请求 `accessToken` / `accountToken` / `ak` 均为空；签到和查询状态时三者为同一个 token。
- 仅使用 `ctx.crypto.sha256`，无 AES/RSA。
- 成功码：`retCode="00000"`；登录同时兼容 `code=200` / `success=true`。
- token 失效码：`21016`、`21018`、`00202`、`errorCode=40001`，或消息命中 token/登录/未授权/失效/过期/未登录/鉴权。

## 缓存

- 缓存 key：`auth`
- 内容：`{ token, updatedAt }`
- TTL：7 天
- 签到状态接口发现 token 失效时清缓存、重新取码登录并重试一次。

## 阻塞项 / 待验证

- 未注册的微信号无法自动注册：海尔只提供短信注册/登录，脚本会抛 `manualRequired(action=register)`，需要先在小程序内完成会员注册再重跑。
- 未做真实账号联调；`clientId` 使用随机值，服务端未验证其格式。
- 积分余额没有可信接口，`ctx.points` 不写入；如需积分余额，需要后续确认 `/wing/member/point/query` 的 host 和参数。
- 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
