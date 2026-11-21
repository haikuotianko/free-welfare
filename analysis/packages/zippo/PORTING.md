# zippo 会员（zippo）迁移记录

## 基本信息

- 应用 key：`zippo`
- 名称：zippo会员
- AppID：`wxaa75ffd8c2d75da7`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\zippo.js`
- 平台脚本：`data/apps/zippo/scripts/sign-in.js`
- 应用清单：`data/apps/zippo/app.json`
- API Base：`https://wx-center.zippo.com.cn`
- 一个 Run 只处理 `ctx.account`，不循环账号
- 当前状态：已迁移，`node --check` 通过；用本地 mock 走通登录、缓存 token、签到、今日已签、401 重登、未注册
- 是否启用：`enabled: true`

## 接口清单

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 登录 | `POST /api/users/auth` | JSON `{code, scene:"1001", platform:"wxmp"}` | 返回 `{token, sid, openId, unionId}`；`token` 为 JWT |
| 会员资料 | `GET /api/users/profile` | 无 | 返回 `memberLevel`、`nickname`、`phone`（已脱敏）；也用于校验缓存 token |
| 每日签到 | `POST /api/daily-signin` | JSON `{}` | 返回 `rewards[]`；每日 1 分，连签 7/30 天另有奖励 |

日历接口 `GET /api/daily-signin/month?month=YYYY-MM` 原脚本只读未使用，未接入。

## 请求头

```
Content-Type: application/json
User-Agent: Mozilla/5.0 (Linux; Android 12; ... ) MicroMessenger/8.0.48.2580 ... MiniProgramEnv/android
Referer: https://servicewechat.com/wxaa75ffd8c2d75da7/0/page-frame.html
Accept: application/json, text/plain, */*
xweb_xhr: 1
x-app-id: zippo
x-platform: wxmp
x-platform-id: wxaa75ffd8c2d75da7
x-platform-env: release
Authorization: Bearer <token>
```

- 无签名/加密。
- `Authorization` 必须带空格：`Bearer <token>`。
- 登录请求不带 `Authorization`。

## 成功 / 错误判定

该后端没有业务成功码：

- 成功 = HTTP 2xx 且响应体没有 `code`（登录/签到正常返回 **201**）。
- 失败才带 `code`，且常放在 4xx/5xx JSON 体里，例如重复签到：HTTP 400
  `{"code":"already_signed","message":"今日已签到"}`。
- 因此 HTTP 非 2xx 时，只要响应体是对象就继续按业务码判断；只有非对象响应才抛 HTTP 错误。
- 重复签到文案：`/已签|已经签|签到过|重复|已完成|already/` → `alreadyDone: true`。
- 会话失效文案：`/登录|token|未授权|未登录|失效|过期|重新|401/` → 清缓存、重新登录、重试一次。
- 未注册文案：`/未注册|未绑定|请先注册|请先绑定|not regist/` → `ctx.manualRequired(..., { details: { action: "register" } })`。

## 缓存

- key：`auth`
- 内容：`{ token, updatedAt }`
- TTL：7 天
- 启动时先用 `GET /api/users/profile` 校验缓存 token；业务失败则清缓存并重新 `ctx.yyb.getCode` 登录。
- 签到或资料接口返回会话失效时，同样清缓存、重登、重试一次。

## 注册 / 积分 / 商品

- 注册：原脚本没有注册/绑定接口，只有「先在小程序注册会员」的提示；未注册时抛 `ctx.manualRequired` 并带 `action: "register"`。
- 积分：`/api/users/profile` 不返回积分余额，签到响应只有 `rewards[].count`，无法确认是否为积分余额，因此不调用 `ctx.points.sync`，只在 `data.rewards` 中返回原始奖励数组。
- `products.js`：未新增。原脚本没有商品/优惠券列表接口。

## 阻塞项 / 待验证

- 没有真实 YYB 账号做线上联调；本次只有本地 mock 覆盖登录、缓存 token、签到、今日已签、401 重登、未注册。
- `rewards[].count` 的语义（积分数量/奖励件数）未在脚本中确认，未写入 metrics 或积分同步。
- 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
