# 铛铛一下（ddyx）迁移记录

- AppID：`wxe378d2d7636c180e`
- 应用目录：`data/apps/ddyx`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\ddyx.js`
- 解包目录：`analysis/packages/ddyx/unpacked`（缓存包版本 872）
- API Base：`https://vues.dd1x.cn`
- 脚本：`scripts/sign-in.js`，`enabled: true`
- 一个 Run 只处理 `ctx.account`，不循环账号。

## 接口

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 登录 | `GET /wechat/login?code=<code>&channelId=154` | 无 | `code` 来自 `ctx.yyb.getCode({ appId })`；响应 token 可能在 `token` / `data.token` / `data.data.token` / `data.data.user.token`，兼容 `accessToken`、`access_token`、`jwt` |
| 签到 | `GET /api/v2/sign_join` | 请求头 `token` | `code === 0` 成功，`data.name` 为签到名称；`msg` 含“已签/签到过/重复/已完成/已参与/今日”视为今日已签 |
| 签到进度（补充） | `GET /api/v2/get_sign_list` | 请求头 `token` | 解包确认的只读接口，返回 `signDayNum`、`signDayInfos[].dayStatus`；失败只告警，不阻塞签到 |
| 会员信息 | `GET /api/v2/get_member_info` | 请求头 `token` | 返回 `money`（回收余额），不是积分，因此未接入 points |
| 优惠券列表 | `GET /api/v2/rubbish_over_coupon/query_coupon_list?state=0` | 请求头 `token` | 回收奖励券列表，无积分价格字段，不适合 `ctx.products.sync`，未实现 products.js |

## 注册

- 未找到独立的“注册”接口；`/wechat/login` 对已注册微信号返回 token。
- 手机号相关接口是绑定/换绑，不是注册：
  - `GET /wechat/get_phone_num?code=<phoneCode>`
  - `GET /api/v2/member/bind_more_member_by_tel?tel=<phone>`（部分页面带 `smsCode`）
- 登录拿不到 token 且文案命中“注册/未绑定/绑定/授权/激活/会员/实名”时，脚本抛 `ctx.manualRequired(..., { details: { action: 'register' } })`，提示先在小程序内登录/注册一次。

## 请求头 / 加密

请求头与青龙脚本一致：

```text
User-Agent: Mozilla/5.0 (...) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF
Content-Type: application/json
Accept: */*
xweb_xhr: 1
Referer: https://servicewechat.com/wxe378d2d7636c180e/824/page-frame.html
Accept-Language: zh-CN,zh;q=0.9
token: <token>   # 仅签到/进度接口
```

- 无签名、无加密。
- `channelId=154` 是小程序默认渠道常量，可用环境变量 `DD1X_CHANNEL_ID` 覆盖（青龙脚本同源逻辑）。
- token 缓存在 `ctx.cache` 的 `auth` 键，TTL 7 天；签到/进度返回 401、403、4001、4003、10401 或 token 类文案时清缓存并重新登录一次。

## 当前状态

- 已按青龙脚本迁移登录、签到、错误判断、重试和 token 缓存。
- 已用 `node --check` 校验通过。
- 静态解包确认 `/api/v2/sign_join`、`/api/v2/get_sign_list`、`/wechat/login` 与渠道号 154。
- 未连接真实 YYB/目标服务器做联调。

## 阻塞 / 说明

- 该小程序没有积分余额；签到奖励是红包/优惠券，所以没有调用 `ctx.points.sync`。`app.json` 的 `pointsName` 标为“红包”。
- 未实现 `products.js`：券列表没有积分价格，商品/券的领取属于业务操作，按要求只做签到。
- 新微信号是否需要额外注册/绑定未验证；如果服务端拒绝，会走 `manualRequired(action=register)`。
- `enabled: true`；未使用手机号授权数据，因此不存在“手机号数据被拒绝”的禁用条件。
