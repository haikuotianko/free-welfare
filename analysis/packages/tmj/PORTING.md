# 谭木匠会员俱乐部（tmj）迁移说明

## 基本信息

- AppID：`wxc6f9e3b38b25b840`
- 应用 key：`tmj`
- 源脚本：`N:\myProject\QLScriptPublic\wxapp\tmj.js`
- 平台脚本：`data/apps/tmj/scripts/sign-in.js`
- 应用配置：`data/apps/tmj/app.json`
- 解包目录：`analysis/packages/tmj/unpacked`（主包 raw 解包，wxapkg 版本 54）
- 账号来源：平台 `ctx.account`（YYB 账号），不再读取青龙变量/本地 token 缓存文件
- 当前状态：已迁移，`node --check` 通过；用本地 mock 走通登录、签到、今日已签、缓存 token 失效重登、未入会提示、register 动作
- 是否启用：`enabled: true`

## 接口清单

域名：`https://mall-mobile-v6.vecrp.com/mobile`

### 登录

- `POST /wxAppLogin`
  - body：
    ```json
    {
      "code": "<wx code>",
      "appid": "wxc6f9e3b38b25b840",
      "shopId": null,
      "envVersion": "",
      "isEnterpriseWx": false,
      "scene": "",
      "referrerInfo": ""
    }
    ```
  - 成功返回 `result.mobileToken`、`result.shopId`、`result.shopName`
  - `mobileToken` 为后续所有请求的 `token` 头

### 门店（登录响应缺 shopId 时）

- `POST /wxAppGetCommonData`
  - body：`{ "shopId": null, "outShopId": null, "latitude": 0, "longitude": 0 }`
  - 读取 `result.shopInfo.shopId` / `result.shopInfo.shopName`

### 积分体系

- `GET /activity/common/queryIntegralSystemList`
  - query：`shopId`、`earnSpendType=1`
  - 返回数组，元素含 `integralAccount`、`integralAlias`、`systemName`
  - 数组为空表示该账号未入会/未开通积分体系

### 签到活动

- `POST /activity/common/queryActivityList`
  - body：`{ earnSpendType: 1, shopId, pageNo: 1, pageSize: 10, integralAccount, activityType: 3 }`
  - 取 `activityType === 3` 且 `canJoin !== false` 的活动
- `GET /activity/sign/loadActivityInfo`
  - query：`activityId`、`source=1`、`shopId`
  - 返回 `title`、`canJoin`、`integral`（或 `awardDescMobileList[0].awardDescList[0].integrationNum`）
- `POST /activity/sign/querySignInfoList`
  - body：`{ activityId, startDate: "YYYY-M-01", endDate: "YYYY-M-<月末>" }`
  - 返回 `result.signDateList`，用于判断今日是否已签
- `POST /activity/sign/sign`
  - body：`{ activityId, shopId, signDate: "YYYY-MM-DD" }`
  - 成功返回 `result.integral` / `result.memberDayIntegral`

### 会员积分余额

- `GET /customer/queryMyMember`
  - query：`shopId`
  - 返回 `result.list[]`，元素含 `account`、`score`、`alias`
  - 用 `integralAccount` 匹配取 `score`；匹配不到时取第一项；再回退积分体系里的 `score`

### 入会 / 绑定手机号（来自解包）

- `POST /wxAppBindPhone`
  - body：`{ "shopId": "<shopId>", "encryptedData": "<手机号加密数据>", "iv": "<iv>" }`
  - `joinClubType` 可选，小程序根据入会入口传入；脚本不传
  - 仅当 `ctx.input.action === "register"` 且积分体系为空时调用
  - 成功后重新查积分体系，仍为空则视为入会失败

## 请求头与签名

```
User-Agent: Mozilla/5.0 ... MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF
Referer: https://servicewechat.com/wxc6f9e3b38b25b840/44/page-frame.html
Accept: application/json, text/plain, */*
Content-Type: application/json;charset=UTF-8
appid: wxc6f9e3b38b25b840
token: <mobileToken>
ts: <毫秒时间戳>
startTime: <同 ts>
sign: <sha1 hex>
X-TracedId: <uuid>
```

- `sign` 算法（保留原脚本）：
  1. 待签对象：GET 为 `{ ...query, secretKey, ts }`；POST 为 `{ body: JSON.stringify(payload), secretKey, ts }`
  2. 按 `` `${key}${value}` `` 的字典序排序 key
  3. 拼接 `` `${key}${value}` `` 后做 SHA-1 hex
- `secretKey = R6WbJ830wNsEdjH9GumwKYiYxHz0K9QD`
- 只使用 `ctx.crypto.sha1` / `ctx.crypto.uuid`
- 成功判断：`result.success === true` 或 `result.code === "0"`（小程序有 code=0 的写法）；失败取 `msg` / `message`
- token 失效：`401`、`403` 或消息命中 token/登录/授权/invalid/expire/过期

## 缓存

- key：`auth`
- 内容：`{ token, shopId, shopName, integralAccount, integralAlias, signActivityId, signTitle, updatedAt }`
- TTL：7 天
- 用 `queryIntegralSystemList` 校验缓存 token；失效后清缓存、重新取 code 登录
- 签到活动每次运行都会重新查询，缓存里的活动 id 只作兜底

## 注册 / 积分 / 商品

- 注册：已接入 `POST /wxAppBindPhone`，手机号授权结果来自 `ctx.yyb.getPhoneAuth({ appId })` 的 `encryptedData` + `iv`。
  - 只支持 `ctx.input.action === "register"`
  - 默认运行遇到积分体系为空会抛 `ctx.manualRequired(..., { details: { action: "register" } })`
- 积分：`GET /customer/queryMyMember` 的 `list[].score`，写入 `ctx.points.sync({ estimated: false })`
- `products.js`：未新增。
  - 解包中有积分商城列表 `GET /activity/integral/exchangeList`，但主包内没有找到调用处，请求参数、分页和返回字段都无法确认，按规则不硬编码
  - 优惠券接口 `/coupon/getCoupons` 存在，但属于领券中心，不是积分商品列表，未接

## 阻塞项 / 待验证

- 没有真实 YYB 账号做线上联调；本次只做了本地 mock（登录、签到、已签、缓存失效重登、未入会、register 动作）。
- `POST /wxAppBindPhone` 需要 `encryptedData` + `iv`；如果 YYB 只返回手机号 code 而不返回加密数据，自动入会会失败并提示人工注册。
- 签到活动优先取 `canJoin !== false` 的活动；不存在时回退到 `activityType === 3` 的任意活动，再用本月签到记录判断今日是否已签，避免已签账号直接报「未找到活动」。
- 积分商城接口参数/返回结构未确认，未做商品同步。
- 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
