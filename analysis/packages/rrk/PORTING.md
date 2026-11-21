# 红人库（rrk）迁移记录

## 基本信息

- 应用 key：`rrk`
- 名称：红人库
- AppID：`wx44356198837c0121`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\rrk.js`
- 平台脚本：`data/apps/rrk/scripts/sign-in.js`
- 应用清单：`data/apps/rrk/app.json`
- API Base：`https://xapi.weimob.com`
- 页面 Referer 版本：`93`
- 一个 Run 只处理 `ctx.account`，不循环账号。

## 接口清单

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| code 登录 | `POST /fe/mapi/user/loginX` | 无 | JSON `{ appid, basicInfo:{bosId,cid,tcode,vid}, env:"production", extendInfo:{source:1}, is_pre_fetch_open:true, parentVid:0, pid:<bosId>, storeId:"0", code, queryAuthConfig:true }`；`errcode==0` 成功，`token` 取 `token/accessToken/access_token/jwt`（顶层或 `data` 内），`wid` 取 `data.wid` |
| 签到状态 | `POST /api3/onecrm/mactivity/sign/misc/sign/activity/c/signMainInfo` | `X-WX-Token` | `data.hasSign===true` 或 `data.isSign===true` 表示今日已签；累计天数取 `activityCumulativeSignDays` / `monthCumulativeSignDays` / `signedDate` |
| 每日签到 | `POST /api3/onecrm/mactivity/sign/misc/sign/activity/core/c/sign` | `X-WX-Token` | `errcode==0` 成功；奖励取 `data.fixedReward.points/growth/amount` 和 `data.extraReward.points` |
| 可用积分 | `POST /api3/onecrm/point/myPoint/getSimpleAccountInfo` | `X-WX-Token` | `data.availablePoint` 为可用积分；失败只记警告，不影响签到结论 |

登录请求体保留青龙脚本的 `appid`、`basicInfo`、`env`、`extendInfo`、`is_pre_fetch_open`、`parentVid`、`pid`、`storeId`、`code`、`queryAuthConfig`。签到/状态/积分请求体保留 `appid`、`basicInfo`、`extendInfo`、`queryParameter:"null"`、`i18n`、`pid`、`storeId` 等字段；签到与状态查询带 `customInfo:{source:0,wid}`。积分请求使用独立的 `POINT_BASIC_INFO`（`productId:1`、`productInstanceId:1021218105`、`productVersionId:"36000"`）并带 `targetBasicInfo`、`request:{}`。

成功/业务码：

- 成功：`errcode === 0`。
- 重复签到：`errcode === 60070013000332`，或文案命中 `已签|已经签|签到过|重复|已完成|already`，按“今日已签到”返回成功。
- 登录失效：文案命中 `登录|token|未授权|失效|过期|未登录|1041|401|403`，清缓存重登并重试一次；再次失败抛 `ctx.authExpired`。
- 活动下线/未开启：文案命中 `活动未开始|活动已结束|活动不存在|活动已下线|活动未开启|活动已过期|活动结束|在用的OneCRM实例|OneCRM实例为空|60070012100039`，返回 `ok:false` 并带 `action: "merchant_activity_closed"` 详情，不误判为账号问题。
- 未注册：登录 `errcode != 0` 或未返回 token，以及签到文案命中 `注册|未激活|会员|绑定|授权`，抛 `ctx.manualRequired(..., { details: { action: 'register' } })`。

## 请求头 / 加密

无自建签名、无请求加密。保留青龙脚本的微盟网关请求头：

公共头：

```text
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF
Content-Type: application/json
Accept: */*
Referer: https://servicewechat.com/wx44356198837c0121/93/page-frame.html
Accept-Language: zh-CN,zh;q=0.9
X-WX-Token: <token>        # 登录成功后所有业务请求携带
```

登录额外头：

```text
weimob-bosId: 4020386662105
weimob-cid: 114397105
```

签到/签到状态/积分额外头：

```text
x-wmsdk-vid: 6015049204105
x-biz-id: 146
x-component-is: onecrm/signgift
cloud-bosid: 4020386662105
weimob-bosId: 4020386662105
weimob-cid: 114397105
```

- 青龙脚本里的 `Host` 头未显式设置，由 HTTP 客户端按 URL 生成。
- 固定商户配置（`vid/bosId/cid/merchantId/productInstanceId/productVersionId`）来自青龙脚本，是这家小程序绑定的商户常量，不是个人凭证。
- `wid` 每次登录动态返回，不使用青龙脚本作者写死的 wid。
- token/wid 缓存在 `ctx.cache` 的 `auth` 键，TTL 7 天；不保存手机号等个人信息。

## 注册 / 手机号

- 青龙脚本没有注册接口。
- 原脚本把 `loginX` 非 0 或没有 token 统一标记为“未注册会员”。
- 平台实现：登录失败或拿不到 token 抛 `ctx.manualRequired(..., { details: { action: 'register' } })`，提示先在小程序内注册。
- 未实现自动注册/手机号授权，原脚本也没有该流程。

## 积分

- `getSimpleAccountInfo.data.availablePoint` 是明确的可用积分余额。
- 签到成功、已签到、活动下线后都会查询一次积分；查询失败只记警告。
- 查到数字余额后调用 `ctx.points.sync({ balance, estimated: false })`。
- 本次签到奖励（`fixedReward.points`）写入 `metrics.earned`，不代表余额。

## 商品 / 券

- 青龙脚本没有商品/券列表接口。
- `getSimpleAccountInfo` 只返回积分账户信息，不是商品列表。
- 因此未创建 `products.js`。

## 未迁移内容

- 青龙脚本的多账号循环、`rrk_token_cache.json` 文件缓存、`wx_server_url`/`wx_auth` 环境变量、账号间随机等待，均由平台调度和 `ctx.yyb`/`ctx.cache` 替代。
- 没有改动任何接口路径、请求体字段、网关请求头或成功/错误码。

## 当前状态

- 代码：`node --check data/apps/rrk/scripts/sign-in.js` 通过。
- 清单：`app.json` JSON 校验通过。
- 本地 mock 验证通过：
  - 缓存/登录 → 状态查询 → 签到成功 → 积分同步；
  - 今日已签到；
  - 登录返回未注册 → `manualRequired(action=register)`；
  - 签到状态 401 → 重新登录后重试成功；
  - 活动下线 → `ok:false` + `merchant_activity_closed`，仍同步积分。
- `enabled: true`。
- 未连接真实 YYB/微盟服务器联调（本机没有平台运行时的账号 ref / code）。

## 阻塞 / 风险

1. **未实测**：登录、签到状态、签到、积分接口均未用真实账号跑过；字段和错误码来自青龙脚本契约。
2. **固定商户配置会轮换**：签到活动或 OneCRM 实例下线时，`productInstanceId`/`productVersionId` 可能需要重新抓包更新；当前会返回 `ok:false` 而不是误报账号失效。
3. **未注册判定沿用原脚本**：`loginX` 任意非 0 都会被当成未注册并转人工；如果服务端用同一接口返回临时错误，也会显示为注册阻塞，需要看日志里的 `errmsg` 区分。
4. **积分接口失败不影响签到**：积分查询失败时 `pointsAfter` 为空，平台不会更新积分快照。
5. **没有商品/券同步**：原脚本没有相应接口。
