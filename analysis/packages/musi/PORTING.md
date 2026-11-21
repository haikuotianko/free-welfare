# 慕思（musi）迁移记录

## 基本信息

- 应用 key：`musi`
- 名称：慕思（DeRUCCI）
- AppID：`wx03527497c5369a2c`（青龙脚本与接口 body 一致，无冲突）
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\musi.js`
- API Base：`https://atom.musiyoujia.com`
- 平台脚本：`data/apps/musi/scripts/sign-in.js`
- 应用清单：`data/apps/musi/app.json`
- 一个 Run 只处理 `ctx.account`，不循环账号
- 当前状态：已迁移，`node --check` 通过；用 mock ctx 走通登录、首次签到、今日已签、签到后积分刷新
- 是否启用：`enabled: true`

## 接口清单

全部为 `POST`，JSON（登录接口为 form-urlencoded）。

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 登录 | `POST /user/wechatlogin/applets` | 无 token | form body `appId=wx03527497c5369a2c&appType=WECHAT_MINI_PROGRAM&code=<wx code>&systemCode=65`；成功 `code === "0"`，返回 `data.token`、`data.openId` |
| 会员信息 | `POST /member/wechatlogin/selectuserinfo` | api_token | body `{ appId, appType, openId }`；成功 `msg === "success"`；`data.resMemberInfo.memberId`、`data.memberInfo.pointInfo.point` |
| 任务/签到状态 | `POST /member/memberbehavior/getBehaviorInfos` | api_token | body `{ appId, appType, behaviorIds: [1,2,10203,10204,10205,5], sourceChannel: "会员小程序", source: memberId, openId }`；`data[0].acts["每天已获得积分次数"] === 1` 表示今日已签 |
| 签到 | `POST /member/memberbehavior/add` | api_token | 保留原脚本完整埋点 body（`behaviorIds: [1,3]`、`eventCategory: "用户签到"`、`eventAttr2: yyyy.MM.dd`、`customId`、`openId` 等）；成功 `msg === "success"`，`data.point` 为本次积分 |

业务成功判定：登录用 `code == 0`，其余接口用 `msg === "success"`（与原脚本完全一致，没有引入新的成功码）。

## 请求头 / 签名

```text
Content-Type: application/json   # 登录为 application/x-www-form-urlencoded
User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 ...) MicroMessenger/8.0.31 ... miniProgram
api_client_code: 65
api_version: 1.0.0
api_timestamp: <毫秒时间戳>
api_token: <token>               # 登录为空串
api_sign: MD5(签名串).toUpperCase()
```

签名串与原脚本一致，且登录/其它接口不同：

- 登录：`api_client_code=65&api_version=1.0.0&api_timestamp=<ms>`
- 其它：`api_token=<token>&api_client_code=65&api_version=1.0.0&api_timestamp=<ms>`

`api_sign` 由 `ctx.crypto.md5()` 计算，没有自建加密。`eventAttr2` 使用北京时间 `yyyy.MM.dd`，避免运行环境时区不同导致埋点日期漂移。

## 登录态与缓存

- `ctx.cache` 键 `auth`，保存 `{ token, openId, memberId }`，TTL 7 天。
- 有缓存时先调 `selectuserinfo` 校验；失败按登录态失效处理，清缓存重新取 code 登录，并重试一次。
- 原脚本每次运行都重新登录；平台版本保留缓存是为了减少取码次数，业务接口与判定未变。

## 注册 / 手机号

青龙脚本没有注册/绑定手机号流程。平台处理：

- 登录返回非 0 且文案与微信 code 无关（不是 `openid`/`code`/40029/45011）→ 抛 `ctx.manualRequired(..., { details: { action: 'register' } })`，提示先在小程序内登录一次。
- code 被微信拒绝（40029 等）属于运行期错误，按普通 `ApiError` 抛出，便于重试，不误判为未注册。

## 积分

- 余额来源：`/member/wechatlogin/selectuserinfo` 的 `data.memberInfo.pointInfo.point`。
- 签到前查一次，签到后再查一次，用最新值调 `ctx.points.sync({ balance, estimated: false })`。
- 若签到后查询失败，会退回「签到前余额 + 本次 point」并记 warn，不因此判定签到失败。

## 未迁移内容

- 远程公告 `getNotice()`（与签到无关，且是第三方 GitHub 地址）。
- 随机延迟 5–30 秒（平台调度负责节流）。
- 青龙脚本没有积分商城/优惠券列表接口，未创建 `products.js`。

## 当前状态

- 代码：`node --check` 通过；`app.json` JSON 校验通过。
- mock 联调：登录 → 查询信息 → 未签 → 签到（+5）→ 复查（105）→ `points.sync(105)`；已签分支不再调用签到接口。
- 匿名探测：用无效 code 调 `/user/wechatlogin/applets`，服务端返回 `{"msg":"无法获取openid：{...invalid code...}","code":10001}`（HTTP 200），说明 form body 与 `api_sign` 被接受，且确认了非 0 错误码的返回形态。

## 阻塞 / 风险

1. 未用真实 YYB 账号联调，`getBehaviorInfos` 的 `acts` 字段与 `memberbehavior/add` 的埋点字段都来自青龙脚本，慕思改版后可能失效。
2. token 有效期未知，只能按「每次运行先校验、失败重登」处理。
3. `source` 传的是 `memberId`（青龙脚本如此）；若服务端改为校验 openId，需要同步调整。
4. 登录接口的 `systemCode` 固定 `65`，属于应用级常量，小程序换版可能变化。

## 2026-11-16 最新包补充（253）

- 新登录接口：`POST /v2/app/loginByAuthCode`，`{ authCode, openId, unionid, third:"wxmini", miniAppId }`。
- 最新注册接口：
  - `POST /user/wechatlogin/userreg`（form），`{ appId, appType, unionId, sessionKey, openId, code, systemCode }`，`code` 是手机号授权 code；实测能创建用户并返回 `id`、`phone`、`token`。
  - `POST /member/wechatlogin/registered`，body 为 `{ userId, mobile, openId, channelType:"WECHAT", memberType:"DeRUCCI", gender, shopCode, unionId, ... }`。
- 实测 `userreg` 成功，但 `registered` 始终返回 `code=101 未登录/请重新登录获取授权`；`selectuserinfo` 仍返回 `{}`，无法拿到 `memberId`。
- 结论：新注册链路的 token 作用域还有一层服务端校验未通过，脚本保持停用；已把接口和参数记录在此，后续可继续排查。
