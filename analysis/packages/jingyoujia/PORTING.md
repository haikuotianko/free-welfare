# 劲友家（jingyoujia）迁移记录

## 基本信息

- 应用 key：`jingyoujia`
- 名称：劲友家
- AppID：`wx10bc773e0851aedd`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\jingyoujia.js`
- 平台脚本：`data/apps/jingyoujia/scripts/sign-in.js`
- 应用清单：`data/apps/jingyoujia/app.json`
- API Base：`https://jjw.jingjiu.com/app-jingyoujia`
- 页面 Referer 版本：`1052`
- 一个 Run 只处理 `ctx.account`，不循环账号。

## 接口清单

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| code 登录 | `POST /login` | 无（`Authorization: none`） | JSON `{ code }`；成功码 200，`data.accessToken` |
| 会员资料 / token 校验 | `GET /app/jingyoujia/customer/detail` | `Authorization: <token>` | 返回 `nickName`、`nickname`、`mobile` 等；也用于缓存 token 校验 |
| 积分查询 | `GET /app/jingyoujia/customer/queryCustIntegral` | `Authorization: <token>` | 余额字段优先级：`usableIntegral` → `integral` → `custIntegral` → `points` |
| 查询签到活动 | `GET /app/jingyoujia/taskContinuousRecord/findCheckTask` | `Authorization: <token>` | `data.id` 为 taskId，另有 `startTime` / `endTime` |
| 查询连续签到状态 | `GET /app/jingyoujia/taskContinuousRecord/queryRecord?taskId=<id>` | `Authorization: <token>` | `continuousNum`、`todayFinish` |
| 每日签到 | `POST /app/jingyoujia/taskContinuousRecord` | `Authorization: <token>` | JSON `{ v1: AES(taskId) }`；`data.currentSignIntegral` / `data.integral` 为本次奖励 |
| 完成任务上报 | `POST /business/member/task/finish` | `Authorization: <token>` | JSON `{ latitude: 0, longitude: 0, taskType: 1 }`；签到成功后调用，失败只告警 |

业务成功码：`Number(result.code) === 200` 或 `String(result.code) === '200'`（与青龙脚本判断一致）。

登录态失效：HTTP 401/403，或文案命中 `401|token|登录|授权|未登录|无效|过期`。

重复签到：文案命中 `已签到|重复|todayFinish`。

验证码/滑块：文案命中 `20230529|captcha|验证码|滑块` 时转人工处理。

## 请求头 / 加密

请求头与青龙脚本一致：

```text
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF
Referer: https://servicewechat.com/wx10bc773e0851aedd/1052/page-frame.html
Accept: application/json, text/plain, */*
Content-Type: application/json
appId: wx10bc773e0851aedd
Authorization: <accessToken>   # 未登录/登录请求固定为 "none"
```

签到加密（青龙脚本 `aesEncrypt`）：

```text
key     = "Z0J7M480h6kppf67"（16 字节，AES-128）
mode    = ECB
padding = PKCS7（Node 默认自动填充，等价青龙 setAutoPadding(true)）
input   = JSON.stringify({ taskId })
output  = base64
body    = { "v1": <base64> }
```

平台实现使用 `ctx.crypto.aesEncrypt(JSON.stringify({ taskId }), AES_KEY, { mode: 'ecb', output: 'base64', keyEncoding: 'utf8' })`，不引入 Node `crypto`。

- token 缓存在 `ctx.cache` 的 `auth` 键，TTL 7 天；保存 `accessToken` 和会员资料对象。
- 缓存 token 用 `customer/detail` 校验，失效后清缓存重新取 code 登录。
- 签到主链路遇到登录态错误会重新登录并重试一次。

## 注册 / 手机号

- 青龙脚本只有 `POST /login { code }`，没有单独的注册接口；登录接口通常同时完成注册。
- 平台未实现手机号授权注册。
- 如果登录响应/错误文案命中 `注册|未注册|绑定|不存在|register`，抛
  `ctx.manualRequired(..., { details: { action: 'register' } })`，提示先在小程序内注册。
- 如果签到返回验证码/滑块拦截，抛 `ctx.manualRequired(..., { details: { action: 'verify' } })`。

## 积分

- `customer/queryCustIntegral` 返回可用积分，字段按青龙脚本优先级读取。
- 签到前后各查一次，签到后用最新值调用 `ctx.points.sync({ balance, estimated: false })`。
- 签到奖励取 `currentSignIntegral` / `integral`，写入返回 message、`data.earned`。
- 非登录态的积分查询失败只告警，不影响签到结果；余额可能为 null。

## 商品 / 券

- 青龙脚本没有商品、券或兑换列表接口。
- 因此未创建 `products.js`。

## 当前状态

- 代码：`node --check data/apps/jingyoujia/scripts/sign-in.js` 通过。
- 清单：`app.json` JSON 校验通过。
- 本地 mock 验证通过：code 登录、会员资料、积分、签到 AES 密文可被同 key/ECB 解密为 `{"taskId":"task1"}`、重复签到、验证码转人工。
- `enabled: true`。
- 未连接真实 YYB/目标服务器联调（本机没有平台运行时的账号 ref / code）。

## 阻塞 / 风险

1. **未实测**：没有真实账号跑过登录/签到；首次运行需要确认 `POST /login` 是否会自动注册。
2. **验证码**：签到接口可能返回 `20230529` / 验证码 / 滑块，脚本会转人工，不会绕过。
3. **AES key**：`Z0J7M480h6kppf67` 为青龙脚本中的常量；小程序升级换 key 后签到会失败，需要重新抓包。
4. **积分字段**：按青龙脚本的四个候选字段读取；如果服务端全部改字段，脚本会跳过余额同步，签到仍可继续。
5. **完成任务上报**：`/business/member/task/finish` 失败只告警，不影响签到判定；该接口是否为签到必需未单独验证。
6. 青龙脚本没有验证码处理、随机等待；平台按单账号 Run 执行，不保留随机延迟。
7. 查询签到活动/状态失败时，脚本按青龙逻辑只告警，并按“无活动/未签”继续；如果该接口持续失败，运行结果可能显示“当前无签到活动”而不是明确失败，需要看日志。
