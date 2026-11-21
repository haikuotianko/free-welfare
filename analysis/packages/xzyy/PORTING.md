# 小紫有约（xzyy）迁移记录

## 基本信息

- 应用 key：`xzyy`
- 名称：小紫有约
- AppID：`wx3db193ecdebd3fea`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\xzyy.js`
- 平台脚本：`data/apps/xzyy/scripts/sign-in.js`
- 应用清单：`data/apps/xzyy/app.json`
- API Base：`https://sxkyziqidonglai.cn`
- 一个 Run 只处理 `ctx.account`，不循环账号
- 当前状态：已迁移，`node --check` 通过；本地 mock 覆盖登录、缓存 session、会员信息、actCode 探测/缓存、签到成功、今日已签、未注册、身份校验失败
- 是否启用：`enabled: true`

## 接口清单

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 微信登录 | `GET /api/platform/wechatAuthenticate` | query `code`、`channelCode`、`siteId`、`deviceHash` | `success && status==200`，`data.sessionId`；后续 Cookie `SESSION=<id>` |
| 会员信息 | `POST /api/mobile/eShop/eshopVipUser/getUserInfo` | form `siteId=...` | `status==200`，`data.phone` / `data.balance`；401=未登录/未注册 |
| 签到 | `POST /api/mobile/activity-v2/activity/launchByValidater` | JSON `{actCode, siteId}` | `status==200` 或 `success==true` 成功；`status==412` 且含「已完成签到」为已签 |
| 每日签到状态 | 无独立接口 | — | 用签到接口的返回判断；已签返回 412 |

固定常量（原脚本硬编码，应用级固定值）：

- `CHANNEL_CODE = "WXjxriol8e8293wezu"`
- `DEVICE_HASH = "lkmtJuKGKQ0_S6Oem6ZIv3YoiHYGgoMf"`
- `SITE_ID = "SITE_33254242630091515087"`

## 请求头

```
User-Agent: Mozilla/5.0 (Linux; Android 12; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.5 MiniProgramEnv/android
accept: application/json, text/plain, */*
content-type: application/json
origin: https://sxkyziqidonglai.cn
referer: https://sxkyziqidonglai.cn/mall/personal?siteId=SITE_33254242630091515087&channelCode=WXjxriol8e8293wezu
x-requested-with: com.tencent.mm
Cookie: SESSION=<sessionId>
```

- 登录请求不带 Cookie；登录后所有业务请求带 `SESSION`。
- 会员信息接口额外把 `content-type` 改为 `application/x-www-form-urlencoded`，body 为 `siteId=<urlencoded>`。
- 无签名/加密。

## actCode 机制（原脚本保留）

- 候选：`SG{两位年}{上个月}{0..9}`，例如 2026-11 生成 `SG26100` 到 `SG26109`。
- 按月缓存 key `actcode`：`{ month: "YYYY-M", actCode }`，TTL 35 天。
- 有缓存先用缓存 actCode 试签到；失败（非 401）则重新逐个探测，命中后更新缓存。
- 探测间隔 1200–2000ms；签到返回 401 立即停止探测（账号未注册/身份校验失败）。

## 状态码 / 错误判断

- 登录：`success` 为真且 `status==200` 且有 `data.sessionId`；`msg` 含「请用手机号登录/完善用户信息」视为未做手机号注册。
- 会员信息：`status==200` 成功；否则视为未登录/未注册。
- 签到成功：`success` 为真或 `status==200`。
- 今日已签：`status==412` 且 `msg` 含「已完成签到」。
- 401：登录后会员信息/签到返回 401，视为未完成手机号注册或身份校验失败，抛
  `RegisterRequiredError`，`run()` 转为 `ctx.manualRequired(..., { details: { action: 'register' } })`。
- 其他状态码：返回 `ok:false`，message 带原 `msg`。

## 缓存

- `auth`：`{ session, updatedAt }`，TTL 7 天；启动时用 `getUserInfo` 校验，失效则清缓存重新登录。
- `actcode`：`{ month, actCode }`，TTL 35 天；按月复用，失效自动重新探测。

## 注册 / 积分 / 商品

- 注册：原脚本没有手机号注册/绑定接口，只提示「先在小程序里手机号登录一次」。未注册时抛 `manualRequired`。
- 积分：`getUserInfo` 的 `data.balance` 是原脚本唯一余额字段，签到后重新查询并调用
  `ctx.points.sync({ balance, estimated: false })`。该字段的业务含义（积分/储值余额）未在源码或文档中确认，见阻塞项。
- `products.js`：未新增。原脚本没有商品/优惠券列表接口，未猜路径。

## 阻塞项 / 待验证

- `data.balance` 是否为积分余额未能从青龙脚本或文档确认；当前按余额同步，若实际是储值金额需要改为不同 `pointsName` 或取消积分同步。
- `actCode` 是每月枚举探测出来的活动编码，活动规则/编码格式变化时需要更新 `generateCandidates()`。
- 没有真实 YYB 账号做线上联调；本次仅本地 mock 覆盖登录、缓存 session、会员信息、actCode 探测与缓存、签到、今日已签、未注册、401。
- 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
