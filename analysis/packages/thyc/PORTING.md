# 途虎养车（thyc）迁移说明

## 基本信息

- 应用 key：`thyc`
- 名称：途虎养车
- AppID：`wx27d20205249c56a3`
- 源脚本：`N:\myProject\QLScriptPublic\wxapp\thyc.js`
- 平台脚本：`data/apps/thyc/scripts/sign-in.js`
- 应用配置：`data/apps/thyc/app.json`
- 账号来源：平台 `ctx.account`（YYB 账号），一个 Run 只处理一个账号
- 解包目录：无（按要求未依赖缓存的小程序包）
- 当前状态：已迁移，`node --check` 通过，本地 mock 走通静默登录、签到、缓存 token 失效重登、未注册转人工；未做真实账号联调
- 是否启用：`enabled: true`

## 接口清单

域名：`https://cl-gateway.tuhu.cn`

### 静默登录

`POST /cl-user-auth-login/login/authSilentSign`

- body：`{ channel: "WXAPP", code }`
- 请求头不带 `Authorization`
- 成功：`code === 10000`，`data.userSession` 为后续 token
- 同时返回 `data.nickName`
- 源脚本说明：`authSilentSign` 通常任意微信 code 都能自动建号，无需明文 openid / unionid

### 签到状态

`POST /cl-common-api/api/member/getSignInInfo`

- body：`{ channel: "WXAPP" }`
- 请求头：`Authorization: Bearer <userSession>`
- 成功：`code === 10000`
- 返回：`data.signInStatus`（是否已签）、`data.userIntegral`（积分）

### 签到

`POST /cl-common-api/api/dailyCheckIn/userCheckIn`

- body：`{ channel: "WXAPP" }`
- 请求头：`Authorization: Bearer <userSession>`
- 成功：`code === 10000`
- 返回：`data.rewardIntegral`（本次奖励积分）、`data.continuousDays`（连续签到天数）
- 重复签到消息命中 `已签 / 签到过 / 重复 / 已完成` 时按 `alreadyDone: true` 处理

## 请求头

```text
Host: cl-gateway.tuhu.cn
Connection: keep-alive
xweb_xhr: 1
distinct_id: <每次 Run 随机 UUID>
currentPage: memberMallPackage/pages/pointCenter/pointCenter
deviceId: <毫秒时间戳>-<7 位随机数字>-0f6cb850fc64da-24853921
authType: oauth
api_level: 2
vehicleClass: CAR
channel: wechat-miniprogram
Content-Type: application/json
fingerprint: sMPVY<秒级时间戳>QPV2wLVhl8f
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
            (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36
            MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI
            MiniProgramEnv/Windows WindowsWechat/WMPF
version: 7.62.8
Accept: */*
Sec-Fetch-Site: cross-site
Sec-Fetch-Mode: cors
Sec-Fetch-Dest: empty
Referer: https://servicewechat.com/wx27d20205249c56a3/1319/page-frame.html
Accept-Language: zh-CN,zh;q=0.9
```

- 登录接口不设置 `Authorization`，其余接口设置 `Authorization: Bearer <userSession>`
- 设备指纹字段每次 Run 重新生成，不复用源脚本作者的固定值

## 加密 / 签名

- 无签名、无加密
- 成功码统一为 `code === 10000`
- 登录态失效判断：响应文本命中 `token / 登录 / 未授权 / 失效 / 过期 / 未登录 / 鉴权 / 401`
- 签到状态查询失败且命中登录态错误时，清缓存、重新取 code 登录并重试一次

## 缓存

- 缓存 key：`auth`（平台按账号隔离）
- 内容：`{ token, nickname, updatedAt }`
- TTL：7 天
- 优先使用缓存 token；签到状态接口发现失效后清缓存并重新登录

## 注册 / 未激活

- 源脚本注释说明 `authSilentSign` 通常会自动建号
- 如果登录返回 `code === 10000` 但没有 `data.userSession`，按“该微信号未注册 / 未激活途虎养车”处理：
  - 抛 `ctx.manualRequired(..., { details: { action: 'register' } })`
  - 提示先在小程序内登录一次
- 如果登录返回其他 code 且消息命中 `未注册 / 未激活 / 注册`，同样转人工注册；否则抛普通 API 错误

## 签到流程与积分

1. 使用 `ctx.yyb.getCode({ appId })` 取 code
2. 调用 `authSilentSign` 换 `userSession`，写入 `auth` 缓存
3. 调用 `getSignInInfo` 查询签到状态与积分
4. 已签到直接返回 `alreadyDone: true`，余额取 `userIntegral`
5. 未签到调用 `userCheckIn`
6. 成功后再次调用 `getSignInInfo` 获取最新积分；若查询失败，用签到前积分 + `rewardIntegral` 估算，并标记 `estimated: true`
7. 有效数字余额调用 `ctx.points.sync({ balance, estimated })`

`pointsName`：积分。

## 商品 / 券

- 青龙脚本只有登录、签到状态、签到三个接口
- 未新增 `products.js`：没有可确认的商品 / 优惠券列表接口

## 验证情况

- `node --check data/apps/thyc/scripts/sign-in.js` 通过
- `app.json` JSON 解析通过
- 本地 mock 覆盖：
  - 新账号：登录 -> 查询未签（100 积分）-> 签到 +10 -> 复查（110 积分）-> 同步 110
  - 缓存 token 失效：`getSignInInfo` 返回 `code=401` -> 清缓存重新登录 -> 签到成功
  - 登录无 `userSession`：抛 `manualRequired(action=register)`
  - 登录请求不带 Bearer，业务请求带 `Bearer <session>`
- 未使用真实 YYB / 途虎账号联调

## 阻塞项 / 待验证

1. 未注册 / 未激活的微信号无法自动完成注册：需要先在小程序内登录一次，脚本会转 `manualRequired(action=register)`。
2. 未做真实账号联调；设备指纹字段使用随机值，服务端未验证其格式（与源脚本一致）。
3. 签到成功后复查积分是平台脚本新增的一次同接口调用（仍为 `getSignInInfo`）；查询失败时余额为“签到前 + 奖励”的估算值，`ctx.points.sync` 会标记 `estimated: true`。
4. 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
