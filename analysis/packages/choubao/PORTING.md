# 臭宝乐园（choubao）迁移记录

## 基本信息

- 应用 key：`choubao`
- 名称：臭宝乐园
- AppID：`wx2206cca563f6f937`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\choubao.js`
- 解包来源：`%APPDATA%\Tencent\xwechat\radium\users\e9c7432ed37e6090dde819f8e5e4d21a\applet\packages\wx2206cca563f6f937\190\__APP__.wxapkg`
- 解包目录：`analysis/packages/choubao/unpacked`（版本 190）
- API Base：`https://cb-bags-slb.weinian.com.cn`
- 平台脚本：
  - `data/apps/choubao/scripts/sign-in.js`
  - `data/apps/choubao/scripts/products.js`
- 应用清单：`data/apps/choubao/app.json`
- 一个 Run 只处理 `ctx.account`，不循环账号。

## 接口清单

所有业务请求由小程序 `utils/util.js` 的 `wxRequest` 强制为 `POST`，JSON body。

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 登录 | `POST /bff/v1/auth/wechatLogin` | 无 | body `{ loginCode }`，`code` 来自 `ctx.yyb.getCode({ appId })`；成功 `status=200`，`data` 直接是 token 字符串 |
| 用户信息 | `POST /wnuser/v1/memberUser/getMemberUser` | Bearer | 返回 `nickName`、`points`（嗦粉币）、`agreeOn`、`mobile`、`mobileLogoffStatus`、`lastSignTime`、`totalSignNum` |
| 签到状态 | `POST /wnuser/v1/memberUser/checkSignNum` | Bearer | 与青龙脚本一致先调用；响应 data 未参与判断 |
| 每日签到 | `POST /wnuser/v1/memberUser/daySign` | Bearer | 成功 `status=200`，`data` 为本次获得的嗦粉币 |
| 埋点 | `POST /member/v1/memberBuryPoint/add` | Bearer | 保留青龙脚本的签到埋点；失败只记 debug，不影响签到 |
| 同意协议 | `POST /wnuser/v1/memberUser/agreeOn` | Bearer | 小程序点击“同意并签到”时调用，`data` 为新的 token 字符串 |
| 绑定手机号/注册 | `POST /wnuser/v1/memberUser/bindPhoneNumber` | Bearer | body `{ phoneCode }`，`data.mobile`、`data.tokenValue` |
| 积分商品列表 | `POST /goods/v1/goodsProduct/list?pageNo=1&pageSize=10..500` | Bearer | body `{ name, type }`；响应 `data` 数组、`page.total` |

业务成功码：`status === 200`（字符串/数字均可）。HTTP/业务 401、403 或文案命中 token/登录/授权/失效/过期按登录态失效处理。

## 请求头 / 加密

无自建签名、无加密。请求头与解包 `wxRequest` 一致：

```text
accept: */*
accept-language: zh-CN,zh;q=0.9
content-type: application/json
user-agent: Mozilla/5.0 (...) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) ... XWEB/19027
authorization: Bearer<token>      # 注意：小程序源码是 "Bearer" + token，没有空格
```

- token 缓存在 `ctx.cache` 的 `auth` 键，TTL 7 天，只保存 token 本身。
- 登录态失效会清缓存、重新取 code 登录并重试一次。
- 兼容 token 被历史缓存写成 `Bearer xxx` 的情况（读取时会去掉前缀）。

## 注册 / 手机号

解包 `pages/signIn/signIn.js` + `components/authorize` + `components/phoneNumber`：

- 签到前小程序要求 `agreeOn === true`、`mobile` 非空且 `mobileLogoffStatus` 为假。
- 首次进入需要：
  1. `POST /wnuser/v1/memberUser/agreeOn` 记录协议同意（返回新 token）；
  2. `POST /wnuser/v1/memberUser/bindPhoneNumber { phoneCode }` 绑定手机号（`phoneCode` 来自 `wx.getPhoneNumber`）。
- 平台实现：
  - 普通定时签到遇到未注册，抛 `ctx.manualRequired(..., { details: { action: 'register' } })`。
  - 用户触发 `ctx.input.action === 'register'` 时，才用 `ctx.yyb.getPhoneAuth({ appId })` 取手机号授权 `code`，先 `agreeOn`（如未同意）再 `bindPhoneNumber`，然后重新登录态校验。
  - 未取到 code、服务端拒绝绑定、绑定后仍未注册，都会抛 `manualRequired(action=register)`，不会静默吞掉。

## 积分

- `getMemberUser.data.points` 即嗦粉币余额。
- 签到前后各查一次用户信息，签到后用最新 `points` 调 `ctx.points.sync({ balance, estimated: false })`。
- 签到奖励取 `daySign.data`（数字），写入返回 message 和 `data.gained`。

## 积分商品

`products.js` 只读同步，不做兑换。字段来自解包 `pages/pointsMall` 与 `chunk_25.webview.js`：

- `externalId = id`
- `name = skuName`（缺失时回退 goodsName/name）
- `pointsCost = discountCoins`（>0 时），否则 `coins`
- `stock = stockQty`
- `imageUrl = img`
- `status = stock 不为空且 <= 0 ? sold_out : on_sale`（`canBuy` 是当前用户资格，不是全局下架状态，未用于状态）
- `limitPerUser = limitBuyNum / limitNum`（如有）
- 只同步 `pointsCost > 0` 的商品，`ctx.products.sync(..., { deactivateMissing: true })`。
- 分页与小程序 `onReachBottom` 一致：固定 `pageNo=1`，`pageSize` 从 10 每次加 10，最多 50 次；未拉全 `page.total` 时本次直接失败，不做缺失下架。

## 当前状态

- 代码：`node --check` 通过；`app.json` JSON 校验通过。
- 签到脚本：`enabled: true`。
- 商品脚本：`enabled: true`。
- 已做匿名接口探测：`wechatLogin` 传无效 code 返回 `status:500`；`goodsProduct/list` 无 token 返回 `status:401 未授权`，确认路径与请求体格式。
- 未连接真实 YYB/目标服务器做联调（本机没有平台运行时的账号 ref / code）。

## 阻塞 / 风险

1. **注册路径未实测**：`bindPhoneNumber` 需要 YYB `getPhoneAuth` 返回的手机号授权 code。若服务端拒绝该 code，注册会失败并抛 `manualRequired(action=register)`；此时应把签到脚本置 `enabled: false`，让用户先在小程序内手动完成登录/绑定。
2. `checkSignNum` 的响应体未在解包代码中使用；脚本保留调用，但“今日已签”主要用 `getMemberUser.lastSignTime` 判断，并以 `daySign` 文案兜底。
3. `lastSignTime` 为服务端 UTC 时间，脚本统一按 UTC+8 计算“今天”，避免运行环境时区不同导致误判。
4. 商品列表字段来自解包模板；若服务端改字段，`products.js` 可能同步 0 条并下架旧商品，首次上线建议先手动跑一次看日志。
5. 青龙脚本里的随机延迟 5–30 秒未保留（平台调度已负责节流）。
