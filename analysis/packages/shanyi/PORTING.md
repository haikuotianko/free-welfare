# 善羿科技（shanyi）迁移记录

## 基本信息

- 应用 key：`shanyi`
- 名称：善羿科技
- AppID：`wxc59eee06736849e8`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\shanyi.js`
- 平台脚本：`data/apps/shanyi/scripts/sign-in.js`
- 应用清单：`data/apps/shanyi/app.json`
- API Base：`https://net.todaypayforyou.fun/YSKJ/api`
- 页面 Referer 版本：`0`
- 一个 Run 只处理 `ctx.account`，不循环账号。

## 接口清单

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| code 登录 | `POST /user/login_wx` | 无 | JSON `{ code, device_id, invite_code:"", nickname:"", avatar:"" }`；`code` 缺省 / `200` / `0` 视为成功，`data.token` 为业务 token |
| 会员资料 | `GET /user/profile` | `X-Token` | 响应可能直接是资料对象，也可能包在 `data/datas/body`；原脚本展示 `nickname/nickName/name/memberId` 和积分类字段 |
| 每日签到 | `POST /sign/checkin` | `X-Token` | 空 JSON body `{}`；成功按登录成功码规则判断 |

青龙脚本顶部契约还提到 `GET /sign/status` 是状态查询接口，但脚本从未调用；平台没有额外接入，避免改变原签到流程。

成功/业务码：

- 成功：`code` 缺省、`200` 或 `0`。
- 已签到：文案命中 `已签|已经签|签到过|重复|已完成|already`，按成功返回 `alreadyDone: true`。
- 未注册：文案命中 `未注册|未绑定|请先注册|请先绑定|not regist`，抛 `ctx.manualRequired(..., { details: { action: 'register' } })`。
- 登录失效：文案命中 `登录|token|未授权|未登录|失效|过期|重新|401`，清缓存重登并重试一次；再次失败抛 `ctx.authExpired`。
- 其他业务失败返回 `ok:false`，保留 `code`/`msg` 详情。

注意：原脚本的 `isOk` 把 `code === undefined` 也视为成功，因此 HTTP 200 且无业务码的响应按成功处理；平台保留该判定。

## 请求头 / 加密

无自建签名、无请求加密。保留青龙脚本请求头：

```text
Content-Type: application/json
User-Agent: Mozilla/5.0 (Linux; Android 12; M2012K11AC Build/SKQ1.220303.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.6998.136 Mobile Safari/537.36 MicroMessenger/8.0.48.2580(0x28003036) MiniProgramEnv/android
Referer: https://servicewechat.com/wxc59eee06736849e8/0/page-frame.html
Accept: application/json, text/plain, */*
xweb_xhr: 1
X-Token: <token>        # 登录成功后携带
```

设备号：

- 原脚本：`device_id = "d_" + md5(openid).slice(0, 16)`。
- 平台：优先使用 `ctx.crypto.md5(ctx.account.yybRef).slice(0, 16)`，`yybRef` 缺失时退回账号 ID；同样加 `d_` 前缀。
- 作用只是让同一账号每次运行保持稳定设备号，不是签名；如果平台账号 ref 与原 `openid` 字符串不同，生成值会和青龙历史值不同，但同一平台账号内稳定。
- token 缓存在 `ctx.cache` 的 `auth` 键，TTL 7 天；不保存手机号等个人信息。

## 注册 / 手机号

- 青龙脚本没有注册接口，也没有手机号授权流程。
- 原脚本遇到“未注册/未绑定/请先注册/请先绑定”只记录警告并返回。
- 平台实现：签到返回未注册文案时抛 `ctx.manualRequired(..., { details: { action: 'register' } })`，提示先在小程序内注册一次。
- 未实现自动注册/手机号授权。

## 积分

- 原脚本没有独立的积分余额接口，只在 `/user/profile` 里按展示字段读取。
- 平台从会员资料中按 `integral → points → point → score → credits` 顺序取第一个可解析数字，不使用 `balance/coin/amount`（可能是现金余额）。
- 签到前后各读取一次资料：签到后余额优先，失败时回退签到前余额。
- 取到余额后调用 `ctx.points.sync({ balance, estimated: false })`。
- 这是从原脚本展示字段推断的余额字段，不是专门的积分账户接口；如果服务端字段含义变化，需要按日志调整。

## 商品 / 券

- 青龙脚本没有商品/券列表接口。
- `/user/profile` 和 `/sign/checkin` 都不是商品列表。
- 因此未创建 `products.js`。

## 未迁移内容

- 青龙脚本的多账号循环、`shanyi_token_cache.json` 文件缓存、`wx_server_url`/`wx_auth` 环境变量、账号间随机等待，均由平台调度和 `ctx.yyb`/`ctx.cache` 替代。
- 没有改动任何接口路径、请求体字段、请求头或成功/错误码。

## 当前状态

- 代码：`node --check data/apps/shanyi/scripts/sign-in.js` 通过。
- 清单：`app.json` JSON 校验通过。
- 本地 mock 验证通过：
  - 登录 → 读取资料 → 签到成功 → 签到后资料积分同步；
  - 今日已签到（HTTP 500 + 业务文案）按成功返回；
  - 签到返回未注册 → `manualRequired(action=register)`。
- `enabled: true`。
- 未连接真实 YYB/善羿服务器联调（本机没有平台运行时的账号 ref / code）。

## 阻塞 / 风险

1. **未实测**：登录、资料、签到均未用真实账号跑过；接口和字段来自青龙脚本契约。
2. **积分字段是推断的**：没有专门积分接口，`integral/points/point/score/credits` 的优先级来自原脚本展示字段；若服务端把 `point` 用作其他含义，可能同步错误余额。
3. **device_id 基准不同**：青龙用 `openid`，平台用 `ctx.account.yybRef`；同一账号在平台内稳定，但不会与青龙历史设备号一致。
4. **`GET /sign/status` 未接入**：原脚本只声明未调用；如果没有接口返回明确的“今日已签”，重复签到依赖签到接口文案判断。
5. **没有商品/券同步**：原脚本没有相应接口。
