# 盈客宝电玩（ykb_all）迁移记录

## 基本信息

- 应用 key：`ykb_all`
- 名称：盈客宝电玩
- AppID：`wxf133aa0a4f191ffc`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\ykb_all.js`
- 青龙脚本中的对应门店：`ayldf` / 爱游乐东方（`appid=wxf133aa0a4f191ffc`，`templateVersion=game_2.32.0`）
- 无缓存小程序包，按青龙脚本迁移。
- API Base：`https://pw.gzych.vip`
- 平台脚本：`data/apps/ykb_all/scripts/sign-in.js`
- 应用清单：`data/apps/ykb_all/app.json`
- 一个 Run 只处理 `ctx.account`，不循环门店/账号。
- 脚本启用：`enabled: true`（未连接真实 YYB / 目标服务器联调）。

> 青龙 `ykb_all.js` 用一个脚本遍历几十家门店；本次只迁移任务指定的 `wxf133aa0a4f191ffc`。其他门店需要复制目录并替换 AppID / 模板版本，不能直接复用本应用的账号缓存。

## 接口清单

响应同时兼容两种信封：

- `{ ResponseStatus: { ErrorCode, Message }, Data }`：`ErrorCode=0` 成功；
- `{ code, msg/message, Data/data }`：`code` 为 `0` 或 `200` 成功。

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 登录（主） | `POST /ykb_huiyuan/api/v3/MembeGameLogin/appletLogin` | 微信 code | body `Code/AppId/WechatVersion/MobilePlatform/MallCode/TemplateVersion/extra`；返回 `Token/OpenId/MallCode/CustomerName` |
| 登录（回退） | `POST /ykbmini/api/v1/HomeAny/appletLogin` | 微信 code | 主登录失败时用新 code 再试一次 |
| 会员信息 | `GET /ykb_huiyuan/api/v1/MemberMine/Info` | token | `Name/NickName/Phone/ARTotalIntegral/MyScrip/GoldCoin/Ticket/Coupon` 等 |
| 储值资产 | `GET /ykb_huiyuan/api/v1/Member/GetMemberStoredValue` | token | 兼容数组、`List`、`Data`、`LeaguerValues`、`StoredValueList`；按 `Equity/Type/Name` 归类 |
| 签到详情 | `GET /ykb_huiyuan/api/v1/MemberCheckIn/GetDetail` | token | query `BeginDate/EndDate`（毫秒）；`IsCheckIn`、`Days`、`RewardRules` |
| 会员签到 | `GET /ykb_huiyuan/api/v1/MemberCheckIn/Submit` | token | 无参数；成功后重新查详情 |
| 任务列表 | `GET /hdb/api/v1/ClientTask/GetTaskListFromYDG` | token | query `TaskType=AllTask`；返回 `List` |
| 任务详情 | `GET /hdb/api/v1/ClientTask/GetUserTaskDetail` 或 `GET /hdb/api/v1/ClientTask/GetTaskDetail` | token | 有 `UserTaskID` 时用前者（query `UserTaskID`），否则用后者（query `TaskID`） |
| 参加任务 | `POST /hdb/api/v1/ClientTask/ReceiveTask` | token | body `{ ID: TaskID }`；返回 `UserTaskId` |
| 领取任务奖励 | `POST /hdb/api/v1/ClientTask/ReceiveTaskRewards` | token | body `{ UserTaskId }`；返回 `Rewards/RewardList` |

## 请求头 / 加密

无自建签名、无加密。请求头与青龙脚本一致：

```text
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF
Referer: https://servicewechat.com/wxf133aa0a4f191ffc/1/page-frame.html
Accept: application/json, text/plain, */*
content-type: application/json
Authorization: <token>        # 仅登录后
```

- 登录请求 `skipToken` 时不带 `Authorization`。
- 登录 body 的 `WechatVersion`/`MobilePlatform`/`TemplateVersion` 默认取青龙 `ayldf` 配置：`3.9.12` / `windows` / `game_2.32.0`。
- 平台环境变量可覆盖：`YKB_API_BASE`、`YKB_TEMPLATE_VERSION`、`YKB_WECHAT_VERSION`、`YKB_MOBILE_PLATFORM`（对应青龙的 `ayldf_*` 变量）。
- token 缓存在 `ctx.cache` 的 `auth` 键，TTL 7 天；缓存字段 `token/openId/mallCode/h5Prefix/customerName`。
- 缓存 token 用 `MemberMine/Info` 校验；token 失效会清缓存、重新登录并重试一次。

## 签到 / 任务

1. 先查 `MemberMine/Info` 和储值资产，记录代币/金币/积分/彩票/优惠券。
2. 查 `MemberCheckIn/GetDetail`：
   - `IsCheckIn=true`：今日已签，不再走任务。
   - 未签：调用 `MemberCheckIn/Submit`，再查一次详情确认。
3. 会员签到接口不可用（非登录失效）时，回退任务签到：
   - 任务名命中 `/签到|每日|天天|登录|打卡|check.?in|sign/`；
   - `Status` 归一化 `Completed→Complete`、`Failed→Fail`；
   - 已完成且 `RewardReceiveStatus=UnReceive` 时领奖；
   - 未完成时用 `TaskID` 参加任务，拿到 `UserTaskId` 后再查详情并领奖。

## 积分

- `ctx.points.sync` 只同步“积分”字段（`ARTotalIntegral/Integral/Exchange/Points`），`app.json` 的 `pointsName` 为“积分”。
- 代币、金币、彩票、优惠券属于不同资产，只放在 Run 的 `data.assets` 里，不写入积分余额，避免把储值当成积分。
- 储值资产接口缺字段时，不会再用 0 覆盖会员信息里的余额（青龙原逻辑会覆盖；这里做了保守修正）。

## 注册

青龙脚本没有注册接口。两个登录接口都失败且返回无 Token / 未注册提示时，抛
`ctx.manualRequired(..., { details: { action: 'register' } })`，需要用户先在对应门店小程序注册。

## 当前状态

- `node --check` 通过；`app.json` JSON 校验通过。
- 用本地 mock ctx 跑通：
  - 主登录 → 会员信息 → 会员签到 → 积分同步；
  - 会员签到接口返回业务错误 → 任务列表 → 参加任务 → 领取奖励；
  - token 缓存、手机号脱敏。
- 未连接真实 YYB / 目标服务器联调。

## 阻塞 / 风险

1. **门店名称与任务名不一致**：任务写“盈客宝电玩”，青龙 `ykb_all` 中 `wxf133aa0a4f191ffc` 对应“爱游乐东方”。脚本按 AppID 和青龙门店配置迁移，应用展示名用任务指定的“盈客宝电玩”。
2. **登录/注册未实测**：不确定该门店是否要求先注册、是否接受 YYB code；登录无 Token 会转人工注册。
3. **会员签到不一定开通**：部分门店可能没有 `MemberCheckIn`，脚本会自动回退任务签到；若两者都不可用会返回 `ok: false`。
4. **任务名是启发式**：沿用青龙的签到任务正则，运营改名后可能匹配不到。
5. **资产字段依赖响应结构**：`GetMemberStoredValue` 的字段/层级按青龙脚本兼容多种写法，真实响应若改版需要补映射。
6. **去掉了取码长退避**：青龙一次跑几十家门店，取 code 失败会等 45/90 秒；平台一个 Run 只跑一个账号，这里只取一次 code，失败直接报错。
7. **未真实联调**：接口路径、模板版本、请求头均来自青龙脚本，未在平台上跑过真实 Run。
