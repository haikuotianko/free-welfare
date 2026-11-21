# 三福会员活动/任务

## 1. 状态

已从解包代码找到任务入口和相关接口；具体活动状态字段需要真实响应验证。

## 2. 福币任务页

`pages/fubishop/task/task.js` 的“福币任务”不是统一任务列表接口，而是入口：

| 任务 | 文案 | 入口 |
| --- | --- | --- |
| 签到 | 连续签到赢取福币 | `/pages/sign/sign` |
| 购买商品 | 购买越多福币越多 | 购物小程序 |
| 点亮勋章 | 点亮勋章可获得福币奖励 | `/pages/user/medals/index/index` |
| 评价订单 | 评价商品订单可获得福币奖励 | `user/customer/orderList?status=4&sendType=1`（H5） |

## 3. 签到活动

| 接口 | 用途 |
| --- | --- |
| `GET ms-sanfu-wechat-common/customer/onSignDetail` | 今日签到状态/连签 |
| `GET ms-sanfu-wechat-common/customer/getSignLogsList` | 签到日历、规则、连签 |
| `POST ms-sanfu-wechat-common/customer/onSign` | 签到 |

字段：

- `signRule`：签到规则文本。
- `signStatus` / `signIn`：今日状态。
- `keepSignDays` / `onKeepSignDay`：连签天数。
- `keepType`：连签奖励类型。
- `daysForGift`：距离下一档奖励天数。
- `giftMoneyDaily` / `giftMoneyAdd` / `giftMoneyKeep`：福币奖励。
- `couponAdd` / `couponKeep` / `freeCartAdd` / `freeCartKeep`：券/包邮卡奖励。

## 4. 勋章

| 接口 | 用途 |
| --- | --- |
| `POST ms-sanfu-wechat-common/badge/initBadge` | 初始化勋章 |
| `GET ms-sanfu-wechat-common/badge/listBadgeGroup` | 勋章分组 |
| `GET ms-sanfu-wechat-common/badge/listBadge` | 勋章列表 |
| `GET ms-sanfu-wechat-common/badge/listCustomerBadge` | 我的勋章 |
| `POST ms-sanfu-wechat-common/badge/activateBadge` | 点亮勋章 |
| `POST ms-sanfu-wechat-common/badge/receiveBadgeReward` | 领取勋章奖励 |

规则文案（来自会员权益页）：

- 注册成为三福会员即可参与勋章任务累积。
- 达到条件后手动点亮，领取奖励。
- 奖励可能是福币、优惠券、包邮卡，具体以勋章界面为准。
- 奖励可在“我的卡券”或“福币”查看。

## 5. 自动化/赠礼/其他活动

| 接口 | 用途 |
| --- | --- |
| `GET ms-sanfu-wechat-common/automation/getCombinationAutomationCfg` | 组合营销/自动化活动配置 |
| `POST ms-sanfu-wechat-common/automation/saveMarketingAutomationReceive` | 领取自动化活动奖励 |
| `GET ms-sanfu-wechat-common/gift/getGift` | 赠礼信息 |
| `POST ms-sanfu-wechat-common/gift/receiveGift` | 领礼 |
| `POST ms-sanfu-wechat-common/gift/toGift` | 赠礼 |
| `GET ms-sanfu-wechat-common/donate/listDonateConfig` | 捐赠活动配置 |
| `GET ms-sanfu-wechat-common/prize/listPrizeForPop` | 弹窗奖品 |
| `GET ms-sanfu-wechat-common/game/listGameForPop` | 游戏/抽奖入口 |

> 这些接口可能包含营销弹窗/抽奖/赠礼，先只读，确认幂等和领取状态后再做写操作。

## 6. 会员权益规则（文案）

来自 `chunk_26.appservice.js`：

- 福币可兑换优惠券、联盟卡券、产品、游戏/抽奖机会，具体以兑换页面为准。
- 福币通过消费与活动获得；消费 1 元积 1 个福币；不同活动获得不同福币，见活动说明。
- 会员等级/折扣、包邮卡、退货补偿、生日礼包等是另一套权益，不要和福币混在一起。
- 生日礼包：一个自然年一次，生日当天推券，抽奖/包邮卡需手动领取，15 日内有效。

## 7. 待实测

- [ ] 勋章列表/点亮/领取真实字段
- [ ] 自动化活动配置/领取
- [ ] 赠礼/领礼
- [ ] 游戏/抽奖
- [ ] 活动周期/每日上限
- [ ] 哪些活动可以安全自动领取
