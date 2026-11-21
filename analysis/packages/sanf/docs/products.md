# 三福会员商品/权益

## 1. 状态

已从解包代码找到商品/券/权益接口和字段；尚未用真实账号逐项验证。

## 2. 列表

### 2.1 简单分页

```http
GET https://crm.sanfu.com/ms-sanfu-wechat-coupon/coupon/listPointExchangeCoupon
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

### 2.2 按时间段/等级（App 首页）

```http
GET https://crm.sanfu.com/ms-sanfu-wechat-coupon/coupon/listPointExchangeCouponNew
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

> 时间 Tab 用 `listCouponLimitPeriod` / `listCouponLimit` / `listCouponCardLevelLimit` 拿时间段/等级选项，再用 `listPointExchangeCouponNew` 拉对应商品。

## 3. 字段（来自页面代码）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `giftId` | string/number | 商品/权益 ID |
| `giftPrice` | number | 福币价格 |
| `giftDesc` | string | 描述，可能含 `<br/>` |
| `couponMemo` | string | 券备注 |
| `statusId` | number | 状态 |
| `isNotice` | number | 提醒/预约状态 |
| `hourList` | string | 可兑换时间段，逗号分隔 |
| `couponTypeId` | string | 券类型 ID |
| `useMethodNew` | string | 使用方式（线上券等） |
| `goodsUrl` | string | 商品/使用链接 |
| `amount` | number | 数量/库存相关 |
| `serverTime` | string | 服务器时间 |
| `exchangeover` | number | 页面计算的“今日已过兑换时间” |

> 库存/限购字段名未在已读代码里明确；抓真实列表后补。

## 4. 详情

```http
GET https://crm.sanfu.com/ms-sanfu-wechat-coupon/coupon/getPointExchangeCoupon
```

参数：

```json
{
  "sid": "<sid>",
  "giftId": "<giftId>",
  "shoId": "GZW"
}
```

## 5. 兑换

```http
POST https://crm.sanfu.com/ms-sanfu-wechat-coupon/coupon/usePointExchangeCoupon
```

```json
{
  "sid": "<sid>",
  "giftId": "<giftId>",
  "shoId": "GZW"
}
```

返回：

```json
{
  "success": true,
  "data": "..."
}
```

注意：

- `data === "completeMsg"`：需要完善会员信息，不是普通成功。
- 成功后刷新 `getPoint`，以服务端余额为准。
- 可能返回订阅消息数据，用于小程序订阅消息；脚本可忽略。
- 兑换前检查：余额、状态、时间段、限购、是否需完善信息、是否需要支付。
- 涉及支付/运费/地址：停止，转人工。

## 6. 外部权益/联盟卡券

| 接口 | 用途 |
| --- | --- |
| `GET ms-sanfu-wechat-coupon/externalCoupon/listExternalExchangeIndex` | 首页入口 |
| `GET ms-sanfu-wechat-coupon/externalCoupon/listExternalExchange` | 列表 |
| `POST ms-sanfu-wechat-coupon/externalCoupon/usePointExchange` | 兑换 |

参数通常含 `sid`、`platFormId`、`shoId`、分页字段；以页面代码为准。

## 7. 幂等/风控

- 兑换前重新拉一次详情/余额；不要用缓存库存做最终判断。
- 兑换结果以服务端订单/券包为准；`success=true` 也要复查。
- 同一商品连续点击有“操作频繁”限制（页面 `checkTimes` 500ms）；不要高频重试。
- 失败不自动重放写请求；区分“未提交/已提交未确认/已成功”。

## 8. 待实测

- [ ] 库存/限购字段
- [ ] 兑换成功/失败真实返回
- [ ] `completeMsg` 触发条件
- [ ] 外部权益兑换
- [ ] 商品图片/图标字段
- [ ] 分页/排序参数
