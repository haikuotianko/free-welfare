# 可口可乐（kekoukele）迁移记录

## 基本信息

- 应用 key：`kekoukele`
- 名称：可口可乐
- AppID：`wxa5811e0426a94686`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\kekoukele.js`
- 缓存包：`%APPDATA%\Tencent\xwechat\radium\users\e9c7432ed37e6090dde819f8e5e4d21a\applet\packages\wxa5811e0426a94686\515`
- 解包目录：`analysis/packages/kekoukele/unpacked`
- 平台脚本：`data/apps/kekoukele/scripts/sign-in.js`
- 应用清单：`data/apps/kekoukele/app.json`
- API Base：`https://member-api.icoke.cn`

## 接口清单

### 登录

1. `GET /api/sp-portal/store/icoke/wechat/loginNoCache/{code}`（青龙脚本主路径）
   - `code` 来自 `ctx.yyb.getCode({ appId })`，路径中做 `encodeURIComponent`。
   - 响应：`{ jwtString, customerBasicInfo, silenceRegister, ... }`
   - JWT 放在后续请求的 `authorization` 头，原脚本不带 `Bearer `。

2. `POST /api/sp-portal/store/icoke/wechat/loginNoCache`（解包当前版本）
   - JSON：`{ code, ...params }`；`params` 是页面进入参数，可为空。
   - GET 返回 404/405 时作为回退路径。
   - 不自行提交 `extraInfo` 等可选字段。

### 积分（快乐瓶）

- `GET /api/icoke-customer/icoke/mini/customer/main/points`
  - 鉴权：`authorization: <jwtString>`
  - 余额字段：`point`

### 签到

- `GET /api/icoke-sign/icoke/mini/sign/main/sign`
  - 鉴权：`authorization: <jwtString>`
  - 成功：`success === true`，`point` 为本次获得快乐瓶。
  - 重复/已签到：`success === false` 且文案命中 `已签到 / 已签 / 重复 / 今日`。

### 注册（未新增自动注册）

解包 API 层存在以下端点，但当前包业务代码未调用：

- `POST /api/sp-portal/store/icoke/wechat/createMember`
- `POST /api/sp-portal/store/icoke/wechat/decodeWeChatPhone/{isCreateUser}`
- `POST /api/sp-portal/store/icoke/wechat/appendMember/encode`

登录响应包含 `silenceRegister` 与 `customerBasicInfo.member`，说明登录接口会自动注册
/静默注册。因为 `createMember` 的完整入参、协议/手机号前置条件无法从代码确认，
本次不实现自动注册；若服务端明确返回未注册/非会员，脚本抛
`ctx.manualRequired(..., { details: { action: "register" } })`。

### 商品 / 券（未移植）

解包只有商品详情和货架子接口：

- `GET /api/icoke-exchange/icoke/mini/goods/item/{id}`
- `POST /api/icoke-exchange/icoke/mini/shelf/sub/goods`
- `POST /api/icoke-exchange/icoke/mini/order/submit/encode`

没有找到“完整商品/券列表”的明确只读端点与分页字段，因此**不新增 `products.js`**。

## 请求头 / 加密

无自建签名/加密，只有 JWT。登录头（原脚本逐项保留）：

```text
User-Agent: Mozilla/5.0 ... Chrome/116 ... MicroMessenger/7.0.20.1781 ... XWEB/50249
Accept: application/json, text/plain, */*
xweb_xhr: 1
Content-Type: application/json
Sec-Fetch-Site: cross-site
Sec-Fetch-Mode: cors
Sec-Fetch-Dest: empty
Referer: https://servicewechat.com/wxa5811e0426a94686/496/page-frame.html
Accept-Language: zh-CN,zh;q=0.9
```

业务头：

```text
accept: application/json, text/plain, */*
accept-language: zh-CN,zh;q=0.9
authorization: <jwtString>          # 没有 Bearer 前缀
content-type: application/json
sec-fetch-dest: empty
sec-fetch-mode: cors
sec-fetch-site: cross-site
xweb_xhr: 1
Referer: https://servicewechat.com/wxa5811e0426a94686/421/page-frame.html
Referrer-Policy: unsafe-url
```

- 登录成功判断：HTTP 200 且响应含非空 `jwtString`；失败时 body 可能是
  `{ code: "SYSTEM", message: "从微信获取openId失败" }`。
- 业务成功判断：积分看 `point` 是否为数字；签到看 `success === true`。
- HTTP 401/403、body code `0401/0403` 或文案命中
  `token/jwt/登录/授权/失效/过期/authorization` 视为 JWT 失效，清缓存重登一次。
- JWT 缓存在 `ctx.cache` 的 `auth` 键，TTL 6 小时；用积分接口校验。

## 已实现逻辑

`sign-in.js`：

1. 读取缓存 JWT，用积分接口校验；失效则清缓存。
2. `ctx.yyb.getCode` → `loginNoCache`（GET，404/405 回退 POST），缓存 JWT。
3. 查询快乐瓶余额。
4. 调签到接口；已签到按 `alreadyDone` 处理。
5. 签到后再查余额，`ctx.points.sync({ balance, estimated: false })`。
6. JWT 失效自动重登重试一次；明确提示未注册则 `manualRequired`。

## 当前状态

- 代码：已写入，`node --check` 通过。
- 签到脚本：`enabled: true`。
- 商品脚本：未创建（原因见上）。
- 定时与原脚本一致：`30 9 * * 1`（每周一）。如需每日签到，可在应用清单改成
  `30 9 * * *`。
- 匿名实测（2026-11-16）：
  - 积分接口返回 HTTP 200 + `{"code":"0401","message":"Need authorization."}`
  - `GET loginNoCache/invalidcode` 返回 HTTP 200 + `{"code":"SYSTEM","message":"从微信获取openId失败"}`
  说明两个路由仍在线，JWT 校验逻辑与错误码匹配。
- 未连接真实 YYB/目标服务器联调。

## 阻塞 / 风险

1. 青龙脚本用 GET `loginNoCache/{code}`，当前小程序版本已改 POST；GET 是否仍被服务端
   支持未实测。脚本已加 404/405 回退，但 POST 的 `params` 只传 `code`，可能缺少
   活动/渠道参数。
2. 自动注册未实现；新账号若需要手机号建会员，会停在 `manualRequired(action=register)`。
   届时需人工完成注册，或把脚本改为 `enabled: false`。
3. 积分商品列表端点不明确，未移植商品同步。
4. JWT 有效期与缓存 6 小时是保守估计；若服务端提前失效，会自动重登。
