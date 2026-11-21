# 龙湖天街（longfor）迁移记录

- AppID：`wx50282644351869da`
- 应用目录：`data/apps/longfor`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\longfor.js`
- 解包目录：`analysis/packages/longfor/unpacked`（缓存包版本 525；`__APP__.wxapkg`）
- API：`https://gw2c-hw-open.longfor.com/supera`
- 脚本：`scripts/sign-in.js`，`enabled: true`
- 一个 Run 只处理 `ctx.account`，不循环账号。
- 未运行 `pnpm import:apps`，未改数据库。

## 接口

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 登录类型检查 | `POST /supera/mine/v1_25_0/publicApi/login/checkLoginType` | 小程序签名 | body `appId`、`thirdType=WX_APPLET`、`fingerprint`、`authCode`；返回 `ticket` |
| 小程序登录 | `POST /supera/mine/v1_25_0/publicApi/login/loginByMiniApp` | 小程序签名 | body 同上 + `isNew=false` + `ticket`；返回 `token`、`lmid`、`expire` |
| 会员页配置 | `POST /supera/member/api/bff/pages/v1_25_0/publicApi/v1/pageConfig` | `lmToken` + 会员 Gaia Key + 小程序签名 | body `{ pageCode: "C2mine" }`；从响应 JSON 中正则提取 `activity_no=数字` |
| 签到活动信息 | `POST /lmarketing-task-api-mvc-prod/openapi/task/v1/signature/page-info` | `token`、`X-LF-UserToken`、任务 Gaia Key | body `{ activity_no }`；`seven_days_signs[0].sign_status === 20` 表示今日已签 |
| 签到 | `POST /lmarketing-task-api-mvc-prod/openapi/task/v1/signature/clock` | 同上 + DXRisk 头 | body `{ activity_no }`；成功码 `200` / `0000` / `10000`；`data.reward_info[]` 为奖励 |
| 珑珠余额 | `GET /supera/member/api/bff/pages/v1_25_0/v2/user-lz-balance` | `lmToken` + 会员 Gaia Key | 解包确认的只读余额接口；`data.balance`、`data.expiringLz` |
| 顶象 DXRisk | `GET/POST https://ly-sta.longhu.net/udid/w1` | `Param` 头 / `If-None-Match` | 自定义 Base64 加密参数；参数长度 > 1024 时改用 POST 表单 |

## 请求头 / 加密

小程序接口头（与青龙脚本一致）：

```text
User-Agent: Mozilla/5.0 (...) MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF
Referer: https://servicewechat.com/wx50282644351869da/506/page-frame.html
Content-Type: application/json
lmToken: <token>
X-LF-Bucode: C20400
X-LF-App-Version: 1.25.0
X-LF-RequestId: <32 位 uuid>
X-LF-Channel: C2
X-LF-Api-Version: v1_25_0
X-Gaia-Api-Key: 98717e7a-a039-46af-8143-be7558a089c0   # 仅会员接口
```

- 小程序签名：按 key 排序 canonicalize 请求体，拼接 `body&timestamp&Q74eKtH5LePYfSjIiflUbCL2gxjTa7rF`，MD5 后放：
  - `X-LONGZHU-TimeStamp`
  - `X-Client-Type: microApp`
  - `X-LONGZHU-Sign`
- 任务中台头：`Referer: https://longzhu.longfor.com/longball-homeh5/`、`X-GAIA-API-KEY: c06753f1-3e68-437d-b592-b94656ea5517`、`token`、`X-LF-UserToken`、`X-LF-Channel`、`X-LF-Bu-Code`。
- 有 DXRisk token 时追加 `X-LF-DXRisk-Token`、`X-LF-DXRisk-Source: 3`、`X-LF-DXRisk-Captcha-Token: ""`。
- MD5 使用 `ctx.crypto.md5`；uuid 使用 `ctx.crypto.uuid()`；DXRisk 加密算法按原脚本逐字符移植。
- token 缓存在 `ctx.cache` 的 `auth` 键，TTL 7 天；缓存校验失败会重新登录，签到遇到 token 错误会重登并重试一次。

## 注册

- 未找到独立注册接口；登录接口固定 `isNew: false`。
- 登录成功但未返回 `token` 时抛 `ctx.manualRequired(..., { details: { action: 'register' } })`，提示先在小程序内登录/注册。
- 未使用 `ctx.yyb.getPhoneAuth`：该流程只依赖微信 code，不需要手机号授权数据。

## 积分 / 商品

- 积分：主包没有可直接查询的“积分”余额接口；`mall_score` / `points_apply` 属于独立插件 `wxfab2bf944bfc4da6`，服务端接口不在本包内。
- 按解包确认的 `v2/user-lz-balance` 同步“珑珠”余额到 `ctx.points.sync`，`app.json` 的 `pointsName` 为“珑珠”。
- 未实现 `products.js`：主包只有 `v2/getCouponInfo`（我的卡券数量/入口）和插件内积分商城，没有清晰的外部可调用商品/券目录接口。

## 阻塞 / 说明

- 顶象 DXRisk token 为原脚本逆向逻辑，未做真实联调；获取失败时按原脚本降级为不带风控头直接签到。
- 小程序版本号 `506`、`v1_25_0`、`1.25.0` 为青龙脚本硬编码，客户端升级后可能需要同步更新。
- `activity_no` 依赖会员页配置返回的链接文本，若运营改版可能解析不到。
- 已用 `node --check` 校验通过；并用本地 mock ctx 跑通登录、pageConfig、签到、珑珠余额流程（未发真实网络请求）。
- 未连接真实 YYB/目标服务器联调。
- `enabled: true`。
