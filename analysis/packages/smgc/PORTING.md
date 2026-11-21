# 上美广场（smgc）迁移记录

## 基本信息

- 应用 key：`smgc`
- 名称：上美广场
- AppID：`wx383a677b99e64655`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\smgc.js`
- 平台脚本：`data/apps/smgc/scripts/sign-in.js`
- 应用清单：`data/apps/smgc/app.json`
- API Base：`https://m.mallcoo.cn`（猫酷 / mallcoo 多商场会员系统）
- 账号来源：平台 `ctx.account`（YYB），一个 Run 只处理一个账号
- 解包目录：无（按要求未依赖缓存的小程序包）
- 当前状态：已迁移，`node --check` 通过；本地 mock 覆盖多商场登录、缓存 token、会话失效重登、已签到、未开放签到、部分/全部未注册、积分同步
- 是否启用：`enabled: true`

## 商场常量

平台为多商场会员系统，每个 SM 广场是独立 MallID，需要各自登录并各自缓存 token：

| 城市 | MallID |
| --- | --- |
| 成都 | `11544` |
| 晋江 | `12135` |
| 扬州 | `12540` |
| 厦门 | `11086` |
| 重庆 | `12305` |

`MallID`、城市名是应用级固定常量，不是个人凭证。可通过平台环境变量 `smgc_malls`
（对应青龙 `smgc_malls`）只跑部分城市，支持城市名或 MallID，逗号/中文逗号/空格分隔；
为空或不配置时跑全部 5 城。

## 接口清单

所有请求均为 `POST`，JSON body，公共外层：

```json
{
  "...业务字段": "...",
  "Header": {
    "systemInfo": {
      "model": "microsoft",
      "SDKVersion": "3.8.10",
      "system": "Windows 10 x64",
      "version": "4.0.6.21",
      "miniVersion": "DZ.2.5.64.1.SM.24"
    },
    "Token": "<Token>,<ProjectConfigID>"
  }
}
```

登录/项目接口的 `Header.Token` 为 `null`。

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 项目配置 ID | `POST /api/home/Mall/GetProjectConfigIDStandard` | `{ MallID }` | 无需登录；`m===1`，`d` 即 `ProjectConfigID` |
| 微信登录 | `POST /a/liteapp/api/identitys/LoginForThirdV2` | `{ MallID, Code, AppID, OpenID:"", NotVCodeAndGraphicVCode:true, SNSType:8 }` | `m===1`，`d.Token` 为后续 token，`d.NickName` 为昵称；无 Token 视为未注册/需绑定 |
| 签到状态 | `POST /api/user/user/GetNoticeFavoriteAndCheckinCount` | `{ MallId }` | `m===1`，`d.IsOpenCheckin` / `d.IsCheckInToday` |
| 执行签到 | `POST /api/user/User/CheckinV2` | `{ MallID }` | `m===1`，`d.Msg` 为签到提示；重复签到文案命中 `已签/签到过/重复/已完成` |
| 积分余额 | `POST /api/user/user/GetUserAndMallCard` | `{ MallId }` | `m===1`，`d.Bonus` 为商场积分；查询失败只告警，不影响签到结果 |

注意大小写：项目/签到用 `MallID`，状态/积分用 `MallId`，与原脚本保持一致。

## 请求头

```text
user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... MicroMessenger/7.0.20.1781 ...
xweb_xhr: 1
content-type: application/json
accept: */*
referer: https://servicewechat.com/wx383a677b99e64655/15/page-frame.html
accept-language: zh-CN,zh;q=0.9
```

- 无签名、无加密，不依赖 `ctx.crypto`。
- 取码：每个商场登录前调用一次 `ctx.yyb.getCode({ appId: 'wx383a677b99e64655' })`，
  因为微信 `code` 单次消耗；使用缓存 token 的商场不会重新取码。
- 成功码：`m === 1`；错误信息取 `e`。
- 登录失败文案命中
  `/未注册|绑定|手机号|会员|注册|授权|用户不存在|不存在|未找到用户|暂无数据|无数据/`
  或登录响应没有 `Token` 时，判定为未注册/需绑定。
- 会话失效文案命中 `/token|登录|未登录|未授权|鉴权|失效|过期|重新登录|请先登录|invalid/i`
  时，会清掉该商场的缓存并重新登录重试一次（仅一次）。

## 缓存

- 缓存 key：`auth`（平台按账号隔离）
- 内容：`{ malls: { "<MallID>": { token, projectId, nickName, updatedAt } }, updatedAt }`
- TTL：7 天
- 启动时逐商场读缓存；有 `token` 且 `projectId` 存在（允许 `0`）就直接复用。
- 状态查询或签到遇到会话失效时，只清除当前商场的缓存并重登，不影响其他商场。
- 缓存 token 无效时由业务接口鉴权错误触发刷新，没有额外的校验接口。

## 注册

青龙脚本没有注册/绑定接口，只有“先在小程序里登录/绑定一次”的提示，因此：

- 所有选中的商场都判定未注册时，抛
  `ctx.manualRequired(..., { details: { action: 'register', malls: [...] } })`。
- 部分商场未注册、部分成功时，保留原脚本“逐商场继续”的行为：返回 `ok: false`，
  `data.malls` 标出未注册商场，`nextActions` 提示去对应小程序登录/绑定，不中断其他商场。

## 积分

- 每个商场签到成功或今日已签后，调用一次 `GetUserAndMallCard` 读取 `d.Bonus`。
- 平台只有一个积分余额字段，这里同步“已查询到的商场积分合计”：
  `ctx.points.sync({ balance, estimated, rulesText })`。
- `estimated`：所有选中的商场都拿到数值时为 `false`；有商场未注册/失败/未开放签到导致
  没取到积分时为 `true`。
- 未开放签到的商场不会查询积分（与原脚本一致）。

## 商品 / 优惠券

未新增 `products.js`。青龙脚本只有登录、签到状态、签到、会员积分接口，没有商品/优惠券
列表或兑换接口，未猜路径。

## 验证情况

- `node --check data/apps/smgc/scripts/sign-in.js` 通过
- `app.json` JSON 解析通过
- 本地 mock 覆盖：
  - 成都签到 + 厦门已签到：逐商场登录、各自缓存、积分合计 `150` 并同步
  - 缓存 token + 状态接口返回“登录已过期”：清缓存、重登、签到成功
  - 商场未开放签到：`ok: true`、不查询积分、不误报已签
  - 全部未注册：抛 `manualRequired(action=register)`
  - 部分未注册：`ok: false`、未注册商场写入 `data.malls`、其他商场继续
  - `smgc_malls` 无匹配：返回 `ok: false`
- 2026-11-17 实测 `GetProjectConfigIDStandard`（成都 `11544`）返回 `{"m":1,"d":16548}`

## 阻塞项 / 待验证

1. 未使用真实 YYB 账号 + 真实 SM 会员账号联调；登录、签到、积分字段以青龙脚本契约和本地 mock 为准。
2. 微信 `code` 每个商场消耗一次；5 城全跑时一次 Run 最多取 5 次 code。YYB 侧限流/取码失败会影响对应商场。
3. 积分合计是各商场独立会员积分的求和，不是单一商场余额；已在 `rulesText` 和 `estimated` 中说明。
4. 部分商场未注册时脚本返回 `ok: false` 但仍会同步已查询到的积分；如希望只跑已注册城市，可配置 `smgc_malls`。
5. 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
