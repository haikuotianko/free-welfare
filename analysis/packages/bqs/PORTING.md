# 倍轻松 BREO（bqs）迁移记录

## 基本信息

- 应用 key：`bqs`
- 名称：倍轻松 BREO
- AppID：`wx61457400e4212cec`
- 青龙源脚本：
  - `N:\myProject\QLScriptPublic\wxapp\bqs.js`
  - `N:\myProject\QLScriptPublic\wxapp\BREO.py`（缓存 token 校验、附件任务参考）
- 平台脚本：`data/apps/bqs/scripts/sign-in.js`
- 应用清单：`data/apps/bqs/app.json`
- API Base：
  - `https://breoplus.breo.cn/app/minic`
  - `https://breoplus.breo.cn/breo-app`
- 页面 Referer 版本：`390`
- 一个 Run 只处理 `ctx.account`，不循环账号。

## 接口清单

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| code 登录第一步 | `GET /app/minic/login/{code}` | 无 | `code` 由 `ctx.yyb.getCode({ appId })` 获取；成功 `code == "200"`，`data` 含 `uid`、`openId`、`unionId`、`nickname` |
| code 登录第二步 | `POST /breo-app/customer/loginByUid` | 无 | JSON `{ uid, openId, unionId }`；`success === true` 或 `code ∈ {0000,200,200.0}`，`result.token` 为业务 JWT |
| 缓存 token 校验 | `POST /breo-app/getUserLevelInfoByUid` | `token` 头 | 来自 `BREO.py`；HTTP 200 且非登录态错误即视为有效 |
| 每日签到/打卡 | `POST /breo-app/user/po-task-info/punch` | `token` 头 | 空 body；`success === true`，`result.point` / `result.grow` 为本次奖励 |
| 浏览商城任务 | `POST /breo-app/user/po-task-info/mall` | `token` 头 | 空 body；附带任务，失败不影响签到 |

成功判定：`success === true` 或 `code` 为 `0000` / `200` / `200.0`。

重复签到：`message` 命中 `已签|签到过|重复|已经|今日已|已完成` 时按“今日已签到”返回。

登录态失效：`message` 命中 `40101|40102|token|登录|未登录|授权|过期|失效|未认证|请重新` 时重新登录；签到会重试一次。

## 请求头 / 加密

无自建签名、无请求加密，保留青龙脚本两套请求头。

登录/校验（`appHeaders`）：

```text
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF
Content-Type: application/json
deviceInfo: {}
Referer: https://servicewechat.com/wx61457400e4212cec/390/page-frame.html
token: <JWT>        # 仅缓存校验请求携带
```

签到/商城任务（`taskHeaders`）：

```text
token: <JWT>
device-type: Xiaomi
device-version: 10
channel: Breo
version_code: 30201
version: 3.2.1
encrypt: 1
Content-Type: application/json; charset=UTF-8
Referer: https://servicewechat.com/wx61457400e4212cec/390/page-frame.html
User-Agent: 同上
```

- `encrypt: 1` 原样保留；原脚本签到/商城请求体为空字符串，没有本地加密逻辑。
- token 缓存在 `ctx.cache` 的 `auth` 键，TTL 7 天；只保存 token、uid、昵称，不保存 openId/unionId/手机号。
- 缓存 token 先用 `getUserLevelInfoByUid` 校验，失效后清缓存重新取 code 登录。
- 签到过程中遇到登录态错误会清缓存、重新登录并只重试一次；再次失败抛 `authExpired`。

## 注册 / 手机号

- `bqs.js` 和 `BREO.py` 都没有注册接口。
- `loginByUid` 返回文案命中 `注册|未激活|绑定|会员` 时，原脚本标记账号未注册。
- 平台实现：抛 `ctx.manualRequired(..., { details: { action: 'register' } })`，提示先在小程序内登录/注册。
- 未实现手机号授权注册，原脚本也没有该流程。

## 积分

- 该应用没有明确返回积分余额的接口。
- `punch.result.point` / `mall.result.point` 是单次任务奖励点数，不是余额，不能用于 `ctx.points.sync`。
- `getUserLevelInfoByUid` 在 `BREO.py` 中只用于判断登录态，未解析积分字段；平台不猜测字段，因此 `sign-in.js` 不调用 `ctx.points.sync`，只在返回值和 `metrics.earned` 中记录本次签到奖励。
- 如果后续确认 `getUserLevelInfoByUid` 返回余额字段，再补 points 同步。

## 商品 / 券

- 青龙脚本没有商品/券列表接口。
- `/breo-app/user/po-task-info/mall` 只是“浏览商城”任务上报，不是商品列表。
- 因此未创建 `products.js`。

## 未迁移内容

- `BREO.py` 的社区任务：发帖 `communityBaseInfo/releasePost`、收藏 `communityBaseInfo/collect`、评论 `communityBaseInfo/comment`。这些会创建公开社区内容，且不属于签到主链路，未迁移。
- `BREO.py` 的公告/一言拉取、随机延迟不迁移（平台调度负责节流）。

## 当前状态

- 代码：`node --check data/apps/bqs/scripts/sign-in.js` 通过。
- 清单：`app.json` JSON 校验通过。
- 本地 mock 验证通过：两步登录、签到成功、重复签到、缓存 token 校验、未注册转人工。
- `enabled: true`。
- 未连接真实 YYB/目标服务器联调（本机没有平台运行时的账号 ref / code）。

## 阻塞 / 风险

1. **注册阻塞**：没有自动注册接口；未在倍轻松注册/激活会员的账号会每次运行都转人工。此类账号需要先在小程序内完成登录/注册。
2. **未实测**：登录、打卡、商城任务均未用真实账号跑过；`getUserLevelInfoByUid` 的响应字段只按 `success/code` 判断，若该接口下线会导致每次运行都重新登录。
3. **积分余额缺失**：接口不返回余额，平台积分快照不会更新；返回值里的 `metrics.earned`
   只表示本次签到奖励点数。
4. **版本号/Referer**：`390`、`version_code: 30201`、`version: 3.2.1` 为青龙脚本抓包时的值，小程序升级后可能需要同步更新。
5. `encrypt: 1` 但请求体为空；如果服务端后续要求加密 body，需要重新抓包确认算法。
