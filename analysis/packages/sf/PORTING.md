# 顺丰速运（sf）迁移记录

## 基本信息

- 应用 key：`sf`
- 名称：顺丰速运
- AppID：`wxd4185d00bf7e08ac`
- 小程序原始 ID：`gh_f9d9fca26a50`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\sf.js`
- 平台脚本：`data/apps/sf/scripts/sign-in.js`
- 应用清单：`data/apps/sf/app.json`
- API Host：`https://ucmp.sf-express.com`、`https://mcs-mimp-web.sf-express.com`
- 一个 Run 只处理 `ctx.account`，不循环账号
- 当前状态：已迁移，`node --check` 通过；用本地 mock 走通登录、Cookie 收集、签到成功、今日已签、缓存会话失效重登、未绑定会员转人工
- 是否启用：`enabled: true`

## 接口清单

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 静默登录 | `GET https://ucmp.sf-express.com/wxaccess/weixin/appOnLogin` | `code`、`publicId=gh_f9d9fca26a50` | 返回 JSON `{sessionId, openid}`；服务端用 code 换会话 |
| 补全会员 Cookie | `GET https://ucmp.sf-express.com/wechat-act/weixin/activity/sfnewactivity` | `bizCode`、`regSource=mypoint`、`citycode=025`、`cityname=广州`、`wxapp-version=V17.49`、`suuid=<sessionId>` | 手动跟随重定向，逐跳收集 `sessionId` / `_login_mobile_` / `_login_user_id_` |
| 兜底 Cookie | `GET https://mcs-mimp-web.sf-express.com/mcs-mimp/app/index.html` | 无 | 再访问一次会员首页补 Cookie，失败只告警 |
| 每日签到 | `POST https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~integralTaskSignPlusService~automaticSignFetchPackage` | JSON `{comeFrom:"vioin", channelFrom:"WEIXIN"}` | `success===true` 为成功；`obj.hasFinishSign===1` 表示今日已签；`obj.integralTaskSignPackageVOList[0].packetName` 为礼包名 |

固定常量（青龙脚本中的应用级常量，非个人凭据）：

- `PAGE_VERSION = "663"`
- `TOKEN = "wwesldfs29aniversaryvdld29"`
- `SYS_CODE = "MCS-MIMP-CORE"`
- `bizCode` 中的 `linkCode = "SFAC20230803190840424"`

## 请求头 / 签名

`appOnLogin`：

```text
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... MiniProgramEnv/Windows WindowsWechat/WMPF ...
Accept: application/json, text/plain, */*
Referer: https://servicewechat.com/wxd4185d00bf7e08ac/663/page-frame.html
```

`sfnewactivity` 使用 iPhone H5 UA，`Accept: text/html,application/xhtml+xml,...`；`mcs-mimp/app/index.html` 使用同一 H5 UA。

签到请求：

```text
Host: mcs-mimp-web.sf-express.com
User-Agent: <小程序 Windows UA>
Accept: application/json, text/plain, */*
Content-Type: application/json
channel: xcxpart
platform: MINI_PROGRAM
accept-language: zh-CN,zh;q=0.9
Referer: https://servicewechat.com/wxd4185d00bf7e08ac/663/page-frame.html
Cookie: <手动 cookie jar>
syscode: MCS-MIMP-CORE
timestamp: <毫秒时间戳>
signature: md5(`token=wwesldfs29aniversaryvdld29&timestamp=<ms>&sysCode=MCS-MIMP-CORE`)
```

- 签名完全保留青龙脚本 `signHeaders()`，只把 `crypto.createHash("md5")` 换成 `ctx.crypto.md5`。
- 平台 `fetch` 会忽略手工设置的 `Host` 头，但请求 URL 的 host 本身就是 `mcs-mimp-web.sf-express.com`，所以不影响协议。
- 成功/失败判断保留原脚本：
  - `success === true` → 成功；
  - `errorCode === "100111"` 或文案命中
    `/用户信息失效|退出重新进入|未登录|登录失效|未授权|请登录|会话失效|会员/` → 登录态失效；
  - 文案命中 `/已签|签到过|重复|已完成/` → 今日已签（按成功处理）；
  - 其他 → 业务失败，返回 `ok: false`。

## Cookie / 缓存

- 平台 HTTP 客户端不维护 Cookie，脚本自己维护 `jar`，与青龙脚本一致。
- `ctx.cache` 键：`auth`
- 内容：`{ jar, updatedAt }`
- TTL：7 天
- 只有拿到 `_login_mobile_`（或 `_login_user_id_`）才写缓存；缓存命中后直接签到。
- 缓存的会话签到报登录态失效时，清缓存、重新 `ctx.yyb.getCode` 登录并重试一次。

**平台限制（重要）**：`ctx.http` 的响应头是 `Record<string,string>`，多条 `Set-Cookie` 只会保留最后一条（本地 Node fetch 实测：`headers.get('set-cookie')` 可拿到合并值，但 runner 的 `forEach` 重新赋值只留下最后一条）。脚本已按“逐跳手动重定向 + 每跳解析 Set-Cookie”尽量收集；如果某一跳同时下发多个 Cookie，仍可能丢失靠前的 Cookie。绑定判定同时接受 `_login_mobile_` 和 `_login_user_id_` 以降低误判。

## 注册 / 积分 / 商品

- 注册：青龙脚本没有注册接口，只在拿不到 `_login_mobile_` 时提示“先在小程序登录绑定手机号”。
  签到返回登录态失效且没有绑定 Cookie 时，抛
  `ctx.manualRequired(..., { details: { action: "register" } })`。
- 积分：原脚本没有积分余额接口，签到奖励是礼包/券（`integralTaskSignPackageVOList`），不是积分。
  因此未调用 `ctx.points.sync`；不伪造积分余额。
- `products.js`：未新增。原脚本没有商品/优惠券列表接口，签到礼包只出现在签到响应里，不能当商品列表同步。

## 验证情况

- `node --check data/apps/sf/scripts/sign-in.js` 通过。
- `app.json` JSON 解析通过。
- 本地 mock 覆盖：
  - `appOnLogin` → 两次重定向逐跳收集 `_login_mobile_` / `_login_user_id_` → 签到成功并写入缓存；
  - 第二次运行直接使用缓存，不再取 code；
  - 缓存会话返回 `100111` → 清缓存重登 → 重试签到成功；
  - 未绑定会员 + 登录态失效 → `manualRequired(register)`；
  - `hasFinishSign === 1` → `alreadyDone: true`。
- 没有真实 YYB 账号做线上联调；未请求真实顺丰接口。

## 阻塞项 / 风险

1. 平台多 `Set-Cookie` 只保留最后一条，可能影响 `_login_mobile_` / `_login_user_id_` 的收集；需真实账号验证。
2. `sfnewactivity` 重定向目标未在真实环境确认；`app.json` 只放行 `ucmp.sf-express.com` 与 `mcs-mimp-web.sf-express.com`，若跳到其他顺丰域名会触发白名单拦截。
3. `TOKEN` / `SYS_CODE` / `PAGE_VERSION` 是 2026-06 抓包常量，小程序发版后可能变化。
4. UCMP 会话有效期未知，当前缓存 TTL 7 天，靠签到失败后的重登兜底。
5. 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
