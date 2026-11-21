# 加多宝Club（jdbclub）迁移记录

## 基本信息

- 应用 key：`jdbclub`
- 名称：加多宝Club
- AppID：`wx8371875e443e177f`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\jdbclub.js`
- 平台脚本：`data/apps/jdbclub/scripts/sign-in.js`
- 应用清单：`data/apps/jdbclub/app.json`
- API Base：`https://api-mp.jdbchina.com`
- 页面 Referer 版本：`45`
- 一个 Run 只处理 `ctx.account`，不循环账号。
- 当前状态：已迁移；`node --check`、`app.json` 解析、mock 登录/注册/签到均通过；`enabled: true`。

## 接口清单

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| code 登录 | `POST /geement.authjextra/api/v1/loginsession/2weichatmicroprogram` | 无 | form `jscode=<code>&app_id=<appid>&client_code=CLI2113448692`；`data.token` 即 `unique_identity` |
| 换 apitoken | `GET /geement.authjextra/api/v1/common/nanoprogramauth` | 无 | query `app_id`、`client_code`、`jscode=<第二个 code>`；`data` 为 apitoken，失败用 token 兜底 |
| 用户信息 | `GET /geement.usercenter/api/v1/user/information` | `unique_identity` + `apitoken` | `success == true`；`data.extra_memberinfo.member_status === 1` 表示已是会员 |
| 手机号验证 | `POST /geement.authjextra/api/v1/loginsession/2weichatmicroprogram/getuserphonenumberwithcheckid` | `unique_identity` + `apitoken` | form `code=<手机号授权 code>&app_id=<appid>&client_code=CLI2113448692`；取 `data.check_id`、`data.phone_number` |
| 注册会员 | `POST /geement.usercenter/api/v1/user/informationvbyfiled` | `unique_identity` + `apitoken` | JSON，带 `register_member_phonenumbercheckdto.system_checkid`；成功取 `data.register_member_result.member_id` |
| 签到活动 | `GET /geement.marketingplay/api/v1/signin` | `unique_identity` + `apitoken` | query `status=30&pageNum=1&pageSize=1`；取 `data[0].activitydto.id` |
| 签到状态 | `GET /geement.marketingplay/api/v1/signin/userinfo` | `unique_identity` + `apitoken` | query `task_id=<活动 ID>`；`data.total_signindays`、`data.continuity_signindays`、`data.latest_signin_time` |
| 签到 | `POST /geement.marketingplay/api/v1/signin/signbyuser` | `unique_identity` + `apitoken` | form `task_id=<活动 ID>`；`success == true` |

响应统一壳：`{ success: boolean, msg: string, data: any }`。

重复签到：`signbyuser` 的 `msg` 命中 `已完成签到|已经签到|已签|重复` 时按“今日已签到”返回。

今日判断：`latest_signin_time` 以北京时间 `YYYY-MM-DD` 开头，与 `Date.now() + 8h` 生成的日期比较（保留青龙脚本逻辑）。

登录态失效：`success === false` 且 `code ∈ {401, 403, 4001, 4003}`，或 `msg` 命中 `token|登录|未授权|失效|过期|未登录|鉴权|授权|会话` 时，清缓存重新取 code 登录并重试一次；再次失败抛 `ctx.authExpired`。

## 请求头 / 鉴权

```text
User-Agent: Mozilla/5.0 ... Chrome/132.0.0.0 ... MiniProgramEnv/Windows WindowsWechat/WMPF
Accept: */*
xweb_xhr: 1
Sec-Fetch-Site: cross-site
Sec-Fetch-Mode: cors
Sec-Fetch-Dest: empty
Referer: https://servicewechat.com/wx8371875e443e177f/45/page-frame.html
Accept-Language: zh-CN,zh;q=0.9
unique_identity: <登录 token>
apitoken: <nanoprogramauth 返回值，失败时为 token>
```

- 登录和 `nanoprogramauth` 请求不携带双 token；业务请求携带。
- form 请求：`Content-Type: application/x-www-form-urlencoded`，body 按 `encodeURIComponent(k)=encodeURIComponent(v)` 拼接。
- JSON 请求：`Content-Type: application/json`，body 为 `JSON.stringify`。
- 无自建签名、无请求加密。
- `CLIENT_CODE = CLI2113448692` 是小程序固定应用标识，非个人凭证。

## 缓存

- key：`auth`，TTL 7 天。
- 保存 `token`、`apitoken`、`updatedAt`。
- 优先使用缓存；会员查询或签到遇到登录态错误时清缓存、重新登录并重试一次。
- 青龙脚本使用缓存 token 时不做校验；平台增加了上述登录态错误重试，避免缓存 token 过期后连续失败，不改变接口协议。

## 注册 / 手机号

青龙脚本有完整注册流程，已实现：

1. `GET /user/information` 查 `extra_memberinfo.member_status`。
2. 非会员时，用 `ctx.yyb.getPhoneAuth({ appId })` 取手机号授权一次性 `code`（等价于青龙脚本的 `wx_server /wx/getphonenumber`）。
3. `POST .../getuserphonenumberwithcheckid` 换取 `check_id` / `phone_number`。
4. `POST /user/informationvbyfiled` 提交 `register_member: true`、`system_checkid`、手机号、固定 `member_sourceinfo`。
5. 注册成功日志输出 `member_id`，不输出手机号。

如果手机号授权不可用、`check_id` 缺失或注册失败：

- 标记 `unregistered`，按青龙脚本“仍尝试签到一次”的行为继续。
- 若签到仍失败并命中注册/会员文案，抛 `ctx.manualRequired(..., { details: { action: "register" } })`，提示先在小程序注册。
- 登录未返回 token 时同样视为未注册，转人工。

## 积分

- 青龙脚本没有积分余额查询接口，也没有解析 `user/information` 中的任何积分字段。
- 因此不调用 `ctx.points.sync`，`pointsName` 仅作展示。
- 返回值 `metrics.signDays` 记录累计签到天数，不代表积分。

## 商品 / 券

- 青龙脚本没有商品/券列表接口。
- 签到活动不是商品列表，没有积分价格/库存字段，因此未创建 `products.js`。

## 未迁移内容

- 青龙脚本的多账号循环、`wx_server` 取 code/手机号、`fs` token 缓存、请求间 1.5–3 秒等待。
- 平台负责账号隔离、缓存与调度节流。
- 没有迁移签到活动之外的营销玩法。

## 当前状态

- 代码：`node --check data/apps/jdbclub/scripts/sign-in.js` 通过。
- 清单：`app.json` JSON 解析通过。
- mock 验证通过：双 code 登录（token + apitoken）→ 会员查询 → 签到活动 → 未签 → 签到成功；非会员 → 手机号授权 code → `check_id` → 注册成功 → 签到；已签到分支；登录无 token 转注册错误。
- `run(ctx)` 包装层（`createLegacyAdapter`、未调用 `points.sync`）mock 通过。
- 未连接真实 YYB/加多宝服务器联调（本机没有平台运行时的账号 ref / code）。
- `enabled: true`。

## 阻塞 / 风险

1. **自动注册副作用**：注册接口会真实创建会员；若账号已注册但 `member_status` 异常，可能触发重复注册尝试，需要在小程序确认。
2. **手机号授权**：依赖 `ctx.yyb.getPhoneAuth` 返回一次性 `code`；YYB 未配置手机号能力或授权失败时只能转人工。
3. **未实测**：登录、会员查询、注册、签到均未用真实账号跑过；`informationvbyfiled` 路径与字段按青龙脚本原样保留。
4. **固定常量**：`CLIENT_CODE`、Referer 版本 `45` 来自青龙脚本抓包，小程序升级后可能需要更新。
5. **活动依赖**：签到活动需存在 `status=30` 的活动；没有活动时返回 `ok: false`，不会误报成功。
6. **积分余额缺失**：接口不返回余额，平台积分快照不会更新。
