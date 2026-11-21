# 美孚臻享俱乐部（mobil）迁移记录

## 基本信息

- 应用 key：`mobil`
- 名称：美孚臻享俱乐部
- AppID：`wx46f9572cac706c22`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\mobil.js`（由 YYB-GO 系脚本「美孚.js」迁移而来）
- 平台脚本：`data/apps/mobil/scripts/sign-in.js`
- 应用清单：`data/apps/mobil/app.json`
- API Base：`https://www.rewards.mobil.com.cn`（SHOPWIND/Yii2 框架）
- 一个 Run 只处理 `ctx.account`，不循环账号
- 当前状态：已迁移，`node --check` 通过；用本地 mock 走通登录、cookie 保存、会员预检、签到、今日已签、token 失效重登、-9 未注册转人工、-11 风控失败
- 是否启用：`enabled: true`

## 接口清单

所有请求走 `/web/index.php?_mall_id=1&r=<route>`。

| 用途 | 方法/route | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 静默登录 | `POST api/passport/login` | form `{code}` | `code==0`；`data.access_token`（= token）、`data.ulp_user_id` |
| 会员信息 | `GET api/kc/user/user-info` | token | `code==0`；`data.ulp_user_id`、`data.ulp_user_info`、`data.nickname` / `nick_name` / `mobile` |
| 会员任务 | `GET api/kc/user/user-task` | token | `data.data.need_improve_user_info == 1` 表示需完善信息/未注册会员 |
| 签到状态 | `GET api/kc/user/user-sign-info` | token | `code==0`；`data.now_date_is_sign` 今日是否已签 |
| 签到 | `POST api/kc/user/sign-in` | form（空） | `code==0 && data.now_date_is_sign`；`data.sign_continue_text` / `sign_continue_day`、`sign_once_point` / `point` 用于日志 |

成功码 `code == 0`。业务错误码（原脚本注释）：

- `-1` 或文案命中 `/登录失效|未登录|token\s*(失效|过期|无效)|invalid.*token|请重新登录/`：mall token 失效，重登一次。
- `-9` 且文案含 `ulp` / `ulp:请先登录`：商城已登录但美孚会员体系（ulp/mefoto）未注册，`ulp_user_id=0` 或 `need_improve_user_info=1`。
- `-11` 或文案命中 `/风险识别|验证码|校验码|滑块/`：风控图形验证码，不自动绕过，按业务失败返回。

## 请求头 / Cookie

```text
Host: www.rewards.mobil.com.cn
Connection: keep-alive
Accept: application/json, text/plain, */*
charset: utf-8
User-Agent: Mozilla/5.0 (Linux; Android 10; MI 8 ...) MicroMessenger/8.0.50.2701(0x28003252) ... MiniProgramEnv/android
X-Form-Id-List: []
X-App-Platform: wxapp
X-Requested-With: XMLHttpRequest
X-channel: WXapp
X-App-Version: 4.8.9
Referer: https://servicewechat.com/wx46f9572cac706c22/120/page-frame.html
X-Access-Token: <token>                     # 登录后
Cookie: <手工保存的 cookieJar>               # 有值时
Content-Type: application/x-www-form-urlencoded   # POST
```

- 无签名/加密，token 放 `X-Access-Token`。
- 原脚本自行维护 cookieJar：平台 HTTP 客户端不维护 Cookie，脚本从每个响应的 `Set-Cookie` 更新内存 cookieJar，并随请求发送 `Cookie` 头。
- `Set-Cookie` 兼容数组和合并成一行两种情况，按 `name=` 边界拆分；`expires` 中的逗号不会被误拆。
- `MALL_ID=1`、`APP_VERSION=4.8.9`、`PAGE_VERSION=120` 是小程序应用级常量，非个人凭证；不发送 `X-User-Id`。

## 缓存

- key：`auth`
- 内容：`{ token, cookieJar, updatedAt }`
- TTL：7 天
- 有缓存时直接使用；`user-info` / `user-sign-info` 返回登录失效后重新 `ctx.yyb.getCode` 登录并重试一次。
- 登录成功后保存 token + 当前 cookieJar。

## 注册 / 积分 / 商品

- 注册：原脚本没有注册接口，只有明确的未注册提示。`user-info` / `user-task` / `sign-in` 判定为未注册会员
  （`-9 ulp:请先登录`、`ulp_user_id=0`、`need_improve_user_info=1`）时，抛
  `ctx.manualRequired(UNREG_MSG, { details: { action: 'register' } })`，提示先在小程序完善会员信息/绑定手机号注册。
- 积分：原脚本没有积分余额接口，也没有解析 `user-info` 里的积分字段，因此未调用 `ctx.points.sync`，`app.json` 只声明
  `sign_in` capability；`pointsName` 保留为“积分”仅用于展示。
- `products.js`：未新增。原脚本没有商品/优惠券列表接口，未猜路径。

## 当前状态 / 验证

- `node --check data/apps/mobil/scripts/sign-in.js` 通过。
- 本地 mock 覆盖：登录、`X-Access-Token`、`Set-Cookie` → `Cookie` 透传、会员预检、签到成功、今日已签、
  缓存 token、token 失效重登、`-9 ulp` 转人工、`-11` 风控失败。
- 未连接真实 YYB / 美孚服务端联调。

## 阻塞 / 风险

1. 该微信号必须已在小程序内注册美孚会员（绑定手机号）；否则服务端返回 `-9 ulp:请先登录`，脚本转人工，不代注册。
2. 风控图形验证码不绕过；命中 `-11` 时返回 `ok:false`，需要用户稍后在小程序内手动签到或降低频率。
3. Cookie 由脚本手工维护；如果服务端依赖 `HttpOnly` cookie 轮换且响应头被平台丢弃，可能出现会话不稳定（已按原脚本每次响应更新）。
4. 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
