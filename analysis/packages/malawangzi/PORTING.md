# 麻辣王子（malawangzi）迁移记录

## 基本信息

- 应用 key：`malawangzi`
- 名称：麻辣王子
- AppID：`wxe8189d7d692db172`
- 最新包：`analysis/packages/malawangzi/unpacked-6`
- 平台脚本：`data/apps/malawangzi/scripts/sign-in.js`
- 应用清单：`data/apps/malawangzi/app.json`
- API Base：`https://ual.shuyun.com/wmc-interact-c/1.3`
- 默认签到活动：`7475`（签到领福利）
- 当前状态：已接入并启用，真实账号签到成功（今日已签）
- 只接签到接口，没有新增积分/商品/活动脚本

## 签到接口

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 微信登录 | `GET /index` | `platShopId=wxe8189d7d692db172`、`jsCode` | 成功 `code="0"`，返回 `tenantId/platShopId/unionId/uid/tx/token` |
| 进入活动 | `POST /activity/access` | `id=7475` | 小程序进入签到页时调用，失败可忽略 |
| 签到状态 | `GET /activity/info/7475` | 无 | `data.typeInfo.signed=1`、`signFlag=1` 表示今日已签 |
| 签到 | `GET /sign/7475` | 无 | 成功 `code="0"`；已签返回 `code="-1"`、`msg="今日已签到"` |

## 请求头

```text
Content-Type: application/json
X-TENANT: <tenantId>
X-PLATSHOPID: <platShopId>
X-UNIONID: <unionId>
X-UID: <uid>
X-TX: <tx>
X-TOKEN: <token>
X-CP: 
```

登录接口不需要以上登录头。`platShopId` 就是小程序 AppID，已实测。

## 登录与缓存

- 用 `ctx.yyb.getCode({ appId })` 取微信 code。
- 缓存 key：`auth`
- 内容：`{ tenantId, platShopId, unionId, uid, tx, token, updatedAt }`
- TTL：7 天
- 缓存 token 失效时清缓存、重新登录并重试一次。
- 活动 ID 可用应用环境变量 `activityId` 覆盖，默认 `7475`。

## 错误处理

- 成功判断：`String(code) === "0"`。
- 已签到：`typeInfo.signed=1`，或签到返回文案包含 `已签/重复/已完成`。
- 未登录/过期：清缓存重登。
- 奖励文案从 `data.receiveList[].awardName/benefitName` 提取，没有奖励字段时只显示“签到成功”。

## 验证

- `node --check data/apps/malawangzi/scripts/sign-in.js` 通过。
- 真实账号运行：
  - 首次：`登录成功：oqqh***W0M8` → `今日已签到`
  - 再次：`使用缓存 token` → `今日已签到`
