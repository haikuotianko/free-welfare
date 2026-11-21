# 08 三福会员脚本实现规格

首个真实应用：**三福会员中心**。目标：YYB code → `sid` → 签到 → 福币 → 商品/活动。

> 实际仓库按 [11 脚本结构](11-script-structure.md) 拆成 `common/auth` + `login` + `sign_in` + `points` + `products` + `redeem` + `activities`。本文给接口和流程规格。

## 1. 基本信息

| 项 | 值 |
| --- | --- |
| 应用 key | `sanf` |
| 名称 | 三福会员中心 |
| AppID | `wxfe13a2a5df88b058` |
| Base URL | `https://crm.sanfu.com` |
| 包版本 | 420 |
| 参考脚本 | `N:\myProject\qinglong-script\mini-program\sanf.js` |
| 首版能力 | `login`、`sign_in`、`points` |
| 后续能力 | `products`、`redeem`、`activities`、`register` |
| 允许域名 | `crm.sanfu.com` |
| 其他根 URL | `img/m/tcrm/cashier/ab/track` 仅记录，默认不进脚本白名单 |

## 2. 请求约定

普通接口：

```http
Sf-Authorization: <sid>
cusId: <curCusId>
Content-Type: application/json
```

- GET 参数拼 query；POST 发 JSON。
- body/query 里通常也带 `sid`。
- 普通接口未发现签名/加密。
- 特殊会员卡/云支付链路有 MD5 签名，首期不需要。

## 3. 登录

```http
POST /ms-sanfu-wechat-customer-core/customer/core/wxMiniAppLogin
```

```json
{
  "code": "<YYB wx.login code>",
  "appid": "wxfe13a2a5df88b058",
  "shoId": "",
  "userId": "",
  "sourceWxsceneid": 1027,
  "sourceUrl": "pages/ucenter_index/ucenter_index"
}
```

成功（App 形状）：

```json
{
  "success": true,
  "data": {
    "sid": "...",
    "curCusId": "...",
    "openid": "...",
    "sessionKey": "...",
    "unionid": "...",
    "qwShoId": "..."
  }
}
```

兼容旧脚本形状：`code=200, data.sid`。

会话：

- `sid` → `Sf-Authorization` + body/query
- `curCusId` → `cusId`
- `sessionKey` → 仅注册/手机号解密用，敏感
- App 本地缓存 48h；服务端可能提前失效
- `code=40301` 表示未登录

## 4. 福币余额/过期

```http
GET /ms-sanfu-wechat-customer/customer/getPoint?sid=<sid>
```

```json
{
  "success": true,
  "data": {
    "restMoney": 120,
    "historyPoint": 10,
    "nextYear": "2026-12-31"
  }
}
```

| 字段 | 含义 |
| --- | --- |
| `restMoney` | 当前福币余额 |
| `historyPoint` | 即将过期数量 |
| `nextYear` | 有效期截止日期/年份字符串；UI “有效期截止至 {nextYear}24时” |

- **年末过期**；代码只在 12 月弹提醒。
- `nextYear` 格式待真实响应确认；宽松解析，失败只存文本。

## 5. 签到

### 5.1 状态

```http
GET /ms-sanfu-wechat-common/customer/onSignDetail?sid=<sid>
```

```json
{
  "success": true,
  "data": {
    "signIn": "1",
    "onKeepSignDay": 3
  }
}
```

- `signIn=1` 可签到；`3` 已签到。
- `40301` 未登录。

### 5.2 日历/规则

```http
GET /ms-sanfu-wechat-common/customer/getSignLogsList?sid=<sid>&signWay=0&showType=1
```

字段：`signRule`、`signStatus`、`keepSignDays`、`keepType`、`firstDay`、`signLogsItemDtoList`。

### 5.3 签到

```http
POST /ms-sanfu-wechat-common/customer/onSign
```

```json
{ "sid": "<sid>", "signWay": 0 }
```

```json
{
  "success": true,
  "data": {
    "signResultMsg": "签到成功",
    "onKeepSignDay": 4,
    "daysForGift": 3,
    "keepType": 1,
    "giftMoneyAdd": 5,
    "giftMoneyKeep": 10,
    "giftMoneyDaily": 5,
    "couponAdd": 0,
    "couponKeep": 0,
    "freeCartAdd": 0,
    "freeCartKeep": 0,
    "couponCnt": 0,
    "freeCartCnt": 0
  }
}
```

- 先查 `onSignDetail`；`signIn != 1` 不提交。
- 已签到按成功处理。
- 签到后重新 `getPoint` 确认余额。

## 6. 商品/券

### 6.1 列表

```http
GET /ms-sanfu-wechat-coupon/coupon/listPointExchangeCoupon?sid=<sid>&page=1&pageSize=8&shoId=GZW
```

时间段/等级列表：

```http
GET /ms-sanfu-wechat-coupon/coupon/listPointExchangeCouponNew?sid=<sid>&shoId=GZW&todayHour=10
```

### 6.2 详情

```http
GET /ms-sanfu-wechat-coupon/coupon/getPointExchangeCoupon?sid=<sid>&giftId=<giftId>&shoId=GZW
```

### 6.3 兑换

```http
POST /ms-sanfu-wechat-coupon/coupon/usePointExchangeCoupon
```

```json
{ "sid": "<sid>", "giftId": "<giftId>", "shoId": "GZW" }
```

- `data === "completeMsg"`：需要完善会员信息，转人工/引导。
- 成功后重新 `getPoint`，不要只信本地扣减。
- 涉及支付/运费/地址：停止，转人工。

### 6.4 字段

`giftId`、`giftPrice`、`giftDesc`、`statusId`、`isNotice`、`hourList`、`couponTypeId`、`useMethodNew`、`goodsUrl`、`amount`、`serverTime`。

库存/限购字段待真实响应确认。

## 7. 活动/任务

福币任务入口：

- 签到：`/pages/sign/sign`
- 购买商品
- 点亮勋章：`badge/*`
- 评价订单

相关接口：

- `badge/initBadge`、`badge/listBadgeGroup`、`badge/listBadge`、`badge/listCustomerBadge`、`badge/activateBadge`、`badge/receiveBadgeReward`
- `automation/getCombinationAutomationCfg`、`automation/saveMarketingAutomationReceive`
- `gift/getGift`、`gift/receiveGift`、`gift/toGift`
- `donate/listDonateConfig`
- `game/listGameForPop`、`prize/listPrizeForPop`

先只读，确认幂等后再领取。

## 8. 注册/手机号

- `updateMobile`
- `analyseMobileAuthInfo`
- `wechat/user/wxMiniAppCustomerRegister`

需要 `encryptedData`、`iv`、`sessionKey`、`sid`。YYB `getPhoneNumber` 是否等价，待实测。首版不自动注册。

## 9. manifest 示例

```json
{
  "id": "sanf.sign_in",
  "name": "三福签到",
  "version": "0.1.0",
  "description": "三福会员中心每日签到",
  "kind": "action",
  "platform": "wechat_miniprogram",
  "app_id": "wxfe13a2a5df88b058",
  "capability": "sign_in",
  "runtime": "node",
  "entry": "adapter.ts",
  "common_version": "0.1.0",
  "allowed_domains": ["crm.sanfu.com"],
  "default_schedule": {
    "cron": "43 8 * * *"
  },
  "config_schema": {
    "type": "object",
    "properties": {}
  },
  "limits": {
    "timeout_seconds": 120,
    "memory_mb": 256
  },
  "min_platform_version": "0.1.0"
}
```

## 10. 流程

```text
ensureSession(ctx)
  -> sid = ctx.session.get('sid')
  -> 有：返回
  -> 无：login(ctx)

login(ctx)
  -> code = ctx.yyb.getCode()
  -> POST wxMiniAppLogin
  -> 读 success/data.sid/curCusId/sessionKey
  -> ctx.session.set('sid', sid)
  -> ctx.session.set('curCusId', curCusId)
  -> ctx.session.set('sessionKey', sessionKey)  // 仅注册用，敏感

signIn(ctx)
  -> ensureSession
  -> GET onSignDetail
  -> signIn != 1：alreadyDone
  -> POST onSign
  -> success：记录 giftMoneyAdd/Keep、连签
  -> 失败：auth/40301 -> 清 sid -> login 一次 -> 重试一次
  -> 最后 GET getPoint 确认余额

points(ctx)
  -> ensureSession
  -> GET getPoint
  -> return balance=restMoney, expiring=historyPoint, expiry=nextYear

products(ctx)
  -> ensureSession
  -> GET listPointExchangeCoupon(New)
  -> normalize giftId/giftPrice/status/hourList

redeem(ctx, giftId)
  -> 检查余额/状态/时间
  -> POST usePointExchangeCoupon
  -> completeMsg -> manualRequired
  -> 成功 -> GET getPoint 复查
```

## 11. 错误映射

| 情况 | error_code | 重试 |
| --- | --- | --- |
| YYB 409 | `yyb_rescan` | 否 |
| 登录失败/无 sid | `login_failed` | 否 |
| 40301/未登录 | 先重登一次 | 是（一次） |
| 已签到 | `already_done` | 否（算成功） |
| 兑换 `completeMsg` | `manual_required` | 否 |
| 网络/5xx | `network_error` | 是（有限） |
| 超时 | `timeout` | 是（有限） |

## 12. 测试

- [ ] 无缓存：login → signIn。
- [ ] 有 sid：直接 signIn。
- [ ] 已签到：onSignDetail 判断，不重复提交。
- [ ] sid 失效：清缓存 → 重登 → 签到。
- [ ] 重登后仍失败：auth_expired。
- [ ] YYB 409：yyb_rescan。
- [ ] getPoint 返回 restMoney/historyPoint/nextYear。
- [ ] 商品列表分页/时间段。
- [ ] 兑换 completeMsg 转人工。
- [ ] 日志无 code/sid/sessionKey/openid。

## 13. 待实测

- [ ] `nextYear` 格式
- [ ] 商品库存/限购
- [ ] 兑换真实返回
- [ ] 注册/手机号
- [ ] 勋章/活动状态
- [ ] `Sf-Authorization` 是否必须（现有脚本 body sid 也能跑）
