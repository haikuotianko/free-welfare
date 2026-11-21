# 三福会员接口

> 来源：`analysis/packages/sanf/unpacked` 解包代码 + 现有 `sanf.js`。  
> 标注“已验证”的是代码里明确调用/解析的；标注“待实测”的是字段名来自代码但未用真实账号逐项验证。

## 1. 约定

### 1.1 根 URL

| id | 根 URL | 用途 | 脚本需要 | 白名单 |
| --- | --- | --- | --- | --- |
| `crm` | `https://crm.sanfu.com` | 登录/签到/福币/商品/兑换 | 是 | 是 |
| `m` | `https://m.sanfu.com` | 服务器时间/H5 | 可选 | 否 |
| `img` | `https://img.sanfu.com` | 图片/静态资源 | 否 | 否 |
| `tcrm` | `https://tcrm.sanfu.com` | 会员卡/云平台 | 否（首期） | 否 |
| `cashier` | `https://cashier.cloud.sanfu.com` | 云支付/二维码 | 否（首期） | 否 |
| `ab` | `https://ab.sanfu.com:26666` | 开关/配置 | 否 | 否 |
| `track` | `https://track.sanfu.com` | 埋点 | 否 | 否 |

- 脚本只允许 `https://crm.sanfu.com`。
- 图片/埋点/会员卡/云支付根 URL 只记录，不加入脚本白名单。
- 应用级网络模式：`whitelist`；如需临时放开，必须在应用设置里显式改 `unrestricted` 并二次确认。

### 1.2 请求

- Base URL：`https://crm.sanfu.com`
- 路径不带前导 `/`，拼在 Base URL 后。
- 普通接口请求头：
  - `Sf-Authorization: <sid>`
  - `cusId: <cardid>`（有会员卡 ID 时）
  - `content-Type: application/json`
- 请求体/查询参数通常也带 `sid`（现有脚本只用 body `sid` 也能跑，但 App 里是 header + body 都有）。
- 返回通常是 HTTP 200，业务状态看：
  - `success: true/false`
  - `code`：如 `40301` 表示请先登录
  - `msg/message`
- 登录接口是例外：现有脚本用 `code=200` 判断，App 代码用 `success`；两者都兼容。
- 已签到：看 `onSignDetail.data.signIn` / `getSignLogsList.data.signStatus`，不要只靠文案。
- `sid` 本地缓存 48 小时（`172800` 秒），但服务端可能提前失效。

## 2. 登录

```http
POST /ms-sanfu-wechat-customer-core/customer/core/wxMiniAppLogin
```

请求：

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

> App 里 `sourceWxsceneid` 用 `wx.getLaunchOptionsSync().scene`，`sourceUrl` 用当前页面；现有脚本固定 1027/ucenter_index，可用。

成功（字段来自 `sf-auth.js`）：

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

兼容现有脚本形状：

```json
{
  "code": 200,
  "data": { "sid": "..." }
}
```

| 字段 | 说明 |
| --- | --- |
| `sid` | 业务会话，后续放 `Sf-Authorization` / body |
| `curCusId` | 会员卡 ID，后续 `cusId` header |
| `openid` | 微信 OpenID（不要日志明文） |
| `sessionKey` | 微信 session_key，注册/手机号解密用（敏感） |
| `unionid` | 微信 unionid（敏感） |
| `qwShoId` | 门店/企微门店 ID |

失败：

| 情况 | 处理 |
| --- | --- |
| `success=false` 或 `code!=200` | `login_failed`，不重试 |
| 没有 `data.sid` | `login_failed` |
| 网络/5xx | `network_error`，有限重试 |
| YYB 409 | `yyb_rescan`，停止任务 |

## 3. 福币余额 / 过期

```http
GET /ms-sanfu-wechat-customer/customer/getPoint
```

参数：

```json
{
  "sid": "<sid>"
}
```

响应（字段来自签到页/福币商城/我的页代码）：

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

| 字段 | 含义 | 依据 |
| --- | --- | --- |
| `restMoney` | 当前福币余额 | `pages/sign/sign.js`、`pages/fubishop/index/base.js` 都把它设为 `total`/`fubi` |
| `historyPoint` | **即将过期**的福币数量 | 弹窗文案：“您有 {historyPoint} 福币即将 … 过期” |
| `nextYear` | 过期截止日期字符串 | 弹窗文案：“有效期截止至 {nextYear}24时” |

> 有效期规则：**年末过期**。代码只在 12 月弹“福币即将过期”提示；`historyPoint > 0` 时提醒。
> `nextYear` 的具体格式（如 `2026-12-31` / `2026年12月31日`）待真实响应确认；脚本不要硬编码格式，直接展示/解析。

## 4. 签到状态

```http
GET /ms-sanfu-wechat-common/customer/onSignDetail
```

参数：

```json
{ "sid": "<sid>" }
```

响应：

```json
{
  "success": true,
  "data": {
    "signIn": "1",
    "onKeepSignDay": 3
  }
}
```

| 字段 | 含义 |
| --- | --- |
| `signIn` | 签到状态；`1`=可签到，`3`=已签到（页面 `sign_tip` 顺序：不可签到/立即签到/还未到时间/已签到/签到中） |
| `onKeepSignDay` | 连续签到天数 |
| `code=40301` | 未登录 |

> 以 `success` + `signIn` 为准；现有脚本用签到响应文案判断，保留兼容。

## 5. 签到日历/规则

```http
GET /ms-sanfu-wechat-common/customer/getSignLogsList
```

参数：

```json
{
  "sid": "<sid>",
  "signWay": 0,
  "showType": 1
}
```

响应（字段来自 `pages/sign/sign.js`）：

```json
{
  "success": true,
  "data": {
    "signRule": "...",
    "signStatus": 1,
    "keepSignDays": 3,
    "keepType": 1,
    "firstDay": "2026-11-01",
    "firstDayOfWeek": 7,
    "signLogsItemDtoList": [
      {
        "day": 1,
        "sign": true,
        "giftMoney": 5
      }
    ]
  }
}
```

| 字段 | 含义 |
| --- | --- |
| `signRule` | 签到规则文本 |
| `signStatus` | 今日签到状态（同 `signIn`） |
| `keepSignDays` | 连续签到天数 |
| `keepType` | 连签奖励类型 |
| `signLogsItemDtoList[].giftMoney` | 当日签到奖励福币 |
| `signLogsItemDtoList[].sign` | 当日是否已签 |

## 6. 签到

```http
POST /ms-sanfu-wechat-common/customer/onSign
```

请求：

```json
{
  "sid": "<sid>",
  "signWay": 0
}
```

响应（字段来自 `pages/sign/sign.js`）：

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

| 字段 | 含义 |
| --- | --- |
| `signResultMsg` | 签到结果文案 |
| `onKeepSignDay` | 连签天数 |
| `daysForGift` | 距离下一档连签奖励天数 |
| `keepType` | 连签奖励类型 |
| `giftMoneyAdd` | 本次签到获得福币 |
| `giftMoneyKeep` | 连签奖励福币 |
| `giftMoneyDaily` | 每日签到福币 |
| `couponAdd` / `couponKeep` | 本次/连签送券数量 |
| `freeCartAdd` / `freeCartKeep` | 本次/连签送包邮卡 |
| `couponCnt` / `freeCartCnt` | 当前券/包邮卡数量 |

已签到：先查 `onSignDetail`，`signIn != 1` 就不要再提交；或提交后识别“已签到”文案。

## 7. 商品/券列表

### 7.1 简单分页列表

```http
GET /ms-sanfu-wechat-coupon/coupon/listPointExchangeCoupon
```

参数：

```json
{
  "sid": "<sid>",
  "page": 1,
  "pageSize": 8,
  "shoId": "GZW"
}
```

### 7.2 按时间段/等级（App 首页用）

```http
GET /ms-sanfu-wechat-coupon/coupon/listPointExchangeCouponNew
```

参数：

```json
{
  "sid": "<sid>",
  "shoId": "GZW",
  "todayHour": 10,
  "tomorrowHour": 10,
  "label": "...",
  "cardLevelId": "..."
}
```

> 这些参数按时间/标签/等级筛选；不传时用默认列表。具体组合以页面 Tab 为准。

### 7.3 商品字段

字段名来自 `pages/fubishop` 代码：

| 字段 | 含义 |
| --- | --- |
| `giftId` | 商品/权益 ID |
| `giftPrice` | 福币价格 |
| `giftDesc` | 描述（可能带 `<br/>`） |
| `couponMemo` | 券备注 |
| `statusId` | 状态 |
| `isNotice` | 提醒/预约状态 |
| `hourList` | 可兑换时间段，逗号分隔 |
| `couponTypeId` | 券类型 ID |
| `useMethodNew` | 使用方式（线上券等） |
| `goodsUrl` | 商品/使用链接 |
| `amount` | 数量/库存相关 |
| `serverTime` | 服务器时间 |

> 库存/限购字段未在已读代码里明确命名；抓一次真实列表响应再补。

## 8. 商品详情

```http
GET /ms-sanfu-wechat-coupon/coupon/getPointExchangeCoupon
```

参数：

```json
{
  "sid": "<sid>",
  "giftId": "<giftId>",
  "shoId": "GZW"
}
```

## 9. 兑换（券/权益）

```http
POST /ms-sanfu-wechat-coupon/coupon/usePointExchangeCoupon
```

请求：

```json
{
  "sid": "<sid>",
  "giftId": "<giftId>",
  "shoId": "GZW"
}
```

成功：

```json
{
  "success": true,
  "data": "..."
}
```

注意：

- `data === "completeMsg"` 表示需要完善会员信息，不是普通成功。
- 成功后页面会本地扣减 `total`，并刷新 `getPoint`；不要只信本地扣减。
- 可能返回订阅消息数据，用于 `subscribeMsg`。
- 兑换前必须检查：余额、商品状态、时间段、限购、是否需要完善信息。
- 涉及支付/运费/地址时停止并转人工。

## 10. 外部权益/联盟卡券

| 接口 | 用途 |
| --- | --- |
| `GET ms-sanfu-wechat-coupon/externalCoupon/listExternalExchangeIndex` | 外部权益首页 |
| `GET ms-sanfu-wechat-coupon/externalCoupon/listExternalExchange` | 外部权益列表 |
| `POST ms-sanfu-wechat-coupon/externalCoupon/usePointExchange` | 外部权益兑换 |

参数通常包含 `sid`、`platFormId`、`shoId`、分页字段；以页面代码为准。

## 11. 任务/活动

App 的“福币任务”页（`pages/fubishop/task/task.js`）不是统一任务接口，而是入口：

| 任务 | 入口 |
| --- | --- |
| 签到 | `/pages/sign/sign` |
| 购买商品 | 购物小程序 |
| 点亮勋章 | `/pages/user/medals/index/index` |
| 评价订单 | `user/customer/orderList?status=4&sendType=1`（H5） |

相关接口：

| 接口 | 用途 |
| --- | --- |
| `ms-sanfu-wechat-common/badge/initBadge` | 初始化勋章 |
| `ms-sanfu-wechat-common/badge/listBadge` / `listBadgeGroup` | 勋章列表 |
| `ms-sanfu-wechat-common/badge/listCustomerBadge` | 我的勋章 |
| `ms-sanfu-wechat-common/badge/activateBadge` | 点亮勋章 |
| `ms-sanfu-wechat-common/badge/receiveBadgeReward` | 领取勋章奖励 |
| `ms-sanfu-wechat-common/automation/getCombinationAutomationCfg` | 组合营销/自动化活动配置 |
| `ms-sanfu-wechat-common/automation/saveMarketingAutomationReceive` | 领取自动化活动奖励 |
| `ms-sanfu-wechat-common/gift/getGift` / `receiveGift` / `toGift` | 赠礼/领礼 |
| `ms-sanfu-wechat-common/donate/listDonateConfig` | 捐赠活动 |
| `ms-sanfu-wechat-common/prize/listPrizeForPop` | 弹窗奖品 |
| `ms-sanfu-wechat-common/game/listGameForPop` | 游戏/抽奖入口 |

> 这些活动不是全部都能自动领取；先只读，确认服务端状态和幂等后再做写操作。

## 12. 注册/手机号

| 接口 | 用途 |
| --- | --- |
| `POST ms-sanfu-wap-customer/updateMobile` | 更新手机号（encryptedData + sessionKey + iv + sid） |
| `POST ms-sanfu-wap-customer/analyseMobileAuthInfo` | 解析手机号授权（appid + encryptedData + sessionKey + iv + sid） |
| `POST wechat/user/wxMiniAppCustomerRegister` | 会员注册（appid + encryptedData + sessionKey + iv + shoId） |
| `POST ms-sanfu-wechat-customer/customer/updateRegisterInfo` | 更新注册信息 |
| `GET ms-sanfu-wechat-customer/customer/information` | 会员资料 |
| `GET ms-sanfu-wechat-customer/customer/index/baseInfo` | 会员基础信息 |
| `GET ms-sanfu-wechat-customer/customer/index/equity` | 会员权益 |

注册/手机号依赖微信 `getPhoneNumber` 的 `encryptedData`/`iv` 和登录返回的 `sessionKey`。YYB 的 `getPhoneNumber` 是否能提供等价 payload，需要实测。

## 13. 错误码/状态

| 状态 | 含义 | 处理 |
| --- | --- | --- |
| `success=false` | 业务失败 | 看 `code/msg` |
| `code=40301` | 未登录 | 重新登录一次 |
| `code=200` | 旧脚本成功码 | 兼容 |
| HTTP 5xx/超时 | 网络/上游 | 有限重试 |
| `data="completeMsg"` | 需完善会员信息 | 转人工/引导 |
| 已签到文案 | 已签到 | 算成功，不重复提交 |

## 14. 待实测

- [ ] `getPoint` 真实响应里 `nextYear` 的格式
- [ ] 商品列表的库存/限购字段
- [ ] `usePointExchangeCoupon` 成功/失败/完善信息/订阅消息的真实返回
- [ ] 是否需要 `Sf-Authorization` 与 body `sid` 同时存在
- [ ] 注册/手机号能否用 YYB `getPhoneNumber` 完成
- [ ] 活动/勋章接口的真实状态字段
