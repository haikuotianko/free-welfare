# 三福会员积分/福币

## 1. 基本信息

| 项 | 值 |
| --- | --- |
| 积分名称 | 福币 |
| 余额接口 | `GET ms-sanfu-wechat-customer/customer/getPoint` |
| 流水接口 | 未找到独立接口；H5 `user/fubi-detail` 可能展示 |
| 规则接口 | 小程序页面/规则文案（`signRule`、福币规则 H5） |
| 是否可查批次 | 部分：`historyPoint` 为即将过期数量 |
| 是否可查有效期 | 是：`nextYear` + 年末过期 |
| 请求头 | `Sf-Authorization: sid`、`cusId` |

## 2. 余额/过期响应

```http
GET https://crm.sanfu.com/ms-sanfu-wechat-customer/customer/getPoint?sid=<sid>
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

| 字段 | 含义 | 代码依据 |
| --- | --- | --- |
| `restMoney` | 当前福币余额 | 签到页/福币商城/我的页都设为 `total`/`fubi` |
| `historyPoint` | 即将过期福币数量 | 弹窗：“您有 {historyPoint} 福币即将 … 过期” |
| `nextYear` | 过期截止日期/年份字符串 | 弹窗：“有效期截止至 {nextYear}24时” |

> `nextYear` 的真实格式待一次真实响应确认；脚本应原样展示或做宽松解析，不要假定固定格式。

## 3. 获取规则

| 来源 | 数量 | 周期 | 上限 | 备注 |
| --- | --- | --- | --- | --- |
| 消费 | 1 元 = 1 福币 | 每笔 | 未知 | 规则文案：“消费一元积一个福币” |
| 每日签到 | `giftMoneyDaily` / `giftMoneyAdd` | 每日 | 未知 | 签到响应字段 |
| 连续签到 | `giftMoneyKeep` | 连签档位 | 未知 | `daysForGift` 提示下一档 |
| 活动 | 不同活动不同 | 活动 | 未知 | 福币商城/任务/勋章/赠礼/游戏 |
| 评价订单 | 可能有 | 订单 | 未知 | 任务页入口 |
| 购买商品 | 1 元 = 1 福币 | 订单 | 未知 | 任务页入口 |

## 4. 有效期

- **年末过期**：代码只在 12 月弹“福币即将过期”提示；`historyPoint > 0` 时提醒。
- `nextYear` 表示有效期截止；UI 文案为“有效期截止至 {nextYear}24时”。
- `historyPoint` 是即将过期数量，不是历史总积分。
- 过期是否自动清零、是否有补发/延期：未知，需要真实账号在 12 月/跨年观察。
- 平台建模建议：
  - `balance = restMoney`
  - `expiring_amount = historyPoint`
  - `next_expiry_at = parse(nextYear)`（宽松解析；失败则只存文本）
  - 不要编造批次；只有“即将过期总量”。

## 5. 消耗/兑换

- 福币可兑换：优惠券、联盟卡券、产品、游戏/抽奖机会。
- 兑换接口：`usePointExchangeCoupon`（券/权益）、`usePointExchange`（外部权益）。
- 兑换后余额以再次 `getPoint` 为准，不要只信本地扣减。
- 可能返回 `completeMsg`（需完善会员信息）或订阅消息数据。
- 涉及支付/运费/地址：转人工。

## 6. 代码里的文案/规则

- “亲爱的福宝，您有 {historyPoint} 福币即将 {nextYear ? 在 {nextYear}24时 : ''} 过期，请尽快至福币商城兑换使用~”
- “有效期截止至 {nextYear}24时”
- “1. 会员可以使用福币兑换相应的优惠券、联盟卡券、产品、游戏/抽奖机会，具体以兑换页面内容为准；”
- “2. 福币可通过消费与活动获得，消费一元积一个福币，不同的活动获得不同福币具体见相应的活动说明。”

## 7. 待实测

- [ ] `nextYear` 确切格式
- [ ] 过期是否清零/是否可延期
- [ ] 福币流水接口（H5 `user/fubi-detail` 是否可用）
- [ ] 签到每日/连签具体数值
- [ ] 兑换后余额刷新
