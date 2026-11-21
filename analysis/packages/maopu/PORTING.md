# 毛铺草本酒（maopu）迁移记录

## 基本信息

- 应用 key：`maopu`
- 名称：毛铺草本酒（毛铺草本荟）
- AppID：`wxefd0fe341e06b815`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\maopu.js`
- 平台脚本：`data/apps/maopu/scripts/sign-in.js`
- 应用清单：`data/apps/maopu/app.json`
- API Base：`https://mpb.jingjiu.com/proxy-he`
- 一个 Run 只处理 `ctx.account`，不循环账号
- 当前状态：已迁移，`node --check` 通过；用本地 mock 走通登录、缓存 token、签到状态、签到、已签分支、-1000 需完善资料、积分同步
- 是否启用：`enabled: true`

## 接口清单

| 用途 | 方法/路径 | 鉴权/签名 | 说明 |
| --- | --- | --- | --- |
| 静默登录 | `POST /jp/api/loginauto` | 无 token | body `{code, unionid:"", user_id:"", user_sources:"0", system:{...}, itime, isource}`；成功 `code==0`，`data.access_token`、`data.session_key`、`data.user_id`、`data.unionid`、`data.mobile`、`data.name` |
| 签到状态/积分 | `POST /api/FlanSignInDaily/mains` | `Authorization: <access_token>` | body `{}`；`data.sign_in_today`（实测未签为 -1，>0 视为已签）、`data.user.point`、`data.sign_in_day_continue`、`data.rule`；不需要签名头 |
| 每日签到 | `POST /api/FlanSignInDaily/adds` | token + `apptime` / `appsign` | body `{date:"YYYY-MM-DD"}`；成功 `code==0`，`data.point` / `data.points` 为本次积分 |
| 阅读文章加积分 | `POST /api/FlanArticle/articleView` | token + 签名 | 原脚本明确不做（刷任务），未迁移 |

统一信封 `{code, data, message}`，成功码 `code == 0`。`-1000` 表示“完善个人信息后才能参与”，是账号资料门槛，不是脚本缺陷。
登录失效判断：HTTP 401，或文案命中 `/登录|token|未授权|未登录|失效|过期/`。

## 请求头 / 签名

```text
content-type: application/json
x-version: 0.0.1
Accept: application/json, text/plain, */*
User-Agent: Mozilla/5.0 (Linux; Android 12; M2012K11AC ...) MicroMessenger/8.0.48.2580(0x28003036) MiniProgramEnv/android
Referer: https://servicewechat.com/wxefd0fe341e06b815/318/page-frame.html
xweb_xhr: 1
Authorization: <access_token>            # 登录后；裸值，无 Bearer
apptime: <秒级时间戳>                     # 仅签名接口
appsign: <md5 后 10 位大写>               # 仅签名接口
```

签名（原脚本 `utils/sign/getAppSign.js`，按 body key 顺序只拼接白名单 key）：

```text
apptime = 秒级时间戳
joined  = 白名单 key 依次拼接 k + v（签到只有 date）
appsign = md5(apptime + joined + "DYSHJS^M&.YXZRGS" + access_token) 的后 10 位，大写
```

登录 `isource`（原脚本 `utils/parse.js`，md5 均为大写）：

```text
isource = md5(code + "DI9ynKTdfWqF")[0:16] + md5(code + itime + "DI9ynKTdfWqF")[-16:]
```

- `SALT_SIGN` / `SALT_LOGIN` / `x-version` / `system` 是应用级固定常量，非个人凭证。
- `ctx.crypto.md5` 返回小写十六进制，脚本统一 `.toUpperCase()` 以匹配原包。

## 缓存

- key：`auth`
- 内容：`{ token, name, updatedAt }`
- TTL：7 天
- 启动时用 `/api/FlanSignInDaily/mains` 静默校验缓存 token；失败则清缓存并重新 `ctx.yyb.getCode({ appId })` 登录。
- 签到接口本身遇到登录失效会重登后重试一次（最多一次，避免循环）。

## 注册 / 积分 / 商品

- 注册：原脚本没有注册/补资料接口。签到返回 `code == -1000`（“完善个人信息后才能参与”）时，抛
  `ctx.manualRequired(message, { details: { action: 'register' } })`，提示先在小程序完善个人信息（手机号等）。
- 积分：`/api/FlanSignInDaily/mains` 的 `data.user.point`；签到后再次查询并用最新余额调用
  `ctx.points.sync({ balance, estimated: false })`。签到响应里的 `data.point` / `data.points` 记入 `metrics.earned`。
- `products.js`：未新增。原脚本没有商品/优惠券列表接口，也没有积分商城调用，未猜路径。

## 当前状态 / 验证

- `node --check data/apps/maopu/scripts/sign-in.js` 通过。
- 本地 mock 覆盖：登录、登录请求体签名、签到签名头、签到成功、今日已签、缓存 token、`-1000` 转人工、积分同步。
- 未连接真实 YYB / 毛铺服务端联调；签名算法按原脚本逐字保留。

## 阻塞 / 风险

1. 测试号登录后服务端可能自动建会员但资料不完整（`mobile` 为 null），签到仍会返回 `-1000`；需要在微信小程序内补手机号等资料，脚本不代填、不代过手机号授权。
2. 签到签名依赖服务端 `apptime` 与请求时间一致；若服务器时钟窗口很窄，可能出现签名校验失败，脚本不做本地时钟校正。
3. 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
