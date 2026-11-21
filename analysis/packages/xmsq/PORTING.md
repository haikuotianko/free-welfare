# 小米社区（xmsq）迁移记录

## 基本信息

- 应用 key：`xmsq`
- 名称：小米社区
- AppID：`wx240a4a764023c444`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\xmsq.js`
- 平台脚本：`data/apps/xmsq/scripts/sign-in.js`
- 应用清单：`data/apps/xmsq/app.json`
- API Base：`https://account.xiaomi.com`（登录）、`https://api.vip.miui.com`（社区）
- 网络白名单另加 `https://sts.xiaomi.com`：`serviceLogin` 返回的 STS `location` 通常在该域，脚本会直接 GET 这个地址
- 一个 Run 只处理 `ctx.account`，不循环账号
- 当前状态：已迁移并启用；首次登录通过 YYB `operateWxData(webapi_getuserinfo)` 取微信用户资料密文，真实账号实测 `tokenLogin` 成功，签到返回“今日已签到”
- 是否启用：`enabled: true`

## 接口清单

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 微信 code 换票据 | `POST https://account.xiaomi.com/pass/sns/wxapp/v2/code` | form `{code, appid, sid:"wx_vip", userInfo:"true", _locale:"zh_CN"}` | `code==0` 时取 `data.wxSToken`；同时写入 `wxSToken` cookie |
| 建立小米会话 | `POST https://account.xiaomi.com/pass/sns/wxapp/v3/tokenLogin` | form `{sid:"wx_vip", appid, callback:"", authType:"1", wxSToken, _locale}` | 必须不跟随重定向；成功体含 `passToken`、`userId`、`cUserId` |
| 服务登录 | `GET https://account.xiaomi.com/pass/serviceLogin` | query `{sid:"wx_vip", _json:"true", _locale:"zh_CN"}` | `code==0` 且返回 `location`（STS 地址） |
| STS 登录 | `GET <serviceLogin.location>` | 无 | 返回 `{S:"OK"}`，响应 `set-cookie` 写入 `wx_vip_ph` |
| 签到状态 | `GET https://api.vip.miui.com/mtop/planet/wechat/checkin/mypagedata` | query `wx_vip_ph` | `entity.data[]` 中 `title=="每日签到"` 且 `buttons[0].button=="已签到"` 即已签；`code==401` 为登录态失效 |
| 签到 | `POST https://api.vip.miui.com/mtop/planet/wechat/member/addCommunityGrowUpPointByActionV2` | query `wx_vip_ph`；form `{action:"WECHAT_CHECKIN_TASK"}` | `message=="success"` 成功，`entity.title` 为成长值文案；重复签到用文案正则兜底 |

业务常量 `sid="wx_vip"`、`action="WECHAT_CHECKIN_TASK"` 为小程序固定值，原脚本硬编码，非个人凭证。

## 请求头 / Cookie / 加密

```
User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) ... MicroMessenger/8.0.73 ...
Referer: https://servicewechat.com/wx240a4a764023c444/73/page-frame.html
Origin: https://servicewechat.com
Accept: */*
Cookie: deviceId=...; wxSToken=...; passToken=...; userId=...; cUserId=...; wx_vip_ph=...
```

- 无签名/加密；登录依赖 Cookie 串联。
- `deviceId` 由 `ctx.crypto.uuid()` 生成：`wp_<uuid>`。
- 青龙脚本的 CookieJar 原样保留，并兼容 Node fetch 把多条 `Set-Cookie` 合并成一行的情况。
- 首次登录的 `userInfo` cookie 改为由 YYB `operateWxData` 获取：`payload={api_name:"webapi_getuserinfo",data:{},env:1,with_credentials:true}`，返回 `cloud_id/encryptedData/iv/signature/data`，再按青龙脚本的结构写入 cookie。
- STS 会下发多条 Cookie（含 `wx_vip_serviceToken`、`wx_vip_slh`、`wx_vip_ph`）；平台 HTTP 响应优先使用 `setCookies` 数组，避免只拿到合并后的 `set-cookie`。
- 登录后 `passToken/userId/cUserId` 写入 cookie，再由 `serviceLogin` + STS 换取社区票据 `wx_vip_ph`；业务接口用 `?wx_vip_ph=` 作为会话。
- `tokenLogin` 必须不跟随重定向，平台适配器固定 `followRedirects: true`，因此这一步直接调用 `ctx.http.request({ followRedirects: false })`；其余请求走 `createLegacyAdapter`。

错误码 / 文案：

- `v2/code`：`code !== 0` 视为该微信无法换票（原脚本归类 `NO_ACCOUNT`）。
- `tokenLogin`：`code=20003` 用户不存在；`code=24023` 用户密码未设置（账号未激活）；HTTP 3xx 回退缓存票据。
- `serviceLogin` / STS：`code !== 0`、缺少 `location`、`S !== "OK"`、缺少 `wx_vip_ph` 均视为会话失败。
- 签到：`message === "success"`；`/已签|签到过|重复|已完成/` 视为今日已签；其余为业务失败。

## 缓存

- key：`auth`
- 内容：`{ passToken, userId, cUserId, updatedAt }`
- TTL：7 天
- 平台没有青龙脚本的 `xmsq_token_cache.json`，改用 `ctx.cache` 按账号隔离。
- 只有首次登录成功拿到 `passToken` 后才写缓存；`tokenLogin` 302 时读取缓存作为回退。

## 注册 / 积分 / 商品

- 注册：青龙脚本没有注册接口，只有「小程序内登录/注册」的提示。`NO_ACCOUNT`（含 20003）、`NOT_ACTIVATED`（24023）、302 且无缓存票据时，统一抛
  `ctx.manualRequired(..., { details: { action: "register" } })`。
- 积分：脚本只有成长值签到（`addCommunityGrowUpPointByActionV2`），没有余额查询接口，因此不调用 `ctx.points.sync`。
- `products.js`：未新增。原脚本没有商品/优惠券列表接口。

## 阻塞项 / 待验证

1. ~~首次登录缺少 `userInfo` cookie~~：已解决。YYB `operateWxData(webapi_getuserinfo)` 能返回与青龙 `wx_server /wx/getuserinfo` 等价的 `cloud_id/encryptedData/iv/signature/data`；填充 `getUserInfoBlob()` 后首次 `tokenLogin` 成功，并写入 `ctx.cache` 的 `auth` 票据。
2. `passToken` 缓存 TTL 为 7 天；过期后若再次遇到 302，会抛 `manualRequired`，需要重新登录或补录。
3. 真实账号已验证“已签到”路径；签到写入新成长值需要下一次未签到状态验证。
4. 未做微信 UI 自动化。
