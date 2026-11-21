# 腾讯地图（txdt）迁移记录

## 基本信息

- 应用 key：`txdt`
- 名称：腾讯地图
- AppID：`wx7643d5f831302ab0`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\txdt.js`
- 平台脚本：`data/apps/txdt/scripts/sign-in.js`
- 应用清单：`data/apps/txdt/app.json`
- API Host：`https://miniapp.map.qq.com`、`https://mmapgwh.map.qq.com`
- 一个 Run 只处理 `ctx.account`，不循环账号
- 当前状态：已迁移，`node --check` 通过；用本地 mock 走通登录、用户信息、签到前余额、资产、签到、签到后余额、今日已签
- 是否启用：`enabled: true`

## 接口清单

全部为 `POST`。

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 小程序登录 | `POST https://miniapp.map.qq.com/minLogin/v2/login` | JSON `{seqid, app_id, auth_code, devHeader:{}}` | `err_code===0` 成功；返回 `user_id`、`openid`、`session_id` 等 |
| 用户信息 | `POST https://miniapp.map.qq.com/minLogin/v2/getUserInfo` | JSON `{seqid, app_id, userId, openId, source:"mini-tencentmap"}` | `err_code===0`；失败只告警，不阻断签到 |
| 现金/金币余额 | `POST https://mmapgwh.map.qq.com/activity/v1/withdraw/home` | JSON `{activity_id:1721983577, game_id:4, rule_id:"tencent_map_withdraw"}` | `code===0`；`data.coins` / `withdrawable_amount` / `current_withdraw_threshold` / `jackpot_amount` |
| 资产 | `POST https://mmapgwh.map.qq.com/activity/v1/assert/home` | JSON `{activity_id:1721983577}` | `code===0`；`data.coins`、`coupons_total`、`lottery_ticket_total` |
| 签到状态 | `POST https://mmapgwh.map.qq.com/activity/v1/checkin/calendar` | JSON `{activity_id, game_id:1, rule_id:"tencent_map_checkin"}` | `data.calendar[YYYYMMDD].checkin` 为今日是否已签；`checkin_days` / `period` |
| 执行签到 | `POST https://mmapgwh.map.qq.com/activity/v1/checkin` | JSON `{activity_id, game_id:1, rule_id:"tencent_map_checkin", nick}` | `code===0`；`data.prizes[]` 为奖励 |

固定常量（青龙脚本中的应用级常量，非个人凭据）：

- `APP_VERSION = 545`
- `LOGIN_ACCESS_KEY = "1"`
- `LOGIN_SECRET_KEY = "4300eec60bedec22a73408a0d76b03ec"`
- `TMAP_SECRET = "3a9875e795c3ecff15f617085e72d4cc"`
- `CHECKIN_TOKEN = "e643d512f085d621bf6c9e80310d0498"`
- `ACTIVITY_ID = 1721983577`

## 请求头 / 签名

公共请求头：

```text
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF
Accept: application/json, text/plain, */*
Referer: https://servicewechat.com/wx7643d5f831302ab0/545/page-frame.html
Content-Type: application/json
```

登录接口 `mapservice-*` 签名：

```text
reqId     = md5(`${Math.random()} ${Date.now()}`)
reqTime   = Date.now().toString().slice(0, 10)        # 秒级 10 位
signParams = { appId, reqId, reqTime, userId, openID, sessionID,
               accessKey, businessStr: JSON.stringify(body) }
signText  = `${sortedQuery(signParams)}&secretKey=4300eec60bedec22a73408a0d76b03ec`
mapservice-sign = sha256(signText)
头：mapservice-sign-version=v2、mapservice-sign、mapservice-reqid、mapservice-reqtime、
    mapservice-appid、mapservice-accesskey、mapservice-sessionid
sessionId !== "-1" 时追加 mapservice-openid / mapservice-userid
```

`sortedQuery` 保留原脚本规则：key 升序，跳过 `undefined` / `null`。

地图 H5 接口 `tmap-*` 签名：

```text
reqId  = ctx.crypto.uuid()
reqTime = Date.now()
path   = apiPath.split("?")[0]
signBase = `mapinst=0&mapnonce=0&reqid=${reqId}&reqtime=${reqTime}`
tmap-default-sign = md5(`${signBase}${path}0${TMAP_SECRET}`)
头：tmap-reqid、tmap-reqtime、tmap-userid、tmap-login-ssid、tmap-imei=0、tmap-qimei=0、
    tmap-qimei36=0、tmap-nonce=0、tmap-install-id=0、tmap-sign=0、tmap-default-sign、
    tmap-app-version=0、tmap-channel=0、tmap-engine=web、tmap-mini-login-ssid、tmap-app-id
```

签到接口额外 `checkinHeader`：

```text
request_id = ctx.crypto.uuid()
timestamp  = Math.floor(Date.now() / 1000)
sign       = sha256(`request_id=${request_id}&from_source=wx7643d5f831302ab0&timestamp=${timestamp}&token=e643d512f085d621bf6c9e80310d0498`).toUpperCase()
头：user_id=<loginInfo.openid>、from_source、request_id、timestamp、sign
```

成功/失败判断：

- 登录 / 用户信息：HTTP 200 且 `err_code===0`；
- 地图接口：HTTP 200 且 `code===0`，取 `data`；
- 业务失败会带上接口路径、HTTP 状态和响应片段，便于排查。

## 缓存 / 登录态

- 青龙脚本每次运行都用新的 `code` 重新登录，没有本地 token 缓存。
- 平台脚本保留这一行为：每次 `run` 只用一次 `ctx.yyb.getCode({ appId })`，不读写登录缓存。
- 因此 `ctx.cache` 未使用；没有自造缓存校验或错误码。

## 注册 / 积分 / 商品

- 注册：青龙脚本没有注册/绑定流程，`minLogin/v2/login` 直接按 code 登录并返回用户。
  没有可确认的“未注册”错误码，未新增 `manualRequired` 分支，登录失败按接口错误抛出。
- 积分：`withdraw/home` 的 `data.coins` 是金币余额。签到前后各查一次，签到后余额通过
  `ctx.points.sync({ balance, estimated: false, rulesText: "腾讯地图签到金币，100 金币=1 元，具体以活动页面为准" })`
  同步；`metrics.earned` 为签到前后金币差（不为负）。
- 金币换算：原脚本 `formatCoin()` 用 `num/100` 展示元，故按 100 金币 = 1 元记录；只影响文案，不改接口。
- `products.js`：未新增。原脚本只有 `coupons_total` / `lottery_ticket_total` 数量，没有优惠券或商品列表接口。

## 验证情况

- `node --check data/apps/txdt/scripts/sign-in.js` 通过。
- `app.json` JSON 解析通过。
- 本地 mock 覆盖：
  - 登录 → 用户信息 → 签到前余额 → 资产 → 日历（未签）→ 签到 → 签到后余额 → 日历（已签）；
  - `alreadyDone` 分支：日历显示今日已签时不调用签到接口；
  - `points.sync` 余额 150、`earned` 50；
  - 登录、地图接口签名头均存在，签到 `nick` 取用户昵称。
- 没有真实 YYB 账号做线上联调；未请求真实腾讯地图接口。

## 阻塞项 / 风险

1. 登录签名里的 `reqTime` 使用原脚本的 `Date.now().toString().slice(0, 10)`（秒级），不是完整毫秒；若服务端校验窗口很窄，需真实环境确认。
2. `minLogin/v2/login` 的 `session_id` 有效期未知；当前按原脚本每次重新登录，不做缓存。
3. `getUserInfo` 失败按原脚本只告警，签到昵称回退为“微信用户”。
4. 固定 secret / activity_id 可能随小程序活动版本变化。
5. 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
