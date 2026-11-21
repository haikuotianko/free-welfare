# colorful 七彩虹（colorful）迁移记录

## 基本信息

- 应用 key：`colorful`
- 名称：colorful 七彩虹
- AppID：`wx49018277e65fc3e1`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\colorful.js`
- 解包来源：`%APPDATA%\Tencent\xwechat\radium\users\e9c7432ed37e6090dde819f8e5e4d21a\applet\packages\wx49018277e65fc3e1\99\__APP__.wxapkg`
- 解包目录：`analysis/packages/colorful/unpacked`（版本 99）
- 解包时 `plugin-private:` 路径在 Windows 下无法保存（文件名非法），插件代码缺失；主包/分包业务代码已解出，不影响本文接口。
- API Base：`https://interface.skycolorful.com`
- 平台脚本：`data/apps/colorful/scripts/sign-in.js`
- 应用清单：`data/apps/colorful/app.json`
- 一个 Run 只处理 `ctx.account`，不循环账号。

## 接口清单

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| code 登录 | `POST /api/User/OnLogin` | 无 | body `{ Code }`，`Code` 来自 `ctx.yyb.getCode({ appId })`；成功只保证返回 `Data.OpenId`（个别账号可能直接带 Token） |
| 手机号授权登录 | `POST /api/User/DecryptPhoneNumber` | 无 | body `{ OpenId, Code }`，`Code` 来自 `ctx.yyb.getPhoneAuth({ appId })`；返回 `Data.Token`、`Data.RefreshToken`，这是唯一发业务 Token 的入口 |
| 用户信息/积分 | `GET /api/User/GetUserInfo` | Bearer | `Data.NickName`、`Data.Mobile`、`Data.Point` |
| 签到状态 | `GET /api/User/IsUserSign` | Bearer | 缓存包实际使用，`Data.IsSign`；实测线上可用 |
| 签到 | `POST /api/User/UserSign` | Bearer | 缓存包实际使用，无 body |
| 签到状态（新路径回退） | `GET /api/User/IsSignV2` | Bearer | 青龙脚本路径；实测线上返回 404，仅作未来版本回退 |
| 签到（新路径回退） | `POST /api/User/SignV2` | Bearer | 青龙脚本路径；实测线上返回 404，仅作未来版本回退 |

响应放行码（解包 `common/vendor.js`）：`[0, 52001, 52002, 50001, 51001, 51002, 40100, 40101]`，且 `Success !== false`。其余 `Code` / HTTP 非 200 视为失败；HTTP 401/403 或错误体 JWT/token/登录/授权 文案按登录态失效。`Code` 40100/40101 在放行码内，按成功处理。

## 请求头 / 加密

每个请求重新生成固定头（解包 `common/vendor.js` 的 `v()` 与请求拦截器）：

```text
User-Agent: Mozilla/5.0 (...) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) ... XWEB/19027
Referer: https://servicewechat.com/wx49018277e65fc3e1/91/page-frame.html
Accept: */*
Accept-Language: zh-CN,zh;q=0.9
Content-Type: application/json
requestId: <uuid v4>
AppId: 815d8026-9a52-4445-a42c-a5443134232e
Ticks: <Date.now()>
Sign: md5(AppId + Ticks + requestId + SECRET)
source: Wx
UcSource: 30
User-from: xcx
version: 2.0.0
xweb_xhr: 1
Authorization: Bearer <token>
X-Authorization: Bearer <refreshToken>
```

- `SECRET = 2b5c01fb-7640-401a-8188-43a13190a626`（来自青龙脚本）。
- 签名用 `ctx.crypto.md5`，uuid 用 `ctx.crypto.uuid`。
- token 会随响应头 `access-token`、`x-access-token` 轮换，脚本先更新再判断业务结果，并写回缓存。
- 缓存在 `ctx.cache` 的 `auth` 键，TTL 7 天，保存 `token` / `refreshToken` / `openId`，不保存手机号。
- 缓存包里的 secret 是 `0ce0e3cf-6982-4eff-a12b-b5eb8b1cbfee`；本移植按任务要求保留青龙脚本的 secret。实测 `OnLogin` 使用无效 code 会返回 `Code:1`（微信 openId 错误），说明接口和请求头结构可用；该端点未校验 `Sign`，secret 需以真实业务请求为准。

## 注册 / 手机号

- 主包中没有账号密码/短信登录端点；`OnLogin` 只返回 OpenId，业务 Token 只由 `DecryptPhoneNumber` 下发（等同小程序“手机号快捷登录”）。
- 平台实现：
  - 优先使用缓存 token。
  - 缓存无效 -> `ctx.yyb.getCode` + `OnLogin` 拿 OpenId。
  - 若 `OnLogin` 没直接给 Token -> `ctx.yyb.getPhoneAuth({ appId })` 取手机号授权 `code` -> `DecryptPhoneNumber` 换 Token。
  - 未取到授权 code、服务端拒绝手机号 code 或未返回 Token，抛 `ctx.manualRequired(..., { details: { action: 'register' } })`。
- 没有独立“注册”按钮；手机号授权登录即首次注册。

## 积分

- `GetUserInfo.Data.Point` 为积分余额。
- 签到前后各查一次用户信息，签到后用最新 `Point` 调 `ctx.points.sync({ balance, estimated: false })`。

## 积分商品

- 解包 `common/vendor.js` 存在积分兑换商品接口：
  - `GET /api/PointExchange/GetPointExchange?Page=&Limit=&CategoryId=&Order=`
  - `GET /api/PointExchange/GetPointExchangeCategory`
  - `GET /api/PointExchange/GetPointExchangeProductInfo?Id=&ExpId=`
- 实测商品列表接口需要登录（匿名请求返回 `Code:3 未登录`）。
- `app.json` 里虽然有 `subpages/PointsExchange/*` 页面，但缓存包只下载了主包，分包代码是空壳，拿不到商品字段结构；无法确认 `pointsCost` / 库存字段。为避免臆造字段映射和误下架商品，本次**未实现 `products.js`**。

## 当前状态

- 代码：`node --check` 通过；`app.json` JSON 校验通过。
- 签到脚本：`enabled: true`。
- 已做匿名接口探测：`OnLogin` 传无效 code 返回 `Code:1`（微信 openId 错误）；`IsSignV2` 返回 HTTP 404；`PointExchange/GetPointExchange` 返回 `Code:3 未登录`，确认接口路径与鉴权要求。
- 未连接真实 YYB/目标服务器做登录联调（本机没有平台运行时的账号 ref / code / 手机号授权）。

## 阻塞 / 风险

1. **V2 与老接口差异（已实测）**：青龙脚本用 `IsSignV2` / `SignV2`，缓存包（版本 99）只有 `IsUserSign` / `UserSign`。用真实域名匿名探测 `GET /api/User/IsSignV2` 返回 **HTTP 404**，因此脚本改为老接口为主，V2 仅在老接口 404 时回退。
2. **手机号授权未实测**：`DecryptPhoneNumber` 需要 YYB `getPhoneAuth` 返回的 `wx.getPhoneNumber` code。如果服务端拒绝，脚本会抛 `manualRequired(action=register)`；此时应将签到脚本置 `enabled: false`，让用户先在小程序内手动完成手机号登录。
3. **签名 secret 存在版本差异**：缓存包与青龙脚本不同；本移植保留青龙 secret。`OnLogin` 实测未校验 `Sign`，无法据此判断业务接口用哪个 secret；若签到/用户信息返回签名类错误，优先核对小程序当前版本 `vendor.js` 的 secret。
4. `PAGE_VERSION=91` 来自青龙脚本；缓存包实际页面版本可能不同，Referer 仅作兼容头，服务端未校验时不影响。
5. 青龙脚本的 `colorful_phone_login` 开关未移植为平台配置：平台默认允许在需要时使用 `getPhoneAuth`；不想授权手机号的用户可用缓存/手填 token，但本平台没有手填 token 入口，需依赖缓存。
