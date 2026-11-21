# iQOO 社区（iqoo）迁移记录

## 基本信息

- 应用 key：`iqoo`
- 名称：iQOO 社区
- AppID：`wxcf4266fbc9463132`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\iqoo.js`
- 缓存包：`%APPDATA%\Tencent\xwechat\radium\users\e9c7432ed37e6090dde819f8e5e4d21a\applet\packages\wxcf4266fbc9463132\262`
- 解包目录：`analysis/packages/iqoo/unpacked`
- 平台脚本：
  - `data/apps/iqoo/scripts/sign-in.js`
  - `data/apps/iqoo/scripts/products.js`
- 应用清单：`data/apps/iqoo/app.json`
- API Base：`https://bbs-api.iqoo.com/api/`
- 签名密钥（生产，解包 config）：`2618194b0ebb620055e19cf9811d3c13`

## 接口清单

### 登录 / 注册

`POST /v3/users/vivo/mini`

- JSON：`{ code, encryptedData, iv, from: 46 }`
- `code`：优先使用 `getPhoneAuth()` 返回的 `code`（若存在），否则
  `ctx.yyb.getCode({ appId })`，保证 code 与密文尽量处于同一微信会话。
- `encryptedData` / `iv`：小程序登录页 `IQOOLogin(e, n)` 的原值来自
  `wx.getUserInfo` 加密数据（青龙脚本从 wx_server `/wx/getuserinfo` 获取）。
  平台侧改用 `ctx.yyb.getPhoneAuth({ appId })` 的 `encryptedData` / `iv`。
- 响应：`Code === 0`，`Data.accessToken` / `Data.token`、`Data.userId`、`Data.user`。
- 该接口同时承担注册/登录；没有找到独立注册端点（只有 `v3/users/vivo/mini/unbind`）。
- 若 YYB 未返回密文或服务端拒绝解密，脚本抛
  `ctx.manualRequired(..., { details: { action: "register" } })`。

### 用户 / 积分

- `GET /v3/user?userId=<userId>`
  - 返回 `Data`，`Data.score` 为酷币余额。
  - 也用于校验缓存 token。

### 签到

- `POST /v3/sign`
  - JSON：`{ from: "group" }`
  - 成功：`Code === 0`，`Data.serialDays`、`Data.score`（本次获得）、
    `Data.scoreCount`（签到后余额）。
  - 重复：错误码 `13006` 或文案 `已签 / 重复 / 今日`。

### 幸运抽奖

- `GET /v3/today.draw.count` → `Data.count`
- `count === 0` 时 `POST /v3/luck.draw`（JSON `{}`）→ `Data.prize_name`
- 抽奖失败只记录警告，不影响签到主链路。

### 酷币商品（products.js）

- `GET /v3/goods.list`
  - Query：`scope=0&page=1&perPage=100&filter[goodsType]=0&filter[saleStatus]=2`
  - 游客可访问（商城页未登录也会请求），因此不依赖 token。
  - 响应：`Code === 0`，`Data.list[]`；`Data.total` 为总数。
  - 商品字段：`id`、`goods_name`、`goods_images[]`、`goods_score`、`goods_stock`、
    `goods_sale_status`、`goods_type`、`is_auction`、`is_lottery`、`list_at`、`delist_at`、`level`。
  - 匿名实测（2026-11-16）：`filter[goodsType]=0` 返回 44 个商品，覆盖 `goods_type`
    1/2/3；签名与 `X-Visitor` 均被接受。
  - 映射：
    - `externalId = id`
    - `name = goods_name`
    - `imageUrl = goods_images[0]`
    - `pointsCost = goods_score`
    - `stock = goods_stock`
    - `startAt = list_at`，`endAt = delist_at`
    - `status = goods_sale_status===1 && 未到 list_at && 未过 delist_at
      ? (stock>0 ? on_sale : sold_out) : off_shelf`
    - 拍卖商品（`is_auction`）直接跳过，不做竞拍同步。
  - 只同步默认 `goodsType=0`（实测即全量），但为防服务端分页/类型变化，
    `ctx.products.sync(..., { deactivateMissing: false })`，不删除未出现的商品。

## 请求头 / 加密

签名算法（解包 `IQOORequest` + `q()`）：

```text
method  = 大写 GET/POST
query   = GET 时按 key 字典序排序，key/value 均 encodeURIComponent，
          并额外转义 ! ' ( ) * 为 %21 %27 %28 %29 %2A；POST 时为空串
body    = POST 时 JSON.stringify(data)；GET 时为空串
raw     = `${method}&/api/${path}&${query}&${body}&appid=1002&timestamp=${unixSeconds}`
sign    = base64(HMAC-SHA256(raw, SIGN_SECRET))
SIGN    = `IQOO-HMAC-SHA256 appid=1002,timestamp=${ts},signature=${sign}`
```

请求头：

```text
Authorization: Bearer <accessToken>   # 未登录为 "Bearer "
X-Visitor: <32 位 hex 设备指纹>
X-Platform: mini
SIGN: IQOO-HMAC-SHA256 appid=1002,timestamp=...,signature=...
Content-Nonce: ""
User-Agent: Mozilla/5.0 ... MicroMessenger/7.0.20.1781 ... XWEB/19027
Referer: https://servicewechat.com/wxcf4266fbc9463132/253/page-frame.html
```

- `X-Visitor`：小程序用 fingerprintjs 的 x64hash128；平台侧生成随机 16 字节 hex，
  缓存在 `ctx.cache` 的 `visitor` 键（365 天），保证同一账号稳定。
- 成功码 `Code === 0`；`-4011` / 401 / 403 / 登录/访客权限文案视为登录态失效。
- token 缓存在 `ctx.cache` 的 `auth` 键，TTL 7 天。

## 注册 / 积分 / 商品状态

- 注册：登录接口即注册；未找到独立注册接口。使用手机号授权密文登录。
- 积分：`/v3/user` 的 `Data.score`，签到响应 `Data.scoreCount` 优先。
- 商品：已新增只读 `products.js`，只同步、不兑换、不竞拍。

## 已实现逻辑

`sign-in.js`：

1. 缓存 token + visitor；`GET /v3/user` 校验 token。
2. 失效时 `getPhoneAuth` + `getCode` → `POST /v3/users/vivo/mini` 登录并缓存。
3. 查询用户资料。
4. 查询抽奖次数，次数为 0 时抽奖（尽力）。
5. `POST /v3/sign` 签到；重复签到按已签到处理。
6. 用 `scoreCount` 或重新查 `/v3/user` 得到余额，`ctx.points.sync`。
7. 登录态失效自动重登重试一次。

未移植原脚本的社区互动任务：`v3/posts.update`（点赞/取消赞）、
`v3/thread.share`、`v3/view.count`、`v3/posts.create`（评论 "666"）。
这些任务会修改公开社区内容且需要多次 5 秒等待，不影响签到主链路。

## 当前状态

- 代码：已写入，`node --check` 通过。
- 签到脚本：`enabled: true`。
- 商品脚本：`enabled: true`。
- 匿名实测（2026-11-16）：
  - `POST /v3/sign`（无 token）签名通过，返回 `{"Code":-3001,"Message":"请先登录！"}`；
  - `GET /v3/goods.list` 签名通过，返回 44 个商品。
- 2026-11-17 最新包（263）核查 + 真实账号联调：登录改为 YYB `operateWxData(webapi_getuserinfo)` 取用户资料密文，不再使用手机号密文；登录、抽奖、签到均成功。

## 阻塞 / 风险

1. **登录密文来源**：原脚本用 `wx.getUserInfo` 的 `encryptedData`/`iv`，平台只能拿到
   手机号授权密文。若 `v3/users/vivo/mini` 只接受用户资料密文，服务端会拒绝，
   此时需要把两个脚本改为 `enabled: false`，人工在小程序完成登录后再启用。
2. `v3/goods.list` 已匿名实测（2026-11-16）返回 44 个商品；签到/用户接口因没有
   真实 YYB 账号未联调。
3. `X-Visitor` 只是形状一致的稳定随机值，不等同于真实设备指纹；若风控校验设备指纹，
   需要改用固定真实值。
4. 抽奖可能中实物奖，脚本只记录奖品名，不处理收货地址。
5. 商品同步跳过拍卖商品（`is_auction`），拍卖类目不在本脚本范围内。
