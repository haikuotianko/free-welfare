# 携程会员（xchy）迁移记录

## 基本信息

- 应用 key：`xchy`
- 名称：携程会员
- AppID：`wx0e6ed4f51db9d078`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\xchy.js`
- 平台脚本：`data/apps/xchy/scripts/sign-in.js`
- 应用清单：`data/apps/xchy/app.json`
- API Base：`https://passport.ctrip.com/gateway/api`、`https://m.ctrip.com`
- 一个 Run 只处理 `ctx.account`，不循环账号
- 当前状态：已迁移，`node --check` 通过；本地 mock 覆盖登录、状态查询、签到成功、今日已签、未注册、风控拦截、积分同步
- 是否启用：`enabled: true`（保留青龙 cron；风控拦截时返回失败，不伪装成功）

## 接口清单

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 微信登录第一步 | `POST /gateway/api/soa2/14553/wechatLogin.json` | JSON 字符串 `{AccountHead:{},Data:{authCode:code,thirdConfigCode:ACCESS_CODE,Context:{}}}` | `ReturnCode==0`，`Result.wechatCode`，`Result.resultStatus.returnCode==0` |
| 微信登录第二步 | `POST /gateway/api/soa2/14553/authenticate.json` | `{AccountHead:{},Data:{authCode:wechatCode,thirdType:"wechat_app",thirdConfigCode:ACCESS_CODE,context:{encryptedData:"",iv:"",uuid:""}}}` | `Result.token` |
| 换会员 ticket | `POST /gateway/api/soa2/12559/thirdPartyLogin.json` | `{AccountHead:{},Data:{accountHead:{locale:"zh_CN",platform:"MINIAPP"},token,extendedProperties:{clientID,page_id:"",Url:"",thirdConfigCode,deviceName:"Windows PC",OsType:"windows"}}}` | `Result.ticket`、`duid`、`udl`、`uid`、`openId`；无 ticket 视为未注册 |
| 签到状态 | `POST /restapi/soa2/13012/getSignTodayInfoProxy` | 空 JSON `{}` | `ResponseStatus.Ack=="Success"`；`responseJson` 解析后 `sign===true` 为已签，`totalPoint` 为积分 |
| 签到 | `POST /restapi/soa2/22769/signToday` | `{openId}` | `ResponseStatus.Ack=="Success"` 且 `code==0` 或 message 含「成功」；`baseIntegratedPoint + extraIntegratedPoint` 为本次积分 |

固定应用常量（原脚本硬编码，非个人凭证）：

- `PACKAGE_VERSION = "1055"`
- `CLIENT_ID = "09031101311473737701"`
- `ACCESS_CODE = "XTHYY69RNSKLWEICHATMINI"`

## 请求头

```
POST gateway:
  Content-Type: application/json
  User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF
  Referer: https://servicewechat.com/wx0e6ed4f51db9d078/1055/page-frame.html
  Body: JSON 字符串（不是对象）

POST m.ctrip.com:
  Content-Type: application/json
  User-Agent: 同上
  Referer: https://m.ctrip.com/
  Cookie: cticket=<ticket>; DUID=<encodeURIComponent(duid)>; _udl=<udl>; GUID=09031101311473737701;
```

- 无额外签名/加密；PASSPORT gateway 用 JSON 字符串包体，H5 接口用 `cticket` Cookie 鉴权。
- 未登录时 Cookie 只保留 `DUID`/`_udl`/`GUID` 中已存在的部分，末尾保留原脚本的分号。
- 登录响应里的 `openId`（或 `extendedProperties.openId`）优先用于 `signToday`，否则回落到 `ctx.account.yybRef`。

## 状态码 / 错误判断

- Gateway：HTTP 200 且 `ReturnCode == 0`；业务 `Result.resultStatus.returnCode == 0`。
- 签到状态：HTTP 200 且 `ResponseStatus.Ack == "Success"`（兼容 `responseStatus.ack`），否则返回 `null`，不阻止后续签到。
- 签到成功：`ResponseStatus.Ack == "Success"` 且（`code == 0` 或 message 含「成功」）。
- 今日已签：message 匹配 `已签到|已经签到|无法补签|重复` 或 `code == 400001`。
- 风控拦截：
  - HTTP 401 且 `code == 11001` -> 返回 `ok:false`，提示运行态校验；
  - `code == 404002` 或 message 含「未满足当前活动参与条件」-> 返回 `ok:false`，提示需要运行态私有签名。
- 会话失效：HTTP 403 或响应文本匹配 `token|登录|未授权|失效|过期|未登录|鉴权` 时，清缓存、重新登录并重试一次。
- 未注册：`thirdPartyLogin` 没有 ticket 时抛 `NoAccountError`，`run()` 转为
  `ctx.manualRequired(..., { details: { action: 'register' } })`。

## 缓存

- key：`auth`
- 内容：`{ ticket, duid, udl, uid, ctripOpenId, updatedAt }`
- TTL：7 天
- 原脚本不主动校验缓存 ticket；本移植保持一致，签到失败且判定为会话失效时清缓存并重新走三次登录。

## 注册 / 积分 / 商品

- 注册：原脚本只有「先在小程序里登录一次」的提示，没有注册接口。登录链正常但没换到 ticket 时按未注册处理并抛 `manualRequired`。
- 积分：用 `getSignTodayInfoProxy` 返回的 `totalPoint`。签到后再次查询状态拿最新值；查询失败时用签到前余额加本次积分并标记 `estimated: true`。
- `products.js`：未新增。原脚本没有商品/优惠券列表接口，未猜路径。

## 阻塞项 / 待验证

- 携程写接口存在运行态校验：Cookie 直连可能被 `401/11001` 或 `404002` 拦截，需要小程序运行态生成的私有签名（`n-payload-source`/`cSign`），本移植无法绕过；被拦截时返回 `ok:false`。
- 没有真实 YYB 账号做线上联调；本次仅本地 mock 覆盖登录、缓存 ticket、状态查询、签到、今日已签、未注册、风控拦截与积分同步。
- 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
