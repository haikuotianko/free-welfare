# 国乐酱酒（gyjj）迁移记录

- AppID：`wxeff120e4d11594c0`
- 应用目录：`data/apps/gyjj`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\gyjj.js`
- 解包目录：`analysis/packages/gyjj/unpacked`（缓存包版本 89）
- API Base：`https://member.guoyuejiu.com/api`
- 脚本：`scripts/sign-in.js`、`scripts/products.js`，均 `enabled: true`
- 一个 Run 只处理 `ctx.account`，不循环账号。

## 接口

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 登录/自动注册 | `POST /user/wxLogin` | 无 | body：`{ avatarUrl, city, country, gender, nickName, province, code, source: 2 }`；`code` 来自 `ctx.yyb.getCode({ appId })`；响应 `data.authorization`、`data.sessionKey`、`data.userId` |
| 签到状态 | `GET /sign/daily/sign` | `Authorization: Mer<token>` | 解包确认的只读状态接口，返回 `signStatus`（>1 表示今日已签）、`spanSumDays`、`recordList` |
| 每日签到 | `GET /user/sign` | `Authorization: Mer<token>` | 解包 `utils/api.js#setSign` 确认的签到接口 |
| 会员/积分 | `GET /user/info` | `Authorization: Mer<token>` | 返回会员资料和 `score`（积分） |
| 积分商品 | `GET /product/list` | `Authorization: Mer<token>` | 参数 `type=2&size=50&current=1`，返回 `data.records[]`；字段 `id/name/cover/score/price` |
| 手机号绑定（未使用） | `POST /user/decodePhone` | 需登录 | `application/x-www-form-urlencoded`，body `{ encryptedData, iv, sessionKey }`；仅完善资料用，签到不依赖 |

### 关于签到接口的差异

青龙脚本把 `GET /sign/daily/sign` 当作签到接口，但解包代码显示：

- `pages/user/memberSign/index.js#memberSign` 调用 `setSign()` → `utils/api.js` → `GET /user/sign`；
- `getMemberSignData()` 才调用 `GET /sign/daily/sign`，用于读取 `signStatus` / `spanSumDays`。

青龙脚本成功日志里的 `spanSumDays` 正是状态接口返回字段，说明它可能只读到了状态而没有真正签到。因此迁移后：

1. 用 `GET /sign/daily/sign` 查询状态；
2. `signStatus > 1` 时判定今日已签；
3. 否则调用 `GET /user/sign` 签到。

没有新增/猜测其他接口。

## 注册

- `POST /user/wxLogin` 本身会创建/登录会员，无独立注册接口。
- `/user/decodePhone` 是手机号绑定（需要登录态和 `sessionKey`），签到、积分查询都不需要。
- 未调用 `ctx.yyb.getPhoneAuth({ appId })`：没有找到必须提交手机号授权加密数据才能完成的注册端点，避免向服务端发送无法验证的注册数据。
- 如果真实环境登录被服务端拒绝（例如提示需完善手机号/注册），再按 `manualRequired(action=register)` 处理。

## 请求头 / 加密

```text
content-Type: application/json
Authorization: Mer<token>        # token 来自 wxLogin 的 data.authorization，缓存时不带 Mer 前缀
User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 16_7_15 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.70(0x1800462d) NetType/WIFI Language/zh_CN
Referer: https://servicewechat.com/wxeff120e4d11594c0/87/page-frame.html
```

- 无签名、无加密。
- 业务成功码 `code === 0`；`code === 1011` 或文案命中 `401/403/token/登录/授权/失效/过期` 视为登录态失效，清缓存并重新 CODE 登录一次。
- token 缓存在 `ctx.cache` 的 `auth` 键，TTL 7 天；缓存 token 用 `GET /user/info` 校验。

## 当前状态

- 已迁移登录、签到状态、签到、积分查询、token 缓存与失效重试。
- 已新增只读 `products.js`，同步 `type=2` 积分商品（`pointsCost = score`），不做兑换/下单。
- 两个脚本均已通过 `node --check`。
- 未连接真实 YYB/目标服务器做联调。

## 阻塞 / 说明

- 青龙脚本的登录资料来自 `wx_server /wx/getuserinfo`；平台侧只有 `ctx.yyb.getCode()`，因此 `wxLogin` 使用空头像/地区、`nickName: '微信用户'`、`source: 2`。若服务端强制要求 `wx.getUserProfile` 资料，登录会失败并暴露该错误，需改为人工或补充资料接口。
- 商品列表是否需要 `branchId` 未验证；小程序从本地缓存读取，未登录/无门店时可以为空，因此同步请求未带该参数。
- 商品库存字段在解包代码中不明确，`stock` 为 `null`，仅按 `score > 0` 过滤并标记 `on_sale`。
- `enabled: true`；未使用手机号授权数据，因此不存在“手机号数据被拒绝”的禁用条件。
