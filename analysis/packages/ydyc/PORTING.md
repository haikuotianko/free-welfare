# 优点云创（ydyc）迁移记录

## 基本信息

- 应用 key：`ydyc`
- 名称：优点云创
- AppID：`wx96eb3beaea480465`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\ydyc.js`
- 平台脚本：`data/apps/ydyc/scripts/sign-in.js`
- 应用清单：`data/apps/ydyc/app.json`
- API Base：`https://youdianyunchuan.weimbo.com`
- 统一入口：`POST /api/index.php?ackey=GZYTAPPLET`
- 页面版本（Referer）：`1`
- 一个 Run 只处理 `ctx.account`，不循环账号。
- 是否启用：`enabled: true`

## 接口清单

所有接口都是同一个入口 `POST /api/index.php?ackey=GZYTAPPLET`，用 body 里的 `action` 区分：

| 用途 | action | 鉴权 | 说明 |
| --- | --- | --- | --- |
| code 登录 | `WxLogin` | 无 | JSON `{ action: "WxLogin", code }`；成功 `Data.r3dkey` 为后续会话，`Data.openid` 为业务 openid |
| 用户信息/余额 | `userInfoData` | `3rdSession: <r3dkey>` | `Data.user.{id,name}`，`Data.u_money.{jifen,jinbi,hongbao,yongjin,yhquan}` |
| 任务进度 | `getIntegralInfo2` | `3rdSession` | JSON `{ action, type }`；`Data.adv_arr[]` 的 `title` 形如 `每日签到(0/1)`、`看广告视频(0/3)` |
| 签到档位信息 | `getIntegralInfo` | `3rdSession` | JSON `{ action: "getIntegralInfo", type: "sign" }`；`Data.user_jf`、`Data.qiands`、`Data.sign_arr[]` |
| 每日签到 | `userQiandao` | `3rdSession` | 成功 `Data.add_jf` 本次积分、`Data.user_jf` 当前积分 |
| 看广告视频奖励 | `IntegralGiveReward` | `3rdSession` | 成功 `Data` 为奖励信息 |

### 响应信封

```json
{ "Status": true, "Data": {} }
```

- `Status` 为真表示成功，业务数据在 `Data`；失败时错误信息在 `Data`。
- 原脚本用 `if (!result?.Status) throw` 判断，平台沿用。
- 登录成功必须拿到 `Data.r3dkey`，否则抛错。

## 请求头 / 加密

无自建签名、无请求加密、无 `ctx.crypto` 调用。所有请求使用：

```text
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF
Accept: application/json, text/plain, */*
content-type: application/json
Referer: https://servicewechat.com/wx96eb3beaea480465/1/page-frame.html
3rdSession: <r3dkey>     # 登录请求为空字符串，登录后所有请求携带
```

- `ackey=GZYTAPPLET` 放在 URL query，原样保留。
- 登录请求也发送空的 `3rdSession: ""`，与原脚本一致。
- 未在日志中输出 `r3dkey` 或完整会话。

## 缓存

- 青龙脚本**不缓存** session：每次运行都用 `wx_server` 取 code，再 `WxLogin` 换 `r3dkey`，运行结束即丢弃。
- 平台没有可用的 session 过期时间、刷新接口或独立的会话校验接口，缓存 `r3dkey` 后无法安全判断失效；因此保持原行为：每个 Run 重新登录，不使用 `ctx.cache`。
- `ctx.yyb.getCode({ appId })` 替代青龙的 `wx_server /wx/code`。

## 注册 / 手机号

- 青龙脚本没有注册接口，也没有注册/未注册判断。
- 平台只在 `WxLogin` 失败文案命中 `未注册|请先注册|注册会员|绑定手机号|未绑定|未激活` 时转 `ctx.manualRequired(..., { details: { action: 'register', step: 'WxLogin' } })`；其他登录失败按普通错误抛出。
- 未实现手机号授权注册，原脚本也没有该流程。

## 积分

- `userInfoData` 返回 `Data.u_money.jifen`，是积分余额。
- 平台在脚本末尾调用 `ctx.points.sync({ balance: jifen, estimated: false })`，`metrics.pointsAfter` 同步记录。
- 签到成功时 `Data.add_jf` / `Data.user_jf` 只用于本次结果文案，不作为余额来源；余额以最后一次 `userInfoData` 为准。
- 如果签到后的用户信息查询失败，退回签到前的余额，并在日志中提示。
- 应用清单 `pointsName` 为“积分”。

## 商品 / 券

- 青龙脚本没有商品/优惠券列表接口。
- `adv_arr` 是任务列表（每日签到/看广告视频），不是商品列表。
- 因此未创建 `products.js`。

## 未迁移内容

- 青龙脚本的多账号循环、`&` / 换行拆分、JSON 账号解析：由平台一个 Run 一个账号替代。
- 固定 1.5–3 秒随机等待（账号之间）：由平台调度替代。
- 广告视频任务保留，但平台把它当作附带任务：最多 3 次，失败只记日志，不改变签到结果。

## 当前状态

- `node --check data/apps/ydyc/scripts/sign-in.js` 通过。
- `app.json` JSON 校验通过。
- 本地 mock 验证通过：登录 → 用户信息 → 签到任务进度 → 签到 → 3 次广告奖励 → 最终余额同步；签到任务已完成；签到失败；未注册转人工；广告奖励失败不影响签到。
- 未连接真实 YYB / 目标服务器联调（本机没有平台运行时的账号 ref / code）。

## 阻塞 / 风险

1. **未实测**：登录、签到、广告奖励、用户信息均未用真实账号跑过；接口响应字段按青龙脚本的实测结构解析。
2. **登录态无重试**：原脚本没有 session 过期处理，平台也未自行发明；如果 `r3dkey` 在运行中失效，后续接口会以 `Status: false` 失败。
3. **会话不缓存**：每个 Run 都重新取 code 登录，依赖 YYB 取码可用；取码失败会直接失败。
4. **广告任务**：`IntegralGiveReward` 依赖服务端广告次数，平台最多尝试 3 次；失败只记录日志。
5. **接口入口/ackey**：`ackey=GZYTAPPLET` 与 `api/index.php` 是青龙脚本硬编码的应用常量，服务端升级后可能需要更新。
6. **返回字段**：`user_jf`、`u_money.jifen` 可能同时存在；平台只用 `u_money.jifen` 作为余额，避免混用。
