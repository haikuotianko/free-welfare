# 老板电器 ROKI（roki）迁移说明

## 基本信息

- AppID：`wxba70fb8e3eb3aab9`
- 应用 key：`roki`
- 源脚本：`N:\myProject\QLScriptPublic\wxapp\roki.js`
- 平台脚本：`data/apps/roki/scripts/sign-in.js`
- 应用配置：`data/apps/roki/app.json`
- 解包目录：`analysis/packages/roki/unpacked`（主包 raw 解包 + KillWxapkg 子包解包，wxapkg 版本 530）
- 账号来源：平台 `ctx.account`（YYB 账号），不再读取青龙变量/本地 token 缓存文件
- 当前状态：已迁移，`node --check` 通过；用本地 mock 走通登录、签到、今日已签、缓存 token 失效重登、register 动作
- 是否启用：`enabled: true`

## 接口清单

域名：`https://aio.myroki.com/api/v1/mini-app`

### 登录

- `POST /user/login`
  - body：`{ "code": "<wx code>", "param": { "qr-code": "" } }`
  - 登录请求 `X-USER-TOKEN` 为空
  - 成功 `code=200`，返回 `data.token`、`data.aiToken`、`data.expireTime`
  - 成功码同时兼容 `0`

### 用户信息 / 签到状态

- `GET /user/profile`
  - 返回 `data.id`、`data.nickName`、`data.mobile`、`data.todayIsCheckIn`（0/1）、`data.points` / `data.memberPoints`
  - 用于校验缓存 token、判断今日是否已签到

### 签到

- `POST /user/check-in-record/check-in`
  - body：`{}`
  - `todayIsCheckIn` 为 1/true 时直接按今日已签处理，不重复请求

### 签到记录

- `GET /user/check-in-record/recent/record`
  - 返回 `data.consecutiveDays` / `continuousDays` / `days`，仅用于日志和 metrics

### 会员积分

- `GET /user/member/points`
  - 返回 `data.point`（小程序「我的积分」页面使用的字段）
  - 兼容 `data.points` / `data.availablePoints` / `data.totalPoints`，以及接口直接返回数字

### 注册 / 绑定手机号（来自解包）

- `PUT /user/setting/wx-bind-phone`
  - body：`{ "code": "<手机号授权 code>", "memberRegister": { ... } }`
  - `memberRegister` 来自 `app.js` 的 `handleLoginParams`：
    - `enrollMethod: "28"`、`recruitmentDepartment: "OPERATION"`
    - `registerShopName`、`registerGuide`、`marketingCenter`、`enrollDetail`、`scene`、`province`、`city`、`district` 均为空串
  - 仅当 `ctx.input.action === "register"` 且 `/user/profile` 没有 `mobile` 时调用
  - 成功后重新读取 `/user/profile`，必须能看到 `mobile` 才算注册完成

## 请求头与签名

```
User-Agent: Mozilla/5.0 ... MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF
Referer: https://servicewechat.com/wxba70fb8e3eb3aab9/454/page-frame.html
Accept: application/json, text/plain, */*
Content-type: application/json
X-App-Env: release
X-USER-TOKEN: <token，登录时为空>
app-id: roki_app
timestamp: <毫秒时间戳>
nonce: 1234567890123456
secret: 1234567890123456
signature: <encodeURIComponent(HMAC-SHA256(base64))>
app-version: 5000
```

- 签名串（按对象枚举顺序）：
  `aesEncryptSecret=1234567890123456&appId=roki_app&nonce=1234567890123456&secret=ee8694419924a22f04ac0e01368683521daa659f&timestamp=<ms>`
- `signature = encodeURIComponent(hmacSha256Base64(签名串, SIGN_SECRET))`
- 只使用 `ctx.crypto.hmac`，没有 AES 报文加密；`aesEncryptSecret` 只是签名串的一部分。
- 成功码：`200` / `0`；token 失效：`401`、`10001` 或消息命中 token/登录/授权/unauthorized。
- HTTP 非 200 直接按失败处理。

## 缓存

- key：`auth`
- 内容：`{ token, aiToken, expireTime, userId, updatedAt }`
- TTL：7 天
- `expireTime` 是服务端返回的毫秒时间戳；过期前 60 秒不再使用缓存
- 缓存 token 用 `/user/profile` 校验；失效后清缓存、重新取 code 登录

## 积分 / 商品

- 积分：签到后在 `/user/member/points` 读取 `data.point`，写入 `ctx.points.sync({ estimated: false })`
- `products.js`：未新增。
  - 「积分商城」在小程序里跳外部 H5 `https://ca.rrx.cn/v/4juamc?mwa=1`，没有可确认的积分商品列表接口
  - 小程序商城 `/goods/*` 和会员优惠券 `/user/member/coupon/user/list` 是现金商城/优惠券，不是积分商品列表，未接

## 阻塞项 / 待验证

- 没有真实 YYB 账号做线上联调；本次只做了本地 mock（登录、签到、已签、缓存失效重登、register 动作）。
- `PUT /user/setting/wx-bind-phone` 的 `memberRegister` 还依赖真实定位/渠道信息；脚本使用解包里的默认值（enrollMethod=28、OPERATION，其余空串），服务端是否接受未验证。若绑定失败会抛 `manualRequired(action=register)`。
- 未绑定手机号的账号仍可尝试签到（与青龙脚本一致），但会员积分可能不可用；需要注册时执行 register 动作。
- 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
