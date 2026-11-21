# 三福会员概览

## 1. 包信息

| 项 | 值 |
| --- | --- |
| 名称 | 三福会员中心 |
| AppID | `wxfe13a2a5df88b058` |
| 类型 | 微信小程序 |
| 分类 | 会员 / 福币 / 商城 |
| 小程序包版本 | 420（缓存目录 `...\wxfe13a2a5df88b058\420`） |
| 解包时间 | 2026-11-13 |
| 包文件 | `__APP__.wxapkg`、`_pages_couponcenter_.wxapkg`、`_pages_user_.wxapkg` |
| 主包页面 | `pages/ucenter_index`、`pages/showCard_index`、`pages/sign`、`pages/fubishop/*`、`pages/register` 等 |

> 名称来自 `app.json` 的 `navigationBarTitleText: 三福会员中心`。

## 2. 加密与传输

| 项 | 结论 |
| --- | --- |
| 传输 | TLS |
| 普通接口签名 | 未发现 |
| 普通接口加密 | 未发现（明文 JSON） |
| 响应加密 | 未发现 |
| 会话 | `Sf-Authorization: sid` + `cusId` |
| 特殊签名 | 会员卡/云支付/二维码链路有 MD5 Authorization，首期不需要 |
| 证书校验 | 未知 |

## 3. 登录流程

```text
YYB /integration/actions/get-code
  -> wx.login code
  -> POST https://crm.sanfu.com/ms-sanfu-wechat-customer-core/customer/core/wxMiniAppLogin
     body: {
       code,
       appid: "wxfe13a2a5df88b058",
       shoId: "",
       userId: "",
       sourceWxsceneid: <scene>,
       sourceUrl: "<current page>"
     }
  -> success/data.sid, curCusId, openid, sessionKey, unionid
  -> 后续请求：
       Sf-Authorization: sid
       cusId: curCusId
       body/query 里也常带 sid
```

- App 本地缓存 `sid` 48 小时。
- 登录失败：`success=false` 或 `code!=200`；不要继续签到。
- 会话失效：`code=40301` 或文案“请先登录/登录失效”；重新取 code 登录一次。

## 4. 福币

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

- `restMoney`：当前余额。
- `historyPoint`：即将过期的福币数量。
- `nextYear`：有效期截止日期/年份字符串；UI 文案“有效期截止至 {nextYear}24时”。
- **年末过期**；代码只在 12 月弹提醒。
- 规则：消费 1 元 = 1 福币；签到/活动也获得福币；可兑换券、联盟卡券、产品、游戏/抽奖机会。

## 5. 签到

- 状态：`GET ms-sanfu-wechat-common/customer/onSignDetail`
  - `signIn`：`1` 可签到，`3` 已签到。
  - `onKeepSignDay`：连签天数。
- 日历/规则：`GET ms-sanfu-wechat-common/customer/getSignLogsList`
  - `signRule`、`signStatus`、`keepSignDays`、`signLogsItemDtoList`。
- 签到：`POST ms-sanfu-wechat-common/customer/onSign`
  - `{sid, signWay:0}`
  - 返回 `giftMoneyAdd`、`giftMoneyKeep`、`daysForGift`、券/包邮卡数量等。
- 已签到以 `signIn`/`signStatus` 为准，不要只靠文案。

## 6. 商品/券

- 列表：
  - `GET ms-sanfu-wechat-coupon/coupon/listPointExchangeCoupon`
  - `GET ms-sanfu-wechat-coupon/coupon/listPointExchangeCouponNew`（时间段/等级）
- 详情：`GET ms-sanfu-wechat-coupon/coupon/getPointExchangeCoupon`
- 兑换：`POST ms-sanfu-wechat-coupon/coupon/usePointExchangeCoupon`
- 外部权益：`listExternalExchangeIndex`、`listExternalExchange`、`usePointExchange`
- 商品字段：`giftId`、`giftPrice`、`giftDesc`、`statusId`、`isNotice`、`hourList`、`couponTypeId`、`useMethodNew`、`goodsUrl`、`amount`、`serverTime`。
- `data === "completeMsg"`：需要完善会员信息，不是普通成功。

## 7. 任务/活动

- 福币任务页入口：签到、购买商品、点亮勋章、评价订单。
- 勋章：`badge/initBadge`、`listBadgeGroup`、`listBadge`、`listCustomerBadge`、`activateBadge`、`receiveBadgeReward`。
- 自动化/赠礼/游戏：`automation/*`、`gift/*`、`donate/*`、`prize/*`、`game/*`。
- 先只读，确认幂等后再做领取。

## 8. 注册/手机号

- `updateMobile`、`analyseMobileAuthInfo`、`wxMiniAppCustomerRegister`。
- 需要 `encryptedData`、`iv`、`sessionKey`、`sid`。
- YYB `getPhoneNumber` 是否能提供等价 payload，待实测。

## 9. 脚本拆分

| 功能 | 脚本 | 说明 |
| --- | --- | --- |
| 登录/会话 | `common/auth` | `ensureSession`、`login`、`getSession` |
| 手动登录 | `login` | 测试/首次绑定 |
| 签到 | `sign_in` | 状态→签到→复查 |
| 福币 | `points` | `getPoint`，返回余额+过期 |
| 商品 | `products` | 列表/详情 |
| 兑换 | `redeem` | 券/权益，后续 |
| 活动 | `activities` | 勋章/任务/自动化，后续 |
| 注册 | `register` | 手机号/注册，待验证 |

## 10. 待确认

- [ ] `nextYear` 真实格式
- [ ] 商品库存/限购字段
- [ ] 兑换真实返回/幂等
- [ ] 注册/手机号能否用 YYB
- [ ] 活动/勋章状态字段
- [ ] 证书校验/设备指纹
- [ ] 官方图标
