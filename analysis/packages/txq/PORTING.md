# 汤星奇（txq）迁移记录

## 基本信息

- 应用 key：`txq`
- 名称：汤星奇（青龙脚本中称“汤星球”）
- AppID：`wx9bb6d5ac457bd69d`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\txq.js`
- 平台脚本：`data/apps/txq/scripts/sign-in.js`
- 应用清单：`data/apps/txq/app.json`
- API Base：`https://vip.by-health.com/vip-api`
- H5 Referer：`https://vip.by-health.com/web/vip-center-h5/`
- 一个 Run 只处理 `ctx.account`，不循环账号。
- 是否启用：`enabled: true`

## 接口清单

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| code 登录 | `POST /vip-api/auth/ma/login` | 无 | JSON `{ appId, code }`；`data.result.token` 为业务 token，`data.result.registerFlag` 为 `0` 表示该微信号尚未注册会员（登录仍发 token） |
| 签到活动详情 | `POST /vip-api/sign/activity/detail` | `Authorization: <token>`（裸 token） | 空 body `{}`；返回 `data.result.{activityId, signFlag, accumulateDay, remainingDay}`；`signFlag` 为真表示今日已签 |
| 每日签到 | `POST /vip-api/sign/daily/create` | `Authorization: <token>` | JSON `{ activityId }`；返回 `data.result.{accumulateDay, rewardType, undrawnFlag}` |

### 响应信封

所有接口是两层信封：

```json
{ "success": true, "data": { "rspCode": "00", "rspMsg": "", "result": {} } }
```

- 业务成功码是字符串 `"00"`，不是 `0` / `200`。
- 判定和取值都先下钻到 `body.data`，再读 `rspCode` / `rspMsg` / `result`。
- HTTP 非 200 直接抛错，与原脚本一致。
- 业务失败文案优先取 `data.rspMsg`，其次 `data.rspCode`。
- 重复签到：`rspMsg` 命中 `已签|已经签|签到过|重复|已完成|already` 时按 `alreadyDone: true` 返回。
- 登录态失效：`rspCode` 命中 `UNAUTHORIZED|TOKEN`，或文案命中 `登录|未授权|未登录|失效|过期|重新`。
- 未注册会员：`rspCode` 命中 `REGISTER_REQUIRED|NOT_REGIST`，或文案命中 `未注册|请先注册|未成为会员`。

## 请求头 / 加密

无自建签名、无请求加密、无 `ctx.crypto` 调用。所有请求使用同一套 H5 请求头：

```text
Content-Type: application/json;charset=utf-8
Accept: application/json, text/plain, */*
User-Agent: Mozilla/5.0 (Linux; Android 12; M2012K11AC Build/SKQ1.220303.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.6998.136 Mobile Safari/537.36 MicroMessenger/8.0.48.2580(0x28003036) MiniProgramEnv/android
Referer: https://vip.by-health.com/web/vip-center-h5/
xweb_xhr: 1
Authorization: <token>        # 仅登录后的接口；裸 token，不加 Bearer
```

- 签到接口来自 web-view H5（`#/signIn`），但 token 与小程序、H5 共用同一个 `/vip-api` 网关。
- 未新增、未修改任何请求头。

## 缓存

- token 写入 `ctx.cache` 的 `auth` 键，TTL 7 天，只保存 `token` 与 `updatedAt`。
- 缓存 token 先用 `/sign/activity/detail` 探测：
  - 返回 `null`（登录态错误）→ 清缓存、重新取 code 登录。
  - 返回其他结果（包括“未注册会员”“活动读取失败”）→ 视为缓存有效，与原脚本一致。
- 未在日志中输出 token、code。

## 注册 / 手机号

- 青龙脚本没有注册接口，只说明“未注册时 detail/create 回 `REGISTER_REQUIRED`，需先在小程序注册会员”。
- 平台实现：检测到未注册时抛 `ctx.manualRequired(..., { details: { action: 'register', step: 'sign_detail' } })`，提示先在小程序内注册。
- 未实现手机号授权注册，原脚本也没有该流程。

## 积分

- 脚本没有任何积分余额接口；`/sign/activity/detail` 只返回活动/签到信息，`/sign/daily/create` 只返回 `rewardType`、`undrawnFlag`、累计天数。
- 因此 `sign-in.js` 不调用 `ctx.points.sync`，也不猜测积分字段；`metrics` 不填 `earned` / `pointsAfter`。
- 应用清单 `pointsName` 保留默认“积分”，但当前没有余额数据源。

## 商品 / 券

- 青龙脚本没有商品/优惠券列表接口。
- `/sign/activity/*` 是签到活动，不是商品列表。
- 因此未创建 `products.js`。

## 未迁移内容

- `/sign/daily/draw`、`/sign/daily/raffle`：原脚本注释明确“按规则不做，本脚本只签到”。
- `/sign/activity/calender`：原脚本只读、未使用。
- `/check/*` 社区打卡：原脚本明确不是每日签到，未迁移。

## 当前状态

- `node --check data/apps/txq/scripts/sign-in.js` 通过。
- `app.json` JSON 校验通过。
- 本地 mock 验证通过：登录 → 活动详情 → 签到成功；重复签到；缓存 token 复用；缓存 token 失效重登；未注册会员转人工。
- 未连接真实 YYB / 目标服务器联调（本机没有平台运行时的账号 ref / code）。

## 阻塞 / 风险

1. **注册阻塞**：没有自动注册接口；未在汤星球注册会员的微信号每次运行都会转人工。需要先在小程序内完成注册。
2. **未实测**：登录、签到详情、签到 create 均未用真实账号跑过；`activityId` 完全依赖详情接口返回，原脚本明确“不猜 id”。如果活动详情不再返回 `activityId`，脚本返回 `ok: false`（`activity_missing`），不会盲猜。
3. **H5 契约**：签到端点在 web-view H5 bundle 中发现，`Referer` 固定为 `https://vip.by-health.com/web/vip-center-h5/`。如果 H5 改版或改成独立域名，需要重新抓包。
4. **无积分余额**：平台积分快照不会更新。
5. **User-Agent**：为青龙脚本抓包时的 Android 微信 UA，小程序升级后可按需更新。
