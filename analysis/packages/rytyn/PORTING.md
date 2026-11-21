# 认养一头牛（rytyn）迁移记录

## 基本信息

- 应用 key：`rytyn`
- 名称：认养一头牛
- AppID：`wx0408f3f20d769a2f`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\rytyn.js`
- API 域名：`https://www.milkcard.mall.ryytngroup.com`
- 平台脚本：`data/apps/rytyn/scripts/sign-in.js`
- 应用清单：`data/apps/rytyn/app.json`
- 当前状态：已迁移，`node --check` 通过；mock ctx 走通“手机号登录 → 签到 → 积分同步”“缓存 token 失效重登”“无手机号授权转人工注册”
- 是否启用：`enabled: true`
- 商品脚本：未创建。青龙脚本没有积分商品/优惠券列表接口。

## 接口清单

基址：`https://www.milkcard.mall.ryytngroup.com`

### 登录 / 注册

`POST /mall/xhr/minilogin`

- JSON body：

```json
{
  "encryptedData": "<微信手机号授权 encryptedData>",
  "offset": "<微信手机号授权 iv>",
  "wxCode": "<wx.login code>",
  "code": "<新式手机号 phoneCode>"
}
```

- 取数顺序（与青龙脚本一致）：
  1. 先从 YYB 取手机号授权数据：`encryptedData`、`iv`、`phoneCode`（QL 里是 `wx_server /wx/getphonenumber` 的 `data.raw.encryptedData`、`data.raw.iv`、`data.code`）。
  2. 再取 `wx.login code`。手机号授权在前、取 code 在后，保证 session_key 一致。
- 请求头：
  - `Content-Type: application/json`
  - `Accept: application/json`
  - `User-Agent`：iPhone iOS 18_3 + MicroMessenger/8.0.61
  - `Referer: https://servicewechat.com/wx0408f3f20d769a2f/323/page-frame.html`
- token 提取顺序：
  1. 响应头 `X-Auth-Token`（平台侧做大小写不敏感读取）
  2. `data.token`
  3. `data["x-auth-token"]`
  4. `data.xAuthToken`
  5. 顶层 `token`
- 没有 token 即登录失败；该店为“手机号一键登录/注册”，`minilogin` 同时承担注册。

### 签到

`POST /mall/xhr/task/checkin/save`

- 请求头：`Content-Type: application/json`、`Accept: application/json`、原 `User-Agent`、`X-Auth-Token: <token>`
- JSON body：`{}`（原脚本固定发空对象）
- 成功条件：`code === 200` 或 `"200"`。
- 返回字段：`data.point`（积分）、`data.phone`（手机号，仅日志脱敏）、`data.grade`（等级）。
- 该接口幂等，原脚本把它当作“签到 + 状态查询”。
- 已签判断：文案命中 `/已签|签到过|重复|已完成|今日已/`。

### 签到规则（辅助）

`GET /mall/xhr/task/checkin/getRule`

- 请求头同上（带 `X-Auth-Token`）。
- 仅在签到成功后拉一次，失败不影响签到结果。
- `Referer` 原脚本用 `305` 版本：`https://servicewechat.com/wx0408f3f20d769a2f/305/page-frame.html`。

## 请求头 / 加密

- 无自建签名、无 AES/RSA；唯一的“加密”是微信手机号授权的 `encryptedData` + `iv` 透传。
- 平台侧手机号数据来自 `ctx.yyb.getPhoneAuth({ appId })`，不再直连 `wx_server`。
- 兼容字段层级：顶层、`data`、`data.raw`、`result`，以适配 YYB 返回 `{ encryptedData, iv, code }` 或 `{ data: { raw: {...}, code } }` 两种形态。
- 登录态失效判断（保留原脚本）：`/token|登录|未授权|失效|过期|未登录|鉴权|401|403/i`，或 HTTP 401/403。

## 登录态与缓存

- `ctx.cache` 键：`auth`，保存 `{ token, updatedAt }`，TTL 7 天。
- 有缓存 token 时直接调用 `checkin/save`；命中登录态失效后清缓存、重新走手机号授权登录，并重试一次。

## 注册 / 手机号

- 青龙脚本没有独立注册接口，`minilogin` 就是“手机号一键登录/注册”。
- 平台脚本已实现该自动登录/注册路径。
- YYB 返回的手机号授权数据缺少 `encryptedData` / `iv` 时，抛 `ctx.manualRequired(..., { details: { action: 'register', step: 'phoneAuth' } })`。
- 服务端拒绝登录数据时，抛 `ctx.manualRequired(..., { details: { action: 'register', step: 'minilogin' } })`。
- 不伪造登录成功，也不在缺少手机号时退回其他登录方式。

## 积分 / 商品

- 积分余额来源：签到接口 `data.point`（成功或已签分支返回时）。
- 查到数字后调用 `ctx.points.sync({ balance, estimated: false })`。
- 青龙脚本没有积分商品/优惠券列表接口，未创建 `products.js`。

## 状态 / 阻塞

- 代码：`node --check` 通过；`app.json` JSON 校验通过。
- mock 测试：手机号登录（含 header token）→ 签到 200 → 积分 88 → `ctx.points.sync`；缓存 token 失效后重登；无手机号授权转 `manualRequired`。
- 未做实网联调：本机没有平台运行时的 YYB 账号 ref / code。
- 阻塞/风险：
  1. 登录强依赖 YYB 返回手机号授权 `encryptedData` + `iv`。若平台协议只返回解密手机号或 phoneCode、不返回密文，脚本会转人工注册，这是当前最大风险。
  2. `X-Auth-Token` 响应头与 body token 两种形态都已兼容，但不同网关可能改字段名。
  3. 签到接口的“已签”可能只给文案不给 `data.point`，此时本次 Run 不同步积分，但不会伪造余额。
