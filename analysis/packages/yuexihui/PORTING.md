# 中粮悦喜会（yuexihui）迁移记录

## 基本信息

- 应用 key：`yuexihui`
- 名称：中粮悦喜会
- AppID：`wx4a9b92a0680e7b29`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\yuexihui.js`
- 平台脚本：`data/apps/yuexihui/scripts/sign-in.js`
- 应用清单：`data/apps/yuexihui/app.json`
- API Base：`https://yxh.cofco.com`
- 一个 Run 只处理 `ctx.account`，不循环账号。
- 当前状态：已迁移，`node --check` 通过；本地 mock 走通登录、会员资料、签到、HTTP 400 已签到、未注册转人工、会话失效重登。
- 是否启用：`enabled: true`

## 接口清单

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 静默登录 | `POST /auth/login` | 无 | JSON `{code, koOpenId:null}`；`success === true`，`data.token` 为业务 token |
| 会员资料 | `POST /member/base` | 请求头 `token` | 空 JSON `{}`；`success === true`；`data` 或响应体本身为资料 |
| 每日签到 | `POST /mission/sign/in` | 请求头 `token` | 空 JSON `{}`；成功 `success === true`，失败原因在 `message` / `msg` |
| 签到状态（未使用） | `POST /mission/sign/list` | 请求头 `token` | 青龙脚本头部注释提到，但脚本没有调用；平台保持不调用 |

成功判定：`success === true`（不是 `code`）。

失败/重试：

- 会话失效：`message` 命中 `登录|token|未授权|未登录|失效|过期|重新|401`。清缓存、重新登录，并只重试签到一次。
- 未注册/未绑定：`message` 命中 `未注册|未绑定|请先注册|请先绑定|not regist`。
  转 `ctx.manualRequired(..., { details: { action: 'register' } })`。
- 重复签到：`message` 命中 `已签|已经签|签到过|重复|已完成|already` 时按“今日已签到”返回。
- 业务结论可能放在 4xx/5xx 的 JSON 体里（原脚本注释明确「今日已签到」见过 400 也见过 500），
  因此非 2xx 只要响应体是对象就交回业务层判断，不在 HTTP 层丢弃。

## 请求头 / 加密

无自建签名、无请求加密，未使用 `ctx.crypto`。固定请求头：

```text
Content-Type: application/json
User-Agent: Mozilla/5.0 (Linux; Android 12; M2012K11AC Build/SKQ1.220303.001; wv) ... MicroMessenger/8.0.48.2580(0x28003036) MiniProgramEnv/android
Referer: https://servicewechat.com/wx4a9b92a0680e7b29/0/page-frame.html
Accept: application/json, text/plain, */*
xweb_xhr: 1
token: <data.token>   # 仅登录后的请求
```

- 登录请求不带 `token` 头。
- 缓存 key：`auth`，TTL 7 天，只保存 `token`、`updatedAt`。
- 启动时用 `POST /member/base` 校验缓存 token；失败则清缓存、重新取 code 登录。
- 原脚本按 openid 计算过 `deviceId`，但请求里从未使用；平台没有携带这个死字段。

## 注册 / 积分 / 商品

- 注册：青龙脚本没有注册/绑定接口，只提示用户先在小程序注册。平台在登录或签到提示未注册/未绑定时抛
  `ctx.manualRequired(..., { details: { action: 'register' } })`。未实现自动注册/手机号授权。
- 积分：`/member/base` 的返回里可能带 `integral` / `points` / `score` 等字段，但原脚本只把它们打进日志，
  没有确认哪个字段是积分余额，也没有调用积分接口。平台不猜字段，因此不调用 `ctx.points.sync`。
- `products.js`：未创建。青龙脚本没有商品/优惠券列表接口。

## 未迁移内容

- `/mission/sign/list` 签到状态查询：原脚本没有调用，平台没有新增。
- 青龙脚本的账号循环、`yuexihui_token_cache.json` 文件缓存、随机等待由平台调度/账号上下文替代。
- 原脚本未使用的 `deviceId` 计算已删除。

## 当前状态

- `node --check data/apps/yuexihui/scripts/sign-in.js` 通过。
- `app.json` JSON 校验通过。
- 本地 mock 验证通过：登录、会员资料、签到成功、HTTP 400 JSON 已签到、未注册转人工、签到会话失效后重登。
- 未连接真实 YYB/目标服务器联调（本机没有平台运行时的账号 ref / code）。

## 阻塞 / 风险

1. **未实测**：登录、会员资料、签到均未用真实账号跑过。
2. **注册阻塞**：没有自动注册接口；未注册/未绑定的微信号会转人工。
3. **积分余额未知**：没有确认的积分余额字段，平台积分快照不会更新；需要后续抓包确认 `member/base` 的字段含义。
4. **签到状态未预检**：原脚本直接调 `/mission/sign/in` 靠错误文案判断已签到，平台保持同样行为；
   如果服务端对重复签到返回非 JSON，会被判为失败。
5. **Referer 版本**：`0` 为青龙脚本抓包时的值，小程序升级后可能需要同步更新。
