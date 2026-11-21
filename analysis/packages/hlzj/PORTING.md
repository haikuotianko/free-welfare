# 海澜之家（hlzj）迁移记录

## 基本信息

- 应用 key：`hlzj`
- 名称：海澜之家
- AppID：`wx315431cc3b5e930f`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\hlzj.js`
- 平台脚本：`data/apps/hlzj/scripts/sign-in.js`
- 应用清单：`data/apps/hlzj/app.json`
- 业务 API：`https://gmdevpro.hlzjppgl.cn`
- code 换 unionId：`https://wxa-tp.ezrpro.com/myvip/Base/User/WxAppOnLoginNew`
- 页面 Referer 版本：`38`
- 一个 Run 只处理 `ctx.account`，不循环账号。
- 当前状态：已迁移；`node --check`、`app.json` 解析、mock 流程均通过；`enabled: true`。

## 接口清单

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| code 换 unionId | `POST https://wxa-tp.ezrpro.com/myvip/Base/User/WxAppOnLoginNew` | 固定应用头 | body `{ code, CommonIdType: "", CommonId: "", ShopId: 0, CommonIdSource: 0, Latitude: 0, Longitude: 0, PingId, PingDate }`；`Success === true`，取 `Result.UnionId` |
| 授权登录 | `POST /server/api/authorized-login` | 无 token，body 签名 | body `{ union_id, invite_user_id }`；`code == 200`，取 `data.token`、`data.user_info.id`、`data.user_info.tree_id` |
| 签到状态 | `POST /server/api/day-list` | `Authorization: Bearer <token>`，body 签名 | `code == 200`；`data.day_sign_status === true` 表示今日已签 |
| 签到 | `POST /server/api/day-sign` | `Authorization: Bearer <token>`，body 签名 | `code == 200`；`data.water_num` 为本次电力，`data.day_sign_list.day_num` 为连续天数 |
| 今日电力 | `POST /server/api/user/get-today-water` | `Authorization: Bearer <token>`，body 签名 | best-effort，成功时 `data.get_water`；失败不影响签到结果 |

业务成功码：`Number(res.code) === 200`。

重复签到：`day-sign` 的 `message` 命中 `已签|签到过|重复|已完成` 时按“今日已签到”返回，并继续领取今日电力。

登录态失效：`code ∈ {309, 401, 403, 4001, 4003}`，或 `message` 命中 `token|登录|未授权|失效|过期|未登录|鉴权|授权|会话` 时，清缓存重新取 code 登录并只重试一次；再次失败抛 `ctx.authExpired`。

未注册/未激活：`day-list` 或 `day-sign` 文案命中 `未注册.*会员|注册商城会员|绑定手机号|未绑定手机|未激活|请先.*绑定|请先.*注册`，或登录文案命中 `注册|未激活|会员|绑定` 时，抛 `ctx.manualRequired(..., { details: { action: "register" } })`。

## 请求头 / 签名

### code 换 unionId

```text
Content-Type: application/json
ezr-sp: 2
ezr-source: weapp
ezr-brand-id: 5896
ezr-client-name: EZR.FE.MultiMall.Mini
uber-trace-id: <16位随机>:<16位随机>:0:1
Referer: https://servicewechat.com/wx315431cc3b5e930f/38/page-frame.html
User-Agent: Mozilla/5.0 ... Chrome/132.0.0.0 ... MiniProgramEnv/Windows WindowsWechat/WMPF
charset: utf-8
```

`PingId` 为 32 位 `[A-Za-z0-9]` 随机串；`PingDate` 为 `YYYY-MM-DD HH:mm:ss`。

### 业务请求

```text
Content-Type: application/json
Accept: */*
Origin: https://gmdevpro.hlzjppgl.cn
Accept-Language: zh-CN,zh;q=0.9
Referer: https://servicewechat.com/wx315431cc3b5e930f/38/page-frame.html
User-Agent: 同上
Authorization: Bearer <token>   # 登录请求不带
```

### 业务签名

每个业务 POST 体追加：

```text
nonce     = 20 位 [A-Za-z0-9] 随机串
timestamp = Date.now().toString()
sign      = md5("ff" + nonce + "nn" + timestamp + userId + "mm")
```

- 登录请求 `userId` 为空串。
- 登录成功后使用 `data.user_info.id` 作为 `userId`。
- 使用 `ctx.crypto.md5`，不引入 Node `crypto`。

`host`、`accept-encoding` 属于传输层头，平台 HTTP 客户端会处理，未手工设置；其余业务头保留。

## 缓存

- key：`auth`，TTL 7 天。
- 保存 `token`、`unionId`、`userId`、`treeId`、`updatedAt`。
- 优先使用缓存 token；`day-list` / `day-sign` 遇到登录态错误时清缓存、重新取 code 登录并重试一次。
- 日志不输出 token、code、unionId 值；只提示“换取 unionId 成功”。

## 注册 / 手机号

- 青龙脚本没有注册接口，只在文案命中未注册/未激活时提示先在小程序登录。
- 平台实现：抛 `ctx.manualRequired(...)`，`details.action = "register"`，不尝试自动注册，也不做 WeChat UI 自动化。
- `HLZJ_INVITE_ID`（兼容 `hlzj_invite`）可选，对应 `authorized-login` 的 `invite_user_id`，默认空。

## 积分

- 青龙脚本没有任何积分/电力余额查询接口。
- `day-sign` 的 `water_num` 和 `get-today-water` 的 `get_water` 是本次奖励，不是余额，不能用于 `ctx.points.sync`。
- 因此本脚本不调用 `ctx.points.sync`；返回值 `metrics.water` / `metrics.signDays` 只记录本次签到结果。
- `pointsName` 使用「电力」，与应用内资源一致。

## 商品 / 券

- 青龙脚本没有商品/券列表接口。
- 种树、电力兑换等玩法未出现在脚本中，不猜测接口，因此未创建 `products.js`。

## 未迁移内容

- 青龙脚本的多账号循环、`wx_server` 取 code、`fs` token 缓存文件、1.5–3 秒随机等待。
- 平台负责账号隔离、缓存与调度节流。
- `Host`、`Accept-Encoding` 等传输层头未手工设置。
- 除签到、签到状态、今日电力外，没有迁移种树游戏其它玩法。

## 当前状态

- 代码：`node --check data/apps/hlzj/scripts/sign-in.js` 通过。
- 清单：`app.json` JSON 解析通过。
- mock 验证通过：code → unionId → 授权登录 → `day-list` 未签 → `day-sign`（电力 +10、连续 3 天）→ 领取今日电力；第二次运行使用缓存 token 且已签；未注册文案转 `manualRequired(action=register)`。
- `run(ctx)` 包装层（`createLegacyAdapter`、未调用 `points.sync`）mock 通过。
- 未连接真实 YYB/海澜之家服务器联调（本机没有平台运行时的账号 ref / code）。
- `enabled: true`。

## 阻塞 / 风险

1. **未注册账号**：没有自动注册接口；未在海澜之家注册/激活会员的账号会每次转人工，需要先在小程序内登录/注册。
2. **未实测**：登录、签到、今日电力均未用真实账号跑过；`wxa-tp.ezrpro.com` 的 code→unionId 服务可能受风控/版本影响。
3. **固定常量**：`ezr-brand-id: 5896`、`ezr-client-name`、Referer 版本 `38`、`ezr-sp: 2` 来自青龙脚本抓包；小程序升级后可能需要同步更新。
4. **无积分余额**：接口不返回电力/积分余额，平台积分快照不会更新；`metrics.water` 只是本次奖励。
5. **PingDate 时区**：按脚本原逻辑使用运行环境本地时间；如果 worker 不在中国时区，`PingDate` 可能与小程序端不一致。
