# sinsin（sinsin）迁移记录

## 基本信息

- 应用 key：`sinsin`
- 名称：sinsin
- AppID：`wxdc40acf03fc92e6f`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\sinsin.js`
- 平台脚本：`data/apps/sinsin/scripts/sign-in.js`
- 应用清单：`data/apps/sinsin/app.json`
- API Base：
  - `https://h5.youzan.com`（有赞微商城）
  - `https://uic.youzan.com`（有赞统一登录）
- 商城 `kdt_id`：`126240508`
- 页面 Referer 版本：`54`
- 一个 Run 只处理 `ctx.account`，不循环账号。

## 接口清单

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| UIC code 登录 | `POST https://uic.youzan.com/passport/general/auth.json` | 无 | JSON `{ appId, code, platformName:"weapp", signature:"Windows" }`；`code==0` 且 `data.sessionId` 非空为成功，token 取 `data.sessionId` / `data.accessToken` |
| 积分 | `GET /wscump/integral/user_points.json` | `KDTSESSIONID` + `access_token` | 余额取 `current_points ?? real_points ?? total_points` |
| 签到活动 | `GET /wscump/checkin/show_checkin_page_v2.json` | 同上 | `checkinId` / `checkin_id` 为活动 ID，另记录 `isShow`、`showPage` |
| 每日签到 | `GET /wscump/checkin/checkinV2.json?checkinId=<id>` | 同上 | 成功 `code==0`；奖励文案取 `data.desc` 和 `data.list[].infos.title/desc` |

公共 query（所有 `h5.youzan.com` 请求）：

```text
store_id=
app_id=wxdc40acf03fc92e6f
kdt_id=126240508
access_token=<accessToken>
checkinId=<id>        # 仅签到接口
```

成功/业务码：

- 成功：`code === 0`。
- 已签到：文案命中 `已签到|已经签到|重复|今日.*签|参与次数|最大参与次数`，按 `alreadyDone: true` 返回成功。
- 手机号未授权：文案命中 `手机号未授权|mobile.*authorized`，原脚本没有手机号授权流程，平台抛 `ctx.manualRequired(..., { details: { action: 'authorize_phone' } })`。
- 登录态失效：`code` 为 `-1` / `40009` / `40010`，或文案命中 `登录|token|session|access`；清缓存、重新 UIC 登录并重试一次，再次失败抛 `ctx.authExpired`。
- 其他业务失败返回 `ok:false`，保留文案。

## 请求头 / 加密

无自建签名、无请求加密。UIC 登录的 `signature: "Windows"` 是原脚本固定字符串参数，不是本地计算签名。

`h5.youzan.com` 业务请求头：

```text
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF
Referer: https://servicewechat.com/wxdc40acf03fc92e6f/54/page-frame.html
Extra-Data: {"is_weapp":1,"sid":"<sessionId>","version":"2.235.5.101","client":"weapp","bizEnv":"wsc"}
Cookie: KDTSESSIONID=<sessionId>; yz_log_seqb=1
Accept: application/json, text/plain, */*
Content-Type: application/json    # 仅 POST；当前签到链路都是 GET
```

UIC 登录请求头：

```text
Content-Type: application/json
User-Agent: 同上
Referer: https://servicewechat.com/wxdc40acf03fc92e6f/54/page-frame.html
X-Requested-With: XMLHttpRequest
```

- token 结构保留 `accessToken` / `sessionId`，兼容下划线字段。
- 缓存在 `ctx.cache` 的 `auth` 键，TTL 7 天；只保存 `accessToken`、`sessionId`、昵称，不保存手机号。
- 缓存存在时先用积分接口校验；失败（任何异常/业务错误）清缓存并重新 code 登录。
- 原脚本不做重试；平台在签到链路遇到登录态失效时清缓存、重登并只重试一次，避免会话刚好过期导致空跑。

## 注册 / 手机号

- 青龙脚本没有注册接口，也没有手机号授权流程。
- 原脚本遇到 `手机号未授权` 只记录失败日志并返回。
- 平台实现：抛 `ctx.manualRequired(..., { details: { action: 'authorize_phone' } })`，提示先在小程序内完成手机号授权。
- 未实现自动注册或 `getPhoneAuth` 提交，原脚本没有该流程。

## 积分

- `user_points.json` 的 `current_points` 是明确余额，回退 `real_points` / `total_points`。
- 签到前后各查一次积分；签到后余额优先，失败时回退签到前余额。
- 查到数字余额后调用 `ctx.points.sync({ balance, estimated: false })`。
- 签到前后余额差为正时写入 `metrics.earned`（仅作本次运行参考）。

## 商品 / 券

- 青龙脚本没有商品/券列表接口。
- 只调用积分、签到活动和签到三个业务接口。
- 因此未创建 `products.js`。

## 未迁移内容

- 青龙脚本的多账号循环、`sinsin_token_cache.json` 文件缓存、自定义 `wx_server` 取 code 请求、账号间等待，均由平台调度、`ctx.yyb.getCode` 和 `ctx.cache` 替代。
- 没有改动任何接口路径、公共 query、请求头、Extra-Data、Cookie 或成功/错误码。

## 当前状态

- 代码：`node --check data/apps/sinsin/scripts/sign-in.js` 通过。
- 清单：`app.json` JSON 校验通过。
- 本地 mock 验证通过：
  - UIC 登录 → 积分 → 签到活动 → 签到成功 → 签到后积分同步；
  - 手机号未授权 → `manualRequired(action=authorize_phone)`。
- `enabled: true`。
- 未连接真实 YYB/有赞服务器联调（本机没有平台运行时的账号 ref / code）。

## 阻塞 / 风险

1. **未实测**：UIC 登录、积分、签到活动和签到均未用真实账号跑过；接口和字段来自青龙脚本契约。
2. **UIC 登录响应可能只有 sessionId**：平台允许 `accessToken` 为空（query 里 `access_token=`），业务请求主要依赖 `KDTSESSIONID` Cookie；如果服务端后续强制要求 accessToken，需要重新抓包确认登录返回。
3. **版本号/页面版本**：`USER_VERSION=2.235.5.101`、Referer `54` 为青龙脚本抓包值，小程序升级后可能需要同步更新；`Extra-Data.version` 会影响有赞风控判断。
4. **签到活动 ID 来自服务端**：`show_checkin_page_v2.json` 不返回 `checkinId` 时会返回 `ok:false`（跳过签到），不会猜测历史活动 ID。
5. **手机号授权阻塞**：未授权的账号每次运行都会转人工；原脚本没有自动授权流程。
6. **没有商品/券同步**：原脚本没有相应接口。
