# 骁龙骁友会（wx_xlxyh）迁移说明

## 基本信息

- AppID：`wx026c06df6adc5d06`
- 应用 key：`wx_xlxyh`
- 源脚本：`N:\myProject\QLScriptPublic\wxapp\wx_xlxyh.js`
- 平台脚本：`data/apps/wx_xlxyh/scripts/sign-in.js`
- 应用配置：`data/apps/wx_xlxyh/app.json`
- 解包目录：`analysis/packages/wx_xlxyh/unpacked`（主包 raw 解包，wxapkg 版本 731）
- 账号来源：平台 `ctx.account`（YYB 账号），不再读取青龙变量/本地 token 缓存文件
- 当前状态：已迁移，`node --check` 通过；用本地 mock 走通登录、签到、抽奖、点赞、今日已签、40001 自动重登重试、未注册提示、register 动作
- 是否启用：`enabled: true`

## 接口清单

域名：`https://qualcomm.boysup.cn/qualcomm-app`

### 登录

- `POST /api/user/getOpenId`
  - body：`{ "code": "<wx code>" }`
  - 不使用会话头（`userId=0`、`sessionKey`/`openId` 为空）
  - 成功返回 `{ openId, sessionKey, userInfo }`
  - `userInfo.id` 就是后续的 `userId`；`userInfo.id === 0` 表示该微信号未注册
  - **必须带微信小程序 User-Agent**，否则服务端回 `{"code":1,"message":"非法请求"}`

### 用户信息

- `GET /api/user/info?userId=<userId>`
  - 返回 `id`、`nick`、`phone`、`coreCoin`、`levelName` / `level`
  - 用于校验会话、读取芯动值

### 注册 / 绑定手机号

- `POST /api/user/bindPhone`
  - body：`{ "userId": 0, "code": "<手机号授权 code>", "type": "1" }`
  - 注册前从 `getOpenId` 拿到 `openId` / `sessionKey`，`userId` 为 0，请求头带上它们用于关联
  - 成功后重新 `getOpenId` 换取真实 `userId` / 新 `sessionKey`
  - 仅当 `ctx.input.action === "register"` 且 `userInfo.id === 0` 时调用

### 签到

- `GET /api/user/signList?userId=<userId>`
  - 返回 `data.isSignToday`、`data.signContinuityMonth`
- `POST /api/buryPointApp/save`
  - body：
    ```json
    {
      "userId": 0,
      "openId": "<openId>",
      "activitySource": "Xcx_MeiRiRenWu",
      "urlPath": "pages/task-center/index",
      "urlName": "任务中心",
      "elementName": "每日签到",
      "elementType": "页面",
      "eventNameEn": "MPClick"
    }
    ```
  - **签到前置条件**：不发埋点 `signIn` 恒回 40001；发完等待 400~1100ms
- `GET /api/user/signIn?userId=<userId>`
  - 是 GET，不是 POST
  - 成功 `data.state` / `data.coreCoin`

### 抽奖

- `POST /api/buryPointApp/save`
  - 同上，改为 `urlPath=pages/wheel/index`、`urlName=幸运大转盘`、`elementName=立即抽奖`
  - 不打埋点连 `luckDraw/list` 都回 `code=1 非法请求`
- `GET /api/luckDraw/list?page=1&userId=<userId>&activityId=7`
  - 返回 `data.luckDrawCount`（剩余次数）、`data.luckDrawSumCount`、`data.freeCountDay`、`data.luckCoreCoin`
  - 免费次数判断：`已用 = luckDrawSumCount - luckDrawCount`，`已用 >= freeCountDay` 时跳过
- `POST /api/luckDraw/getLuck`
  - body：`{ "userId": <userId>, "activityId": 7 }`

### 资讯 / 点赞 / 阅读

- `GET /api/home/articles?page=1&size=20&userId=&type=0&searchDate=&articleShowPlace=骁友资讯列表页`
- `GET /api/article/like?articleId=&userId=`
- `POST /api/article/enterReadDaily` / `POST /api/article/exitReadDaily`
  - body：`{ articleId, userId }`
  - 服务端按 enter/exit 两次调用的时间差算阅读时长，没有时长参数，必须真等 300 秒
- `POST /api/sysConfig/detail` body `{ "propertyKey": "task_switch_DAILY_PLAY_VIDEO_1_MINUTES" }`（VLOG 开关）
- `GET /api/article/vlogList?page=1&size=20&userId=&sortBy=1`
- `GET /api/article/vlogPlay?articleId=`
  - VLOG 必须真等 60 秒后 exitReadDaily

### 互动答题 / 每日任务汇总

- `POST /api/interactQuestion/detail` body `{ "userId": <userId> }`
  - 接口不返回正确答案，脚本只打印题目提醒，不自动作答（每天只有一次机会）
- `GET /api/home/taskDaily?userId=<userId>`
  - `status === 1` 表示已完成

## 请求头与签名

```
Content-Type: application/x-www-form-urlencoded;charset=UTF-8
userId: <userId 或 0>
sessionKey: <sessionKey>
openId: <openId>
timestamp: <毫秒时间戳>
requestId: <32 位十六进制>
sign: md5(body + requestId + timestamp)  // 小写，无盐
User-Agent: Mozilla/5.0 ... Chrome/132.0.0.0 ... MicroMessenger/7.0.20.1781 ... MiniProgramEnv/Windows WindowsWechat/WMPF ... XWEB/18151
Referer: https://servicewechat.com/wx026c06df6adc5d06/644/page-frame.html
Accept: */*
xweb_xhr: 1
```

- 参数一律走 `joinJson`：`k1=encodeURIComponent(v1)&k2=...`（对象自身枚举顺序）
- GET 把 `joinJson` 结果直接拼到 URL；POST 作为 raw body，`Content-Type` 为 form-urlencoded
- `requestId` 照抄源码 quirk：先生成 36 位随机 hex，第 14 位置 `4`、第 19 位置 `8..b`，再把第 8/13/18/23 位设为 `undefined` 后 join，实际得到 32 位十六进制
- 签名服务端并不校验，但 `User-Agent` 是真正准入门槛，必须原样保留
- 成功码：`"200"`、`"40003"`；会话失效码：`"40001"`
- `40001` 时清空旧会话、重新 `getOpenId`，然后重放一次原请求（签到请求除外：签到回 40001 通常是前置埋点没被认下）

## 缓存

- key：`auth`
- 内容：`{ userId, sessionKey, openId, nick, updatedAt }`
- TTL：7 天
- 用 `GET /api/user/info` 校验；失效后重新取 code 登录

## 注册 / 积分 / 商品

- 注册：已接入 `POST /api/user/bindPhone`，手机号 code 来自 `ctx.yyb.getPhoneAuth({ appId })`。
  - 只支持 `ctx.input.action === "register"`
  - 默认运行遇到 `userInfo.id === 0` 会抛 `ctx.manualRequired(..., { details: { action: "register" } })`
- 积分：`GET /api/user/info` 的 `coreCoin`（芯动值），写入 `ctx.points.sync({ estimated: false })`
- `products.js`：未新增。
  - 小程序里的「生活周边兑换」走第三方商城 `thirdMall`（`/api/thirdMall/getLoginCode` 只是换登录码），没有本域名的积分商品/优惠券列表接口
  - 福利中心的 `giftList` 是活动奖励，不是积分商品目录，未接

## 阅读 / VLOG 任务与超时

- 阅读 5 分钟 + VLOG 1 分钟合计约 370 秒，加上签到/抽奖/点赞，单次运行需要约 7 分钟。
- 平台默认任务超时 120 秒，因此脚本只有同时满足以下条件才执行这两个停留任务：
  - `ctx.config` 的 `readTask` 不为 false（默认 true）
  - `ctx.run.timeoutMs >= 480000`
- 否则跳过并写日志，不影响签到/抽奖/点赞，避免整次运行超时。
- 需要在平台把任务超时调到 480 秒以上，并确认 `readTask` 未关闭。

## 阻塞项 / 待验证

- 没有真实 YYB 账号做线上联调；本次只做了本地 mock（登录、签到、抽奖、点赞、已签、40001 重登重试、未注册、register 动作）。
- `POST /api/user/bindPhone` 的注册链路未在真机验证：如果服务端要求更多注册资料或 `type` 不是 `"1"`，会抛 `manualRequired(action=register)`。
- 阅读 5 分钟 / VLOG 1 分钟依赖平台任务超时；默认 120 秒下自动跳过，详见上一节。
- 互动答题不自动作答（接口不返回正确答案，每天一次机会），只输出题目提醒。
- 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
