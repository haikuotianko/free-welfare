# 植白说（zbs）迁移记录

## 基本信息

- 应用 key：`zbs`
- 名称：植白说
- AppID：`wx6b6c5243359fe265`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\zbs.js`
- 解包来源：`%APPDATA%\Tencent\xwechat\radium\users\e9c7432ed37e6090dde819f8e5e4d21a\applet\packages\wx6b6c5243359fe265\172`
  - 主包 `__APP__.wxapkg` + 分包 `_pages_auth_.wxapkg`
  - 主包 `app-service.js` 用 `extract-wxapkg.cjs` 保留原文后检索接口常量
- 平台脚本：
  - `data/apps/zbs/scripts/sign-in.js`
  - `data/apps/zbs/scripts/products.js`
- 应用清单：`data/apps/zbs/app.json`

## 接口清单

基址：`https://www.kozbs.com/demo/wx/`

### 登录

1. `POST auth/login_by_weixin`
   - JSON：`{ code, userInfo: {}, shareUserId: 1 }`
   - `code` 来自 `ctx.yyb.getCode({ appId })`。
   - 响应：`{ errno: 0, data: { token, userInfo } }`，token 即后续 `X-Dts-Token`。
   - 无效 code 实测返回 `{"errno":-1,"errmsg":"错误"}`；脚本按普通业务失败抛出，下个 Run 重新取 code。

### 积分 / 签到

- `GET user/getUserIntegral?userId=<userId>`
  - 响应：`{ errno: 0, data: { integer } }`
  - 积分余额取 `data.integer`（解包页面也是读 `e.data.integer`）。
- `GET home/signDay?userId=<userId>`
  - 响应：`{ errno: 0, data: { isSign, signCount, signInfo, bannerList, ... } }`
  - `data.isSign === true` 表示今日已签到。
- `GET home/sign?userId=<userId>`
  - 成功：`errno=0`。
  - 重复签到：错误信息含「已签到 / 已签 / 重复 / 今日已签」时按 `alreadyDone` 处理。
  - 原青龙脚本和页面都是 GET，脚本保持 GET + query，没有改成 POST。

### 积分商城

- `GET goods/integralShopList`
  - 公开接口，不需要 token。
  - 响应：`{ errno: 0, data: { goodsList, couponList, adList } }`
  - `goodsList`：`id`、`goodsId`、`goodsName`、`brief`、`picUrl`、`leftNumber`、`totalNumber`、`integralPrice`
  - `couponList`：`id`、`name`、`desc`、`image`、`limit`、`integralPrice`
  - `products.js` 同步 `goodsList + couponList`，`adList` 忽略。

## 请求头 / 加密

- 无自建签名或加密；没有手机号授权、没有 AES/RSA。
- 通用头：
  - `Content-Type: application/json`
  - `User-Agent`：青龙脚本里的 Windows 微信 UA（Chrome 132 + MicroMessenger 7.0.20）
  - `Accept: */*`
  - `Accept-Language: zh-CN,zh;q=0.9`
  - `Referer: https://servicewechat.com/wx6b6c5243359fe265/171/page-frame.html`
  - `xweb_xhr: 1`
  - 登录后：`X-Dts-Token: <token>`
- 成功码：`errno === 0`。
- 登录失效：`errno === 501`（解包请求层约定）；`errno === 753`「无效用户」也按 token 失效处理，触发重新登录。
- 日志不输出 token、code。

## 已实现逻辑

`sign-in.js`：

1. 读取 `ctx.cache` 的 `auth`（token + userInfo），有缓存先用 `user/getUserIntegral` 校验。
2. 缓存失效或没有缓存：`ctx.yyb.getCode` → `auth/login_by_weixin` → 缓存 token 7 天。
3. 查询签到前积分，`home/signDay` 判断今日是否已签。
4. 未签时调用 `home/sign`；重复提示按已签到处理。
5. 再查一次积分，计算本次增量，`ctx.points.sync({ balance, estimated: false })`。
6. 签到/查积分遇到登录失效时清缓存、重新登录并重试一次；第二次仍失效抛 `ctx.authExpired`。

`products.js`：

1. `GET goods/integralShopList`（公开接口）。
2. `goodsList` 映射 `externalId=goods:<id>`、`name=goodsName`、`pointsCost=integralPrice`、`stock=leftNumber`。
3. `couponList` 映射 `externalId=coupon:<id>`、`name=name`、`pointsCost=integralPrice`、`limitPerUser=limit`、`stock=null`。
4. `ctx.products.sync(..., { deactivateMissing: true })`，只读，不兑换。

## 当前状态

- 代码：已写入，`node --check` 通过。
- 签到脚本：`enabled: true`。
- 商品脚本：`enabled: true`。
- 商品接口已实网只读验证（2026-11-16）：`errno=0`，返回 7 个积分商品 + 2 张积分兑换券，映射与库存正常。
- 签到链路未做实网联调（本机没有平台运行时的 YYB code / 账号 ref）。

## 注册 / 阻塞 / 风险

1. 没有独立的微信注册流程：小程序端只调用 `auth/login_by_weixin`，`auth/bindPhone` 只在接口常量里出现、页面未使用。
   因此不需要 `ctx.yyb.getPhoneAuth`，也不设置 `enabled: false`。
2. 登录 code 只有 5 分钟有效；若本次取 code 后登录失败，脚本按业务失败返回，下个 Run 会重新取 code，不会复用失效 code。
3. `home/sign` 的重复签到文案由服务端决定；已覆盖常见「已签到 / 已签 / 重复」关键词，若服务端改文案会按失败上报。
4. 积分商城没有分页参数；若以后接口改为分页，`products.js` 需要补分页，当前一次返回全量（9 条）。
