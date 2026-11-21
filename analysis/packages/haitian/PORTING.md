# 海天美味馆（haitian）迁移记录

## 基本信息

- 应用 key：`haitian`
- 名称：海天美味馆
- AppID：`wx7a890ea13f50d7b6`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\haitian.js`
- 解包来源：`%APPDATA%\Tencent\xwechat\radium\users\e9c7432ed37e6090dde819f8e5e4d21a\applet\packages\wx7a890ea13f50d7b6\817`
- 平台脚本：
  - `data/apps/haitian/scripts/sign-in.js`
  - `data/apps/haitian/scripts/products.js`
- 应用清单：`data/apps/haitian/app.json`

## 接口清单

基址：

- `https://cmallapi.xkmm.cn/buyer-api`
- `https://cmallapi.xkmm.cn/base-api`
- `https://cmallwap.xkmm.cn/haday`

### 登录 / 注册

海天没有单独的注册接口，手机号快捷登录会在服务端自动注册/登录。

1. `POST /wechat/mini/phoneNew/login`
   - Query（不是 body）：`edata`、`iv`、`code`、`uuid`、`article_ids`、`app_versions=1.0.0`
   - `edata` / `iv` 必须来自**手机号**授权回调，即 YYB `getPhoneAuth()` 返回的 `encryptedData` / `iv`；
     不能用 `getuserinfo` 的用户资料加密数据，否则服务端固定回 HTTP 500 `{"code":"E131","message":"登录失败"}`。
   - `code`：手机号授权后再取一次 `wx.login` code。
   - `uuid`：20 位十六进制字符串，登录后缓存复用。
   - 响应：`{ success, access_token, refresh_token, ... }`。

2. `POST /passport/token`
   - Form：`refresh_token`
   - 响应：`access_token` / `accessToken`、`refresh_token` / `refreshToken`。

3. `POST /wx/auth/loginByToken`（社区 token）
   - 基址：`https://cmallwap.xkmm.cn/haday`
   - JSON：`{ access_token }`
   - 响应：`data` 为社区 token；后续请求带 `X-Haday-Token`。

4. `GET /pages/REGISTRATION_AGREEMENT,PRIVACY_PROTECTION_CLAUSE/articles/list`
   - 基址：`https://cmallapi.xkmm.cn/base-api`
   - 无鉴权，返回协议数组，取 `article_id` 拼成 `article_ids`；失败时继续登录。

### 会员 / 积分

- `GET /members`
  - 鉴权：`Authorization: <access_token>`
  - 关键字段：`member_id`、`mobile`、`consum_point`、`nickname`
  - 积分余额取 `consum_point`。

### 签到

- `GET /sign/activity/code?activityCode=`
  - 取当前签到活动，返回 `activity_code`。
- `POST /sign/activity/sign`
  - JSON：`{ activity_code, fill_date: "" }`
  - 成功：`is_sign === true` 或 `success === true`。
  - 重复：HTTP 500 `{"code":"1019","message":"今天已经签到过了"}`，按“今日已签到”处理。

### 附加任务

- `POST /members/browsePage`，form body 为空。
- `POST /members/commnity/brosing/duration/add?seconds=10`，form body 为空。
- 两者都是尽力执行，失败不影响签到。

### 积分商品 / 券

`products.js` 只读同步，不做兑换。

- `GET /point/goods/list`
  - Query：`pageNo`、`pageSize`（实测 `page`/`pageNum` 会报「页码不能为空」，`pageNo` 正确）
  - 该接口实测**无需登录**即可返回商品目录；`products.js` 不依赖 token。
  - 响应：`{ data:[...], page_no, page_size, data_total }`
  - 列表字段：`goods_id`、`goods_code`、`goods_name`、`need_point`、`need_money`、
    `goods_cover`（JSON 字符串数组）、`middle_pic`、`small_pic`、`quantity`、`enable_quantity`、
    `is_quota`、`quota_num`、`market_enable`、`online_time`、`under_time`。
  - 映射：
    - `externalId = goods_id`
    - `name = goods_name`
    - `pointsCost = need_point`
    - `cashCost = need_money`（0 视为 null）
    - `stock = enable_quantity ?? quantity`
    - `status = market_enable==1 && !delete_time && 未到 online_time && 未过 under_time ? (stock>0 ? on_sale : sold_out) : off_shelf`
    - `limitPerUser = is_quota ? quota_num : null`
    - `startAt/endAt`：`online_time`/`under_time` 的 Unix 秒转 ISO
  - 分页每页 50，最多 20 页；如果 `data_total` 表明没拉完，本次直接失败，不做删除缺失商品的同步。

`/point-mall/checkout-params/address-id/{id}` 是积分兑换下单用的地址参数接口，只读同步不需要。

## 请求头 / 加密

- 无自建签名或加密算法；唯一“加密”是微信手机号授权的 `encryptedData` + `iv` 透传。
- 通用头：
  - `User-Agent`：iPhone MicroMessenger 8.0.70
  - `Referer`：`https://servicewechat.com/wx7a890ea13f50d7b6/772/page-frame.html`
  - `uuid`：20 位十六进制
  - `envVersion: release`
  - `Authorization: <access_token>`
  - 有社区 token 时加 `X-Haday-Token`
  - 默认 `Content-Type: application/x-www-form-urlencoded`；签到接口用 `application/json`
- 成功码：`code` 为 `0` / `200` 或缺省；401/403 视为登录态失效；重复签到 `1019`。

## 已实现逻辑

`sign-in.js`：

1. 读取 `ctx.cache` 的 `auth`；有 token 时先 `GET /members` 校验。
2. 失效时先用 `refresh_token` 续期；续期失败再走手机号授权登录。
3. 登录后查会员信息、同步积分。
4. 执行浏览任务（尽力）。
5. 取签到活动并签到；登录态失效自动重登重试一次。
6. `ctx.points.sync({ balance: consum_point, estimated: false })`。

未移植：青龙脚本里的积分抽奖任务（`/lucky/task/...`、`/lucky/activity/...`），
避免一次 Run 内长时间浏览等待和额外活动状态分支；签到主链路不受影响。

`products.js`：

1. 直接 `GET /point/goods/list`（公开接口，不需要登录）。
2. 分页拉取积分商品，映射 `need_point` / `enable_quantity` / `quota_num` 等字段。
3. `ctx.products.sync(..., { deactivateMissing: true })`，只读，不兑换。

## 当前状态

- 代码：已写入，`node --check` 通过。
- 签到脚本：`enabled: true`。
- 商品脚本：`enabled: true`。
- 商品接口 `/point/goods/list` 已用公开请求实测（2026-11-16）：`pageNo=1&pageSize=50` 返回 48 个商品。
- 签到链路未做实网联调（本机没有平台运行时的 YYB code / 账号 ref）。

## 阻塞 / 风险

1. 必须能拿到**手机号**授权 `encryptedData` / `iv`。若 YYB 只返回普通用户资料加密数据，
   服务端会回 E131；若 YYB 完全拿不到手机号授权数据，脚本会抛 `ctx.manualRequired`，
   `details.action = "register"`。
2. 若服务端整体拒绝手机号授权数据，需要把 `app.json` 的脚本改为 `enabled: false`，
   等手动在小程序完成手机号快捷登录后再启用。
3. 签到活动可能随活动上下线；没有 `activity_code` 时脚本返回 `ok: false`，不会伪造签到成功。
4. 浏览任务/抽奖属于活动侧行为，服务端可能随时调整。
