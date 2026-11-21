# 小铛家（xiaodangjia）迁移记录

## 基本信息

- 应用 key：`xiaodangjia`
- 名称：小铛家
- AppID：`wx7f5bc6f204abc629`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\xiaodangjia.js`
- 平台脚本：`data/apps/xiaodangjia/scripts/sign-in.js`
- 应用清单：`data/apps/xiaodangjia/app.json`
- API Base：`https://lm.api.sujh.net`
- 一个 Run 只处理 `ctx.account`，不循环账号
- 当前状态：已迁移，`node --check` 通过；2026-11-17 按 25 版小程序更新为手机号授权登录 + `app/score/sign`；YYB 手机号授权登录仍返回“系统繁忙”，暂不启用
- 是否启用：`enabled: false`

## 接口清单

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 微信登录 | `POST /app/login/wechatLogin` | JSON `{code}` | 成功 `code=0/200` 或 `success=true`；`data.token` |
| 签到 | `POST /app/sign/signIn` | JSON `{}` | 成功后所有请求带 `Authorization: <token>` |

原脚本常量：`EP_USER = null`，即没有会员资料/积分查询接口。

## 请求头

```
Content-Type: application/json
User-Agent: Mozilla/5.0 (Linux; Android 12; M2012K11AC Build/SKQ1.220303.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.6998.136 Mobile Safari/537.36 MicroMessenger/8.0.48.2580(0x28003036) MiniProgramEnv/android
Referer: https://servicewechat.com/wx7f5bc6f204abc629/0/page-frame.html
Accept: application/json, text/plain, */*
xweb_xhr: 1
Authorization: <token>   # 登录接口不带
```

- 无签名/加密，全部为 JSON body。
- `Authorization` 直接放 token，不加 `Bearer`（与原脚本一致）。
- 原脚本的 `deviceId` 只计算未使用，本移植不引入。

## 状态码 / 错误判断

- 成功：`code==0`、`code==200` 或 `success===true`。
- 今日已签：`msg/message` 匹配 `已签|已经签|签到过|重复|已完成|already`，按成功返回 `alreadyDone: true`。
- 未注册：匹配 `未注册|未绑定|请先注册|请先绑定|not regist`，抛
  `RegisterRequiredError`，`run()` 转为 `ctx.manualRequired(..., { details: { action: 'register' } })`。
- 会话失效：匹配 `登录|token|未授权|未登录|失效|过期|重新|401`，清缓存、重新登录并重试一次。
- HTTP 4xx/5xx 且响应体是 JSON 时，不直接抛错，交给业务码判断（原脚本注释明确「今日已签到」可能返回 400/500）。

## 缓存

- key：`auth`
- 内容：`{ token, updatedAt }`
- TTL：7 天
- 原脚本 `EP_USER=null`，缓存 token 不做预校验，直接使用；签到返回会话失效时清缓存并重新登录。

## 注册 / 积分 / 商品

- 注册：原脚本没有注册/手机号授权接口，只有提示。未注册时抛 `manualRequired`。
- 积分：无积分接口，未调用 `ctx.points.sync`；`app.json` capability 只有 `sign_in`。
- `products.js`：未新增。原脚本没有商品/优惠券列表接口，未猜路径。

## 阻塞项 / 待验证

- 没有真实 YYB 账号做线上联调；本次仅本地 mock 覆盖登录、缓存 token、签到、今日已签、会话失效重登、未注册。
- 缓存 token 的原脚本没有校验接口；若 token 在有效期内被服务端提前作废，会在本次签到时触发一次重登。
- 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。

## 2026-11-17 最新包（25）核查

- 登录页改为 `bindgetphonenumber`，登录体 `{code, encryptedData, iv}`；平台已改用 `ctx.yyb.getPhoneAuth`。
- 签到接口由 `/app/sign/signIn` 改为 `/app/score/sign`，body `{tmplIds, platform:1}`，请求头 `Appid: xiaodangjia`。
- 实测 YYB 手机号授权密文 + 新 code 调登录仍返回 `{"code":500,"msg":"系统繁忙，请稍后再试..."}`，疑似服务端校验手机号授权会话；脚本保持停用。
- 当前 token/签到链路无法线上验证。
