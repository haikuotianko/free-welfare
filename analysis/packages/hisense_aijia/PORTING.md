# 海信爱家（hisense_aijia）迁移说明

## 基本信息

- 应用 key：`hisense_aijia`
- 名称：海信爱家
- AppID：`wxf488d623a17cd7b5`
- 源脚本：`N:\myProject\QLScriptPublic\wxapp\hisense_aijia.js`
- 平台脚本：`data/apps/hisense_aijia/scripts/sign-in.js`
- 应用配置：`data/apps/hisense_aijia/app.json`
- 账号来源：平台 `ctx.account`（YYB 账号），一个 Run 只处理一个账号
- 解包目录：无（按要求未依赖缓存的小程序包）
- 当前状态：已迁移，`node --check` 通过，使用本地 mock 走通新登录、签到、token 失效刷新重登、已签到、未授权转人工；未做真实账号联调
- 是否启用：`enabled: true`

## 接口清单

### 登录（主链路，手机号授权）

`POST https://public-wxtv.hismarttv.com/weixintv/oauth/login4MiniAPPByPhone`

- 签名方式：`WEB_CN`（body 内 `sign` + `appKey`）
- body：
  - `deviceId`：`FEATURE_CODE + 32 位设备串`，每次 Run 重新生成
  - `phoneCode`：YYB 手机号授权 code
  - 或 `iv` + `loginCode` + `encryptedData`（YYB 返回加密数据时，用 `ctx.yyb.getCode` 取 loginCode）
  - `miniId: "105"`
  - `sid`：UUID
- 成功：HTTP 200、`resultCode === 0`、`data.token` 存在；同时取 `customerId`、`refreshToken`
- 失败：`data.errorDesc` / `errorDesc` / `message`，转为 `ctx.manualRequired(..., { details: { action: 'register' } })`

### 刷新 token

`POST https://mini-mobi.hismarttv.com/MobileMiniAppAPI/1.2/adapter/refreshToken`

- 无签名
- body：`{ token, refreshToken }`
- 成功：HTTP 200、外层 `resultCode === 0`、`data.data.resultCode === 0`、`data.data.token`
- 原脚本同时要求外层和嵌套 `resultCode`，此处保留该判断

### loginKey 备用登录

- `POST https://portal-account.hismarttv.com/mobile/s/quickLogin`
  - 签名：`WEB_CN_GW`（header `X-Sign-For` + `appKey`）
  - body：`serverCode: 9006`、`requestSource: 2`、`qrCodeFlag: 0`、`accCategory: "newminihxaj"`、`termType: "1"`、`loginKey`、`sid`
  - 成功：HTTP 200、`data.data.resultCode === 0`、`data.data.tokenInfo.token`
- `GET https://portal-account.hismarttv.com/mobile/st/getLoginKey?accessToken=...&keyType=1`
  - 签名：`WEB_CN_GW`
  - 成功：HTTP 200、`data.data.resultCode === 0`、`data.data.loginKey`

### 用户资料

`GET https://mobile-aiot.hismarttv.com/MobileMiniAppAPI/s/6.3/account/getCustomerProfile`

- 签名：`WEB_CN_GW`
- query：`_t`、`accessToken`、`timeStamp`（秒）、`customerId`、`randStr`（无连字符 UUID）
- 成功：`resultCode === 0`；`data.mobilePhone` 为 AES 密文，解密后仅写入缓存，不输出日志
- 失败：token 类错误抛 `SessionExpiredError`，其他错误只记录 warning（与源脚本一致）

### 积分

- `POST https://mobile-aiot.hismarttv.com/AIoTPointsMall/gw/svc/HiScore/1.0/userPoints`
  - 签名：`WEB_CN_GW`
  - 公共参数：`customerId`、`mobile`（AES 加密）、`accessToken`、`appType: "105"`
  - 成功：`resultCode === 0`，`data.totalScore` 为总积分
- `POST https://mobile-aiot.hismarttv.com/AIoTPointsMall/gw/svc/HiScore/1.0/userPointRecords`
  - body：`pageNo: "1"`、`pageSize: "100"`、`startTime`、`endTime`
  - 成功：`resultCode === 0`；源脚本额外容忍 `data.resultCode === "B0306"`，此处保留
  - 今日收入按 `type === 1` 的 `score` 求和，仅用于日志 / `metrics.todayIncome`

### 签到任务与签到

- `GET https://public-wxtv.hismarttv.com/vodapptv/5.10/sceneParams/data/get`
  - query：`accessToken`、`type: 2`、`sceneCode: "STATIC_AILIFE_SIGN_INFO"`
  - 无签名（源脚本 `signType: "NONE"`）
  - 成功：`resultCode === 0`，从 `pageParams` / `data` 中解析 `mpSignInfo.taskId`
  - 支持平台环境变量 `hisense_aijia_sign_task_id` 覆盖解析结果
- `POST https://mobile-aiot.hismarttv.com/AIoTPointsMall/gw/svc/HiVip/1.0/getCheckInStatus`
  - 签名：`WEB_CN_GW`
  - body：`taskId`、`sourceType: 21`
  - 成功：`code === 0`，`checkInStatus.signedToday` / `keepSigningDays` / `rewardSignTaskList`
- `POST https://mobile-aiot.hismarttv.com/AIoTPointsMall/gw/svc/HiVip/1.0/checkIn?customerId=...`
  - 签名：`WEB_CN_GW`，query 带 `customerId`
  - body：`returnCheckInStatus: false`、`requestId: "ailife_sign-<毫秒>-<hex>"`、`taskId`、`reportToGroup: 1`、`requestTime: "<毫秒>"`
  - 成功：`code === 0`
  - 重复签到消息命中 `已签 / 重复 / today` 时按 `alreadyDone: true` 处理
  - 奖励类型不是 `130`（积分）时按源脚本跳过签到，返回提示，不提交签到

## 请求头与签名 / 加密

通用请求头：

```text
Accept: */*
content-type: application/json
User-Agent: Mozilla/5.0 MicroMessenger MiniProgramEnv/Windows
Referer: https://servicewechat.com/wxf488d623a17cd7b5/115/page-frame.html
```

所有请求都会注入 `_t = Date.now()`；为空 / null / NaN 的字段会被清理。

签名常量：

```text
appKey   = commonweb
appSecret = MORZRbkuiWxjp+SM4vR_GxY4pZxLZ6rn
```

签名算法（与原脚本一致）：

- `WEB_CN_GW`：
  - GET：参数按键名排序成 `k=v&k=v` 后拼接 secret
  - POST JSON：`JSON.stringify(payload)` 后拼接 secret
  - `sign = base64(md5(text + secret))`
  - 放到请求头 `X-Sign-For`，同时带 `appKey: commonweb`
- `WEB_CN`：
  - 同样计算 `sign`，写入 body 的 `sign` 字段，再写入 `appKey`
- 使用 `ctx.crypto.md5` 计算摘要，再 `Buffer.from(hex, 'hex').toString('base64')` 转 base64

手机号加密（`mobile` 字段）：

- AES-256-CBC，PKCS7
- key：secret 的 UTF-8 字节（32 字节）
- iv：secret 前 16 个字符的 UTF-8 字节
- 输出 base64
- 使用 `ctx.crypto.aesEncrypt` / `aesDecrypt`，已与 Node `crypto.createCipheriv` 结果对照一致

成功 / 失效判断：

- 用户、积分、编排接口：`resultCode === 0`
- 签到状态、签到：`code === 0`
- token 失效码：`A00001`、`B0101`、`B0102`、`401`，或响应文本命中 `token / 登录 / 未登录 / 失效 / access`
- 登录态失效时清缓存，按 `refreshToken -> loginKey -> 手机号授权` 顺序重登并重试一次

## 缓存

- 缓存 key：`auth`（平台按账号隔离）
- 内容：`customerId`、`accessToken`、`refreshToken`、`loginKey`、`phone`、`updatedAt`
- TTL：7 天
- 登录 / 刷新成功后会调用一次原脚本已定义但未调用的 `getLoginKey`，把 `loginKey` 写入缓存，作为 refreshToken 失效后的备用凭证；失败只告警
- 青龙脚本中的直接 `customerId#accessToken` / JSON 配置未迁移：平台账号只提供 YYB ref，首次运行必须能拿到手机号授权；之后依赖缓存与 refreshToken
- 源脚本的 `hisense_aijia_customerId` / `hisense_aijia_token` / `hisense_aijia_refreshToken` / `hisense_aijia_loginKey` 环境变量未迁移

## 积分 / 商品

- 积分：`userPoints.data.totalScore`，签到前后各查一次，签到后查询失败时使用签到前余额
- 同步：`ctx.points.sync({ balance, estimated: false })`，仅当 `totalScore` 为有效数字
- 未新增 `products.js`：青龙脚本没有商品 / 优惠券列表接口，只有积分、签到和场景编排接口

## 验证情况

- `node --check data/apps/hisense_aijia/scripts/sign-in.js` 通过
- `app.json` JSON 解析通过
- 本地 mock 覆盖：
  - 新账号：手机号授权 code -> 登录 -> getLoginKey -> 资料 -> 积分 -> 今日记录 -> 签到任务 -> 状态 -> 签到 -> 积分
  - 缓存 token 失效：资料返回 `A00001` -> refreshToken 成功 -> 重试 -> 已签到 -> 同步余额
  - 手机号授权不可用：抛 `manualRequired(action=register)`
  - 已签到：不重复提交签到
- 签名与 AES 结果已和原脚本使用的 Node crypto 实现逐项对照一致
- 未使用真实 YYB / 海信账号联调

## 阻塞项 / 待验证

1. 首次登录依赖 `ctx.yyb.getPhoneAuth({ appId })` 返回 `phoneCode`（或 `encryptedData + iv`）。如果 YYB 侧不支持该小程序的手机号授权，会转 `manualRequired(action=register)`，需要先在小程序内完成手机号授权/注册。
2. 平台账号模型不提供青龙里的 `customerId#accessToken` / `loginKey` 手动配置，首次运行无法直接注入已有 token；后续运行依赖 7 天缓存和 refreshToken。
3. refreshToken 成功条件保留了源脚本的“外层与嵌套 resultCode 都为 0”。若服务端只返回其中一层，会按源脚本逻辑视为刷新失败并回退到 loginKey / 手机号登录。
4. 未做真实账号联调，接口字段、签名和活动 taskId 可能随小程序版本变化。
5. 任务 ID 默认识别 `STATIC_AILIFE_SIGN_INFO`；若活动编排调整，需要重新确认 sceneCode 或通过 `hisense_aijia_sign_task_id` 覆盖。
6. 未新增商品同步；源脚本没有可确认的积分商品 / 券列表接口。
7. 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
