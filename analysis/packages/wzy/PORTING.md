# 喂自由（wzy）迁移记录

## 基本信息

- 应用 key：`wzy`
- 名称：喂自由（达能爱他美育儿中心）
- AppID：`wx75813e4a771649e5`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\wzy.js`
- 平台脚本：`data/apps/wzy/scripts/sign-in.js`
- 应用清单：`data/apps/wzy/app.json`
- API Base：`https://phapi.nutriciaeln.com.cn`
- 页面版本（Referer）：`100`
- 固定应用常量：`x-ca-key=203753385`、`version=1.0`、`ACTIVITY_CODE=MGM_SIGN`
- 一个 Run 只处理 `ctx.account`，不循环账号。
- 是否启用：`enabled: true`（每日签到活动当前已下线，见“阻塞 / 风险”）

## 接口清单

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| code 登录 | `POST /auth/v1/miniapp/login` | 无 | JSON `{ code, appid }`；外层 `code == 200` 且 `data.access_token` 为 token；有 `data.openId`/`data.unionId` 但无 token = 未注册会员 |
| 签到状态 | `POST /activity/v1/miniapp/sign/MGM_SIGN` | `Authorization: Bearer <token>` | 空 body `{}`；`data.continueDays` 连续天数，`data.signList` 末项 `status == 1` 表示今日已签 |
| 每日签到 | `POST /activity/v1/miniapp/sign/sign/MGM_SIGN` | `Authorization: Bearer <token>` | 空 body `{}`；外层 `code == 200` 后看内层 `data.code` |
| 自由金余额 | `GET /activity/v1/miniapp/credit/getUserCredit` | `Authorization: Bearer <token>` | `code == 200` 时取 `data.credit`；原脚本为非致命查询 |

### 业务码

- 外层成功：`code == 200`（数字或字符串均可）。
- 签到内层：
  - `data.code == "10002"`：今日已签到。
  - `data.code == "200"` 且 `data.value == 1`：签到成功。
  - `data.code == "10001"` 或 `data.text` 命中 `活动已结束|活动不存在|活动未开始|暂未开始`：当前无每日签到活动。
  - 其他内层结果：平台返回 `ok: false`（`sign_unknown`），并带原始响应。
- 登录态失效：外层 `code ∈ {401, 403, 4001, 4003, 10401}`，或 `msg/message` 命中 `token|登录|未授权|失效|过期|未登录|鉴权|无效`。
- 重复签到：签到外层失败文案命中 `已签|签到过|重复|已完成` 时按 `alreadyDone: true` 返回。
- 未注册会员：登录返回 openId/unionId 但无 token，或登录/签到状态文案命中 `注册|未激活|会员|绑定`。

## 请求头 / 加密

无自建签名、无请求加密、无 `ctx.crypto` 调用。原脚本的网关签名头是空值，原样保留：

```text
Host: phapi.nutriciaeln.com.cn
Accept: application/json
Content-Type: application/json
User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.75(0x18004b2b) NetType/WIFI Language/zh_CN
x-ca-key: 203753385
x-ca-signature-method: HmacSHA256
x-ca-timestamp: <Date.now() 毫秒>
x-ca-nonce: (空)
x-ca-signature: (空)
x-ca-signature-headers: x-ca-timestamp,x-ca-key,x-ca-nonce,x-ca-signature-method
version: 1.0
web_id: (空)
deviceId: (空)
Referer: https://servicewechat.com/wx75813e4a771649e5/100/page-frame.html
Authorization: Bearer <token>   # 登录后
```

- 原脚本签名与 nonce 都为空，网关不校验 HMAC，因此没有新增 HMAC 计算。
- `Host` 头在平台 `fetch` 中会被忽略（Node fetch 的 forbidden header），实际 Host 由请求 URL 决定，不影响接口。
- 未在日志中输出 token、openId、手机号。

## 缓存

- token 写入 `ctx.cache` 的 `auth` 键，TTL 7 天，保存 `token`、`uuid`、`updatedAt`。
- 与原脚本一致：缓存 token 不主动校验，直接用于签到状态请求。
- 状态/签到遇到登录态错误时：清缓存 → 重新取 code 登录 → 只重试一次。
- 再次登录后仍失效则抛 `ctx.authExpired`。
- 缓存按平台账号隔离，不使用 openid 作为 key。

## 注册 / 手机号

- 青龙脚本没有注册接口；登录返回 openId/unionId 但没有 `access_token` 时标记未注册。
- 平台实现：抛 `ctx.manualRequired(..., { details: { action: 'register', step: 'login' } })`，提示先在小程序内登录/注册。
- 未实现手机号授权注册，原脚本也没有该流程。

## 积分

- `GET /activity/v1/miniapp/credit/getUserCredit` 返回的 `data.credit` 是自由金余额。
- 平台在脚本末尾调用 `ctx.points.sync({ balance: credit, estimated: false })`，`metrics.pointsAfter` 同步记录。
- 自由金查询是非致命步骤，失败只记 `warn`，不影响签到结果。
- 应用清单 `pointsName` 为“自由金”。

## 商品 / 券

- 青龙脚本没有商品/优惠券列表接口。
- 签到活动、任务列表、自由金都不是商品列表。
- 因此未创建 `products.js`。

## 未迁移内容

- `GET /user/v1/miniapp/member/my`：青龙脚本只定义了常量，从未调用，未迁移。
- 青龙脚本中的 `wx_server` 取 code、token 文件缓存、随机等待：分别由 `ctx.yyb.getCode`、`ctx.cache`、平台调度替代。
- 原脚本 `RUN` 捕获所有异常只打日志；平台改为按业务结果 / `authExpired` / `manualRequired` 返回或抛出。

## 当前状态

- `node --check data/apps/wzy/scripts/sign-in.js` 通过。
- `app.json` JSON 校验通过。
- 本地 mock 验证通过：登录 → 状态查询 → 签到成功 → 自由金同步；今日已签；无签到活动（10001）；缓存 token 失效重登；未注册会员转人工。
- 未连接真实 YYB / 目标服务器联调（本机没有平台运行时的账号 ref / code）。

## 阻塞 / 风险

1. **每日签到已下线**：青龙脚本 2026-08 实测 `/activity/v1/miniapp/sign/sign/<任意 code>` 一律返回 `{"code":"10001","text":"活动已结束"}`，签到主流程当前无法产生实际签到。脚本保留完整流程，活动恢复后可直接使用。
2. **启用策略**：仍设置 `enabled: true`，因为登录和自由金查询仍可用，每天可刷新自由金余额；如果只需要签到，可改为 `false`。
3. **未实测**：登录、签到状态、签到成功分支、自由金接口未用真实账号跑过；`10001` 以外的未知内层结果会返回 `ok: false`，不会被误判为成功。
4. **活动码/签名常量**：`MGM_SIGN`、`203753385`、页面版本 `100` 是青龙脚本抓包时的固定应用常量，小程序升级后可能需要更新。
5. **状态判断**：今日是否已签严格按 `signList` 末项 `status === 1`（数字），与原脚本一致；如果服务端改为字符串 `"1"`，会漏判并继续尝试签到，接口会以 `10002` 返回已签。
