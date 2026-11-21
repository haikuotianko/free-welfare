# 捷停车（jtc）迁移记录

## 基本信息

- 应用 key：`jtc`
- 名称：捷停车
- AppID：`wx24b70f0ad2a9a89a`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\jtc.js`
- 平台脚本：`data/apps/jtc/scripts/sign-in.js`
- 应用清单：`data/apps/jtc/app.json`
- API Base：
  - `https://www.jslife.com.cn`（登录）
  - `https://sytgate.jslife.com.cn`（签到）
- 页面 Referer 版本：`312`
- 一个 Run 只处理 `ctx.account`，不循环账号。
- 当前 `enabled`：`true`

## 接口清单

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 静默登录 | `POST https://www.jslife.com.cn/wxhttp/weixin/xcx/get_openid_by_code?t=<毫秒时间戳>` | JSON `{code, userType:"WX_XCX_JTC", appId:"wx24b70f0ad2a9a89a"}` | token 取 `obj.token` 或 `data.token`；token 为 JWT |
| 解析 userId | 本地 JWT 解析 | 取 JWT 第二段 payload 的 `sub` | `sub` 是 JSON 字符串，解析后取 `userId`；也兼容 payload 顶层 `userId` |
| 查询签到任务 | `POST /base-gateway/integral/v2/sign-in-task/query` | JSON `{userId, platformType:"WX_XCX_JTC"}` | `obj.todaySigned` / `obj.signed` / `obj.isSign` 为 `true` 表示今日已签 |
| 领取签到任务 | `POST /base-gateway/integral/v2/task/receive` | JSON `{userId, taskNo:"T00", reqSource:"WX_XCX_JTC", platformType:"WX_XCX_JTC", osType:"WINDOWS", token}` | `resultCode == "0"` 或 `success` 为真；`obj.point` / `obj.integral` 为本次积分 |

固定常量（原脚本硬编码，应用级）：

- `PLATFORM_TYPE = "WX_XCX_JTC"`
- `APP_VERSION = "312"`
- `TASK_NO = "T00"`（签到接口内固定）

## 请求头

登录：

```text
Host: www.jslife.com.cn          # Node fetch 会忽略 Host，URL 本身已是该域名
applicationVersion: 1.0.1
User-Agent: <原青龙 UA>
xweb_xhr: 1
Content-Type: application/json;charset=UTF-8
Accept: */*
Referer: https://servicewechat.com/wx24b70f0ad2a9a89a/312/page-frame.html
```

签到：

```text
User-Agent: <原青龙 UA>
Authorization: Bearer <JWT>
Content-Type: application/json
Referer: https://servicewechat.com/wx24b70f0ad2a9a89a/312/page-frame.html
```

- 无自建签名、无请求加密。
- 登录 URL 的 `t` 参数在平台侧通过 query 重新生成。
- 日志不输出 token、微信登录 code、userId 明文（userId 只在接口 body 中使用）。

## 登录态、缓存与重试

- `ctx.cache` 键 `auth`，保存 `{ token, userId, updatedAt }`，TTL 7 天。
- 与原脚本一致：有缓存且同时存在 `token` / `userId` 时直接使用，不在启动时额外校验。
- 查询签到任务时，如果整个响应 JSON 文本命中
  `未登录|token|登录失效|鉴权|unauthorized|401`，清缓存、重新
  `ctx.yyb.getCode({ appId })` 登录并只重试一次。
- 重试后仍判定鉴权失效，抛 `ctx.authExpired(...)`。
- JWT 只做 base64url 解码，不校验签名。

## 注册 / 手机号

- 青龙脚本没有注册/绑定手机号流程，登录接口直接用 `code` 换取 token。
- 平台没有额外添加注册接口或手机号授权；登录失败按普通错误抛出，由运行记录展示。
- 若后续确认该小程序存在“未注册”业务码，再按 `manualRequired(action=register)` 处理。

## 积分

- 该脚本没有查询积分余额的接口。
- `task/receive` 的 `obj.point` / `obj.integral` 是**本次签到获得积分**，不是余额，
  不能用于 `ctx.points.sync`。
- 平台不猜测余额字段，因此不调用 `ctx.points.sync`，只在 `metrics.earned` 和返回值
  `data.earned` 中记录本次获得积分。

## 商品 / 券

- 青龙脚本没有商品/优惠券列表接口。
- 因此未创建 `products.js`。

## 当前状态

- 代码：`node --check data/apps/jtc/scripts/sign-in.js` 通过。
- 清单：`app.json` JSON 校验通过。
- 本地 mock 验证通过：code 登录、JWT `sub.userId` 解析、签到查询、领取成功、
  今日已签、缓存 token 复用、缓存失效重登重试、重复领取文案。
- 未连接真实 YYB / 捷停车服务器联调（本机没有平台运行时的账号 ref / code）。
- 本次迁移只依据青龙脚本 `jtc.js`，未使用缓存小程序包。
- `enabled: true`。

## 阻塞 / 风险

1. **未实测**：登录、签到查询、领取均未用真实账号跑过。
2. **JWT 结构风险**：userId 依赖 `sub` 为 JSON 字符串且含 `userId`；若后端改为其它
   claim 结构，登录会报“未解析出 userId”。
3. **鉴权失效判断较宽**：沿用原脚本对整个响应 JSON 文本做正则匹配
   `未登录|token|登录失效|鉴权|unauthorized|401`。若正常响应里包含 `token` 字段，
   可能误触发重登；这是原脚本行为，未自行收紧。
4. **任务号/版本号**：`taskNo="T00"`、`PAGE_VERSION=312`、
   `applicationVersion=1.0.1` 为青龙脚本抓包时的值，小程序升级后可能需要同步更新。
5. **Host 头**：Node `fetch` 不允许真正覆盖 `Host`，代码保留但实际由 URL 决定；
   登录 URL 域名与 Host 一致，不影响请求。
