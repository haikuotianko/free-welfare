# 美的会员（wx_midea）迁移记录

## 基本信息

- 应用 key：`wx_midea`
- 名称：美的会员
- AppID：`wx03925a39ca94b161`（青龙脚本 Referer / 互动营销 UA 中的小程序 AppID）
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\wx_midea.js`
- 无缓存小程序包，按青龙脚本迁移。
- API Base：`https://mvip.midea.cn`
- 平台脚本：`data/apps/wx_midea/scripts/sign-in.js`
- 应用清单：`data/apps/wx_midea/app.json`
- 一个 Run 只处理 `ctx.account`。
- 脚本启用：**`enabled: false`**。纯 Cookie 流程，必须先由用户填入 Cookie / ucAccessToken 并手动跑通，平台无法自动登录或续期。

## 这是 Cookie 流程，不是微信登录流程

青龙变量格式：

```text
uid=xxxx;sukey=yyyy#7895566asa
```

`#` 前是 `mvip.midea.cn` 的 Cookie，`#` 后是请求头 `ucAccessToken`。多账号用 `&` 或换行分隔。脚本没有 `wx.login`、没有 code 换 token、没有 refresh token 接口，所以平台不能像其他小程序一样用 `ctx.yyb.getCode` 自动登录。

### 平台账号映射

平台一个 Run 只处理一个 `ctx.account`，因此脚本优先读取 `WX_MIDEA_ACCOUNTS`：

```json
{
  "账号ID或备注名或yybRef": "uid=...;sukey=...#ucAccessToken",
  "另一个账号": { "cookie": "uid=...;sukey=...", "accessToken": "..." }
}
```

匹配顺序：`ctx.account.id` → `ctx.account.yybRef` → `ctx.account.displayName`；也支持 `"default"` 作为兜底。

单账号也可以只配：

- `WX_MIDEA_COOKIE`
- `WX_MIDEA_UC_ACCESS_TOKEN`

未配置时脚本抛 `ctx.manualRequired(..., { details: { action: 'configure' } })`，不会用空 Cookie 发请求。

## 接口清单

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 信息查询 | `GET /next/mucuserinfo/getmucuserinfo` | Cookie | `errcode=0` 成功；`data.userinfo.VipGrow` 是积分，`Mobile` 只脱敏输出 |
| 每日积分签到 | `GET /my/score/create_daily_score` | Cookie | `errcode=0` 成功；`errcode!=0` 且文案命中已签/今日/重复时按今日已签处理 |
| 互动营销签到 | `POST /mscp_mscp/api/cms_api/activity-center-im-service/im-svr/im/game/page/sign` | `ucAccessToken` + `apiKey` | 青龙脚本只要求 HTTP 成功，不判断业务 `errcode`；本脚本保留该行为，业务错误只记 warning |

## 请求头 / 签名

无自建签名、无加密。固定业务头：

```text
# 信息查询
cookie: <cookie>
User-Agent: Mozilla/5.0 (...) MicroMessenger/8.0.35.2360 ... MiniProgramEnv/android
Content-Type: application/json
charset: utf-8
Referer: https://servicewechat.com/wx03925a39ca94b161/409/page-frame.html

# 每日积分签到
content-type: application/x-www-form-urlencoded; charset=UTF-8
cookie: <cookie>
User-Agent: <同上>

# 互动营销签到
User-Agent: Mozilla/5.0 (...) MicroMessenger/8.0.49.2600 ... miniProgram/wx03925a39ca94b161
Accept: application/json, text/plain, */*
Content-Type: application/json
ucAccessToken: <ucAccessToken>
apiKey: 3660663068894a0d9fea574c2673f3c0
Origin: https://mvip.midea.cn
X-Requested-With: com.tencent.mm
intercept: 1
Referer: https://mvip.midea.cn/mscp_weixin/apps/h5-pro-wx-interaction-marketing/
```

- 保留 `sec-ch-ua*`、`Sec-Fetch-*`、`Accept-Language`。
- 未设置 `Host`、`Connection`、`Accept-Encoding`：这些由平台 HTTP 客户端管理，Node fetch 也不允许调用方完全控制；不影响 Cookie / ucAccessToken 鉴权。
- 互动营销签到的 JSON body 与青龙一致：`headParams`、`pagination: null`、`restParams`（`gameId=22`、`actvId=401671388248692763`、`rootCode=MDHY`、`appCode=MDHY_XCX` 等）。

## 积分

- 积分取 `data.userinfo.VipGrow`，签到前后各查一次；签到后查询失败时使用签到前余额。
- `ctx.points.sync({ balance, estimated: false })`，`app.json` 的 `pointsName` 为“积分”。
- 手机号只以 `138****8000` 形式出现在 Run data 中，不写日志、不写缓存。

## 当前状态

- `node --check` 通过；`app.json` JSON 校验通过。
- 用本地 mock ctx 跑通：
  - 多账号 JSON 按 `ctx.account.id` 选择 Cookie；
  - 信息查询 → 签到 → 签到2 → 再次查询积分；
  - Cookie 失效 `errcode=401` → `ctx.authExpired`；
  - 未配置 Cookie → `ctx.manualRequired(action=configure)`；
  - 今日已签 + 签到2失败 → `alreadyDone: true`。
- 未连接真实美的服务器联调。

## 为什么创建了应用但保持 disabled

- 该流程可以在 `ctx.env` / `ctx.http` 下运行：Cookie 和 ucAccessToken 都是普通请求头，不需要微信登录、签名或 UI 自动化。
- 但 Cookie 必须由用户从小程序抓包后手工填入，而且会过期；平台没有自动续期能力。
- 因此创建完整应用和脚本，`enabled: false`，等用户配置 `WX_MIDEA_ACCOUNTS`（或单账号变量）并手动 Run 成功后再启用。这不是“坏应用”，而是需要人工凭证的 Cookie 应用。

## 阻塞 / 风险

1. **Cookie 会过期**：失效后只能重新抓包更新环境变量；脚本会抛 `authExpired`，不会尝试登录。
2. **没有注册流程**：这是已有会员的 Cookie 签到，不涉及注册；未配置凭证按配置缺失处理。
3. **签到2业务码不透明**：青龙脚本注释掉了 `errcode` 判断，只打印成功；本脚本保留 HTTP 成功即通过，业务错误只记 warning，真实成功与否需联调确认。
4. **平台多账号需要显式映射**：`WX_MIDEA_ACCOUNTS` 的 key 必须能匹配 `ctx.account.id`、`yybRef` 或 `displayName`，否则该 Run 会转人工配置。
5. **请求头有传输层差异**：`Host/Connection/Accept-Encoding` 由平台管理；如目标服务器强校验这些头，需要再评估。
6. **未真实联调**：接口路径、apiKey、actvId、gameId 均来自青龙脚本，未在平台上跑过真实 Run。
