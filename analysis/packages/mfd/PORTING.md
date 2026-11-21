# 麦富迪会员（mfd）迁移记录

- AppID：`wx278a2ed79c5182f8`
- 应用目录：`data/apps/mfd`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\mfd.js`
- 解包目录：`analysis/packages/mfd/unpacked`（缓存包版本 503；`__APP__.wxapkg`）
- API：`https://cdp.myfoodiepet.com`
- 脚本：`scripts/sign-in.js`、`scripts/products.js`，均 `enabled: true`
- 一个 Run 只处理 `ctx.account`，不循环账号。
- 未运行 `pnpm import:apps`，未改数据库。

## 接口

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 会员身份配置 | `GET /tnew/myfoodiepet-member/v1/member/identity/info/wx278a2ed79c5182f8` | 公共头 | 返回 `groupId`、`agentId`；失败只告警 |
| 微信授权登录 | `GET /tnew/myfoodiepet-member/v1/wechat/applet/authorizeV2?code=<code>` | 公共头 | `code` 来自 `ctx.yyb.getCode`；返回 `openId`、`unionId`、`memberId`、`accessToken`、`phone` |
| 会员信息 | `POST /tnew/myfoodiepet-member/v1/member/queryByMemberId` | 公共头 | body `{ memberId, timestamp, signature }`；`signature = md5(memberId + timestamp + XpL9q#dK2zRf$tMn)`；返回 `availablePoint` 等 |
| 连续签到 | `GET /tnew/myfoodiepet-member/v1/member/continuous-days/<memberId>` | 公共头 | 返回 `continuousDays`、`signedToday` |
| 签到 | `POST /tnew/myfoodiepet-member/v1/member/sign` | 公共头 | body `{ memberId }`；业务成功码 `0` 或 `2` |
| 积分商城商品 | `GET /deepexi-dm-domain-integral/open-api/v1/pointsMall/list/wx278a2ed79c5182f8` | 公共头 | 参数 `page`、`size`、`ordering`、`status=1`、`version=正式`；响应 `payload.content[]`、`payload.totalPages` |
| 商品详情（解包） | `GET /deepexi-dm-domain-integral/open-api/v1/pointsMall/queryInfoAPP?id=<id>` | 公共头 | 详情页使用，脚本未调用 |
| 积分明细（解包） | `GET /deepexi-dm-domain-integral/open-api/v1/pointsMall/getMaxOrder` | 公共头 | 兑换限制，脚本未调用 |
| 注册（解包） | `POST /tnew/myfoodiepet-member/v1/member/regAndBind` | 公共头 | 未实现，见“注册” |

## 请求头 / 加密

```text
User-Agent: Mozilla/5.0 (...) MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF
Referer: https://servicewechat.com/wx278a2ed79c5182f8/402/page-frame.html
Accept: application/json, text/plain, */*
Content-Type: application/json
appId: 6259662812989361028
tenantId: 00ae459e842642f78b9ab0d8e7c027b4
wxAppid: wx278a2ed79c5182f8
groupId: <identity/info 返回>
X-Token: <accessToken>
userId: <memberId>   # 有 memberId 时
```

- 请求参数统一追加 `_=<毫秒时间戳>`；GET 参数放 query，POST 放 body。
- 业务成功码：`String(code) === "0"` 或 `Number(code) === 2`。
- 会员信息签名为 MD5：`md5(memberId + timestamp + SIGN_SALT)`，使用 `ctx.crypto.md5`。
- 登录态缓存到 `ctx.cache` 的 `auth` 键（openId/unionId/memberId/accessToken/phone/groupId/agentId），TTL 7 天。
- 401/4016 或 token/登录/授权类文案视为登录失效，清缓存并重登重试一次。

## 注册

- 解包确认存在注册/绑定接口：
  - `POST /tnew/myfoodiepet-member/v1/member/regAndBind`
  - `POST /tnew/myfoodiepet-member/v1/wechat/applet/binding/mobilePhoneV4`
  - `POST /tnew/myfoodiepet-member/v1/wechat/applet/binding/mobilePhoneV4Sms`
- 青龙脚本没有走注册；`authorizeV2` 对已注册微信号返回 `memberId`。
- 当前移植版在 `authorizeV2` 未返回 `memberId` 时抛 `ctx.manualRequired(..., { details: { action: 'register' } })`，提示先在小程序完成注册/手机号绑定。
- 未调用 `ctx.yyb.getPhoneAuth`：`regAndBind` 的完整请求体（手机号授权 code、短信 ticket、协议等）未在解包中确认，避免臆造。
- 若后续联调确认 `regAndBind` 字段，可在此处接入手机号授权自动注册。

## 积分 / 商品

- 积分：`queryByMemberId` 返回 `availablePoint`（兼容 `point` / `points` / `integral`），签到前后各查一次，调用 `ctx.points.sync({ balance, estimated: false })`。
- 商品：`products.js` 调用积分商城列表接口，映射：
  - `externalId = id`
  - `name = activityName`
  - `imageUrl = imageMain`
  - `pointsCost = requiredPointsMin || requiredPoints`
  - `stock = remainingQuantityAll`
  - `status = stock > 0 ? on_sale : sold_out`
- `version=正式` 为接口必填中文字段；`commodityTypeOne` 传空串；未传 `point`/`memberLevel`，避免按当前账户积分过滤商品。

## 阻塞 / 说明

- 商品列表接口的 `point`、`memberLevel`、`ordering` 等服务端过滤参数未在真实环境验证；当前只同步全量在售商品。
- 登录接口 `authorizeV2` 在解包中会对特定路径追加 `X-Device-Token`（图灵盾），青龙脚本未使用；若服务端开始强校验，需要补风险 token。
- 新账号注册需要手机号绑定，暂未自动化；命中时走 `manualRequired(action=register)`。
- 已用 `node --check` 校验通过；并用本地 mock ctx 跑通登录、签到、积分和商品同步流程（未发真实网络请求）。
- 未连接真实 YYB/目标服务器联调。
- `enabled: true`。
