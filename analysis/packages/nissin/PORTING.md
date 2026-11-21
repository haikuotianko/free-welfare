# 日清食品（nissin）迁移记录

- AppID：`wx21b71db59d93bd6d`
- 应用目录：`data/apps/nissin`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\nissin.js`
- 解包目录：`analysis/packages/nissin/unpacked`（缓存包版本 83；`__APP__.wxapkg`）
- API：`https://foodhall-prod-api.nissinfoodium.com.cn/miniapp`
- 脚本：`scripts/sign-in.js`、`scripts/products.js`，均 `enabled: true`
- 一个 Run 只处理 `ctx.account`，不循环账号。
- 未运行 `pnpm import:apps`，未改数据库。

## 接口

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 换 openId | `POST /auth/getOpenId` | 无 | body `{ code, invitorMemberId: 0 }`；`code` 来自 `ctx.yyb.getCode` |
| 登录 | `POST /auth/login` | 无 | body `{ openId }`；返回 `accessToken`、`openId`、`userId` |
| 当前用户 | `GET /auth/user/current` | `Authorization: Bearer <token>` | 返回昵称、手机号等 |
| 签到统计 | `GET /sign-in/statistics` | Bearer | `hasSignedToday`、`continuousDays`、`totalDays`、`todayPoints` |
| 签到规则 | `GET /sign-in/rule` | Bearer | 解包确认，脚本未调用 |
| 签到 | `POST /sign-in` | Bearer | body `{}`；成功返回本次积分 |
| 积分余额 | `GET /member/point` | Bearer | 返回 `availablePoints` |
| 积分明细 | `GET /member/point/flow` | Bearer | 解包确认，脚本未调用 |
| 任务列表 | `GET /taskCenter/getEffectiveTask` | Bearer | 查找 `ruleType = PLAY_GAME` 任务 |
| 游戏配置 | `GET /game/config` | Bearer | 返回 `shareTitle` |
| 游戏登录 | `POST /game/login` | Bearer | body `{ loginIp: "", loginLocation: "" }` |
| 游戏次数 | `GET /game/count` | Bearer | 返回剩余次数 |
| 游戏页面 | `GET https://foodhall-prod.nissinfoodium.com.cn/game/index.html?version=&token=&user_id=&webViewHeight=800` | WebView | 原脚本仅打开页面，不自动玩游戏 |
| 商品分类 | `GET /product/category` | Bearer | 返回 `attributeCode`、`displayName` |
| 商品列表 | `POST /product` | Bearer | body `{ pageSize, pageNum, category, orders: [] }`；返回 `data.list`、`data.total` |
| 平台券列表 | `GET /platform-coupon/list` | Bearer | 解包确认的券中心列表，未用于 `products.js` |

## 请求头 / 加密

```text
User-Agent: Mozilla/5.0 (...) MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF
Referer: https://servicewechat.com/wx21b71db59d93bd6d/74/page-frame.html
Accept: application/json, text/plain, */*
Content-Type: application/json   # POST
Authorization: Bearer <accessToken>
```

- 响应头 `Auth-Status: false` 或业务码 `900001` / `401` 视为登录失效。
- 业务成功条件：HTTP 200 且 `code === 0`。
- token 缓存在 `ctx.cache` 的 `auth` 键（accessToken/redOpenId/userId/mobile），TTL 7 天；缓存校验失败会重登，签到遇到登录失效会重登并重试一次。
- 无额外签名/加密；openId 和登录接口不带 token。

## 注册

- 未找到独立注册接口；`/auth/getOpenId` 会返回 `isNewRegister`，`/auth/login` 对已注册/可自动建号的 openId 返回 token。
- 若 `getOpenId` 未返回 `openId`、`login` 未返回 `accessToken`，或错误文案命中“注册/未绑定/绑定手机/手机号/实名”，抛 `ctx.manualRequired(..., { details: { action: 'register' } })`。
- 未使用 `ctx.yyb.getPhoneAuth`：登录只需要微信 code，未发现必须手机号授权的注册路径。

## 积分 / 商品

- 积分：`/member/point` 返回 `data.availablePoints`，签到后同步到 `ctx.points.sync({ balance, estimated: false })`。
- 商品：`products.js` 先读 `/product/category`，再按分类分页调用 `POST /product`，映射：
  - `externalId = id`
  - `name = displayName`
  - `imageUrl = mainImageUrl`（列表为字符串，详情为 `[{url}]`，已兼容）
  - `pointsCost = point`
  - `stock = currentStock`
  - `endAt = shelfTime`
  - `status = currentStock > 0 ? on_sale : sold_out`
- 去重后 `ctx.products.sync(..., { deactivateMissing: true })`。

## 阻塞 / 说明

- 游戏入口会在 URL 中携带 token，脚本不输出 token；只模拟打开游戏页，不实现自动玩法和领奖。
- 商品列表的 `mainImageUrl`、`currentStock`、`displayName` 字段来自积分商城页编译产物；真实接口字段如有变化需联调确认。
- `/platform-coupon/list` 券字段结构未完全确认，未接入 `products.js`，避免臆造积分价格。
- 已用 `node --check` 校验通过；并用本地 mock ctx 跑通登录、签到、积分、游戏入口和商品同步流程（未发真实网络请求）。
- 未连接真实 YYB/目标服务器联调。
- `enabled: true`。
