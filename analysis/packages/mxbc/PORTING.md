# 蜜雪冰城（mxbc）迁移记录

- AppID：`wx7696c66d2245d107`
- 最新缓存包：`313`（2026-11-16 抓取，主包 + `_pages_coupon_` + `_pages_customer-center_`）
- 解包目录：`analysis/packages/mxbc/unpacked`

## 接口

- `POST /v1/app/code2Session`：`{ miniAppId, code }` 换 openid/unionid。
- `POST /v1/app/regByUnionid`：旧登录，`{ code, openId, unionid, third:"wxmini", miniAppId }`，返回 `accessToken`、`customerInfo`。
- `POST /v2/app/loginByAuthCode`：新登录，`{ authCode, openId, unionid, third:"wxmini", miniAppId }`，`authCode` 必须是新的 `wx.login` code。
- `GET /v1/customer/info`：会员信息，`customerPoint` 是雪王币余额，`isSignin` 是今日签到状态。
- `GET /v1/customer/signin`：每日签到。

## 鉴权 / 签名

- 请求头：`Access-Token`（JWT）、`version`、`x-ssos-cid`、`traceNo`、`xweb_xhr: 1`。
- 新版签名（包内 `utils/enhanceMD5.js`）：
  1. 参数对象加入 `appId=d82be6bbc1da11eb9dd000163e122ecb`、`t=Date.now()`、`s=3`；
  2. 按 key 排序，跳过假值（0 保留），删除空字符串，对象用 `JSON.stringify`；
  3. `md5(拼接串 + "0d787c102fe2f7b4279af8925819d5fd")`；
  4. 取 MD5 的 16 字节，每 4 字节按大端拼成有符号 int32，取绝对值（`-0x80000000` 用 `0x7fffffff`），四段十进制直接拼在 MD5 十六进制串后面，作为 `sign`。
- 旧青龙脚本使用 `RSA-SHA256` 私钥签名，已改为新版 `enhanceMD5`。

## 当前状态

- 登录、会员信息、雪王币查询正常（当前 830）。
- `GET /v1/customer/signin` 仍返回 `{"code":500,"msg":"请升级至最新版本"}`：
  - 已尝试新版 `s=3` 签名、旧 RSA 签名、`2.8.28/2.8.66/3.0.0/313` 版本头、`x-ssos-cid`/`traceNo`、GET/POST、`loginByAuthCode` 新 token，结果一致；
  - `customer/info` 的 `isSignin=0`，说明不是“今日已签到”；
  - 结论：服务端对签到接口做了版本/灰度限制，旧小程序脚本保持停用；新的青龙模式见下文。

## 2026-11-17 App 端 RSA 脚本对比

收到一份青龙 `mxbc.js`，它与小程序脚本的差异：

- 不调用 `code2Session` / `regByUnionid`，直接使用抓包得到的 `mxsa.mxbc.net/api` `Access-Token`；
- 请求头使用 `app: mxbc`、`appchannel: xiaomi`、`appversion: 3.0.3`、`User-Agent: okhttp/4.4.1`；
- 签名改为 `SHA256withRSA`，内容为 `appId=<appId>&t=<毫秒时间戳>`，私钥硬编码在脚本里；
- 青龙脚本里 URL 的 `t` 和签名内容里的 `t` 各调用了一次 `ts13()`，两次可能差 1ms，容易出现签名不一致；复现时应只取一次时间戳。

实测：

- 用 YYB 小程序登录拿到的 `accessToken`（JWT 的 `sub` 为 `wxmini_...`），配合同一套 RSA 签名和 App 请求头：
  - `GET /v1/customer/info` 返回 `code=0`，能读到雪王币和 `isSignin=0`；
  - `GET /v1/customer/signin` 仍返回 `{"code":500,"msg":"请升级至最新版本"}`。
- 又用 `/v2/app/loginByAuthCode` 重新登录换 token，签到结果一致。

结论：RSA 签名本身不是阻塞点，阻塞点是 **token 来源**。App 端签到接口要求 App 客户端签发的 `Access-Token`，小程序 `wxmini` token 被服务端判定为不满足版本/客户端条件。该青龙脚本只能使用手动抓包 token，token 过期后需要重新抓取。

## 平台青龙模式脚本

2026-11-17 已把 `data/apps/mxbc/scripts/sign-in.js` 改为青龙模式：

- 凭据：环境变量 `MXBC_ACCESS_TOKEN`（App 抓包 `mxsa.mxbc.net/api` 的 `Access-Token`）。
- 请求头：`app: mxbc`、`appchannel: xiaomi`、`appversion: 3.0.3`、`User-Agent: okhttp/4.4.1`。
- 签名：`SHA256withRSA(appId=...&t=...)`，使用 `ctx.crypto.rsaSign`，base64url；URL 和签名共用同一个 `t`。
- 可选覆盖：`MXBC_APP_VERSION`、`MXBC_APP_CHANNEL`。
- 凭证优先级：账号级环境变量覆盖应用默认环境变量；两者都为空时抛 `manualRequired(action=configure)`。
- 对 HTTP 429/5xx 和网络异常做 3 次退避重试；业务码 `500 请升级至最新版本` 不重试，直接提示检查 token 来源。
- 签到时先查 `customer/info`，`isSignin=1` 直接视为今日已签到，避免重复请求签到接口。

### 账号级环境变量

平台新增 `SiteAccount.envVars` JSON 字段，账号页每个应用卡片有「环境变量」按钮，可配置当前账号在该应用下的 KEY/VALUE。运行时合并顺序：

```text
应用默认环境变量（SiteEnvVar）
  ↓ 覆盖
账号应用环境变量（SiteAccount.envVars）
  ↓
ctx.env / process.env
```

未配置账号变量时自动使用应用默认值。

配置入口：

- 应用默认变量：应用详情页「环境变量」。
- 账号覆盖变量：账号页 → 对应应用卡片 →「环境变量」。多个账号可以分别配置不同的 `MXBC_ACCESS_TOKEN`。

### 验证

- `node --check data/apps/mxbc/scripts/sign-in.js` 通过。
- 平台真实账号运行：账号变量 `MXBC_ACCESS_TOKEN` 被正确读取，`customer/info` 成功（雪王币 770），`customer/signin` 仍返回 `请升级至最新版本`，说明测试 token 是小程序 token，需要换成 App 抓包 token。
- 脚本当前保持停用；配置有效 App token 后可启用。

## GitHub 小程序脚本测试（2026-11-18）

测试脚本：

```text
https://raw.githubusercontent.com/smallfawn/QLScriptPublic/refs/heads/main/wxapp/mxbc.js
```

该脚本通过 `wx_server` 取小程序 code，登录后使用：

- `SHA256withRSA(appId=<appId>&t=<timestamp>)`
- 小程序 UA、`xweb_xhr: 1`
- `version: 2.8.28`
- `Referer: .../wx7696c66d2245d107/59/page-frame.html`
- 小程序 UA 请求 `customer/info` 和 `customer/signin`

用平台 YYB 取码复现同样流程：

- `code2Session` 成功；
- `regByUnionid` 成功，拿到 `accessToken`；
- `customer/info` 成功，雪王币 770；
- `customer/signin` 仍返回 `{"code":500,"msg":"请升级至最新版本"}`。

额外尝试了 `version=2.8.28/2.8.30/2.8.66/3.0.0/3.0.3/3.1.0` 和 `Referer` 的 `59/313` 版本，结果全部一致。

结论：该 GitHub 脚本的签名和小程序请求头本身能通过登录和用户信息接口，但当前账号/服务端对签到接口做了版本或灰度限制，脚本无法绕过；当前平台的 `mxbc` 保持停用，等有效 App token 或服务端放开限制后再启用。



