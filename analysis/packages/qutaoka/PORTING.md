# 趣淘卡（qutaoka）迁移说明

## 基本信息

- 应用 key：`qutaoka`
- 名称：趣淘卡
- AppID：`wx479a4a95ec031d79`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\qutaoka.js`
- 平台脚本：`data/apps/qutaoka/scripts/sign-in.js`
- 应用配置：`data/apps/qutaoka/app.json`
- 解包目录：无（本次未使用缓存小程序包，按青龙脚本迁移）
- 账号来源：平台 `ctx.account`（YYB 账号），不再读取青龙变量 / 本地 `qutaoka_token_cache.json`
- 当前状态：已迁移，`node --check` 通过，本地 mock 走通登录、资料查询、缓存 token、签到、积分同步
- 是否启用：`enabled: true`

## 接口清单

域名：`https://taotaoka.languoyun.cn`

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| code 登录 | `POST /api/login` | 无 | form-urlencoded：`code`、`nickname`、`headimg`、`pid`（后三个为空串）；成功 `status == 1`，`data` 直接是 token 字符串 |
| 会员资料 | `POST /api/user` | 请求头 `token` | 空表单体；成功 `status == 1`，`data` 含 `nickname`/`nick_name`/`integral`/`points`/`score`/`balance` 等候选字段 |
| 每日签到 | `POST /api/sign_add` | 请求头 `token` | 空表单体；成功 `status == 1`，失败原因在 `msg` |

该后端成功码是 `status == 1`（不是 `code`）。

## 请求头 / 签名

无自建签名、无请求加密，未使用 `ctx.crypto`。请求体使用源脚本的自定义 form 编码（`encodeURIComponent`，空值编码为空串）。

```text
Content-Type: application/x-www-form-urlencoded
User-Agent: Mozilla/5.0 (Linux; Android 12; M2012K11AC Build/SKQ1.220303.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.6998.136 Mobile Safari/537.36 MicroMessenger/8.0.48.2580(0x28003036) MiniProgramEnv/android
Referer: https://servicewechat.com/wx479a4a95ec031d79/0/page-frame.html
token: <登录返回的 token>   # 登录后携带
```

业务码：

- 成功：`status == 1`。
- 重复签到：消息命中 `已签|已经签|签到过|重复|already`，返回 `alreadyDone: true`。
- 登录态失效：消息命中 `登录|token|未授权|失效|过期|重新`，清缓存重新登录并重试签到一次；重试后仍失效则抛 `ctx.authExpired`。
- 登录失败消息命中 `未注册|注册|未绑定|绑定|手机号|授权|不存在` 时转 `ctx.manualRequired(action=register)`；其他登录失败按业务错误抛出。

## 缓存

- 缓存 key：`auth`
- 内容：`{ token, updatedAt }`
- TTL：7 天
- 使用缓存前调 `POST /api/user` 校验；失败则清缓存并重新取 code 登录。
- 只缓存 token，不缓存手机号等资料。

## 注册 / 人工处理

- 源脚本没有注册接口，登录失败只记录 `登录失败: <msg>`。
- 平台脚本在登录失败文案明确指向注册/绑定/手机号授权时，抛：

```js
ctx.manualRequired('趣淘卡需要先在小程序注册/绑定：...', {
  details: { action: 'register', step: 'login', status: <服务端 status> },
});
```

- 未实现自动注册/手机号授权，因为源脚本没有该流程。

## 积分

- 资料接口候选字段里取 `integral` → `points` → `score`，不把 `balance`（可能是现金余额）当积分。
- 签到前后各查一次 `/api/user`，优先用签到后的资料调 `ctx.points.sync({ balance, estimated: false })`。
- `integral` 是源脚本文档里最可能的积分字段，但源脚本只打印候选字段、没有明确标注；若真实响应使用其他字段，积分同步会跳过（返回 `data.balance: null`），不影响签到结果。

## 商品 / 券

源脚本没有商品/优惠券列表接口，未创建 `products.js`。

## 状态 / 验证

- `node --check data/apps/qutaoka/scripts/sign-in.js` 通过。
- `app.json` JSON 校验通过。
- 本地 mock 验证：form 登录、token 缓存、资料查询、签到成功、重复签到、鉴权失效重登、未注册转人工。
- 未执行 `pnpm import:apps`，未写数据库，未做真实 YYB 取码/趣淘卡接口联调。

## 阻塞 / 风险

1. **积分字段待确认**：`integral` 作为积分余额是迁移时的合理推断；源脚本没有明确说明字段含义，真实环境若不同则不会同步积分。
2. **未实测**：接口只在 mock 下验证，未连接真实账号/YYB。
3. **注册判断依赖文案**：只有在登录失败文案包含注册/绑定/手机号/授权等关键词时才转人工；其他登录失败会作为普通业务错误。
4. **登录 token 形态**：源脚本说明 `data` 直接是 token 字符串；平台同时兼容 `data.token` 作为兜底。
