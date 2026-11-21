# 立乐家（lilejia）迁移记录

## 基本信息

- 应用 key：`lilejia`
- 名称：立乐家
- AppID：`wxb9f68ca2da513bb2`
- 最新包：`analysis/packages/lilejia/unpacked-135`
- 平台脚本：`data/apps/lilejia/scripts/sign-in.js`
- 应用清单：`data/apps/lilejia/app.json`
- API Base：`https://clubwx.hm.liby.com.cn`
- platformCode：`LiLeJia`
- 当前状态：已接入并启用，真实账号签到成功（今日已签）
- 只接签到接口，没有新增积分/商品/活动脚本

## 签到接口

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 微信登录 | `POST /miniprogram/auth/loginMiniProgramB2cV2.htm` | JSON `{type:1, code, flag:0, registerChannel:"", userInfo:{}}` | 成功 `code=200`，`data.token` |
| 签到状态 | `GET /miniprogram/benefits/activity/sign/reward/get.htm` | query `marketingCode`（普通入口为空） | `data.id` 为签到 taskId，`data.isSign=true` 表示今日已签 |
| 签到 | `GET /miniprogram/benefits/activity/sign/execute.htm` | query `taskId` | 成功 `code=200`，`data.resultDesc` 为奖励文案，`data.rewardType=1` 表示有抽奖机会 |
| 抽奖（未接入） | `GET /miniprogram/benefits/activity/lottery/execute.htm` | query `taskId` | 只提示到小程序领奖，不自动调用 |

## 请求头

```text
Content-Type: application/json
appId: wxb9f68ca2da513bb2
platformCode: LiLeJia
unionId: <登录返回 userInfo.weixin_unionID>
X-wxb9f68ca2da513bb2-Token: <登录返回 token>
```

## 登录与缓存

- 用 `ctx.yyb.getCode({ appId })` 取微信 code。
- 登录使用 `type=1`（小程序里的“直接登录”分支）；`type=0` 会返回 `code=503`。
- 缓存 key：`auth`
- 内容：`{ token, unionId, userInfo, mobile, userId, updatedAt }`
- TTL：30 天（与小程序 token 过期策略一致）
- 缓存 token 失效时清缓存、重新登录并重试一次。

## 错误处理

- 成功码统一为 `code === 200`。
- 已签到：`data.isSign=true` 或签到返回文案包含 `已签/重复/已完成`。
- 未登录/过期：清缓存重登。
- 需要注册/绑定手机号：抛 `ctx.manualRequired`，`details.action = "register"`。
- 有抽奖机会时只提示，不自动抽奖。

## 验证

- `node --check data/apps/lilejia/scripts/sign-in.js` 通过。
- 真实账号运行：
  - `登录成功：***`
  - 首次探测签到：`签到成功，恭喜获得2积分`
  - 平台脚本再次运行：`今日已签到`
