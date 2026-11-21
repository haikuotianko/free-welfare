# 嘉立创 JLC（jlc）迁移记录

## 基本信息

- 应用 key：`jlc`
- 名称：嘉立创
- AppID：`wx6c7b851c877dba42`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\jlc.js`
- 平台脚本：`data/apps/jlc/scripts/sign-in.js`
- 应用清单：`data/apps/jlc/app.json`
- API Base：
  - `https://m.jlc.com`
  - `https://passport.jlc.com`
- 页面 Referer 版本：`154`
- 一个 Run 只处理 `ctx.account`，不循环账号。
- 当前 `enabled`：`true`

## 接口清单

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 获取 secretkey | `POST https://m.jlc.com/api/integrated/secret/update` | JSON `{}` 或 `{keyId}` | `code == 200`，`data.keyId` 作为后续 `secretkey` 请求头；过期码 `29001` / `29003`，登录接口也可能返回 HTTP 460 |
| CAS 检查小程序登录 | `POST https://passport.jlc.com/api/cas/sso/login/check-applet-login` | JSON `{appId:"JLC_MOBILE_APP", appletAuthCode:<wx code>}` | `code == 200`，`data.token` 为 applet login token；`data.isLoginBind === false` 或 `data.bind === false` 表示该微信未绑定嘉立创账号 |
| CAS 静默登录 | `POST https://passport.jlc.com/api/cas/sso/login/applet-silent-login` | JSON `{token:<applet login token>, appId:"JLC_MOBILE_APP"}` | `code == 200`，响应内递归查找 `AC-` 前缀字符串作为 CAS 授权码 |
| 登录 | `POST https://m.jlc.com/api/login/login-by-code` | `multipart/form-data`，字段 `code=<CAS AC- 授权码>` | token 优先取响应头 `x-jlc-accesstoken`，其次 body `data.accessToken` / `data.token` / `data.access_token` |
| 签到状态 | `GET /api/activity/sign/getCurrentUserSignInConfig` | `platformType=MP-WEIXIN` | `success === true`；`data.haveSignIn` / `data.haveReceive` / `data.day`（连续天数） |
| 每日签到 | `GET /api/activity/sign/signIn` | `platformType=MP-WEIXIN&source=2` | `success === true`；`data.gainNum` 为本次豆豆 |
| 第七天领取 | `GET /api/activity/sign/receiveVoucher` | `platformType=MP-WEIXIN` | 仅在 `day == 7 && haveSignIn && !haveReceive` 时调用；`success === true`，`data` 为奖励 |
| 豆豆总数 | `GET /api/activity/front/getCustomerIntegral` | 无 | `success === true`；`data.integralVoucher` 为余额，`data.expireTime` 为有效期 |

固定常量（原脚本硬编码的应用级常量，不是个人凭证）：

- `CAS_APP_ID = "JLC_MOBILE_APP"`
- `PLATFORM_TYPE = "MP-WEIXIN"`
- `SOURCE = "2"`
- `MP_ENV = "release"`
- `MP_VERSION = "1.117.4"`
- `PAGE_VERSION = "154"`

## 请求头 / 加密

无自建签名、无请求加密；核心是动态 `secretkey`（keyId）。

获取/刷新 secretkey：

```text
accept: application/json, text/plain, */*
content-type: application/json;charset=UTF-8
X-JLC-AccessToken: <token 或 NONE>
X-JLC-ClientType: MP-WEIXIN
X-JLC-MP-AppId: wx6c7b851c877dba42
X-JLC-MP-Env: release
X-JLC-MP-Version: 1.117.4
origin: https://m.jlc.com
referer: https://m.jlc.com/
user-agent: <原青龙 UA>
```

CAS 两步：

```text
accept: application/json, text/plain, */*
content-type: application/json
referer: https://servicewechat.com/wx6c7b851c877dba42/154/page-frame.html
        （第二步改为 https://passport.jlc.com/m/login/mp-login?appId=JLC_MOBILE_APP）
user-agent: <原青龙 UA>
```

登录（multipart）：

```text
content-type: multipart/form-data; boundary=<随机 boundary>
accept: application/json, text/plain, */*
referer: https://servicewechat.com/wx6c7b851c877dba42/154/page-frame.html
X-JLC-AccessToken: NONE
X-JLC-ClientType: MP-WEIXIN
X-JLC-MP-AppId: wx6c7b851c877dba42
X-JLC-MP-Env: release
X-JLC-MP-Version: 1.117.4
secretkey: <动态 keyId>
xweb_xhr: 1
user-agent: <原青龙 UA>
```

业务 GET：

```text
accept: application/json, text/plain, */*
content-type: application/json;charset=UTF-8
x-jlc-accesstoken: <token>
secretkey: <动态 keyId>
origin: https://m.jlc.com
referer: https://m.jlc.com/
user-agent: <原青龙 UA>
```

SDK 的 `form` 是 `application/x-www-form-urlencoded`，因此 multipart body 用
`rawBody` 手工拼接（单个字段 `code`），未改登录协议。

## 登录态、缓存与重试

- `ctx.cache` 键 `auth`，保存 `{ token, secret, updatedAt }`，TTL 7 天。
- 有缓存时先调签到状态接口校验；`success === true` 视为 token 有效。
- 缓存 token 失效：清缓存，重新 `ctx.yyb.getCode({ appId })` → CAS 两步 → 登录。
- 登录时若响应 body code 为 `29001` / `29003` 或 HTTP 460，刷新 secretkey 并用新的
  CAS 授权码重试一次（与青龙脚本一致，最多 2 次尝试）。
- 业务 GET 遇到 `29001` / `29003` 时刷新 secretkey 并重试一次；刷新后的 secret
  会写回缓存。
- 签到过程中查询状态返回鉴权错误时，清缓存重新登录并只重试一次。
- 日志不输出 token、微信登录 code、secretkey。

## 注册 / 绑定

- CAS `check-applet-login` 返回 `isLoginBind === false` 或 `bind === false` 时，
  该微信尚未绑定嘉立创账号。
- 青龙脚本没有自动注册/绑定接口，只提示先在小程序里登录绑定。
- 平台实现：抛 `ctx.manualRequired(..., { details: { action: 'register' } })`。
- 未实现手机号授权注册，原脚本也没有该流程。

## 积分

- 余额来源：`GET /api/activity/front/getCustomerIntegral` 的 `data.integralVoucher`。
- 签到后查询并调用 `ctx.points.sync({ balance, estimated: false })`。
- `metrics.earned` 记录本次签到 `gainNum`；第七天奖励金额放在返回值 `data.voucherGain`。
- 与原脚本一致，签到失败/风控时仍会查询豆豆总数并同步余额；整体结果保持 `ok: false`。
- 豆豆总数查询失败不会把已成功的签到判为失败，只记 warn 并跳过积分同步。

## 商品 / 券

- 青龙脚本没有商品/优惠券列表接口。
- `receiveVoucher` 是连续第 7 天领取奖励，不是商品列表。
- 因此未创建 `products.js`。

## 当前状态

- 代码：`node --check data/apps/jlc/scripts/sign-in.js` 通过。
- 清单：`app.json` JSON 校验通过。
- 本地 mock 验证通过：secretkey 获取、CAS 两步换码、multipart 登录、签到、
  连续第 7 天领取、豆豆余额同步、缓存 token 复用、secret 过期刷新重试、
  未绑定微信转人工。
- 未连接真实 YYB / 嘉立创服务器联调（本机没有平台运行时的账号 ref / code）。
- 本次迁移只依据青龙脚本 `jlc.js`，未使用缓存小程序包。
- `enabled: true`。

## 阻塞 / 风险

1. **绑定阻塞**：未在嘉立创绑定当前微信的账号会每次运行都转人工，需要先在小程序内
   登录绑定一次。原脚本没有自动绑定能力。
2. **服务端风控**：嘉立创可能返回“违反签到规则/疑似/风控”等提示。原脚本明确说明
   这是服务端对账号或运行环境的判定，脚本层无法绕过；平台返回 `ok: false` 并保留
   原始提示。
3. **未实测**：CAS 两步、multipart 登录、签到和豆豆接口均未用真实账号跑过。
   `AC-` 授权码仍按原脚本“递归查找 AC- 前缀字符串”提取，若 CAS 响应结构变化会失败。
4. **版本号/Referer**：`154`、`MP_VERSION=1.117.4` 为青龙脚本抓包时的值，小程序升级后
   可能需要同步更新。
5. **secretkey**：`X-JLC-AccessToken` 大小写、响应头 `x-jlc-accesstoken` / `secretkey`
   已做大小写不敏感读取；若服务端改为其它响应头名称，需要重新抓包。
