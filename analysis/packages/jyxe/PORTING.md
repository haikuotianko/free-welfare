# 旧衣小二（jyxe）迁移记录

## 基本信息

- 应用 key：`jyxe`
- 名称：旧衣小二
- AppID：`wx426d52c8130b8559`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\jyxe.js`
- 平台脚本：`data/apps/jyxe/scripts/sign-in.js`
- 应用清单：`data/apps/jyxe/app.json`
- API Base：`https://jiuyixiaoer.fzjingzhou.com`
- 一个 Run 只处理 `ctx.account`，不循环账号。

## AppID 说明（重要）

任务清单和 `docs/23-qlscript-integration.md` 里给 `jyxe` 写的 AppID 是
`wx3f0209cc35a953a4`，但该 AppID 实际属于同目录的 `jyk.js`（旧衣客，host
`jyk.scjyx.com`）。

`jyxe.js` 的契约注释、`MINI_APP_ID` 常量和实测记录（2026-08-19）都使用
`wx426d52c8130b8559`（host `jiuyixiaoer.fzjingzhou.com`）。平台取 code 必须用后者，
否则会拿到旧衣客的 code，登录一定失败。本应用清单按青龙脚本使用
`wx426d52c8130b8559`；需要同步修正任务清单/文档中的 AppID。

## 接口清单

所有请求都是 `POST` + `application/x-www-form-urlencoded`，token 放在 **body** 里，不放请求头。

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 微信登录/注册 | `POST /api/login/wxMiniProgramOauth` | 游客 token | form `{ code, phoneCode, token: wek2020123456788wek }`；`data.token` 为会话 token，`data.personInfo` 含 `score`、`sign_in_num`、`days`、`mobile` |
| 个人信息 / token 校验 | `POST /api/Person/index` | body `token` | `data.score` 为积分余额，`data.sign_in_num` 为今日签到次数，`> 0` 视为已签 |
| 每日签到 | `POST /api/Person/sign` | body `token` | 成功 `code === 1000` 且 `data == "1"`；重复签到 `{ code: 1001, msg: "今日已签到" }` |

响应信封：`{ code, msg, time, token, data }`。

- 成功码：`Number(code) === 1000`。
- 业务失败：`1001`；重复签到文案命中 `已签|已经签|签到过|重复|已完成|already`。
- 登录态失效：文案命中 `登录|token|未授权|未登录|失效|过期|重新`。

## 请求头 / 加密

无签名、无请求加密。请求头与青龙脚本一致：

```text
content-type: application/x-www-form-urlencoded
platform: MP-WEIXIN
Accept: application/json, text/plain, */*
User-Agent: Mozilla/5.0 (Linux; Android 12; M2012K11AC Build/SKQ1.220303.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.6998.136 Mobile Safari/537.36 MicroMessenger/8.0.48.2580(0x28003036) MiniProgramEnv/android
Referer: https://servicewechat.com/wx426d52c8130b8559/0/page-frame.html
xweb_xhr: 1
```

- 未登录时 body 里的 `token` 使用小程序写死的游客 token：
  `wek2020123456788wek`（来自解包 `f552` 模块的请求拦截器）。
- form 编码按青龙脚本实现：key 原样、value 用 `encodeURIComponent`。
- token 缓存在 `ctx.cache` 的 `auth` 键，TTL 7 天；只保存 token。
- 缓存 token 先用 `/api/Person/index` 校验，失效后清缓存重新走手机号授权登录。

## 注册 / 手机号

- 该登录接口**必须**带手机号授权 `phoneCode`。青龙脚本通过 wx_server
  `/wx/getphonenumber` 取 code；平台等价能力是 `ctx.yyb.getPhoneAuth({ appId })`。
- 平台实现流程：
  1. `ctx.yyb.getCode({ appId })` 取微信登录 code；
  2. `ctx.yyb.getPhoneAuth({ appId })` 取手机号授权 code（兼容 `code` / `authCode` /
     `data.code` / `raw.code` 几种返回形状）；
  3. `POST /api/login/wxMiniProgramOauth` 带 `code + phoneCode + 游客 token`；
  4. 按青龙脚本，该接口同时承担登录和首次注册；成功后缓存 `data.token`。
- 取不到手机号授权 code、服务端报 `phoneCode/手机号/授权/注册/绑定`、或登录未返回 token 时，
  抛 `ctx.manualRequired(..., { details: { action: 'register' } })`。
- 青龙脚本的 `jyxe_phone_login=0` 开关未迁移：平台没有 wx_server，关闭手机号授权无法首登；
  有缓存 token 时仍可正常签到，缓存失效后会转人工。

## 积分

- `data.personInfo.score`（登录响应）或 `/api/Person/index` 的 `data.score` 为积分余额。
- 签到成功后重新查一次 `Person/index`，用最新 `score` 调用
  `ctx.points.sync({ balance, estimated: false })`。
- 签到本身不返回余额；若签到后查询失败，使用签到前的 `score`。
- 返回 `data.days`（加入天数）和 `data.signInNum`（今日签到次数）作为辅助信息。

## 商品 / 券

- 青龙脚本没有商品、券或兑换列表接口。
- 因此未创建 `products.js`。

## 当前状态

- 代码：`node --check data/apps/jyxe/scripts/sign-in.js` 通过。
- 清单：`app.json` JSON 校验通过。
- 本地 mock 验证通过：手机号授权登录、form body 顺序/编码、签到成功、缓存 token 已签、缺少手机号授权转人工。
- `enabled: true`。
- 未连接真实 YYB/目标服务器联调（本机没有平台运行时的账号 ref / code）。

## 阻塞 / 风险

1. **AppID 冲突（必须先确认）**：`docs/23-qlscript-integration.md` 和任务清单写的是
   `wx3f0209cc35a953a4`，但那是旧衣客 `jyk` 的 AppID。本应用按青龙 `jyxe.js` 使用
   `wx426d52c8130b8559`；如果平台站点已按错误 AppID 导入，需要改回。
2. **手机号授权 code 兼容性未实测**：`ctx.yyb.getPhoneAuth` 返回的是平台 YYB 协议数据，
   目标服务端是否接受这份 `phoneCode` 未验证；被拒绝时会转人工注册。
3. **未实测**：没有真实账号跑过登录/签到；青龙脚本的实测记录是 2026-08-19，接口可能已变。
4. **登录链路烧手机号授权**：缓存 token 失效时才重新取手机号 code；如果服务端频繁判失效，
   会频繁请求手机号授权，可能触发 YYB 限流。
5. 未迁移青龙脚本的其它任务（金币、兑换、邀请），只做登录 + 每日签到 + 积分。
