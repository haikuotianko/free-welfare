# 万家乐会员俱乐部（wanjiale）迁移记录

## 基本信息

- 应用 key：`wanjiale`
- 名称：万家乐会员俱乐部
- AppID：`wx07b7a339bb2cf065`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\wanjiale.js`
- 平台脚本：`data/apps/wanjiale/scripts/sign-in.js`
- 应用清单：`data/apps/wanjiale/app.json`
- API Base：`https://wakecloud.chinamacro.com`
- 页面 Referer 版本：`117`
- 一个 Run 只处理 `ctx.account`，不循环账号。
- 当前状态：已迁移，`node --check` 通过；本地 mock 走通登录、缓存会话、已签到、未注册会员、缓存失效重登。
- 是否启用：`enabled: true`

## 接口清单

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 静默登录 | `POST /wd-member/member/login` | 无 | JSON `{code, tenantId:473, appBuId:2065, wxAppId:"wx07b7a339bb2cf065", i3rdSystemCode:"CSP2.0"}`；成功 `success === true` 且 `Number(code) === 100`；会话在 `data.loginInfo.sessionId`（`data.sessionId` 恒为 null） |
| 签到状态 | `GET /wd-member/app/member/checkSigned` | `Cookie: sessionId=<id>` | `data` 为布尔，`true` 表示今天已签 |
| 会员资料 | `GET /wd-member/app/member/detail` | `Cookie: sessionId=<id>` | 未注册会员返回 `code === 130004`（查询不到指定的会员信息） |
| 每日签到 | `GET /wd-member/app/member/sign` | `Cookie: sessionId=<id>` | 成功 `data` 为本次获得的积分数；没有会员档案时返回 `code === 105`「系统繁忙，请稍后再试」 |

成功判定：`success === true` 且 `Number(code) === 100`（不是 0，也不是 200）。

失败/重试：

- 会话失效：`code === 401`，或 `msg` 命中 `未登录|登录失效|重新登录`。清缓存、重新取 code 登录，并只重试一次。
- 未注册会员：`member/detail` 返回 `130004`，或 `checkSigned` / 登录响应命中 `未注册|未绑定|请先注册|请先绑定`。
  转 `ctx.manualRequired(..., { details: { action: 'register' } })`。
- 签到码 `105`：原脚本判断为后端兜底文案，多半仍是会员档案问题；平台返回 `ok: false`，不伪装成功。
- 重复签到：`msg` 命中 `已签|已经签|签到过|重复|已完成|already` 时按“今日已签到”返回。

## 请求头 / 加密

无自建签名、无请求加密，未使用 `ctx.crypto`。固定请求头：

```text
Content-Type: application/json
Accept: application/json, text/plain, */*
Accept-Language: zh
Charset: utf-8
User-Agent: Mozilla/5.0 (Linux; Android 12; M2012K11AC Build/SKQ1.220303.001; wv) ... MicroMessenger/8.0.48.2580(0x28003036) MiniProgramEnv/android
Referer: https://servicewechat.com/wx07b7a339bb2cf065/117/page-frame.html
xweb_xhr: 1
Cookie: sessionId=<sessionId>   # 仅登录后的请求
```

- 服务端不下 `Set-Cookie`，会话由脚本手工拼成 `Cookie: sessionId=<...>`。
- 登录请求不带 `Cookie`。
- 缓存 key：`auth`，TTL 7 天，只保存 `sessionId`、`hasMember`、`updatedAt`，不保存 code、手机号。
- 启动时先用 `checkSigned` 校验缓存会话；失败后清缓存重新登录。

## 注册 / 积分 / 商品

- 注册：青龙脚本没有注册接口，只提示“先在小程序里注册一次”。平台在 `member/detail` 返回 `130004` 时抛
  `ctx.manualRequired(..., { details: { action: 'register' } })`。未实现手机号授权注册。
- 积分：没有明确的积分余额接口。`member/sign` 的 `data` 是本次签到奖励，不是余额，不能用于
  `ctx.points.sync`。平台只在 `metrics.earned` 和 `data.gained` 中记录本次奖励。
- `products.js`：未创建。青龙脚本没有商品/优惠券列表接口；`/mtool/app/luckywheel/draw` 与
  `/mtool/app/sign/*` 不属于本签到链路，未迁移。

## 未迁移内容

- `/mtool/app/luckywheel/draw` 抽奖（原脚本明确按规则不做）。
- `/mtool/app/sign/*` 另一套活动签到系统（会员俱乐部页面用的是 `member/sign`）。
- 青龙脚本的账号循环、`wanjiale_token_cache.json` 文件缓存、随机等待由平台调度/账号上下文替代。

## 当前状态

- `node --check data/apps/wanjiale/scripts/sign-in.js` 通过。
- `app.json` JSON 校验通过。
- 本地 mock 验证通过：登录、缓存会话、今日已签到、未注册会员转人工、缓存会话失效后重登。
- 未连接真实 YYB/目标服务器联调（本机没有平台运行时的账号 ref / code）。

## 阻塞 / 风险

1. **注册阻塞**：没有自动注册接口；未在万家乐注册会员的微信号每次运行都会转人工。需要先在小程序内完成注册。
2. **未实测**：登录、签到状态、会员资料、签到均未用真实账号跑过。
3. **积分余额缺失**：接口不返回余额，平台积分快照不会更新；`metrics.earned` 只表示本次签到奖励。
4. **`code 105` 含义依赖后端兜底文案**：已按原脚本保留为失败，并提示用户手动确认。
5. **Referer 版本号**：`117` 为青龙脚本抓包时的值，小程序升级后可能需要同步更新。
