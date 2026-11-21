# 爱玛会员俱乐部接口清单

## 约定

- Base URL：`https://scrm.aimatech.com/aima/wxclient`
- 公共 Header：
  - `App-Id: scrm`
  - `Time-Stamp: <ms>`
  - `TraceLog-Id: <uuid>`
  - `Access-Token: <token>`
  - `Sign: md5("App-Idscrm" + "Time-Stamp" + ts + "TraceLog-Id" + uuid + "Access-Token" + token[50:80] + "AimaScrm321_^")`
  - `Referer: https://servicewechat.com/wx2dcfb409fd5ddfb4/228/page-frame.html`
- 鉴权方式：登录响应头 `set-access-token`，后续请求头 `Access-Token`
- 成功码：HTTP 200 + body `code === 200`

## 登录

```http
POST /user/members:login
Content-Type: application/json

{ "code": "<YYB wx.login code>" }
```

响应头：

```text
set-access-token: <token>
```

## 会员信息 / 积分

```http
GET /member/IndexInfo
Access-Token: <token>
```

响应关键字段：

| 字段 | 说明 |
| --- | --- |
| `content.vipMemberPointDTO.pointValue` | 会员积分余额 |
| `content.memberLevelName` | 会员等级 |
| `content.nickname` | 昵称 |

## 签到

```http
POST /mkt/activities/locations:search
{ "locations": [0,1,2] }

POST /mkt/activities/sign:search
{ "activityId": "<id>" }

POST /mkt/activities/sign:join
{ "activityId": "<id>", "activitySceneId": null }
```

## 积分商品

```http
POST /product/awards/deploy_up:search
Content-Type: application/json

{
  "productStoreStatus": 1,
  "exchange": true,
  "pageIndex": 1,
  "pageSize": 50
}
```

响应：`recordList[]`

| 字段 | 说明 |
| --- | --- |
| `id` | 商品 ID |
| `mallDisplayName` | 展示名 |
| `storePoint` | 积分价格；现金商品为 0 |
| `stock` / `skuIdList[].remainingNum` | 库存 |
| `productPicDTOList[].url` | 图片 |
| `conditionDTO.startDate/endDate` | 活动时间（毫秒时间戳） |

## 会员任务

```http
POST /vip/member/point_tasks:search
Content-Type: application/json

{}
```

响应：`content[]`

| 字段 | 说明 |
| --- | --- |
| `description` | 任务名 |
| `pointValue` | 奖励积分 |
| `type` | 1 普通 / 2 每日 |
| `joinStatus` | 参与状态（完成语义待验证） |
| `url` | 任务跳转路径 |
| `enabled` / `visible` | 是否展示 |

## 规则

- `POST /vip/point_rule/find`：积分规则。
- `POST /order/buyer/orders`：兑换下单（未接入自动兑换）。
