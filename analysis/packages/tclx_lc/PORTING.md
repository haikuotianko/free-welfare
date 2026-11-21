# 同程旅行里程（tclx_lc）迁移说明

## 基本信息

- 应用 key：`tclx_lc`
- 名称：同程旅行里程
- AppID：`wx336dcaf6a1ecf632`
- 源脚本：`N:\myProject\QLScriptPublic\wxapp\tclx_lc.js`
- 平台脚本：`data/apps/tclx_lc/scripts/sign-in.js`
- 应用配置：`data/apps/tclx_lc/app.json`
- 账号来源：平台 `ctx.account`（YYB 账号），一个 Run 只处理一个账号
- 解包目录：无（签到任务分包无法还原，未依赖缓存包）
- 当前状态：已迁移，`node --check` 通过，本地 mock 走通登录、签到、重复签到、里程余额同步；未做真实账号联调
- 是否启用：`enabled: true`

## 接口清单

域名：`https://wx.17u.cn`、`https://tcmobileapi.17usoft.com`

### 登录

`POST https://wx.17u.cn/wechatappapi/wxUser/login`

- body：`{ code, scene: 1001 }`
- 请求头：`content-type: application/json` + 通用 UA / Accept
- 成功：HTTP 200 且 `content.openId` 存在
- 登录结果：`content.{ openId, memberId, sectoken, encryOpenId, aesOpenId, unionId, aesUnionId }`

### 签到日历

`POST https://wx.17u.cn/wxmpsign/sign/signCalendar`

- body：`{ beginDate, endDate }`，日期取今天前后各 2 天（共 5 天）
- 成功：`data.{ canSign, today, todaySigned, dateInfo[{ date, mileage, isSigned }] }`

### 签到状态

`POST https://wx.17u.cn/wxmpsign/sign/getSignInfo`

- body：`{}`
- 返回：`data.{ todaySigned, canSign, signMileage, signDays, periodContinuedSignDays, tomorrowMileage }`
- 用于签到前幂等预检，签到后再次调用复核

### 签到

`POST https://wx.17u.cn/wxmpsign/sign/saveSignInfo`

- body：`{}`
- 成功码：`code === 200`（严格等于数字 200，保留源脚本判断）
- 成功后再次调用 `getSignInfo`，`data.todaySigned` 为真才算成功

### 里程余额

`POST https://tcmobileapi.17usoft.com/mallgatewayapi/userApi/mileages/remain`

- body：`{ osType: 2 }`
- 额外请求头：`TC-MALL-DEPT-CODE: iH3PGf9ZucSMMEYi4keylA==`、`TC-MALL-CLIENT: API_CLIENT`、`TC-MALL-OS-TYPE: Android`
- 返回：`data.{ remainMileageTitle, memberGrade, exchangeRate }`
- `remainMileageTitle` 可能是带千分位 / 单位的字符串，脚本提取其中的数字后同步为里程余额

## 请求头

登录、签到接口：

```text
content-type: application/json
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
            (KHTML, like Gecko) MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF
Accept: application/json, text/plain, */*
```

登录后所有业务请求额外带：

```text
apmat: <openId>|<UTC YYYYMMDDHHmm>|<0-999999 随机数>
TCSecTk: <sectoken>
TCxcxVersion: 10.8.7
platform: WX_MP
osType: 2
secToken: <sectoken>
TC-MALL-PLATFORM-CODE: WX_MP
TC-MALL-USER-TOKEN: <sectoken>
```

`apmat` 的时间部分沿用源脚本的 `toISOString().slice(0, 16)`（UTC），未改成本地时间。

## 加密 / 签名

- 无签名、无加密
- `sectoken` 仅来自登录响应，放在 `TCSecTk`、`secToken`、`TC-MALL-USER-TOKEN`
- 成功 / 失败判断完全沿用源脚本：
  - `saveSignInfo.code === 200`
  - `getSignInfo.data.todaySigned` 复核
  - `info.canSign === 0 && cal.canSign === 0` 视为当前不可签到，返回 `ok: false`

## 登录与缓存

- 每次 Run 使用 `ctx.yyb.getCode({ appId })` 取新 code 登录
- 源脚本不缓存 `sectoken`，平台脚本也不缓存：登录接口轻量，且 code 登录比长期缓存更可靠
- 登录失败抛错；没有注册流程，也不需要 `manualRequired`

## 签到流程

1. 取 code 登录，保存 `openId` / `memberId` / `sectoken`
2. 查询 5 天签到日历 + 签到状态
3. 已签到（`todaySigned` / 日历 `todaySigned` / 当天 `isSigned`）直接返回 `alreadyDone: true`
4. 两边都 `canSign === 0` 时返回 `ok: false`，提示在小程序内查看活动状态
5. 提交签到，`code === 200` 后再次查状态，`todaySigned` 为真才返回成功
6. 查询里程余额，数字有效时调用 `ctx.points.sync({ balance, estimated: false })`

签到奖励里程取当天日历 `dateInfo[].mileage`，回退到状态里的 `signMileage`；`tomorrowMileage`、连续天数仅作为提示和 `data` 返回。

## 积分 / 商品

- `pointsName`：里程
- 余额来源：`mileages/remain.data.remainMileageTitle`
- `ctx.points.sync` 仅在提取到有效数字时调用
- 未新增 `products.js`：源脚本没有商品 / 优惠券列表接口

## 验证情况

- `node --check data/apps/tclx_lc/scripts/sign-in.js` 通过
- `app.json` JSON 解析通过
- 本地 mock 覆盖：
  - 登录 -> 日历 -> 状态 -> 签到 -> 复核 -> 里程余额 -> 同步 1234
  - 已签到分支不调用 `saveSignInfo`，但仍同步里程余额
  - 里程字符串 `"1,234"` 能解析为数字
  - 请求头 `TCSecTk` / `TC-MALL-USER-TOKEN` / `TC-MALL-DEPT-CODE` 与源脚本一致
- 未使用真实 YYB / 同程账号联调

## 阻塞项 / 待验证

1. 源脚本明确说明：签到后的任务中心位于分包 `page/AC/sign/`，分包反编译后为空壳，任务中心接口无法还原。本迁移只做每日签到 + 里程查询，不实现任务中心，也不盲猜接口。
2. 签到 `saveSignInfo` 的成功判断严格使用 `code === 200`，若服务端改为字符串 `"200"` 会被判失败；这是保留源脚本行为。
3. `canSign` 判断严格使用数字 `0`；若接口返回字符串 `"0"` 不会触发“不可签到”分支，仍会尝试提交签到（保留源脚本行为）。
4. 未做真实账号联调，接口字段和 host 可能变化。
5. 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
