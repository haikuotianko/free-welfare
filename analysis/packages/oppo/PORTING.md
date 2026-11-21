# OPPO（oppo）迁移说明

## 基本信息

- 应用 key：`oppo`
- 名称：OPPO
- AppID：`wxe705c556754a1de2`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\oppo.js`
- 平台脚本：`data/apps/oppo/scripts/sign-in.js`
- 应用配置：`data/apps/oppo/app.json`
- 解包目录：无（本次未使用缓存小程序包，按青龙脚本迁移）
- 账号来源：平台 `ctx.account`（YYB 账号），不再读取青龙变量 / `wx_server` openid
- 页面 Referer 版本：`361`（源脚本 `APP.version`）
- 当前状态：已迁移，`node --check` 通过，本地 mock 走通登录、会员查询、活动发现、签到、积分同步、已签到分支
- 是否启用：`enabled: true`

## 接口清单

小程序接口域名：`https://omoapplet-api-cn.heytap.com`

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| code 登录 | `POST /user/pre/auth` | 无 | JSON `{ code }`；`ret == "1"` 成功；`data` 含 `sessionId`、`encryptedSession`、`openId` |
| 会员信息/积分 | `GET /member/info?sessionId=` | `sessionId` 头/query | `data.pointAmount` 为积分，`data.growthValue` 为成长值，`data.gradeCode` 为等级 |
| 会员基础信息 | `GET /member/baseInfo?sessionId=` | 同上 | 主要取 `userName`；原脚本失败时忽略 |
| 签到入口 | `GET /activity/signIn/entrance?sessionId=` | 同上 | 返回 `signInIsStarted`、`signInDays`，只做展示 |

签到 H5 域名：`https://hd.opposhop.cn`

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 发现当期活动 | `GET /bp/b371ce270f7509f0?...` | 无 | 读取 HTML，从 `{"type":"SignIn",...}` 楼层里解析 `activityInfo.activityId` 和 `creditsAddActionId` |
| 签到详情 | `GET /api/cn/oapi/marketing/cumulativeSignIn/getSignInDetail` | H5 会话头/Cookie | query：`activityId`、`creditsAddActionId`、`business=1`；`data.baseAwards[].status==1` 表示已签 |
| 每日签到 | `POST /api/cn/oapi/marketing/cumulativeSignIn/signIn` | H5 会话头/Cookie | JSON：`activityId`、`captchaCode: ""`、`creditsAddActionId`、`business: 1`；`data.receiveStatus === false` 表示业务失败 |

签到活动 id 会按月轮换。平台脚本保留源脚本的运行时发现逻辑；发现失败时回落到 `2061050217641549824`（2026-06 那期）并输出 warn。

## 请求头 / 签名

无自建签名、无 AES/RSA，未使用 `ctx.crypto`；请求头按源脚本原样保留。

小程序请求头：

```text
content-type: application/json
s_channel: oppo
source_type: 2
s_version: 010000
spCallSource: oppohy
Referer: https://servicewechat.com/wxe705c556754a1de2/361/page-frame.html
sessionId: <登录返回的 sessionId>
NEWOPPOSID: <登录返回的 encryptedSession>
openid: <登录返回的 openId>
sa_distinct_id: <openId>
constToken: <sessionId>
```

登录请求只带 `content-type` 和 `Referer`。

H5 请求头：

```text
content-type: application/json
Origin: https://hd.opposhop.cn
Referer: https://hd.opposhop.cn/bp/b371ce270f7509f0?nightModelEnable=true&utm_source=huiyuanwx&utm_medium=me_qiandao
sessionId: <sessionId>
NEWOPPOSID: <encryptedSession>
openid: <openId>
sa_distinct_id: <openId>
constToken: <sessionId>
Cookie: NEWOPPOSID=<urlencoded>; sessionId=<urlencoded>; openid=<urlencoded>
```

活动发现页使用手机微信 UA：

```text
User-Agent: Mozilla/5.0 (Linux; Android 12) ... Chrome/107.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.30
Accept: text/html,*/*
Referer: <签到页 URL>
```

业务码：

- 小程序：HTTP 200 且 `ret == "1"`；`ret` 非 1 抛错，消息命中 session/token/登录/失效/过期时重新登录。
- H5：HTTP 200 且 `code == 200` 或 `succeed === true`；否则抛错。
- `receiveStatus === false`：签到业务失败，返回 `ok: false`，消息取 `receiveFailMsg` / `message`。
- 若失败消息命中 `已签|已经签|签到过|重复|已完成`，按今日已签到返回。

## 缓存

- 缓存 key：`auth`
- 内容：`{ sessionId, encryptedSession, openId, updatedAt }`
- TTL：7 天
- 使用缓存前调 `GET /member/info` 校验；失效则清缓存并重新取 code 登录。
- 任务过程中遇到 session 失效会清缓存、重新登录并重试一次。

## 注册 / 人工处理

- 源脚本没有注册/手机号绑定流程，也没有注册判断。
- 登录只要求微信 code；若服务端因风控或其他原因拒绝登录，脚本抛业务错误，不会伪造注册。
- 未新增 `ctx.manualRequired(action=register)`，因为没有证据表明 OPPO 需要单独的注册动作。

## 积分

- 会员积分字段：`member/info` 的 `data.pointAmount`。
- 签到前后各查一次会员信息，最终以签到后的 `pointAmount` 调 `ctx.points.sync({ balance, estimated: false })`。
- 本次签到奖励取签到响应 `data.awardValue`，仅写入 `metrics.earned`，不作为余额。
- 成长值、等级、连续签到天数只放在返回 `data`，不参与积分同步。

## 商品 / 券

源脚本没有商品/优惠券列表接口，未创建 `products.js`。

## 状态 / 验证

- `node --check data/apps/oppo/scripts/sign-in.js` 通过。
- `app.json` JSON 校验通过。
- 本地 mock 验证：code 登录、缓存会话、会员积分、签到入口、H5 活动发现、签到成功、重复签到、积分同步。
- 未执行 `pnpm import:apps`，未写数据库，未做真实 YYB 取码/OPPO 接口联调。

## 阻塞 / 风险

1. **活动 id 轮换**：签到活动 id 按月变化。HTML 发现依赖 `SignIn` 楼层结构；如果 OPPO 改版或页面不再直出配置，会回落到旧 id，签到返回「活动已经结束」。此时登录和积分查询仍可用，但签到会返回失败。
2. **未实测**：所有接口只在 mock 下验证，未用真实账号联调；H5 Cookie/会话是否与小程序 web-view 完全一致需真实环境确认。
3. **版本号**：`Referer` 版本 `361` 为源脚本抓包值，小程序升级后可能需要更新。
4. **签到入口接口失败会中断**：保留源脚本行为，`/activity/signIn/entrance` 查询失败会抛错，后面的签到不会执行。
5. **无注册流程**：若账号没有 OPPO 会员身份，服务端登录/签到错误会直接以业务失败返回，不转人工注册。
