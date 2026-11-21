# 战马能量星球（zhanma）迁移记录

## 基本信息

- 应用 key：`zhanma`
- 名称：战马能量星球
- AppID：`wx94dca6ef07a54c55`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\zhanma.js`
- 解包来源：`%APPDATA%\Tencent\xwechat\radium\users\e9c7432ed37e6090dde819f8e5e4d21a\applet\packages\wx94dca6ef07a54c55\182\__APP__.wxapkg`
  - SDK：`vendor/wafer2-client-sdk`（`config/config.js`、`lib/constants.js`、`lib/login.js`、`lib/session.js`）
- 平台脚本：
  - `data/apps/zhanma/scripts/common.js`（请求层 / 登录 / 任务）
  - `data/apps/zhanma/scripts/sign-in.js`
  - `data/apps/zhanma/scripts/products.js`
- 应用清单：`data/apps/zhanma/app.json`

## 接口清单

基址：`https://warhorsechina.cojoy.com.cn/app/api`

### 登录 / 注册

青龙脚本直接用环境变量里的 `safe`，没有登录流程。平台侧根据解包 SDK 补上登录：

1. `POST /wxlogin`
   - 请求头：`X-WX-Code: <wx.login code>`、`CUSTOMAPPID: wx94dca6ef07a54c55`、`X-WX-Encrypted-Data`、`X-WX-IV`（后两个可为空）。
   - JSON：`{ profile: {} }`
   - 响应：`{ status: "ok", desc: { data: { f1safe, skey, expire, type } } }`
   - `f1safe` 即后续 `custom/*` 的 `safe`；登录响应同时返回 `skey`（解包 SDK 用它做自定义请求头，平台脚本仍保留青龙固定值，见下）。
   - 无效 code 实测返回 `{"status":"error","desc":"登录失败"}`。
2. `POST /wxphonelogin`（兜底）
   - 请求头：`X-WX-Code`、`X-WX-Encrypted-Data`、`X-WX-IV`（来自 `ctx.yyb.getPhoneAuth({ appId })`）。
   - JSON：`{ profile: {} }`
   - 与解包登录页“手机号快捷登录”一致；用于微信 code 登录被拒时的注册/绑定手机号兜底。
   - 未实测成功；YYB 不返回 `encryptedData/iv` 时直接跳过。
3. `wxreg` 在 SDK 里定义但页面未使用，视为废弃接口，不调用。

### 用户 / 能量

- `GET /custom/getusercenter?safe=<safe>`
  - 成功：`status=1`，字段 `nickname`、`nowscore`、`isgzhkl`、`isinfo`、`headimgurl` 等。
  - 能量余额取 `nowscore`。
  - `safe` 失效：`{"status":"necessaryloginerror","msg":"需要登录"}`。
- `GET /custom/getuserinfo?safe=<safe>`
  - 成功：`status=1`，`tel` 为账号已绑定手机号。
  - 只用于完善资料，**绝不使用 `safe=-1`**；实测 `safe=-1` 会命中服务端默认用户，可能读到他人资料。

### 签到 / 日常任务

- `GET /custom/checkin?safe=<safe>`
  - 成功：`status=1`，`msg`，`checkscore`（本次能量）。
  - 重复：`status=0`，`msg` 含「已签到 / 今日已签」。
- `GET /custom/gzhkl?safe=<safe>&kl=有能量 当燃战马！`
- `GET /custom/saveuserinfo?safe=<safe>&avatar=&nickname=&uname=&sex=&birthday=&tel=`
- `GET /custom/share?safe=<safe>`
- `GET /custom/joinxcx?safe=<safe>`
- `GET /custom/starthorse?safe=<safe>`
- `GET /custom/strokehorse?safe=<safe>`
- `GET /custom/checkslgift?safe=<safe>`
- `GET /custom/horseeat?safe=<safe>`
  - 青龙脚本逻辑：`status != 0` 继续喂，`status = 0` 停止；平台脚本最多 10 次并打日志。

### 积分商品

- `GET /custom/getgoodlists?type=1`
  - 公开接口，**不需要 safe**（实测不带 safe 也返回全量）。
  - 响应：`{ status: 1, count: 21, data: [...] }`
  - 字段：`id`、`title`、`photo`、`count`、`score`、`canex`。
  - `type=1` 为全部礼品，`type=2` 为「我能兑换」，同步用 `type=1`。

## 请求头 / 加密

- 无自建签名或加密。
- `custom/*` 通用头：
  - `CUSTOMAPPID: wx94dca6ef07a54c55`
  - `cGvnZetrWSWfLcdYaN40mLdFx6ObkRltdZmhS5hQkgDbuZd9bLcQevwBVEjx-war-horse-zm-2025`：保持青龙脚本里的固定值 `CjkFMAxs...`（解包 SDK 登录后会改用 session `skey`；这里优先保持原脚本请求头不变）
  - `user-agent`：青龙脚本里的 Android MicroMessenger 8.0.20 UA
  - `Host` 交给 HTTP 客户端按 URL 自动生成（原脚本硬编码同值）
- 登录额外头：`X-WX-Code`、`X-WX-Encrypted-Data`、`X-WX-IV`。
- 成功码：`custom/*` 为 `status === 1`；登录为 `status === "ok"`。
- 登录失效：`status === "necessaryloginerror"` 或 `msg` 含「需要登录 / 登录失效 / 过期」。
- 日志不输出 `safe`、`skey`、code、手机号。

## 已实现逻辑

`sign-in.js`：

1. 读取 `ctx.cache` 的 `auth.safe`，用 `custom/getusercenter` 校验。
2. 没有缓存 / 缓存失效：`ctx.yyb.getCode` → `/wxlogin`；失败再尝试 `getPhoneAuth` → `/wxphonelogin`。
3. 两次都失败抛 `RegistrationRequiredError`，在入口转成 `ctx.manualRequired(..., { details: { action: 'register' } })`。
4. 查用户与 `nowscore`；`isgzhkl=0` 时做公众号口令；`isinfo=0` 时用已绑定手机号补全资料。
5. `custom/checkin` 签到；`status=1` 成功，重复文案按 `alreadyDone`。
6. 依次尽力执行分享、加入排行榜、领取小马儿、摸一摸、马儿分享、喂马；单项失败只警告，不影响签到结果。
7. 再查一次 `getusercenter`，`ctx.points.sync({ balance: nowscore, estimated: false })`。
8. 登录态中途失效时清缓存、重新登录、整轮重试一次；仍失效抛 `ctx.authExpired`。

`products.js`：

1. `GET custom/getgoodlists?type=1`（公开接口）。
2. 映射 `externalId=id`、`name=title`、`imageUrl=photo`、`pointsCost=score`、`stock=count`。
3. `ctx.products.sync(..., { deactivateMissing: true })`，只读，不兑换。

未迁移（与原脚本语义相关，非签到主链路）：

- 好友点赞（`getranklist` + `subrank`）
- 偷饲料 / 送饲料（`getotherhorseinfo` + `subhorseplayer`）
- 固定答案答题（`getquesbackstatus` + `getques` + `subques`，原脚本硬编码 qid=126/138/119）
- 多账号加好友（`getranklist?fromsafe=`）

## 当前状态

- 代码：已写入，`node --check` 通过。
- 签到脚本：`enabled: true`。
- 商品脚本：`enabled: true`。
- 商品接口已实网只读验证（2026-11-16）：不带 `safe` 返回 21 个积分商品，标题/图片/能量/库存映射正常。
- 商品接口实测 `status=1`，`score` / `count` 为字符串，脚本已统一 `Number()`。
- 2026-11-17 用真实 YYB 账号完成签到链路联调：`wxlogin` 仍失败，`wxphonelogin` 成功；登录返回 `skey` 后 `custom/*` 正常，签到/任务全部通过。

## 2026-11-17 最新包核查（182）

- 包路径：`applet/packages/wx94dca6ef07a54c55/182/__APP__.wxapkg`；接口与旧版一致。
- 关键修复：登录响应 `desc.data` 同时返回 `f1safe` 和 `skey`，`custom/*` 必须使用本次登录的 `skey`，不能继续使用旧脚本硬编码值。
- 平台脚本已把 `skey` 与 `safe` 一起缓存；缓存缺少 `skey` 时视为失效并重新登录。
- 实测结果：`今日已签到`，公众号口令/完善资料/分享/排行榜/小马儿等任务成功。

## 阻塞 / 风险

1. **登录链路未实测**：`/wxlogin` 是否接受 YYB 的 `wx.login` code、是否会自动注册，需要真实账号验证。
   若服务端要求先在小程序注册/绑定手机号，脚本会抛 `ctx.manualRequired`，`details.action = "register"`。
2. `getPhoneAuth` 兜底依赖 YYB 返回 `encryptedData` + `iv`；若只返回手机号 code，则无法走 `/wxphonelogin`，会直接转人工注册。
3. 青龙脚本的 `safe` 不是长期 token 语义；平台改为登录后缓存 `f1safe`，缓存 7 天，失效自动重登。
4. 自定义 skey 头保留青龙脚本的固定值；解包 SDK 在登录后会改用 session `skey`。若服务端开始强校验 session `skey`，需要把 `buildHeaders()` 改成使用登录返回的 `skey`。
5. `getuserinfo` 对 `safe=-1` 会命中默认用户（实测会返回非当前账号资料），脚本只传当前账号的 `safe`，严禁把 `-1` 用于该接口。
6. 喂马最多 10 次，防止服务端一直返回非 0 导致死循环；原脚本是无限递归。
7. 固定答案答题和好友互助未迁移，可能少拿部分每日能量；不影响签到与积分同步。
