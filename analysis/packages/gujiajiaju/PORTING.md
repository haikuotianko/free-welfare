# 顾家家居（gujiajiaju）迁移说明

## 基本信息

- AppID：`wx0770280d160f09fe`
- 应用 key：`gujiajiaju`
- 源脚本：`N:\myProject\QLScriptPublic\wxapp\gujiajiaju.js`
- 平台脚本：`data/apps/gujiajiaju/scripts/sign-in.js`
- 应用配置：`data/apps/gujiajiaju/app.json`
- 解包目录：`analysis/packages/gujiajiaju/unpacked`（wxapkg 版本 306）
- 账号来源：平台 `ctx.account`（YYB 账号），不再读取青龙变量/本地 token 缓存文件
- 当前状态：已迁移，`node --check` 通过，使用本地 mock 走通登录、签到、积分、注册分支
- 是否启用：`enabled: true`（签到脚本）

## 接口清单

域名：`https://mc.kukahome.com`

### 登录

1. `POST /club-server/api/user/identify?code=<wx code>`
   - 不带 `AccessToken`、不带 `tmpToken`
   - 响应 `code=0`，`data.status` 为账号状态，`data.token` 为临时 token
   - 源脚本要求 `status=4`；平台脚本在非 4 时先尝试 `authorizeLogin`，失败再走手机号注册
2. `POST /club-server/api/user/authorizeLogin`
   - body：`{ "source": "顾家小程序", "contentName": "" }`
   - 请求头带 `tmpToken`
   - 响应 `code=0`，`data.token` 为 `AccessToken`，`data.memberId` 为 `X-Customer`

### 注册（来自解包，源脚本未实现）

- `POST /club-server/api/user/authorize/register`
  - 请求头带 `tmpToken`
  - body：`{ "encryptedData": "...", "iv": "...", "source": "顾家小程序", "contentName": "" }`
  - 手机号数据来自 `ctx.yyb.getPhoneAuth({ appId })`
  - 响应 `code=0`，`data.token` / `data.memberId`
- 如果 YYB 只返回手机号 `code`、没有 `encryptedData`/`iv`，或服务端拒绝该数据，脚本会抛出 `ctx.manualRequired(..., { details: { action: 'register' } })`。

### 用户信息 / 积分

- `POST /club-server/api/user/info`（body `{}`，带 `AccessToken`）
  - 返回会员信息，`data.point` 为当前积分（解包页面 `accountInfo.point` 同源）
- `GET /wx-mgr-api/userIntegral/getUserPoint`（解包接口，带登录头）
  - 返回 `{ code: 0, data: <积分> }`；失败时回退到 `user/info.point`

### 签到

- `GET /integral-server/user/sign/calendar`
  - 返回 `data.isTodaySigned`、`data.signCount`、`data.dailyUserSignStatusList`
- `POST /integral-server/scenePoint/scene/point`
  - body：`{ "scene": "sign", "brandCode": "K001" }`
  - 业务成功：`code=0` 且 `data` 为本次获得积分；`data=0` 时再查一次日历确认是否已签到

### 商品 / 优惠券

- 未新增 `products.js`。
- 积分商城是独立 H5（解包常量 `VUE_APP_SHOP_URL = https://www.kukahome.com`，入口 `/kuka/pages/custom/custom-page?id=pointshop`），小程序内没有可用的积分商品列表接口。
- 优惠券接口（如 `/club-server/front/coupon/...`、`/club-server/interest/selectCouponByInterestId`）依赖权益/券 id，不能作为全量商品列表，未接入。

## 请求头与签名

```
User-Agent: Mozilla/5.0 ... MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF
Referer: https://servicewechat.com/wx0770280d160f09fe/286/page-frame.html
Accept: application/json, text/plain, */*
Content-Type: application/json
X-Customer: <memberId>
brandCode: K001
appid: 667516
sign: md5(667516 + FH3yRrHG2RfexND8 + timestamp)
timestamp: <毫秒时间戳>
versionNumber: 2.8.6
parameterSign: md5(md5(sortedParams) + timestamp[4..10])   # 有参数时
AccessToken: <登录 token>
tmpToken: <identify 临时 token>
```

- `parameterSign` 的 `sortedParams` 按 key 字符编码排序，跳过 `null`/空串/数组，对象用 `JSON.stringify`。
- GET 用 query 参与签名，POST 用 body 参与签名。
- 仅使用 `ctx.crypto.md5`，无 AES/RSA。
- 业务码：`0` 成功；`401` 视为登录失效；`402`、`515` 按接口原样返回；其余抛错。

## 缓存

- 缓存 key：`auth`
- 内容：`{ accessToken, memberId, updatedAt }`
- TTL：7 天
- 缓存 token 失效（401 或 user/info 为空）后清除并重新取码登录，重试一次。

## 阻塞项 / 待验证

- 自动注册分支依赖 YYB 返回 `encryptedData` + `iv`；未在真实账号上验证服务端是否接受该手机号数据。若被拒绝，运行结果会变成 `manualRequired(action=register)`。
- `data.point` 与 `getUserPoint` 的积分口径以服务端为准，当前优先使用 `user/info.point`，为空时再调用 `getUserPoint`。
- 未执行 `pnpm import:apps`，未写数据库，未做真实微信取码联调。
