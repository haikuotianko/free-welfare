# 洽洽会员俱乐部（qqhyjlb）迁移记录

## 基本信息

- 应用 key：`qqhyjlb`
- 名称：洽洽会员俱乐部
- AppID：`wxc72491b6cd007333`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\qqhyjlb.js`
- 解包来源：`%APPDATA%\Tencent\xwechat\radium\users\e9c7432ed37e6090dde819f8e5e4d21a\applet\packages\wxc72491b6cd007333\550`
- 平台脚本：
  - `data/apps/qqhyjlb/scripts/common.js`（登录/会话/请求）
  - `data/apps/qqhyjlb/scripts/sign-in.js`
  - `data/apps/qqhyjlb/scripts/products.js`
- 应用清单：`data/apps/qqhyjlb/app.json`

## 接口清单

### 两段登录

1. mobile 登录（拿 SESSION）
   - `POST https://qq-tasting-hall.qiaqiafood.com/mobile/wechat/login`
   - Form：`code`、`userId=c10cff02123a9e2697d875262612399d`
     - 这个 `userId` 是解包 `utils/zhangchu.js` 里的商户/小程序 ID（`wx.getExtConfigSync().userId` 的线上兜底），不是用户 ID。
   - Header：`content-type: application/x-www-form-urlencoded; charset=UTF-8`、`from_env: app`、Referer、User-Agent。
   - 响应：`{ status: "0", data: { customer } }`，并从 `Set-Cookie` 提取 `SESSION`。
   - `status != 0` 且 msg 匹配「用户状态不可用/不可用/未注册/未激活」= 该微信号未在 mobile 侧激活。

2. upms 登录（拿 token + loginId）
   - `POST https://vip.qiaqiafood.com/upms/wechat/login/code`
   - Form：`code`、`tenantId=1`、`appId=wxc72491b6cd007333`、`componentAppId=wxc72491b6cd007333`
   - Header：同上，另带 `Authorization`（可能为空）。
   - 响应：`status: "0"`，`data.data`（或 `data`）里取 `token`、`loginId`、`account.loginId`。

### 业务请求

- 基址：`https://vip.qiaqiafood.com`
- Form body 在业务参数外追加：`uid=<loginId>`、`tenantId=1`。
  - 解包 `utils/request.js` 的请求拦截器就是 `data.uid = wx.getStorageSync("loginId")`；
    青龙脚本里字段名写作 `userId`，实际应使用 `loginId`，本移植按解包结果修正。
- Header：`Cookie: SESSION=<mobile session>`、`Authorization: <token>`、`from_env: app`、Referer、User-Agent。
- 成功码：`status === "0"`；`status === "-2"` 为登录失效。

### 注册（未激活账号）

解包 `qiaqia/pages/register/register`：

1. `POST /upms/wechat_user/updateBase`
   - Form：`code=<手机号授权 code>`，加 `uid`、`tenantId`。
   - 手机号授权按钮走的就是这个接口；`code` 来自 `wx.getPhoneNumber`。
2. `POST /vip/member/register`
   - Form：`channel=`（空），加 `uid`、`tenantId`。
   - 成功 `status: "0"`；msg 含「已注册」按成功处理。

本移植用 `ctx.yyb.getPhoneAuth({ appId })` 取手机号授权 `code`，先 `updateBase` 再 `register`，
然后重新走两段登录。SMS 验证码路径（`/upms/wechat_user/updatePhoneBySms`）不实现，避免需要人工短信码。

注册只在用户触发 `ctx.input.action === "register"`（平台“一键注册”）时执行；
普通定时签到发现未注册会抛 `ctx.manualRequired(..., { details: { action: "register" } })`，
不会在定时任务里静默消耗手机号授权。

### 签到

- `POST /vip/member/listUserSignLog`
  - Form：`yearMonth=YYYY-MM`、`tenantId=1`
  - 响应：`data` 为数组，元素含 `dayMonth`、`continueDays`。
  - 用 `String(dayMonth) === String(今天)` 判断当天是否已签（服务端可能返回数字或字符串）。
- `POST /vip/member/sign`
  - Form：`channel=`（空）、`tenantId=1`
  - 成功：`status === "0"`，`data.point` / `data.value` 为本次获得积分。
  - 重复：msg 匹配 `已签到|每天只能签到一次|重复|今日已`。

### 积分

- `POST /vip/member/getVipExtInfo`
  - Form：`tenantId=1`
  - 响应 `data` 含 `point`（当前积分）、`vipLevel`、`vipId` 等。
  - 签到后重新查询并用 `point` 同步。

### 积分商品

`products.js` 只读同步，不做兑换。

- `POST /mall/spu/search`
  - Form：`pageSize=10`、`page=1..n`、`asc=false`、`groupId=`、`tenantId=1`、`uid=`
  - 该接口实测**无需登录**即可返回积分商品目录；`products.js` 直接请求，不依赖 mobile/upms 会话。
  - 响应：`{ status:"0", data:[...], count, page, pageSize }`
  - 分页拉取，最多 20 页；如果 `count` 表明还有数据但没拉完，本次直接失败，不做“删除缺失商品”的同步。
  - 列表字段（解包 `qiaqia/components/points-goods` 确认）：
    - `id`、`title`、`headImg`、`pointsPrice`、`salePrice`、`stockNum`、`vipLevel`
  - 映射：
    - `externalId = id`
    - `name = title`
    - `pointsCost = pointsPrice`
    - `cashCost = salePrice`（0 视为 null）
    - `stock = stockNum`（缺省时累加 `skus[].stockNum`）
    - `status = stock > 0 ? on_sale : sold_out`
    - `limitPerUser = limitConfig.limitQuantity`（如有）
  - 只同步 `pointsPrice > 0` 的商品，`ctx.products.sync(..., { deactivateMissing: true })`。

## 请求头 / 加密

- 无自建签名；解包中的 SHA256 只用于埋点，不参与业务接口。
- 通用头：
  - `content-type: application/x-www-form-urlencoded; charset=UTF-8`
  - `User-Agent`：Windows MicroMessenger 7.0.20
  - `Referer`：`https://servicewechat.com/wxc72491b6cd007333/516/page-frame.html`
  - `from_env: app`
- 登录后业务请求：
  - `Cookie: SESSION=<...>`
  - `Authorization: <upms token>`
- 成功码：`status === "0"`；登录失效：`status === "-2"`。

## 已实现逻辑

`sign-in.js`：

1. `checkRegistered()`：优先用缓存 `SESSION` + `token` 校验 `/vip/member/getVipExtInfo`。
2. 缓存失效则重新两段登录；mobile 登录返回未注册，或 `getVipExtInfo().vipLevel` 缺失时，
   普通签到抛 `manualRequired`（action=register）；只有 `ctx.input.action === "register"`
   时才用手机号授权注册，然后重新登录。
3. 查当月签到记录，判断今天是否已签。
4. 未签则 `POST /vip/member/sign`；重复签到按 `alreadyDone` 处理。
5. 查 `getVipExtInfo` 取积分并 `ctx.points.sync`。
6. 遇到 `status=-2` 自动清缓存、重登并重试一次。

`products.js`：

1. 直接 `POST /mall/spu/search`（公开接口，不依赖登录/注册）。
2. 分页拉取积分商品（pageSize=10，最多 20 页）。
3. 映射并 `ctx.products.sync`，只读，不兑换。

## 当前状态

- 代码：已写入，`node --check` 通过。
- 签到脚本：`enabled: true`。
- 商品脚本：`enabled: true`。
- 商品接口 `/mall/spu/search` 已用公开请求实测（2026-11-16）：`pageSize=20` 返回 5 个积分商品。
- 签到链路未做实网联调（本机没有平台运行时的 YYB code / 账号 ref）。

## 阻塞 / 风险

1. **注册路径未实测**：`/upms/wechat_user/updateBase` 需要 YYB 返回的**手机号授权 code**
   （`wx.getPhoneNumber` 的 `code`）。普通签到只抛 `ctx.manualRequired(..., { details: { action: "register" } })`；
   用户点击“一键注册”后才会调用 `getPhoneAuth`。如果目标服务端拒绝该 code，注册会失败并同样抛
   `manualRequired`。这种情况下应把 `app.json` 的签到脚本置为 `enabled: false`，
   让用户先在小程序内手动完成手机号登录/注册。
2. 老账号（已在洽洽 mobile 侧激活）不依赖注册路径，可正常签到。
3. 青龙脚本的 `mobilePost` 用 `userId` 作为 `uid`；解包确认小程序实际用 `loginId`。
   本移植按 `loginId` 发送，若服务端对老账号返回的 `loginId` 与历史 `userId` 不一致，需要以实际响应为准。
4. `/vip/member/getVipExtInfo` 在未注册时可能仍返回 `status=0` 但无 `vipLevel`；
   脚本同时使用 mobile 登录的「用户状态不可用」和 `getVipExtInfo` 缺少 `vipLevel` 作为未注册信号。
5. 积分商品列表字段来自解包组件；若服务端改字段，`products.js` 会同步 0 条并可能把旧商品下架，
   首次上线建议先看一次运行日志再开定时。
