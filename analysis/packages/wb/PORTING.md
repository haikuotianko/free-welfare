# 花生帮粉丝俱乐部（wb）迁移记录

## 基本信息

- 应用 key：`wb`
- 名称：花生帮粉丝俱乐部
- AppID：`wx841a8e9e6972a9a6`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\wb.js`
- 无缓存小程序包，按青龙脚本迁移。
- API Base：`https://restapi.supercarrier8.com`
- 企业号：`131932658387`
- 平台脚本：`data/apps/wb/scripts/sign-in.js`
- 应用清单：`data/apps/wb/app.json`
- 一个 Run 只处理 `ctx.account`，不循环账号。
- 脚本启用：`enabled: true`（未连接真实 YYB / 目标服务器联调）。

> AppID 说明：任务说明与 `docs/23-qlscript-integration.md` 里写的是 `wx0e6ed4f51db9d078`，但该 AppID 在 `QLScriptPublic/wxapp/xchy.js` 中是携程会员，不能用于花生帮。青龙 `wb.js` 的 `MINI_APP_ID`、登录 `authorizerAppid` 和 Referer 都是 `wx841a8e9e6972a9a6`，本应用按青龙脚本保留该值。

## 接口清单

除登录外，所有请求都会自动带 `enterpriseNo=131932658387`；GET 放 query，POST 放 JSON body。

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 小程序登录 1 | `GET /marketing/v1/wechat-user-auth/miniapp-login` | 微信 code | query `authorizerAppid`、`jsCode`；返回 `data.openid`、`data.serviceSign` |
| 小程序登录 2 | `POST /marketing/v1/customer-login/wechat-openid` | 无 | body `serviceSign`、`openid`、`appId`、`appType: 2`；返回 `data.token`、`id`、`userType` |
| 用户信息 | `GET /marketing/shyx/marketing/v1/cus/get-user-info` | token | query `openId`；`data.currentJf` 是能量余额 |
| 签到记录 | `GET /marketing/cusSign/v1/getUserSignInfo` | token | query `signMonth=YYYY-MM`；`data.signDateList`、`continuousSignDays` |
| 每日签到 | `POST /marketing/sign/woBeiCus/v1/justSign` | token | body 只有 `enterpriseNo`；`data=0` 表示今日已签 |
| 签到奖励回调 | `GET /marketing/v1/client-sign/sign-callback` | token | query `userId`；`data[]` 里 `rewardType=1/2` 是能量奖励 |
| 任务列表 | `GET /marketing/sign/marketing/v1/cus/get-user-task-list` | token | query `UserID`、`UserType`；`data[]` |
| 标记任务完成 | `POST /marketing/sign/marketing/v1/cus/set-task-ok` | token | body `taskId`、`userId`、`mode: "1"` |
| 领取任务奖励 | `POST /marketing/sign/marketing/v1/cus/task-complete` | token | body `taskId`、`userId`；成功 `code=200`，`21210108` 表示已领取 |

业务成功码：`code=200`。token 失效沿用青龙正则：`2032401|token|登录|授权|invalid|expire|过期|401|403`。

## 请求头 / 签名

```text
User-Agent: Mozilla/5.0 (...) MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF
Referer: https://servicewechat.com/wx841a8e9e6972a9a6/102/page-frame.html
Accept: application/json, text/plain, */*
Content-Type: application/json
X-Request-Lang: zh-CN
Authorization: <token>
x-request-ts: <Date.now() 毫秒字符串>
x-request-sign: <签名>
```

签名完全沿用青龙 `getSign`：

1. 参数 key 升序；
2. 跳过 `""`、`null`、`undefined`；非字符串先 `JSON.stringify`，对象内值为 `null` 的 key 删除；
3. 拼接所有值得到 `valueText`，UTF-8 base64 得到 `paramSign`；
4. `md5(base64(METHOD + "/" + apiPath + paramSign + timestamp))`，hex 小写。

平台实现使用 `ctx.crypto.base64Encode` / `ctx.crypto.md5`；GET 的参与签名参数和 query 是同一份 payload，POST 的参与签名参数和 JSON body 也是同一份。

## 登录 / 缓存

- 微信 code 来自 `ctx.yyb.getCode({ appId: 'wx841a8e9e6972a9a6' })`。
- token 缓存在 `ctx.cache` 的 `auth` 键，TTL 7 天，字段 `token/appOpenid/userId/userType/currentJf`；不缓存手机号。
- 缓存 token 先用用户信息接口校验；失效则清缓存重新登录。
- 业务请求遇到 token 失效会清缓存、重新登录并重试一次。

## 签到 / 任务

- 签到前按 `ctx.time.now()` 生成 `YYYY-MM` 查询签到记录。
- `justSign` 非 200 且文案命中 `/已签|签到/` 时按今日已签处理（保留青龙原判断）；`data=0` 也按已签处理。
- 签到成功后调用 `sign-callback` 取奖励；回调失败只记录 warning，签到仍按成功返回。
- 目标任务：`i_0002` 浏览微信推文、`i_0003` 观看视频、`i_0006` 浏览四格漫画。
- 任务 `status=2` 已完成；`status=0` 先 `set-task-ok` 再 `task-complete`；`21210108` 按奖励已领取处理。
- 单个任务失败只记录，不影响签到结果。

## 积分

- 能量余额取 `get-user-info.data.currentJf`，签到后重新查询并 `ctx.points.sync({ balance, estimated: false })`。
- `app.json` 的 `pointsName` 为“能量”。

## 注册

青龙脚本没有注册接口。登录未返回 `openid` 或 `token` 时抛
`ctx.manualRequired(..., { details: { action: 'register' } })`，需要用户先在花生帮小程序完成注册；没有伪造注册请求。

## 当前状态

- `node --check` 通过；`app.json` JSON 校验通过。
- 用本地 mock ctx 跑通：登录、用户信息、签到、回调、浏览任务、今日已签、token 失效重登。
- 签名用独立的青龙算法实现比对，所有 mock 请求签名一致。
- 未连接真实 YYB / 目标服务器联调。

## 阻塞 / 风险

1. **AppID 冲突**：任务说明和 `docs/23` 的 `wx0e6ed4f51db9d078` 实际是携程会员；本应用使用青龙脚本的 `wx841a8e9e6972a9a6`。若真实花生帮 AppID 不是这个值，需要同时改 `app.json` 和脚本常量。
2. **注册未验证**：没有注册接口，未注册账号会直接转人工；需要在真实账号上确认 `customer-login/wechat-openid` 是否自动注册。
3. **`justSign` 判断偏宽**：青龙用 `/已签|签到/`，服务端若返回“签到失败”这类文案会被误判为已签；本脚本为保持协议一致未改，联调时需重点确认。
4. **奖励回调失败仍返回成功**：`justSign` 成功但 `sign-callback` 非 200 时，结果 `ok: true` 并带 warning；能量可能未到账。
5. **未真实联调**：接口路径、签名和企业号均来自青龙脚本，未在平台上跑过真实 Run。
