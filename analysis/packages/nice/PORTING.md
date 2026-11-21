# 纳爱斯品质生活（nice）迁移记录

## 基本信息

- 应用 key：`nice`
- 名称：纳爱斯品质生活
- AppID：`wx231879a144b5879e`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\nice.js`
- API Base：`https://m.pailifan.com/xcx`
- 品牌 ID：`2655`（加密 body 的 `b` 字段与 `brand` 相关，来自青龙脚本）
- 平台脚本：`data/apps/nice/scripts/sign-in.js`
- 应用清单：`data/apps/nice/app.json`
- 一个 Run 只处理 `ctx.account`，不循环账号
- 当前状态：已迁移，`node --check` 通过；用 mock ctx 走通登录、签到、今日已签、缓存 token 失效重登；加密 body 已用真实接口验证
- 是否启用：`enabled: true`

## AppID 归属判定（重要）

任务描述里提到「`nice.js` 和 `qmsd.js` 都出现 `wx231879a144b5879e`」，实际读源码后不成立：

- `nice.js:21` `const MINI_APP_ID = "wx231879a144b5879e";`，接口域名 `https://m.pailifan.com/xcx`，`BRAND_ID = 2655`，登录 body `{ code }`，返回 `member_id` / `u` / `p`，签到记录字段 `member_sign_info`。
- `qmsd.js:13` 注释与 `qmsd.js:40` 都是 `wxdfcaa44b1aa891a7`，域名 `https://nmp.pureh2b.com`；`quanmianshidai.py:44` 同样写 `wxdfcaa44b1aa891a7`。
- 匿名调用 `GET https://nmp.pureh2b.com/api/new/member/sign/index?signId=QD26060001` 返回 `baseInfoVo.appid = "wxdfcaa44b1aa891a7"`、`memberBrand = "purcotton"`，可确认 `wxdfcaa44b1aa891a7` 是全棉时代（Purcotton）。
- `m.pailifan.com` 与 purcotton/h2b 无关，`wx231879a144b5879e` 不可能是全棉时代；青龙脚本自身标注为「纳爱斯品质生活」，变量名 `nice` 也与纳爱斯集团英文名 Nice 一致。

结论：`wx231879a144b5879e` 属于纳爱斯品质生活，`wxdfcaa44b1aa891a7` 属于全棉时代，两个 AppID 各自清晰，**不存在需要跳过的错标应用**。详见 `analysis/packages/qmsd/PORTING.md`。

## 接口清单

全部为 `POST`，body 为加密信封 `{ encode, t, bd }`。

| 用途 | 方法/路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 登录 | `POST /v2/user_login` | 无 token 字段 | 新版明文 `{ code, b: 2655, lat, lng, userInfo, userSource, equipment, scene }`；返回 `data.token`、`data.u`、`data.p`（手机号）、`data.status`（0=未绑手机号，1=已有会员） |
| 手机号授权注册 | `POST /v2/user_login` | 无 token 字段 | 携带 `encrypted_data_phone`、`iv_phone`、新的 `code`、`encrypted_data_user=" "`、`iv_user=" "`、`userInfo`、`userSource`、`equipment`、`scene`；返回 `data.token` |
| 用户信息 | `POST /m/user` | token | 返回 `data.user.member_id`、`data.user.phone` |
| 签到状态/积分 | `POST /u/signinlog` | token | `data.member_sign_info.sign_today`（1=今日已签）、`show_day`（连续天数）、`zongCoin`（总积分，缺失时取 `data.zongCoin`） |
| 签到 | `POST /u/signin` | token | 明文 `{ token, data: "2019-09-23", b, lat, lng }`（`data` 为脚本固定值）；响应 `data.data.coin` 为本次积分，`total_coins` 为总积分 |

业务成功码：`flag === 0`；失败文案优先取 `msg`，其次 `data.msg` / `data.message` / `data.reason`。
`data.reason === "unlogin"`、以及文案命中 `/40313|40317|unlogin|token|登录|授权|invalid/` 时按登录态失效处理（保留原脚本 `isTokenError`）。

## 请求头 / 加密

```text
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF
Referer: https://servicewechat.com/wx231879a144b5879e/290/page-frame.html
Accept: application/json, text/plain, */*
Content-Type: application/json
VERSION: 2022072802
brand: devtools
model: Windows
platform: windows
system: Windows 10
deviceOrientation: portrait
version: 8.0.5
size: 414,896
```

请求体加密（逐字保留原脚本 `encryptPayload`）：

```text
t    = 秒级时间戳
date = 北京时间 "YYYY-MM-DD HH:mm:ss"
key  = md5(固定盐 + date + t).slice(8, 24)     # 16 字节 ASCII
iv   = md5(date + t + 固定盐).slice(8, 24)
body = AES-128-CBC(JSON 明文零填充到 16 字节倍数, setAutoPadding(false)) -> base64
外层 = { encode, t, bd: 2655 }
```

- `ctx.crypto.aesEncrypt` 内部固定使用 PKCS7 填充，无法复现原脚本的零填充，因此脚本只用 `ctx.crypto.md5` 派生 key/iv，AES 由 `require('crypto')` 完成（平台 `ALLOWED_BUILTINS` 明确允许 `crypto`）。
- 固定盐是应用级常量，不是个人凭据。

加密已验证：用脚本的加密函数向真实接口发送 `code=invalid_code_probe`，返回 `flag=1`、`data.msg="登录超时,请退出移除小程序重试"`；把 `encode` 换成垃圾数据后返回 `data.msg="请求参数解析失败，请刷新重试"`。两者不同，说明服务端能正确解密脚本生成的 body。

## 登录态与缓存

- `ctx.cache` 键 `auth`，保存 `{ token, memberId, phone }`，TTL 7 天。
- 有缓存时用 `/u/signinlog` 静默校验；失效则清缓存重新取 code 登录，并重试一次。
- 手机号只用于日志（脱敏为 `138****1111`），不写入返回值。

## 注册 / 手机号

最新包（306）的登录页已给出完整的手机号绑定流程，平台已实现自动注册：

- 第一次 `/v2/user_login` 只带 `code + userInfo`；如果返回 `data.status === 0`，表示账号尚未绑定手机号。
- 此时调用 `ctx.yyb.getPhoneAuth({ appId })` 取 `encryptedData` / `iv`，再用一个新的 `ctx.yyb.getCode()` 作为 `code`，在同一个 `/v2/user_login` 里提交 `encrypted_data_phone` / `iv_phone`。
- 服务端返回 `data.token` 即注册成功（实测手机号 `***`，`remark: 注册成功`）。
- YYB 未返回密文或服务端拒绝时，抛 `ctx.manualRequired(..., { details: { action: 'register' } })`，不伪造成功。

## 实跑结果

- 2026-11-16：YYB 手机号授权自动注册成功，签到获得 5 积分；随后 `/u/signinlog` 与 `/u/signin` 均正常。
- 登录、注册、签到、积分同步链路已用真实账号跑通。

## 积分

- 余额来源：`/u/signinlog` 的 `member_sign_info.zongCoin`（缺失回退 `data.zongCoin`）。
- 签到成功后再查一次签到记录，用最新余额 `ctx.points.sync({ balance, estimated: false })`；连续天数写入 metrics。
- 签到响应里的 `coin` 作为本次获得积分，`total_coins` 也会更新内存余额。

## 未迁移内容

- 青龙脚本的本地文件 token 缓存（改为 `ctx.cache`）。
- 账号变量解析、`wx_server` 直连（改为 `ctx.yyb.getCode({ appId })`）。
- 青龙脚本没有积分商城/优惠券列表接口，未创建 `products.js`。

## 当前状态

- 代码：`node --check` 通过；`app.json` JSON 校验通过。
- 真实联调：登录 → 手机号授权注册 → `/m/user` → `/u/signinlog` → `/u/signin`（+5 积分）全部成功。
- 缓存 token 失效重登、今日已签分支保留。

## 阻塞 / 风险

1. 手机号授权依赖 YYB 返回 `encryptedData` / `iv`；如果后续 YYB 协议变更，注册会转 `manualRequired`。
2. 加密依赖北京时间 `date` 与秒级 `t` 的一致性；服务器时钟窗口未知，脚本不做本地时间校正。
3. 固定盐、`BRAND_ID=2655`、`VERSION` 等为小程序常量，换版可能变化。
