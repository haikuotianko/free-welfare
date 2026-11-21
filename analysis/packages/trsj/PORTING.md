# 甜润世界（trsj）迁移记录

## 基本信息

- 应用 key：`trsj`
- 名称：甜润世界
- AppID：`wx210e40a77dbe7a27`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\trsj.js`
- 平台脚本：`data/apps/trsj/scripts/sign-in.js`
- 应用清单：`data/apps/trsj/app.json`
- API Base：`https://m.ahzyssl.com`
- 账号来源：平台 `ctx.account`（YYB），一个 Run 只处理一个账号
- 解包目录：`analysis/packages/trsj/unpacked-101`
- 当前状态：已迁移，`node --check` 通过；2026-11-17 再次实测，登录正常，签到接口稳定返回 `code=502,msg="请绑定手机号！"`，账号侧未绑定手机号；服务端 500/502 已加入退避重试
- 是否启用：`enabled: false`（绑定手机号后再启用）

## 接口清单

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 微信登录 | `GET /wx/user/appletLogin` | query `code` | `code===200`，`data` 即 applet token（裸 token，非 Bearer） |
| 校验登录态 | `GET /applet/user/getUserBaseInfo` | 无 | `code===200` 且 `data` 存在；`data.userName` 仅用于日志 |
| 签到记录 | `GET /applet/user/signIn/getUserSignInLog` | 无 | `data.userSignInList[]{ signInDate, signInStatus }`，`signInStatus===1` 表示已签 |
| 签到有奖 | `POST /applet/user/signIn` | JSON `{}` | `code===200` 成功；已签走 `msg` |
| 石斛状态 | `GET /applet/game/dendrobium/get` | 无 | `code===200` 且 `data` 存在 = 已种植 |
| 石斛播种 | `GET /applet/game/dendrobium/sowing` | 无 | `code===500` 或 `msg` 含“没有正在培养”时调用；`code===200` 成功 |
| 石斛签到记录 | `GET /applet/game/dendrobium/signIn/getUserSignInLog` | 无 | `data.todaySignInStatus` 为真表示今日已签 |
| 石斛签到 | `GET /applet/game/dendrobium/signIn` | 无 | `code===200` 成功 |

成功码统一为 `code === 200`；错误信息取 `msg` / `message`。

已签到判定：`/已签|签到过|重复|已完成/`。

未注册判定：登录或校验文案命中 `/未注册|未绑定|未激活|不存在|请先|注册/`（校验接口额外
包含 `无权限|登录`）。

## 请求头

业务接口：

```text
Host: m.ahzyssl.com
Connection: keep-alive
charset: utf-8
Content-Type: application/json;charset=utf-8
User-Agent: Mozilla/5.0 (Linux; Android 14; PJE110) ... MiniProgramEnv/android
Referer: https://servicewechat.com/wx210e40a77dbe7a27/page-frame.html
Accept: */*
Authorization: <applet token>   # 裸 token
```

登录接口单独使用 WMPF User-Agent：

```text
Host: m.ahzyssl.com
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... MicroMessenger/7.0.20.1781 ... WindowsWechat/WMPF
Accept: */*
Referer: https://servicewechat.com/wx210e40a77dbe7a27/page-frame.html
```

- 无签名、无加密，不依赖 `ctx.crypto`。
- 取码：`ctx.yyb.getCode({ appId: 'wx210e40a77dbe7a27' })`。
- 平台 `fetch` 会忽略脚本设置的 `Host`（由 URL 决定），保留该头只为与原脚本一致。

## 缓存

- 缓存 key：`auth`（平台按账号隔离）
- 内容：`{ token, updatedAt }`
- TTL：7 天
- 启动时先用缓存 token 调 `getUserBaseInfo` 校验：
  - 校验成功：直接使用缓存 token；
  - 校验失败：清空内存 token，重新取 code 登录，再校验。
- 登录成功后立即写入缓存。

## 注册

青龙脚本没有注册/激活接口，只有“先在小程序登录一次”的提示。因此：

- 登录文案命中未注册规则，或登录后 `getUserBaseInfo` 仍判定未注册时，抛
  `ctx.manualRequired(..., { details: { action: 'register' } })`。
- 签到记录/签到过程中如果返回未注册文案，也会在 Run 结束时转 `manualRequired`。

## 签到流程

1. `ensureLogin`：缓存 token 校验或重新登录。
2. `signAward`（主签到）：
   - 查 `getUserSignInLog`，按北京时间 `yyyy-MM-dd` 比较 `signInDate`，且 `signInStatus===1`
     视为今日已签；
   - 未签则 `POST /applet/user/signIn`，`code===200` 成功。
3. `dendrobiumSign`（次签到，best-effort）：
   - 查种植状态；未种植且符合青龙条件时尝试播种（不带作者个人 `inviteUserId`）；
   - 查今日石斛签到状态；
   - 未签则 `GET /applet/game/dendrobium/signIn`。
   - 石斛失败只记录 warning，不影响主签到结果。

主签到成功但石斛失败时返回 `ok: true`；主签到失败时返回 `ok: false`，即使石斛成功。

## 服务端 500/502 重试

该服务对大流量请求经常直接返回 500/502/503 HTML，同一请求稍后重试就可能恢复（实测同一次登录/签到记录请求会在 200 和 502 之间来回变化）。

脚本对以下情况进行最多 4 次、带 `1.5s × 次数` 退避的重试：

- HTTP `429/500/502/503/504`；
- 网络异常 / 超时。

业务 JSON 内的 `code=500/502` 不自动重试：例如签到接口返回 `{"code":502,"msg":"请绑定手机号！"}` 属于账号资料问题，直接转人工处理。

重试失败后仍会在错误信息中标注“已重试 4 次”，避免把服务端短暂故障误判成脚本逻辑错误。

## 绑定手机号

签到有奖和石斛签到都要求先绑定手机号，服务端固定返回：

```json
{"code":502,"msg":"请绑定手机号！"}
```

绑定接口是 `POST /applet/user/changeTelephone`，参数为 `{phone, code}`，`code` 需要短信验证码；脚本无法代替用户接收短信。因此检测到该文案时抛 `ctx.manualRequired`，`details.action = "bind_phone"`，保持脚本停用，等账号绑定后再启用。

## 未迁移的青龙逻辑

青龙脚本头部契约写明：“原脚本的推文浏览/买肥料/自动施肥属养成任务，非签到，已略去。”
虽然脚本正文仍保留了 `getTaskList` / `articleList` / `dendrobiumRead`，本次按契约不迁移：

- 这些是石斛养成任务，不是签到；
- 文章 URL 来自服务端列表，域名不在本应用网络白名单（仅 `m.ahzyssl.com`）；
- 阅读还依赖随机等待 3–10 秒和外部文章请求，不适合作为签到脚本的稳定步骤。

如果后续需要做养成任务，应单独建脚本并补充文章域名白名单，而不是混入 `sign-in.js`。

## 积分

- 青龙脚本没有积分余额查询接口，只有签到成功提示，因此不调用 `ctx.points.sync`，
  避免编造余额。
- `capabilities` 只声明 `sign_in`，未声明 `points`。

## 2026-11-17 最新包（101）核查

- 登录 `/wx/user/appletLogin` 仍正常，`getUserBaseInfo` 校验通过。
- 签到 `/applet/user/signIn` 用 JSON body 会返回 HTML 502；改为 form 空体后返回 JSON `{code:502,msg:"请绑定手机号！"}`。
- 连续探测 4 次：签到记录接口在 HTTP 200 和 502 HTML 之间波动；签到接口每次都返回 `{code:502,msg:"请绑定手机号！"}`，确认不是临时 500，而是账号未绑定手机号。
- 已修复脚本里 `options.form` 的未定义变量错误，并为所有业务请求加入 4 次 5xx 退避重试。
- 平台实测：缓存 token 失效后自动重登；登录第一次 502、第二次成功；签到有奖和石斛签到均转 `manualRequired(action=bind_phone)`。
- 说明账号侧未绑定手机号，属于账号资料问题；脚本保持停用，待账号绑定手机号后再启用。

## 商品 / 优惠券

未新增 `products.js`。青龙脚本没有商品/优惠券列表或兑换接口。

## 验证情况

- `node --check data/apps/trsj/scripts/sign-in.js` 通过
- `app.json` JSON 解析通过
- 本地 mock 覆盖：
  - 新登录：取 code → 登录 → 校验 → 签到记录为空 → 主签到成功 → 石斛已种植 → 石斛签到成功
  - 缓存 token：校验成功，签到记录显示今日已签，不重复 POST；石斛今日已签
  - 登录返回未注册：抛 `manualRequired(action=register)`
  - 主签到查询失败 + 石斛未种植 → 自动播种 → 石斛签到成功；主签到仍返回 `ok: false`
- 断言了登录 query 的 `code`、Authorization 使用裸 token（非 Bearer）
- 真实账号平台实测：
  - 缓存 token 过期后自动重新登录
  - 登录请求首次 HTTP 502，重试后成功
  - 签到有奖返回 `请绑定手机号！`，转 `manualRequired(action=bind_phone)`
  - 石斛签到记录首次 HTTP 502，重试后返回业务码 `502`，同样转绑定手机号提示

## 阻塞项 / 待验证

1. 账号未绑定手机号，签到有奖和石斛签到都会被服务端拒绝；需在小程序“我的-绑定手机号”完成短信验证后，再启用脚本。
2. `signInStatus` 按青龙脚本严格比较数字 `1`；若服务端返回字符串 `"1"`，会走一次签到请求，再由“已签”文案兜底。
3. 石斛播种按青龙条件仅在 `code===500` 或 `msg` 含“没有正在培养”时触发；其他错误不强行播种。
4. 石斛接口是 best-effort，失败不会让整个 Run 失败，也不会写入积分。
5. 未迁移文章浏览任务（原因见上）；如需要请单独立项。
