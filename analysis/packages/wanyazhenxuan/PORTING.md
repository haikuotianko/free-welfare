# 丸丫甄选（wanyazhenxuan）迁移记录

## 基本信息

- 应用 key：`wanyazhenxuan`
- 名称：丸丫甄选
- AppID：`wx35322299c6492f6e`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\wanyazhenxuan.js`
- 平台脚本：`data/apps/wanyazhenxuan/scripts/sign-in.js`
- 应用清单：`data/apps/wanyazhenxuan/app.json`
- API Base：`https://h5.youzan.com`（有赞微商城）
- 一个 Run 只处理 `ctx.account`，不循环账号。
- 当前状态：已迁移，`node --check` 通过；本地 mock 走通登录、缓存 token、签到、今日已签、未获取 checkinId、积分同步、缓存 token 失效重登。
- 是否启用：`enabled: true`

## 接口清单

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 静默登录 | `POST /wscshop/weapp/authorize.json` | JSON `{appId, clientBiz:"weapp_wsc", code}` | `code === 0`，`data.accessToken` / `access_token`、`sessionId`、`kdtId`、`nick_name`、`mobile` |
| 签到活动 | `GET /wscump/checkin/show_checkin_page_v2.json` | 公共 query | 取 `checkinId`、`isShow`；今日已签标记 `todayCheckin` / `isCheckin` / `hasCheckinToday` |
| 执行签到 | `GET /wscump/checkin/checkinV2.json` | 公共 query + `checkinId` | 返回 `desc`、`list[].infos.title`；重复签到报「已达最大参与次数」 |
| 积分余额 | `GET /wscump/integral/user_points.json` | 公共 query | `current_points` 或 `real_points`；也用于校验缓存 token |

公共 query：`app_id=wx35322299c6492f6e`、`kdt_id=100939936`、`access_token=<token>`。

固定常量（来自青龙脚本标注的反编译结果）：

- `CLIENT_BIZ = "weapp_wsc"`
- `KDT_ID = "100939936"`
- `USER_VERSION = "2.219.11.101"`
- `PAGE_VERSION = "0"`（仅用于 Referer 伪装，不参与校验）

统一响应：HTTP 200 且 `code === 0` 成功，否则取 `msg` 作为错误原因。

- 会话失效文案：`/access_token|token|登录|invalid session|session/i`。
- 重复签到文案：`/已达最大参与次数|已签到|重复签到|今日已参与|已经签到|已参与/`。
- 注册/手机号授权文案：`/手机号未授权|未授权手机|请先授权|未注册|未绑定|请先注册|请先绑定|绑定手机/`，
  命中后转 `ctx.manualRequired(..., { details: { action: 'register' } })`。
- 未拿到 `checkinId` 时返回 `ok: false`，不猜活动 id；原脚本没有兜底 `checkinId`，平台也未添加。

## 请求头 / 加密

无自建签名、无请求加密，未使用 `ctx.crypto`。固定请求头：

```text
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF
Referer: https://servicewechat.com/wx35322299c6492f6e/0/page-frame.html
Accept: */*
Extra-Data: {"sid":"<sessionId>","version":"2.219.11.101","clientType":"weapp-miniprogram","client":"weapp","bizEnv":"wsc"}
Content-Type: application/json   # 仅 POST
Cookie: <Set-Cookie 抓取结果>
```

- 有赞不维护 Cookie 会话，平台 HTTP 客户端也不自动保存；脚本从 `Set-Cookie` 抓取并合并成一行，随缓存保存。
- 登录响应本身通常不带 cookie 字段，保留 `request()` 从 `Set-Cookie` 抓到的值。
- 缓存 key：`auth`，TTL 7 天，内容 `{ accessToken, sessionId, kdtId, cookie, mobile, nickName, updatedAt }`。
- 启动时用 `GET /wscump/integral/user_points.json` 校验缓存 token；失效则清缓存重新取 code 登录。
- 取 code 保留青龙脚本的重试：最多 4 次，重试前调用 `ctx.yyb.refreshAccount()` 并等待 3 秒。

## 注册 / 积分 / 商品

- 注册：原脚本没有注册/手机号绑定接口，只有错误文案提示。平台在签到或登录提示手机号未授权/未注册/未绑定时抛
  `ctx.manualRequired(..., { details: { action: 'register' } })`。未实现自动注册。
- 积分：`user_points.json` 的 `current_points ?? real_points`，签到后查询并调用
  `ctx.points.sync({ balance, estimated: false, rulesText })`。
- `products.js`：未创建。青龙脚本没有商品/优惠券列表接口，未猜有赞商品路径。

## 未迁移内容

- 青龙脚本的账号循环、`wanyazhenxuan_token_cache.json` 文件缓存、固定 800ms 账号间隔由平台调度/账号上下文替代。
- 原脚本把取码失败重试放在 smallcat 的 `/wx/refresh`；平台改用 `ctx.yyb.refreshAccount()`，语义一致。

## 当前状态

- `node --check data/apps/wanyazhenxuan/scripts/sign-in.js` 通过。
- `app.json` JSON 校验通过。
- 本地 mock 验证通过：登录、缓存 token、签到成功、重复签到、未获取 checkinId、积分同步、缓存 token 失效后重登。
- 未连接真实 YYB/目标服务器联调（本机没有平台运行时的账号 ref / code）。

## 阻塞 / 风险

1. **未实测**：有赞登录、签到活动、签到、积分接口均未用真实账号跑过。
2. **签到活动依赖服务端返回 `checkinId`**：拿不到时本次返回 `ok: false`，不会用固定活动 id 兜底。
3. **手机号授权风险**：有赞签到可能要求手机号授权（同仓库 `camel` 遇到过）；命中时会转人工注册，不会自动完成授权。
4. **Cookie 持久化**：有赞的 `Set-Cookie` 只在运行时缓存，平台缓存在 7 天后过期；过期后重新登录即可。
5. **版本号/Referer**：`2.219.11.101`、`0` 为青龙脚本抓包时的值，小程序升级后可能需要同步更新。
6. **`checkinV2.json` 的 `desc`/`list` 结构**：按原脚本解析，若接口改版只影响提示文案，不影响成功判定。
