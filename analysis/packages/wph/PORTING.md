# 唯品会（wph）迁移记录

## 基本信息

- 应用 key：`wph`
- 名称：唯品会
- AppID：`wxe9714e742209d35f`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\wph.js`
- 平台脚本：`data/apps/wph/scripts/sign-in.js`
- 应用清单：`data/apps/wph/app.json`
- API Host：`https://mapi.vip.com`、`https://weixin-api.vip.com`、`https://act-ug.vip.com`
- 一个 Run 只处理 `ctx.account`，不循环账号
- 当前状态：已迁移，`node --check` 通过；用本地 mock 走通登录、签到、今日已签、缓存登录态、会话失效重登、未绑定账户转人工
- 是否启用：`enabled: true`

## 接口清单

全部为 `POST`，`Content-Type: application/x-www-form-urlencoded`，body 为 `URLSearchParams` 表单。

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 登录 1 | `POST https://mapi.vip.com/vips-mobile/rest/auth/third_party/trylogin/v1?api_key=ce29a51aa5c94a318755b2529dcb8e0b` | `baseData` + `{hash:"ptx26", code, event:2, deviceId:marsCid, context:'{"iv":"","encryptedData":""}', source_app_type:"shop_weixin_mina", login_type:"WEIXIN_SMALL_APP", third_type:"WEIXIN"}` | `code===1` 且 `data.tokenId`（VIP_TANK）、`data.userId` |
| 登录 2 | `POST https://weixin-api.vip.com/v4/LiteApp/getUserInfo?api_key=...` | `baseData` + `{code, iv:"", encryptedData:"", hash:"ptx26"}` | `code===0` 且 `data.openid`（唯品会侧 openid）、`data.unionid` |
| 签到状态 | `POST https://act-ug.vip.com/checkInAward/withSign/info?api_key=...` | `baseData` + `{openid:vipOpenid, actId:"H3gRnE1Xi18=", biz_code:"old"}` | `code===1`；`data.checkInList[isCheckInDay==1].isCheckIn===1` 表示今日已签 |
| 执行签到 | `POST https://act-ug.vip.com/checkInAward/withSign/checkin?api_key=...` | 同上 | `code===1`；`data.awardAmount` / `awardValDesc`、`numTotal`、`nonStopNum` |

`baseData` 固定字段（原脚本逐字保留）：

```text
app_name=shop_weixin_mina
client=wechat_mini_program
source_app=shop_weixin_mina
api_key=ce29a51aa5c94a318755b2529dcb8e0b
app_version=4.0
client_type=wap
format=json
mobile_platform=2
ver=2.0
standby_id=native
mobile_channel=nature
warehouse=VIP_NH
fdc_area_id=104104101
province_id=104104
wap_consumer=A1
net=WIFI
width=375
height=667
phone_model=Windows
phone_brand=microsoft
sys_version=Windows 10
is_default_area=1
app_theme_mode=0
app_theme_action=0
req_scene=0
t=<秒级时间戳>
mars_cid=<设备号>
```

固定常量（青龙脚本中的应用级常量，非个人凭据）：

- `API_KEY = "ce29a51aa5c94a318755b2529dcb8e0b"`
- `HASH = "ptx26"`
- `ACT_ID = "H3gRnE1Xi18="`
- `SIGN_SECRET_ENC = "Ql4mW09F3urBNdzBLfK6UuRTqj22Bta7eEKTO7n5jFf9uU6FZZmcfe/gurOAOB+o"`
- `PACKAGE_VERSION = "1371"`

## 请求头 / 加密

公共请求头：

```text
Accept: application/json, text/plain, */*
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... MicroMessenger/7.0.20.1781 ... MiniProgramEnv/Windows WindowsWechat/WMPF
Referer: https://servicewechat.com/wxe9714e742209d35f/1371/page-frame.html
```

签到接口签名（`signedHeaders`，只有 `act-ug.vip.com` 的 info / checkin 带）：

```text
secret = AES-128-CBC-decrypt(
  base64(SIGN_SECRET_ENC),
  key = "weixin_smallmina",
  iv  = "weixin" + 10 个 0x00
)   # 得到 32 位 hex 字符串

paramHash = sha1(
  参数按 key 升序，剔除 api_key，
  拼成 k=v&...，对象值 JSON.stringify
)

api_sign = sha1(path + paramHash + VIP_TANK + marsCid + secret)
```

请求头：

```text
Content-Type: application/x-www-form-urlencoded
Cookie: mars_cid=<marsCid>;userId=<userId>;warehouse=VIP_NH;VIP_TANK=<token>;wap_consumer=A1
X-Traceid: <同一份 cookie>;__need_sign=1
Authorization: OAuth api_sign=<api_sign>
```

- AES 解密使用 `ctx.crypto.aesDecrypt(SIGN_SECRET_ENC, "weixin_smallmina", { mode:"cbc", iv:"weixin"+10*0x00, keyEncoding:"utf8", output:"base64" })`；本地已用同一算法解出 32 位 hex secret。
- `marsCid` 是设备号，格式 `13 位时间戳_32 位 hex`（含原脚本 `createMarsCid()` 的校验位算法），首次生成后按账号缓存复用；登录与签名必须使用同一个。
- 登录 1 与登录 2 各消耗一个未使用的 `wx.login` code，脚本分别调用一次 `ctx.yyb.getCode`；这是原脚本明确要求，不能复用同一个 code。

成功/失败判断：

- 登录 1：`code===1` 且 `data.tokenId` 存在；`code===70202` 或文案命中
  `/没有绑定|未绑定|绑定唯品会/` → 未绑定账户；
- 登录 2：`code===0` 且 `data.openid` 存在；
- 签到 info / checkin：`code===1`；
- `code===10013` 或 `code===-2` → 登录态失效；
- 签到文案命中 `/已签|重复|already/i` → 今日已签（按成功处理）。

## 缓存 / 登录态

- `ctx.cache` 键：`auth`
- 内容：`{ token, userId, vipOpenid, unionid, marsCid, updatedAt }`
- TTL：7 天
- 缓存中同时有 `token`、`userId`、`vipOpenid` 时直接复用，不再取 code。
- 签到返回 `10013` / `-2` 时，删除缓存中的 `token` / `userId`（保留 `marsCid`、`vipOpenid`），重新登录并重试一次。
- 青龙脚本的本地文件缓存改为 `ctx.cache`，不再使用 `fs` / `path`。

## 注册 / 积分 / 商品

- 注册：青龙脚本没有注册/手机号绑定接口，只判断“没有绑定唯品会账户”。
  `trylogin` 返回 `70202` 或“没有绑定/未绑定/绑定唯品会”时，抛
  `ctx.manualRequired(..., { details: { action: "register" } })`。
- 积分：脚本能查到的 `awardVipcoinTotal` 是“该签到活动累计已得唯品币”，不是唯品币钱包余额；
  原脚本也没有钱包/余额接口。因此未调用 `ctx.points.sync`，避免把活动累计值写成账户余额。
- `products.js`：未新增。原脚本没有商品/优惠券列表接口。

## 验证情况

- `node --check data/apps/wph/scripts/sign-in.js` 通过。
- `app.json` JSON 解析通过。
- 本地 mock 覆盖：
  - 两次 `getCode` → trylogin → getUserInfo → 签到状态 → 签到 → 再次签到状态；
  - 签名头 `Authorization: OAuth api_sign=...`、`Cookie` 含 `VIP_TANK`、`X-Traceid` 以 `__need_sign=1` 结尾；
  - `marsCid` 格式 `^\d{13}_[0-9a-f]{32}$`，写入缓存并复用；
  - 今日已签分支不调用 checkin；
  - 签到状态返回 `10013` → 清登录态 → 重新登录 → 重试成功；
  - trylogin 返回 `70202` → `manualRequired(register)`。
- 没有真实 YYB 账号做线上联调；未请求真实唯品会接口。

## 阻塞项 / 风险

1. 平台多 `Set-Cookie` 只保留最后一条（runner 把响应头收成 `Record<string,string>`）；唯品会登录依赖 code 换 token，不依赖 Cookie 回写，影响较小。
2. `SIGN_SECRET_ENC`、`API_KEY`、`HASH`、`ACT_ID` 是小程序应用级常量，换版可能变化；secret 已本地解密验证，但未做真实接口验签。
3. `trylogin` 的 `code` 由微信侧一次性消费；如果 YYB 偶发取码失败，登录会直接失败，原脚本没有重试逻辑，本脚本也未新增。
4. 会话有效期未知，当前缓存 TTL 7 天，靠 `10013` / `-2` 重登兜底。
5. 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
