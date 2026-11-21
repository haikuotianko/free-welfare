# 全棉时代（qmsd）迁移记录

## 基本信息

- 应用 key：`qmsd`
- 名称：全棉时代（Purcotton）
- AppID：`wxdfcaa44b1aa891a7`
- 青龙源脚本：
  - 主：`N:\myProject\QLScriptPublic\wxapp\qmsd.js`（2026 版，静默登录 + 签到 ID 发现 + 签到）
  - 辅：`N:\myProject\QLScriptPublic\wxapp\quanmianshidai.py`（同 AppID 的旧版，签到走 `/api/member/signIn/point`）
- API Base：`https://nmp.pureh2b.com`
- 平台脚本：`data/apps/qmsd/scripts/sign-in.js`
- 应用清单：`data/apps/qmsd/app.json`
- 一个 Run 只处理 `ctx.account`，不循环账号
- 当前状态：已迁移，`node --check` 通过；用 mock ctx 走通登录、签到 ID 发现、签到、今日已签、未注册；匿名探测确认真实接口形态
- 是否启用：`enabled: true`

## AppID 归属判定（重要）

任务描述认为「`nice.js` 和 `qmsd.js` 都出现 `wx231879a144b5879e`」，实际不是：

| 脚本 | AppID | 域名 | 判定依据 |
| --- | --- | --- | --- |
| `qmsd.js:13` 注释 / `qmsd.js:40` | `wxdfcaa44b1aa891a7` | `nmp.pureh2b.com` | 全棉时代 |
| `quanmianshidai.py:44` / `:81` | `wxdfcaa44b1aa891a7` | `nmp.pureh2b.com` / `sg01.purcotton.com` | 全棉时代 |
| `nice.js:21` | `wx231879a144b5879e` | `m.pailifan.com/xcx` | 纳爱斯品质生活 |

匿名调用 `GET https://nmp.pureh2b.com/api/new/member/sign/index?signId=QD26060001`，响应 `baseInfoVo.appid = "wxdfcaa44b1aa891a7"`、`memberBrand = "purcotton"`，服务端自己确认了全棉时代的 AppID。

结论：两个 AppID 各自清晰，`qmsd` 只使用 `wxdfcaa44b1aa891a7`；`wx231879a144b5879e` 是纳爱斯，未在此应用中使用，也没有创建错位应用。

## 接口清单

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 登录 | `GET /api/wx/main/login?code=<wx code>` | 无 token | 兼容两种包裹：`data.token/data.member/data.bind` 或顶层同名字段；成功 `token + member`，`member.availablePoint` 为积分；`bind="no"` / `member=null` 视为未注册 |
| 签到 ID | `POST /api/new/navigation/category/query` | token | body `{ pageNum: 1, pageSize: 10, venueType: "MAIN", categoryId: "010002" }`；从 `data.componentList` 的 `redirectInfo.info` 解析 `QD\d+` |
| 签到 ID 兜底 | `GET /api/new/navigation/nav/query?navigationId=<id>` | token | 首页 `pageConfig.topNavigationId` 存在时，从顶部导航再解析一次 |
| 签到详情 | `GET /api/new/member/sign/index?signId=<id>` | token | `signMember.signDateList` 含北京时间今天 = 已签；`signDays` 为累计天数；`baseInfoVo.activityStatus` 仅用于告警 |
| 签到 | `POST /api/new/member/sign/signIn` | token | body `{ signType: 1, signInId: "<signId>" }`；返回数组：非空取 `[0].rewardPoint`，空数组 = 今日已签 |

业务成功码：普通接口 `code == 200`；签到接口直接返回数组（原脚本语义）。HTTP 非 200 但响应体是对象时仍进入业务判断（与原脚本一致），只有非对象响应才抛错。

## 请求头 / 设备标识

```text
tag: v3.0
token: <登录 token>                # 登录请求为空
code: <设备 UUID>                  # 每个账号固定，缓存在 ctx.cache
content-type: application/json;charset=UTF-8
accept: */*
user-agent: Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 ...) MicroMessenger/8.0.34 ... Language/zh_CN
referer: https://servicewechat.com/wxdfcaa44b1aa891a7/1376/page-frame.html
```

- 原脚本还手写了 `host`、`connection`，属于传输层头，平台的 fetch 会忽略/覆盖，已省略，不影响服务端判定（已用匿名请求验证同样返回 200）。
- `code` 是客户端设备 UUID，不是个人凭据：首次生成 `ctx.crypto.uuid()`，存 `ctx.cache` 的 `device` 键（365 天），后续复用。
- 无自建签名、无加密。

## 签到 ID 发现

原脚本从首页组件里取第一个 `id=` 或 `QD\d+`。实测首页组件里还可能出现 `.../redpackgerain/index?id=HBY000135` 这类非签到 ID，因此平台版本：

- 递归收集所有候选 ID；
- **优先**取 `QD\d+` 形态；
- 都没有时退回 `QMSD_SIGN_ID` 环境变量或脚本默认值 `QD26060001`。

这是对 ID 选择的收紧，不改变接口协议。默认值已过期：`QD26060001` 在 2026-11-16 的活动状态是 `FINISHED`（结束于 2026-07-31），当前首页指向 `QD26090002`（`RUNNING`），所以正常运行应依赖自动发现；发现失败会打 warn，并用签到详情里的 `activityStatus` 提示活动已结束。

## 注册 / 手机号

青龙脚本没有注册流程，只提示「先在小程序里登录一次」。平台处理：

- `bind === "no"`、`member` 为空且有 openid/token，或文案命中 `未注册|注册|未绑定|绑定|会员` → `ctx.manualRequired(..., { details: { action: "register", bind } })`。
- 其它登录失败（如 HTTP 500 + `{code:68003, message:"登录失败"}`）按 `ApiError` 抛出，便于重试，不误判为未注册。

## 积分

- 登录响应的 `member.availablePoint` 是运行开始时的余额。
- 已签：直接同步该余额。
- 签到成功：同步 `availablePoint + rewardPoint`（服务端已确认发放的本次积分）。
- 该应用没有独立的积分查询接口（两份青龙脚本都没有），所以不做签到后复查；这一点在返回值 `data.gained` 中同时给出本次积分，便于核对。

## 未迁移内容

- `quanmianshidai.py` 的种棉花/浇水/阳光/好友浇水/任务领取（`sg01.purcotton.com`）——属于游戏玩法，不是签到，且会消耗水滴。
- `quanmianshidai.py` 的旧签到接口 `GET /api/member/signIn/point`（裸 `1`/`0`）。匿名探测该接口返回 `401 请先登录会员`，仍然存在；如果新版 `signIn` 接口失效，可作为回退方案再迁移。
- 青龙脚本里的 `sleep(1000)`、随机等待（平台调度负责节流）。
- `quanmianshidai.py` 的 `GET /api/prize/home`（种棉花的成长目标奖品列表）不是积分商城：没有积分价格/库存字段，也没有兑换动作，因此未创建 `products.js`。

## 当前状态

- 代码：`node --check` 通过；`app.json` JSON 校验通过。
- mock 联调：登录（200 分）→ 首页组件同时含 `HBY000135` 与 `QD26090002`，脚本选中 `QD26090002` → 详情未签 → 签到 `+2` → `points.sync(202)`；已签分支不再调用签到接口；`bind=no` 抛 `manualRequired(action=register)`；`QMSD_SIGN_ID` 环境变量可覆盖默认 ID。
- 匿名探测：
  - `POST /api/new/navigation/category/query` → 200，`success: true`，首页确实指向 `/sub/two/sign/v3/index?id=QD26090002`。
  - `GET /api/new/member/sign/index?signId=QD26060001` → `baseInfoVo.activityStatus = FINISHED`，`signMember: null`。
  - `GET /api/wx/main/login?code=invalid` → HTTP 500，`{code:68003, data:null, message:"登录失败", success:false}`。

## 阻塞 / 风险

1. 未用真实 YYB 账号联调：`signMember.signDateList`、`signIn` 的数组元素字段（`rewardPoint`）来自青龙脚本，未在带 token 的真实响应里核对。
2. 签到 ID 会随活动更换（默认 `QD26060001` 已结束）；若首页改版导致发现失败，脚本会退回旧 ID 并在日志提示活动结束。
3. 积分是「登录余额 + 本次奖励」推导，没有独立积分接口可复核；若服务端有延迟发放，余额会偏乐观。
4. `code` 设备 UUID 缓存在账号维度；清缓存后会换新设备号，原脚本也允许这种情况。
