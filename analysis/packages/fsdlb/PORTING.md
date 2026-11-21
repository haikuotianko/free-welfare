# 逢三得利吧（fsdlb）迁移记录

## 基本信息

- 应用 key：`fsdlb`
- 名称：逢三得利吧
- AppID：`wxb33ed03c6c715482`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\fsdlb.js`
- 缓存包：`%APPDATA%\Tencent\xwechat\radium\users\e9c7432ed37e6090dde819f8e5e4d21a\applet\packages\wxb33ed03c6c715482\87`
- 解包目录：`analysis/packages/fsdlb/unpacked`（已合并主包与 `_sub-pages_.wxapkg`，签到页在 `sub-pages/signIn`）
- 平台脚本：`data/apps/fsdlb/scripts/sign-in.js`
- 应用清单：`data/apps/fsdlb/app.json`
- API Base：`https://xiaodian.miyatech.com/api`

## 接口清单

### 登录 / 注册

1. `POST /user/login/wx-jc`
   - `Authorization`：无
   - JSON：`{ jsCode, clientId: "saas-wechat-app", myUnionId: "", appPublishType: 1 }`
   - `jsCode` 来自 `ctx.yyb.getCode({ appId })`。
   - 响应成功码：字符串 `code === "200"`。
   - token：`data.tokenInfo.access_token`（兼容 `accessToken` / `access_token` / `token`）。
   - 用户资料：`data.thirdUsrIf`（`oid`、`oneId`、`payOpenId`、`phone` 等）。

2. `POST /user/login/register-by-phone`（解包 authLogin 页确认）
   - `Authorization`：无
   - JSON：`{ code, openIdOrUserId, payOpenId, appPublishType, iv, encryptedData }`
   - `code`：重新 `wx.login` 的 code。
   - `openIdOrUserId`：登录响应 `thirdUsrIf.oid`；`payOpenId`：`thirdUsrIf.payOpenId`。
   - `iv` / `encryptedData`：手机号授权数据（平台侧 `ctx.yyb.getPhoneAuth({ appId })`）。
   - 仅在积分/签到接口明确返回“未注册 / 请先注册 / 绑定手机”时触发；失败抛
     `ctx.manualRequired(..., { details: { action: "register" } })`。

### 积分

- `GET /user/auth/member/integral/union/flow/list`
  - Query：`pageNo=1&pageSize=10&dataType=SCORE`
  - 鉴权：`Authorization: bearer <token>`（小写 bearer，原脚本如此）
  - 余额字段：`data.totalScore`

### 签到

- 签到页：`sub-pages/signIn/index`，调用 `signInApi({ miniappId: miniAppInfo.id })`。
- `POST /coupon/auth/signIn`
  - JSON：`{ miniappId: 159 }`
  - 成功：`code === "200"`
  - 提示字段：`data.integralToastText`
  - 重复签到：接口失败文案命中 `已签到 / 已签 / 重复`，按“今日已签到”处理。

### 签到状态（可选，未使用）

- `GET /coupon/auth/signIn/homePage?miniappId=159`
  - 签到页展示用，返回 `signInInfo`，未在平台脚本中调用（避免多一次接口依赖）。

### 积分商品（未移植）

解包确认存在以下只读接口：

- `GET /item/integral-product-do/list`
- `GET /item/integral-product-do/list/v2`
- `GET /item/integral-product-do/list/search-by-category`
  - Query：`categoryId`、`pageNo`、`pageSize`
- `GET /item/integral-product-do/detail?id=`
- 详情字段：`id`、`integral`、`productInfoImage`、`type`

但匿名实测 `https://xiaodian.miyatech.com/api/item/...` 返回 404（网关把路径改写为
`/integral-product-do/...`），而同一 Base 下 `/api/user/...` 正常返回 401，说明 item
服务的实际前缀/环境未确认。字段和分页参数也不完整，因此**不新增 `products.js`**，
避免上线一个必然 404 的商品脚本。

## 请求头 / 加密

无自建签名/加密，只有登录态 token。通用头（原脚本逐项保留）：

```text
componentSend: 1
HH-FROM: 20230130307725
HH-APP: wxb33ed03c6c715482
HH-VERSION: 0.6.4
X-VERSION: 2.3.5
Content-Type: application/json
appPublishType: 1
HH-CI: saas-wechat-app
MARKETING-PLAN-NO: ""
USER-ENTRANCE-CHANNEL: ""
USER-ENTRANCE-CHANNEL-KEY: ""
ONE-ID: <thirdUsrIf.oneId>
groupPosId: ""
User-Agent: Mozilla/5.0 ... MicroMessenger/3.9.12 MiniProgramEnv/Windows ...
Authorization: bearer <access_token>   # 登录/注册接口不带
```

- 业务成功码：`code === "200"`。
- token 失效：HTTP 401/403 或 code `401/403/M401/M403`，或文案命中
  `token/登录/授权/未登录/无效/过期`；清缓存后重新 CODE 登录一次。
- token 缓存在 `ctx.cache` 的 `auth` 键，TTL 7 天；用积分列表接口校验。

## 已实现逻辑

`sign-in.js`：

1. 读取缓存 token，用积分列表接口校验；失效则清缓存。
2. `ctx.yyb.getCode` → `/user/login/wx-jc` 登录，缓存 token/用户资料。
3. 查询积分 `totalScore`。
4. 调用 `/coupon/auth/signIn` 签到；重复签到按已签到处理。
5. 签到后再查积分，`ctx.points.sync({ balance, estimated: false })`。
6. 若接口明确提示未注册，用 `getPhoneAuth` 的 `encryptedData`/`iv` 调
   `/user/login/register-by-phone`，成功后重试一次；仍失败则 `manualRequired`。

## 当前状态

- 代码：已写入，`node --check` 通过。
- 签到脚本：`enabled: true`。
- 商品脚本：未创建（原因见上）。
- 匿名实测（2026-11-16）：
  - `POST /user/login/wx-jc`（无效 code）→ `{"code":"U1205","msg":"获取三方用户信息失败"}`；
  - `POST /coupon/auth/signIn`（无 token）→ HTTP 401。
  两个路由与错误结构均在线。
- 未连接真实 YYB/目标服务器联调。

## 阻塞 / 风险

1. 注册兜底依赖 YYB 返回手机号授权 `encryptedData`/`iv`；若 YYB 返回的是普通用户资料
   或服务端拒绝手机号密文，自动注册会失败，需要人工在小程序完成注册，并把
   `app.json` 的脚本改为 `enabled: false`。
2. `register-by-phone` 的入会/协议流程可能还有页面侧前置条件（协议勾选、会员卡等），
   本脚本只按接口最小字段提交。
3. 积分商城 item 服务前缀未确认，未移植商品同步。
4. 青龙脚本外层的公告请求（ghproxy Notice.json）与签到无关，未移植。
