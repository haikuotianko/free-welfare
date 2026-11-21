# 骆驼 CAMEL（camel）迁移记录

## 基本信息

- 应用 key：`camel`
- 名称：骆驼 CAMEL
- AppID：`wxa82836302320ca29`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\camel.js`
- 平台脚本：`data/apps/camel/scripts/sign-in.js`
- 应用清单：`data/apps/camel/app.json`
- API Base：`https://h5.youzan.com`（有赞微商城）
- 一个 Run 只处理 `ctx.account`，不循环账号
- 当前状态：已迁移，`node --check` 通过；用本地 mock 走通登录、缓存 token、签到、今日已签、手机号未授权、积分同步
- 是否启用：`enabled: true`

## 接口清单

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 静默登录 | `POST /wscshop/weapp/authorize.json` | JSON `{appId, clientBiz:"weapp_wsc", code}` | `code==0`，`data.accessToken` / `access_token`、`sessionId`、`kdtId`、`nick_name`、`mobile` |
| 签到活动 | `GET /wscump/checkin/show_checkin_page_v2.json` | 公共 query | 取 `checkinId`、`isShow`；今日已签标记 `todayCheckin/isCheckin/hasCheckinToday` |
| 执行签到 | `GET /wscump/checkin/checkinV2.json` | 公共 query + `checkinId` | 返回 `desc`、`list[].infos.title`；重复签到报「已达最大参与次数」 |
| 积分余额 | `GET /wscump/integral/user_points.json` | 公共 query | `current_points` 或 `real_points`；也用于校验缓存 token |

公共 query：`app_id=wxa82836302320ca29`、`kdt_id=182479100`、`access_token=<token>`。

固定常量（原 YYB-GO 版抓取，应用级固定值，非个人凭证）：

- `CLIENT_BIZ = "weapp_wsc"`
- `KDT_ID = "182479100"`
- `USER_VERSION = "3.197.5.102"`
- `PAGE_VERSION = "32"`
- `FALLBACK_CHECKIN_ID = "5540097"`（活动接口未返回 `checkinId` 时兜底）

## 请求头

```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF
Referer: https://servicewechat.com/wxa82836302320ca29/32/page-frame.html
Accept: */*
Extra-Data: {"sid":"<sessionId>","version":"3.197.5.102","clientType":"weapp-miniprogram","client":"weapp","bizEnv":"wsc"}
Content-Type: application/json   # 仅 POST
Cookie: <Set-Cookie 抓取结果>
```

- 无签名/加密，依赖 `access_token` 和 `sessionId`。
- `Set-Cookie` 由脚本手动保存（平台 HTTP 客户端不维护 Cookie）；兼容多条 Cookie 合并成一行。
- 登录响应本身通常不带 cookie 字段，保留 `request()` 从 `Set-Cookie` 抓到的值。
- 统一响应：HTTP 200 且 `code==0` 成功；否则取 `msg` 作为错误原因。
- 会话失效文案：`/access_token|token|登录|invalid session|session/`。
- 重复签到文案：`/已达最大参与次数|已签到|重复签到|今日已参与|已经签到|已参与/`。

## 缓存

- key：`auth`
- 内容：`{ accessToken, sessionId, kdtId, cookie, mobile, nickName, updatedAt }`
- TTL：7 天
- 启动时用 `GET /wscump/integral/user_points.json` 校验缓存 token；失效则清缓存，重新 `ctx.yyb.getCode` 登录。
- 登录后用 `ctx.yyb.getCode({ appId })` 取 code；原脚本 smallcat 偶发取码失败，保留最多 4 次重试，重试前调用 `ctx.yyb.refreshAccount()` 并等待 3 秒。

## 注册 / 积分 / 商品

- 注册：原脚本没有注册/手机号绑定接口，只有「先在小程序授权手机号/注册会员」的提示。签到报
  `/手机号未授权|未授权手机|请先授权|未注册|未绑定|绑定手机|会员/` 时，抛
  `ctx.manualRequired(..., { details: { action: "register" } })`。
- 积分：`GET /wscump/integral/user_points.json` 的 `current_points ?? real_points`，签到后查询并调用
  `ctx.points.sync({ balance, estimated: false })`。
- `products.js`：未新增。原脚本没有商品/优惠券列表接口；有赞商城商品接口不在本脚本契约内，未猜路径。

## 阻塞项 / 待验证

- 没有真实 YYB 账号做线上联调；本次只有本地 mock 覆盖登录、缓存 token、签到、今日已签、手机号未授权、积分同步。
- 签到活动接口失败时仍用 `FALLBACK_CHECKIN_ID=5540097` 兜底尝试，与青龙脚本一致；活动 id 失效时签到会返回业务错误。
- 未获取到 `checkinId` 时返回 `ok: false`，不会伪装成功。
- 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
