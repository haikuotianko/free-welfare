# 薇诺娜（wrn）迁移记录

## 基本信息

- 应用 key：`wrn`
- 名称：薇诺娜
- AppID：`wx250394ab3f680bfa`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\wrn.js`
- API 域名：
  - `https://zhls.qq.com`（code 换明文 openId/unionId）
  - `https://api.qiumeiapp.com`（快速登录、签到）
- 平台脚本：`data/apps/wrn/scripts/sign-in.js`
- 应用清单：`data/apps/wrn/app.json`
- 当前状态：已迁移，`node --check` 通过；mock ctx 走通“登录 → 签到 → 积分同步”“缓存 703 已签”“code 600 重登”“openId 换取失败转人工注册”
- 是否启用：`enabled: true`
- 商品脚本：未创建。青龙脚本没有积分商品/优惠券列表接口。

## 接口清单

### 登录三步

1. `GET https://zhls.qq.com/wxlogin/getOpenId`

   - Query：`appid=wx250394ab3f680bfa`、`js_code=<wx.login code>`
   - 请求头：
     - `User-Agent`：iPhone iOS 17_6_1 + MicroMessenger/8.0.56
     - `Accept: */*`
     - `Referer: https://servicewechat.com/wx250394ab3f680bfa/637/page-frame.html`
   - 响应：`openId`、`unionId`（也兼容 `openid` / `unionid` / `OpenId` / `UnionId`）。
   - 拿不到 openId/unionId 时无法继续，平台脚本转 `manualRequired`（`action: register`，`step: getOpenId`）。

2. YYB 取手机号授权

   - `ctx.yyb.getPhoneAuth({ appId })`，取新式手机号 `phoneCode`（QL 里是 `wx_server /wx/getphonenumber` 的 `code` / `data.code` / `phoneCode` / `raw.code`）。
   - 该店使用新式 phoneCode：服务端用小程序自身 access_token 换手机号，不需要与 wx.login code 配对。
   - 取不到 phoneCode 时转 `manualRequired`（`action: register`，`step: phoneAuth`）。

3. `POST https://api.qiumeiapp.com/zgxcx/10001/zgxcxUserFastLogin`

   - `Content-Type: application/x-www-form-urlencoded`
   - Form body（顺序与编码保留原脚本）：

```text
code=<phoneCode>
&unionid=<unionId>
&xcxOpenid=<openId>
&zgCounterId=0&vm1Code=&registerSource=0
```

   - 请求头：
     - `Host: api.qiumeiapp.com`
     - `Content-Type: application/x-www-form-urlencoded`
     - `User-Agent`：iPhone iOS 17_6_1 + MicroMessenger/8.0.56
     - `Accept: */*`
     - `Referer: https://servicewechat.com/wx250394ab3f680bfa/753/page-frame.html`
   - 成功条件：`code === 200` 且有 token。
   - token 提取顺序：`data.zgUserToken`、`data.token`、`data.appUserToken`、顶层 `zgUserToken`。
   - 快速登录即注册，没有独立注册接口。

### 签到

`POST https://api.qiumeiapp.com/zg-activity/zg-daily/zgSigninNew`

- `Content-Type: application/x-www-form-urlencoded`
- Form body：`appUserToken=<token>`
- 请求头：
  - `Host: api.qiumeiapp.com`
  - `Content-Type: application/x-www-form-urlencoded`
  - `User-Agent`：同上
  - `Accept: */*`
  - `Referer: https://servicewechat.com/wx250394ab3f680bfa/637/page-frame.html`
- 业务码：
  - `200`：签到成功，`data.integral` 为本次积分。
  - `703`：今日已签。
  - `600`：token 失效，清缓存重新登录后重试一次。
  - 其他文案命中 `/已签|已经签|签到过|重复|已完成|already/i` 也按今日已签。
  - token 文案命中 `/token|登录|未授权|失效|过期|未登录|鉴权|重新登陆|重新登录/i` 时重登重试一次（保留原脚本）。

## 请求头 / 加密

- 无自建签名、无 AES/RSA；`zgCounterId=0`、`vm1Code=`、`registerSource=0` 是应用级固定常量，原脚本硬编码，非个人凭证。
- 登录链路唯一“加密”是微信手机号授权的 phoneCode 透传，以及 code→openId/unionId 的腾讯中转接口。
- 两个请求 host（`zhls.qq.com`、`api.qiumeiapp.com`）都已写入 `app.json` 的 `rootUrls`，供平台 HTTP 白名单使用。

## 登录态与缓存

- `ctx.cache` 键：`auth`，保存 `{ token, openId, unionId, updatedAt }`，TTL 7 天。
- 有缓存 token 时直接签到；`code 600` 或 token 失效文案触发清缓存、重新登录并重试一次。
- 登录成功后缓存新 token。

## 注册 / 手机号

- 青龙脚本没有独立注册接口，`zgxcxUserFastLogin` 就是“快速登录/注册”。
- 平台脚本已实现该自动登录/注册路径。
- 拿不到 openId/unionId 或手机号 phoneCode，或服务端拒绝快速登录时，抛
  `ctx.manualRequired(..., { details: { action: 'register' } })`，不伪造成功。

## 积分 / 商品

- 积分来源：签到成功响应 `data.integral`。
- 查到数字后调用 `ctx.points.sync({ balance, estimated: false })`。
- `703` 已签分支没有余额字段，本次 Run 不写积分，避免覆盖已有余额。
- 青龙脚本没有积分商品/优惠券列表接口，未创建 `products.js`。

## 状态 / 阻塞

- 代码：`node --check` 通过；`app.json` JSON 校验通过。
- mock 测试：code→openId/unionId → 手机号 phoneCode → 快速登录 → 签到 200 → 积分 12；缓存 703；`code 600` 重登；openId 换取失败转 `manualRequired`。
- 未做实网联调：本机没有平台运行时的 YYB 账号 ref / code。
- 阻塞/风险：
  1. `zhls.qq.com/wxlogin/getOpenId` 是腾讯侧 jscode2session 中转；如果该接口限制来源或下线，登录会转人工注册。
  2. 登录依赖 YYB 返回新式手机号 `phoneCode`（不需要 encryptedData/iv）；若协议不返回 phoneCode，则无法自动登录。
  3. `703` 已签时拿不到积分余额，本次不同步积分，这是原接口能力限制。
