# 敷尔佳（fej）迁移记录

## 基本信息

- 应用 key：`fej`
- 名称：敷尔佳
- AppID：`wx7ff0b3a99cb13b43`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\fej.js`
- 解包来源：`%APPDATA%\Tencent\xwechat\radium\users\e9c7432ed37e6090dde819f8e5e4d21a\applet\packages\wx7ff0b3a99cb13b43\34\__APP__.wxapkg`
- 解包目录：`analysis/packages/fej/unpacked`（版本 34，含 goods/home/usercenter 等分包）
- 解包时 `plugin-private:` 路径在 Windows 下无法保存（文件名非法），插件代码缺失；主包/分包业务代码已解出，不影响本文接口。
- API Base：`https://h5.youzan.com`
- 平台脚本：`data/apps/fej/scripts/sign-in.js`
- 应用清单：`data/apps/fej/app.json`
- 一个 Run 只处理 `ctx.account`，不循环账号。

## 接口清单

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 小程序登录 | `POST /wscshop/weapp/authorize.json` | 无 | body `{ appId, clientId, clientSecret, grantType, code }`，`code` 来自 `ctx.yyb.getCode({ appId })`；返回 access_token 等 token 对象 |
| 签到活动 | `GET /wscump/checkin/show_checkin_page_v2.json` | 有赞参数 | 返回 `checkinId`、`isShow` |
| 签到 | `GET /wscump/checkin/checkinV2.json?checkinId=<id>` | 有赞参数 | 返回 `desc`、`list[].infos.title` |
| 积分 | `GET /wscump/integral/user_points.json` | 有赞参数 | 返回 `current_points` / `real_points` |

有赞业务请求统一参数：

```text
app_id=wx7ff0b3a99cb13b43
kdt_id=44980544
access_token=<token>
```

登录成功码 `code === 0`。HTTP/业务 401、403 或文案命中 access_token/token/登录/授权/session/失效/过期按登录态失效处理。

## 请求头 / 加密

无自建签名、无加密。请求头与青龙脚本一致：

```text
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF
Referer: https://servicewechat.com/wx7ff0b3a99cb13b43/30/page-frame.html
Accept: */*
Content-Type: application/json        # 仅 POST
Extra-Data: {"sid":"<sessionId>","version":"2.220.5.101","clientType":"weapp-miniprogram","client":"weapp","bizEnv":"wsc"}
Cookie: <Set-Cookie 中的 name=value...>   # 有则带
```

- `clientId = 4d65249d377b2c3ed8`、`clientSecret = 1cdc05151d64f3a4a6ebd0e9de64422a`、`grantType = yz_union`、`kdt_id = 44980544`。
- 登录响应里的 `accessToken` / `sessionId` / `kdtId` 写入缓存；`Set-Cookie` 会更新 `this.cookie`。
- 缓存在 `ctx.cache` 的 `auth` 键，TTL 7 天，保存 token、sessionId、kdtId、cookie，不保存手机号。

## 注册 / 手机号

- 缓存包和青龙脚本都没有独立的“注册”或“手机号绑定”端点；`authorize.json` 本身就是有赞小程序的登录/自动建号入口。
- 脚本不主动调用 `getPhoneAuth`。
- 登录返回文案命中“未注册 / 未绑定 / 注册失败 / 请先授权 / 手机号 / 完善资料”时，抛 `ctx.manualRequired(..., { details: { action: 'register' } })`，提示先在小程序内完成登录/注册。

## 积分

- `user_points.json.data.current_points`，缺失时回退 `real_points`。
- 签到后调用 `ctx.points.sync({ balance, estimated: false })`。
- 签到前用同一个接口校验缓存 token，并顺带缓存积分。

## 商品 / 优惠券

- 缓存包内有优惠券领取（如 `/wscump/coupon/take-coupon-by-alias.json`、`/wscshop/ump/coupon/takeCouponByAlias.json`）和商品详情接口，但没有明确的“签到积分商品列表”接口。
- 有赞积分商城属于页面配置，缓存包内没有稳定的积分商品分页端点；本次**未实现 `products.js`**，避免臆造商品字段或误同步。

## 当前状态

- 代码：`node --check` 通过；`app.json` JSON 校验通过。
- 签到脚本：`enabled: true`。
- 已做匿名接口探测：`authorize.json` 传无效 code 返回 `code:160210052 三方平台用户注册失败`；`show_checkin_page_v2.json`、`checkinV2.json`、`user_points.json` 传无效 token 均返回 `code:-1 invalid session`，确认路径、参数与错误码。
- 未连接真实 YYB/目标服务器做登录与签到联调（本机没有平台运行时的账号 ref / code）。

## 阻塞 / 风险

1. **签到接口不在缓存包内**：`show_checkin_page_v2.json`、`checkinV2.json` 只来自青龙脚本，缓存包（版本 34）中没有对应字符串，无法静态二次核对字段。首次上线需看运行日志确认 `checkinId` 和返回结构。
2. `authorize.json` 登录成功后的 token 字段按青龙脚本兼容 `accessToken/access_token`、`sessionId/session_id`、`kdtId/kdt_id`；缓存包 `app.js` 确认登录对象会做 camelCase，实际以 `accessToken` 为主。
3. 新微信账号是否需要额外注册未验证；实测用无效 code 请求 `authorize.json` 返回 `code:160210052 三方平台用户注册失败`，脚本会转 `manualRequired(action=register)`，提示先在小程序内完成登录/注册。老账号 + 有效 code 未实测。
4. 有赞可能随时调整 `Extra-Data` 或签名策略；当前严格保留青龙脚本的请求头，没有额外自造字段。
5. 青龙脚本的 `fej_token_cache.json` 文件缓存已替换为平台 `ctx.cache`，按账号隔离。
