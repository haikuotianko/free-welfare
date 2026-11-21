# RIO 微醺俱乐部（rio）迁移说明

## 基本信息

- 应用 key：`rio`
- 名称：RIO 微醺俱乐部
- AppID：`wx225b10f204323da5`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\rio.js`
- 平台脚本：`data/apps/rio/scripts/sign-in.js`
- 应用配置：`data/apps/rio/app.json`
- 解包目录：无（本次未使用缓存小程序包，按青龙脚本迁移）
- 账号来源：平台 `ctx.account`（YYB 账号），不再读取青龙变量 / 本地 `rio_token_cache.json`
- 当前状态：已迁移，`node --check` 通过，本地 mock 走通登录、签到、缓存 token、未注册转人工
- 是否启用：`enabled: true`

## 接口清单

域名：`https://club.rioalc.com`，API 前缀 `/api/miniprogram`

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| code 登录 | `POST /api/miniprogram/auth` | 无 | JSON `{ code, redirect_path }`；成功 `code == 200`，`data.api_token` 为业务 token，另含 `nick_name`、`points` |
| 每日签到 | `POST /api/miniprogram/user-sign-click` | `Authorization: Bearer <api_token>` | JSON `{}`；成功 `code == 200`，消息在 `message` |

`redirect_path` 原样保留：

```text
/pages/welcome/loading-page?nocheck=&type_lk=3&path=%2Fpages%2Findex%2Findex
```

## 请求头 / 签名

无自建签名、无请求加密，未使用 `ctx.crypto`。

```text
User-Agent: Mozilla/5.0 (Linux; Android 12; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.48.2580(0x28003036) MiniProgramEnv/android
Content-Type: application/json
Referer: https://servicewechat.com/wx225b10f204323da5/0/page-frame.html
Authorization: Bearer <api_token>   # 登录后携带
```

业务码：

- 成功：`code == 200`。
- 重复签到：消息命中 `已签|已经签|签到过|重复|已完成|already`，返回 `alreadyDone: true`。
- 登录态失效：`code == 401` 或消息命中 `登录|token|未授权|失效|过期`，清缓存重新登录并重试签到一次；重试后仍失效则抛 `ctx.authExpired`。
- 未注册：登录 `code != 200` 或没有 `api_token`（源脚本实测 `5001`），转 `ctx.manualRequired`。

## 缓存

- 缓存 key：`auth`
- 内容：`{ token, points, nickName, updatedAt }`
- TTL：7 天
- 不额外校验 token；直接用于签到，签到返回鉴权错误时清缓存、重新取 code 登录并重试一次。
- 只缓存 token / 积分 / 昵称，不缓存手机号。

## 注册 / 人工处理

- 源脚本没有注册接口，只提示“先在小程序里注册一次再跑”。
- 登录 `code != 200` 或没有 `api_token` 时，平台脚本抛：

```js
ctx.manualRequired('RIO 微醺俱乐部需要先在小程序注册会员：...', {
  details: { action: 'register', step: 'login', code: <服务端 code> },
});
```

- 未实现自动注册/手机号授权，因为源脚本没有该流程。

## 积分

- 登录响应 `data.points` 作为当前积分余额；缓存 token 时使用缓存里的 `points`（上次登录时的值）。
- 仅当 `points` 为数字时调用 `ctx.points.sync({ balance, estimated: false })`。
- 签到接口不返回积分余额，签到后没有额外刷新接口；因此缓存 token 运行时同步的是上次登录记录，可能不是签到后的最新值。

## 商品 / 券

源脚本没有商品/优惠券列表接口，未创建 `products.js`。

## 状态 / 验证

- `node --check data/apps/rio/scripts/sign-in.js` 通过。
- `app.json` JSON 校验通过。
- 本地 mock 验证：首次登录、缓存 token、签到成功、重复签到、鉴权失效重登、未注册转人工。
- 未执行 `pnpm import:apps`，未写数据库，未做真实 YYB 取码/RIO 接口联调。

## 阻塞 / 风险

1. **注册阻塞**：未在 RIO 俱乐部注册的微信号每次运行都会转人工（`action=register`），需要先在小程序内完成注册。
2. **积分时效**：签到接口没有余额字段，缓存 token 时只能同步登录时缓存的 `points`；该值可能过期。
3. **缓存 token 无主动校验**：只有签到返回 401/失效文案才会重新登录；若服务端对失效 token 返回其他业务码，会被当作签到失败。
4. **未实测**：接口只在 mock 下验证，未连接真实账号/YYB。
