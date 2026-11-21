# 杰士邦会员中心（jsb）迁移记录

## 基本信息

- 应用 key：`jsb`
- 名称：杰士邦会员中心
- AppID：`wx5966681b4a895dee`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\jsb.js`
- 平台脚本：`data/apps/jsb/scripts/sign-in.js`
- 应用清单：`data/apps/jsb/app.json`
- API Base：`https://api.vshop.hchiv.cn/jfmb`
- 页面 Referer 版本：`1`
- 一个 Run 只处理 `ctx.account`，不循环账号。
- 当前 `enabled`：`true`

## 接口清单

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 静默登录 | `POST /cloud/member/wechatlogin/authLoginApplet` | JSON `{wxInfo:<code>, extend:"{}", sessionIdForWxShop:""}` | 响应 `data.openId` / `data.unionId`；`clientToken` 由响应自动捕获；未返回 token 通常表示该微信未注册会员 |
| 会员信息（原脚本声明未使用） | `POST /cloud/member/tblogin/getClientInfo` | 原脚本未调用 | 平台保留常量但不调用，避免猜测参数 |
| 签到状态 | `POST /cloud/activity/sign/load-sign` | JSON `{activityId:"170630"}` | `code == 200`；`data.signed === true` 表示今日已签，另有 `continuousSignNum` / `totalSignNum` |
| 执行签到 | `POST /cloud/activity/sign/add-sign` | JSON `{activityId:"170630"}` | `code == 200` 成功；`data.integralCount` 为本次积分，`data.prizeList` 为奖励 |

固定常量（原脚本硬编码，应用级）：

- `SIGN_ACTIVITY_ID = "170630"`
- `SHOP_ID = "467028"`（原脚本声明，但当前签到链路未使用）
- `APP_ID = "wx5966681b4a895dee"`

## 公共请求体 / Query

所有请求均为 `POST`，body 由 `buildData()` 合成：

```json
{
  "appId": "wx5966681b4a895dee",
  "openId": "<登录后回填，首次登录为空>",
  "shopNick": "",
  "timestamp": 1700000000000,
  "interfaceSource": 0
}
```

再合并接口字段（如 `wxInfo`、`activityId`）。

Query 固定为：

```text
?sideType=3
 &mob=<手机号，当前为空>
 &appId=wx5966681b4a895dee
 &shopNick=<mainShopNick 或 appId>
 &timestamp=<新的毫秒时间戳>
 [&securePlatId=<响应捕获值>]
```

注意 body 和 query 的 `timestamp` 是两次独立的 `Date.now()`，与原脚本一致。

## 请求头 / Cookie / Token

```text
content-type: application/json
appenv: test
User-Agent: <原青龙 UA>
Referer: https://servicewechat.com/wx5966681b4a895dee/1/page-frame.html
cookie: <从 Set-Cookie 捕获的 JSESSIONID>
Authorization: Bearer <clientToken>
```

- 无自建签名、无请求加密。
- 原脚本在每次响应后捕获：
  - `set-cookie[0]` 的分号前部分作为 `jsession`；
  - `res.data.data.clientToken` 或 `res.data.data.data.clientToken` 作为 `clientToken`；
  - `res.data.data.data.securePlatId` 或 `res.data.securePlatId` 作为 `securePlatId`。
- 平台实现做大小写不敏感的 `set-cookie` 读取，并兼容多条 Cookie 合并成一个头的情况；
  仍只取第一条，与原脚本一致。
- 日志不输出 token、cookie、手机号、openId。

## 响应壳

青龙脚本按“双层壳”取值：`res.data.data` 才是业务体
`{code, message, data}`。平台实现 `envelopeOf()`：

- 优先识别 `res.data` 下带 `code` / `resultCode` 的业务体（双层壳）；
- 兼容单层 `{code, message, data}`；
- 再兼容网关多包一层 `data` 的情况。

业务成功/失败码没有改变：只认 `code === 200` 成功，`code === 204` 或文案
`未登录 / 未注册` 视为需要注册会员。

## 登录态与缓存

- `ctx.cache` 键 `auth`，保存
  `{ clientToken, openId, unionid, jsession, securePlatId, updatedAt }`，TTL 7 天。
- 有缓存时直接复用 `clientToken` / `jsession` / `securePlatId`，先调签到状态接口；
  若缓存态下返回非 200（包括 204、401、token 失效等），清缓存重新登录并只重试一次。
- 无缓存时先 `ctx.yyb.getCode({ appId })` 再登录。
- 缓存重登后仍返回 `204` / `未登录` / `未注册` 时，转人工注册。
- 日志不输出微信登录 code / token / cookie。

## 注册 / 手机号

- 青龙脚本没有注册接口，也没有手机号授权流程。
- 登录未返回 `clientToken`，或签到状态返回 `code == 204` / 文案 `未登录|未注册` 时，
  原脚本提示先在小程序内绑定手机号注册。
- 平台实现：抛 `ctx.manualRequired(..., { details: { action: 'register' } })`。
- 未实现手机号授权注册，原脚本也没有该流程。

## 积分

- 该脚本没有查询积分余额的接口。
- `add-sign` 的 `data.integralCount` 是**本次签到获得积分**，不是余额，不能用于
  `ctx.points.sync`。
- 平台不猜测余额字段，因此不调用 `ctx.points.sync`，只在 `metrics.earned` 和返回值
  `data.earned` 中记录本次获得积分。
- 如果后续确认 `load-sign` 或其它接口返回余额字段，再补积分同步。

## 商品 / 券

- 青龙脚本没有商品/优惠券列表接口。
- 签到奖励 `prizeList` 只是本次签到结果，不是可兑换商品列表。
- 因此未创建 `products.js`。

## 当前状态

- 代码：`node --check data/apps/jsb/scripts/sign-in.js` 通过。
- 清单：`app.json` JSON 校验通过。
- 本地 mock 验证通过：双层壳登录、clientToken / Set-Cookie 捕获、签到状态、签到成功、
  重复签到、缓存 clientToken 复用、缓存失效重登、204 未注册转人工、单层壳兼容。
- 未连接真实 YYB / 杰士邦服务器联调（本机没有平台运行时的账号 ref / code）。
- 本次迁移只依据青龙脚本 `jsb.js`，未使用缓存小程序包。
- `enabled: true`。

## 阻塞 / 风险

1. **注册阻塞**：未在杰士邦会员中心注册/绑定手机号的微信账号会每次运行都转人工。
   需要先在小程序内完成登录并绑定手机号。
2. **首次登录 openId 为空**：青龙脚本把 wx_server 变量里的 openid 放进公共 body；
   平台账号只暴露 `yybRef`（YYB 的账号 id，不是 openid），因此平台首次登录请求的
   `openId` 为空，登录成功后用响应里的 `openId` 回填后续请求。若服务端要求首次登录
   必须携带 openid，需要平台补充完整 openid 能力。
3. **活动 id 可能失效**：`activityId=170630` 是原脚本硬编码值，若活动更换需要更新。
4. **响应壳未实测**：双层壳按原脚本注释和取值路径实现，同时做单层/多层兼容；
   真实响应若与假设不同，签到状态可能被判定为非 200。
5. **版本号/Referer**：`PAGE_VERSION=1`、`appenv=test` 为青龙脚本抓包时的值。
6. **Set-Cookie 平台限制**：平台 HTTP 客户端用 Node `Headers.forEach` 读取响应头，
   多条 `Set-Cookie` 时只暴露其中一个值（本机 Node 24 实测为最后一条）；原脚本取
   `set-cookie` 数组的第一条。若服务端同时下发多个 Cookie 且最后一条不是 JSESSIONID，
   平台会拿不到正确 cookie，联调时需要重点确认。
7. 原脚本的 `SHOP_ID=467028` 与 `EP_CLIENT=getClientInfo` 未参与签到链路，平台保留
   常量但不调用，避免猜测参数。
