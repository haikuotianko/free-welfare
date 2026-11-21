# 名创优品（mcyp）迁移记录

## 基本信息

- 应用 key：`mcyp`
- 名称：名创优品
- AppID：`wx2a212470bade49bf`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\mcyp.js`
- 平台脚本：`data/apps/mcyp/scripts/sign-in.js`
- 应用清单：`data/apps/mcyp/app.json`
- 登录：`https://cdn-storeexpress.miniso.com/wechat/login`
- 业务 API：`https://api-saas.miniso.com/task-manage-platform`
- 页面 Referer 版本：登录 `1110`，业务 `1084`
- 一个 Run 只处理 `ctx.account`，不循环账号。
- 当前状态：已迁移；`node --check`、`app.json` 解析、mock 登录/签到均通过；`enabled: true`。

## 接口清单

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 登录 | `POST https://cdn-storeexpress.miniso.com/wechat/login` | 登录签名头 | body 为 `AES-128-CBC(hex)` 加密的 `{ code, appid: wx2a212470bade49bf, isreturnuserinfo: 1 }`；`code == 200` 且 `data.skey` 存在即成功，返回 `skey/openid/unionid/uid` |
| 签到任务详情 | `GET /task-manage-platform/api/activity/signInTask/taskDetail?activityId=18` | `content-skey` 等业务头 + `signature` | `code == 200`；`data.todaySignInFinishFlag === 1` 表示今日已签，`data.signInFinishDays` 为已签到天数，`data.taskId` 为任务 ID |
| 签到 | `POST /task-manage-platform/api/activity/signInTask/award/receive` | `content-skey` 等业务头 + `signature` | body `{ activityId: "18", taskId }`；`code == 200` 成功 |

业务成功码：`Number(data.code) === 200`。

重复签到：`award/receive` 的 `message/msg` 命中 `已签|签到过|重复|已完成|已领取` 时按“今日已签到”返回。

今日状态以 `taskDetail.data.todaySignInFinishFlag` 为准（`1` 或 `true`），不使用本地日期推断。

登录态失效：`code ∈ {401, 403, 4001, 4003, 10401}`，或 `message/msg` 命中 `token|登录|未授权|失效|过期|未登录|鉴权|skey|会话` 时，清缓存重新取 code 登录并重试一次；再次失败抛 `ctx.authExpired`。

## 请求头 / 加密 / 签名

### 登录

```text
content-type: application/json
version: storeexpress1.0
tenant-code: MINISO
can-flash-send: false
content-sceneid: 1027
x-client-source: MINISO_WX_MINI
content-longitude: [object Undefined]
content-latitude: [object Undefined]
content-weappcode: ""
content-appcode: ""
content-uid: ""
content-skey: ""
content-openid: ""
content-unionid: ""
nonce: 32 位 [1234567890qwertyuiopasdfghjklzxc] 随机串
time: Date.now().toString()
signature: MD5(SIGN_PREFIX + time + "#" + nonce) 大写
charset: utf-8
referer: https://servicewechat.com/wx2a212470bade49bf/1110/page-frame.html
user-agent: Mozilla/5.0 ... Chrome/132.0.0.0 ... MiniProgramEnv/Windows WindowsWechat/WMPF
```

- `SIGN_PREFIX = "#storeexpress1.0#ffe232&t%4df!67sx55eas#"`
- 登录明文：`JSON.stringify({ code, appid, isreturnuserinfo: 1 })`
- AES：`aes-128-cbc`，key（hex）`0f9f8b1e791f754d2ded9dfb38a4b628`，iv（hex）`31323334353637383930313233343535`，PKCS7，输出 hex 作为原始 body。
- 平台使用 `ctx.crypto.aesEncrypt`（`keyEncoding: "hex"`、`iv` 为 hex、`output: "hex"`），不引入 Node `crypto`。
- 请求 body 是 hex 字符串本身，`Content-Type` 仍保留 `application/json`。

### 业务请求

```text
content-type: application/json
version: storeexpress1.0
tenant-code: MINISO
tenant: MINISO
x-mi-version: 5.1.64
x-client-source: MINISO_WX_MINI
content-weappcode: 52
content-appcode: 51
content-sceneid: 1256
content-pagetype: %E6%BD%AC%E7%8E%A9%E7%AD%BE%E5%88%B0%E9%A1%B5%E9%9D%A2
content-pagename: %E6%BD%AC%E7%8E%A9%E7%AD%BE%E5%88%B0%E9%A1%B5%E9%9D%A2
x-mi-store-id: Z6XV
content-skey: <登录 skey>
content-openid: <登录 openid>
content-unionid: <登录 unionid>
content-uid: <登录 uid>
content-latitude: [object Undefined]
content-longitude: [object Undefined]
x-mi-city: ""
user-agent: 同上
accept: */*
referer: https://servicewechat.com/wx2a212470bade49bf/1084/page-frame.html
can-flash-send: true
time: Date.now()
nonce: 32 位 [A-Za-z0-9] 随机串
signature: MD5(<签名基串> + time + nonce) 大写
```

签名基串：

| 请求 | 基串 |
| --- | --- |
| 签到任务详情 | `"signInTaskDetail" + activityId`，即 `signInTaskDetail18` |
| 签到 | `JSON.stringify({ activityId: "18", taskId })` |

- 签到 POST 的 body 与签名基串使用同一个 JSON 字符串，避免字段顺序/空格差异。
- `Z6XV` 是青龙脚本固定门店 ID，不是个人凭证。
- 原脚本的 `host` 属于传输层头，平台 HTTP 客户端会处理，未手工设置；其余业务头保留。

## 缓存

- key：`auth`，TTL 7 天。
- 保存 `skey`、`openid`、`unionid`、`uid`、`storeId`、`updatedAt`。
- 优先使用缓存；任务详情或签到遇到登录态错误时清缓存、重新取 code 登录并重试一次。
- 日志不输出 skey、code、openid、unionid、uid。

## 注册 / 手机号

- 青龙脚本没有注册接口；登录或任务详情文案命中 `注册|未激活|会员|绑定|授权` 时标记未注册。
- 平台实现：抛 `ctx.manualRequired(..., { details: { action: "register" } })`，提示先在小程序内登录/注册。
- 不实现手机号授权注册，原脚本也没有该流程。

## 积分

- 青龙脚本没有积分余额查询接口，签到响应也没有解析任何积分字段。
- 因此不调用 `ctx.points.sync`；`metrics.signDays` 只记录连续签到天数。
- `pointsName` 仅作展示。

## 商品 / 券

- 青龙脚本没有商品/券列表接口，签到任务也不是积分商品列表。
- 因此未创建 `products.js`。

## 未迁移内容

- 青龙脚本的多账号循环、`wx_server` 取 code、`fs` token 缓存、请求间随机等待。
- 平台负责账号隔离、缓存与调度节流。
- 没有迁移签到之外的 MINISO 商城/会员玩法。

## 当前状态

- 代码：`node --check data/apps/mcyp/scripts/sign-in.js` 通过。
- 清单：`app.json` JSON 解析通过。
- mock 验证通过：AES 登录（解密请求体校验明文、MD5 登录签名）→ 任务详情（`signInTaskDetail18` 签名）→ `award/receive`（body 与签名一致）→ 第 3 天；已签到分支；登录注册文案转人工。
- 另用平台 worker 的 `createCryptoApi`（`apps/worker/dist/runner/crypto.js`）对 mock 的 AES/签名结果做了交叉校验。
- `run(ctx)` 包装层（`createLegacyAdapter`、未调用 `points.sync`）mock 通过。
- 未连接真实 YYB/名创优品服务器联调（本机没有平台运行时的账号 ref / code）。
- `enabled: true`。

## 阻塞 / 风险

1. **活动 ID 固定为 18**：青龙脚本硬编码 `ACTIVITY_ID = 18`；活动结束后 `taskDetail` 可能不再返回 `taskId`，脚本会返回 `ok: false` 并提示更新 activityId。
2. **AES 常量**：key、iv、`SIGN_PREFIX`、门店 ID 均来自青龙脚本抓包；小程序升级后若更换，需要重新抓包。
3. **未实测**：登录、任务详情、签到均未用真实账号跑过；`content-pagetype` 等 URL 编码头按原脚本原样发送。
4. **积分余额缺失**：接口不返回积分余额，平台积分快照不会更新。
5. **未注册账号**：没有注册流程，未注册/未激活账号会转人工。
