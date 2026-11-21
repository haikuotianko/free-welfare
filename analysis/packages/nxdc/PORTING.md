# 奈雪（nxdc）迁移记录

## 基本信息

- 应用 key：`nxdc`
- 名称：奈雪
- AppID：`wxab7430e6e8b9a4ab`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\nxdc.js`
- API 域名：
  - `https://tm-api.pin-dao.cn`（登录）
  - `https://tm-web.pin-dao.cn`（签到、签到记录）
- 平台脚本：`data/apps/nxdc/scripts/sign-in.js`
- 应用清单：`data/apps/nxdc/app.json`
- 当前状态：已迁移，`node --check` 通过；mock ctx 走通“新登录 → 签到”“已签”“缓存 token 失效重登”“未注册转人工注册”
- 是否启用：`enabled: true`
- 商品脚本：未创建。青龙脚本没有积分商品/优惠券列表接口。

## 接口清单

所有业务接口均为 `POST`，JSON body 为统一信封：

```json
{
  "common": {
    "platform": "wxapp",
    "version": "6.0.42",
    "imei": "",
    "osn": "microsoft",
    "sv": "Windows 10 x64",
    "lat": "",
    "lng": "",
    "lang": "zh_CN",
    "currency": "CNY",
    "timeZone": "",
    "nonce": 123456,
    "openId": "QL6ZOftGzbziPlZwfiXM",
    "timestamp": 1700000000,
    "signature": "<base64 hmac-sha1>"
  },
  "params": {
    "businessType": 1,
    "brand": 26000252,
    "tenantId": 1,
    "channel": 2,
    "stallType": null,
    "storeId": "",
    "storeType": "",
    "cityId": "",
    "...": "各接口追加字段"
  }
}
```

### 登录

`POST https://tm-api.pin-dao.cn/passport/authenticate/wxapp/verify/grc`

- `params` 追加：`appId=wxab7430e6e8b9a4ab`、`dAId=""`、`type=3`、`wxappCode=<wx.login code>`、`regChannelCode="|1027"`
- 请求头：
  - `Host: tm-api.pin-dao.cn`
  - `Authorization: Bearer null`
  - `User-Agent`：Windows Chrome/132 + MicroMessenger/7.0.20.1781
  - `xweb_xhr: 1`
  - `storeId: ""`
  - `Content-Type: application/json`
  - `iv`: 16 位随机数字字符串
  - `Accept: */*`
  - `Referer: https://servicewechat.com/wxab7430e6e8b9a4ab/1/page-frame.html`
- 响应 token 提取顺序（与原脚本一致）：`token`、`accessToken`、`access_token`、`authToken`、`memberToken`，顶层和 `data` 内层都会尝试。
- 没有 token 表示“未注册/登录失败”，脚本抛 `ctx.manualRequired(..., { details: { action: 'register' } })`。

### 签到记录

`POST https://tm-web.pin-dao.cn/user/sign/records`

- `params` 追加：
  - `signDate`：北京时间当月 1 日，`YYYY-MM-01`
  - `startDate`：北京时间今天，`YYYY-MM-DD`
- 请求头：`Authorization: Bearer <token>`、`Referer: https://tm-web.pin-dao.cn/`、`Origin: https://tm-web.pin-dao.cn`、`Content-Type: application/json`、原 `User-Agent`。
- 成功条件：`code === 0`。
- 返回字段：`data.status`（今日已签）、`data.signCount`（累计天数）。

### 签到

`POST https://tm-web.pin-dao.cn/user/sign/save`

- `params` 追加：`signDate`：北京时间今天。
- 成功条件：`code === 0 && data.flag`。
- 返回字段：`data.signCount`。
- 失败文案命中 `/已签|签到过|重复/` 时按“今日已签到”处理（保留原脚本）。

## 请求头 / 加密

- 无 AES/RSA，无个人凭证。
- 每个请求都重新生成 `nonce`（6 位数字）和秒级 `timestamp`。
- 签名：

```text
signature = base64(hmac_sha1(SIGN_SECRET,
  "nonce=<nonce>&openId=<OPEN_ID>&timestamp=<timestamp>"))
```

- `SIGN_SECRET = sArMTldQ9tqU19XIRDMWz7BO5WaeBnrezA`
- `OPEN_ID = QL6ZOftGzbziPlZwfiXM`
- 两者是小程序固定应用常量，原脚本硬编码，非个人凭证；换版可能变化。
- 原脚本的 `nonce` 是可能带前导 0 的 6 位字符串，但 body 里 `common.nonce` 用 `Number(nonce)`。为避免“签名原文带 0、body 数字丢 0”不一致，平台脚本生成 100000–999999 的 6 位数字，签名原文与 JSON number 完全一致。
- 登录接口的 `iv` 请求头是 16 位随机数字字符串，与签名无关。

## 登录态与缓存

- `ctx.cache` 键：`auth`，保存 `{ token, updatedAt }`，TTL 7 天。
- 有缓存时先直接查签到记录；若返回 `code`/文案命中 token 失效语义，清缓存、重新取 code 登录并重试一次。
- token 失效判断：HTTP 401/403，或文案命中 `/token|登录|未授权|授权|失效|过期|401|403/i`。
- 原脚本没有独立的状态校验接口，因此只在业务请求失败时重登，不额外发探测请求。

## 积分 / 商品

- 青龙脚本只有签到天数，没有积分余额接口，也没有积分商城/优惠券接口。
- 平台脚本不调用 `ctx.points.sync`，`app.json` 的 capability 只有 `sign_in`。
- 未创建 `products.js`。

## 状态 / 阻塞

- 代码：`node --check` 通过；`app.json` JSON 校验通过。
- mock 测试：登录 → 签到 → 累计天数返回；已签分支；缓存 token 失效重登；未注册转 `manualRequired`。
- 未做实网联调：本机没有平台运行时的 YYB 账号 ref / code。
- 阻塞/风险：
  1. 未注册奈雪会员的微信号登录拿不到 token，只能转人工注册。
  2. 奈雪换包后 `SIGN_SECRET`、`OPEN_ID`、`version`、`brand` 等常量可能变化。
  3. 服务端 token 失效的具体 code 未知，脚本按 HTTP 401/403 + 文案兜底判断。
  4. 原脚本没有积分接口，平台无法同步积分余额，这是接口缺失而不是脚本遗漏。
