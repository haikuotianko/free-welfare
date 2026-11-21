# 玛氏宠享会（mscxh）迁移记录

## 基本信息

- 应用 key：`mscxh`
- 名称：玛氏宠享会
- AppID：`wxd96d7e6249780c6a`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\mscxh.js`（由 YYB-GO 系脚本迁移而来）
- 平台脚本：`data/apps/mscxh/scripts/sign-in.js`
- 应用清单：`data/apps/mscxh/app.json`
- API Base：`https://petcare-consumer.marschina.com/index.php`
- 一个 Run 只处理 `ctx.account`，不循环账号
- 当前状态：已迁移，`node --check` 通过；用本地 mock 走通签名登录、积分查询、签到、今日已签、缓存 token、token 失效重登、未注册转人工、积分同步
- 是否启用：`enabled: true`

## 接口清单

| 用途 | 方法/route | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 静默登录 | `POST /index.php?r=api/passport/login` | `code, type=p, login_first=1, channel=default, store_id=42, timestamp, _version=2.8.9, _platform=wx, signature` | 参数同时放 query 和 form body；`code==0`；`data.access_token`、`data.nickname` |
| 会员/积分 | `GET /index.php?r=api/user/member` | `store_id, access_token, timestamp, _version, _platform, type=p, signature` | `code==0`；`data.user_info.integral` |
| 每日签到 | `GET /index.php?r=api/integralmall/integralmall/register` | 同上 + `type=1` | `code==0`；`data.integral` 为本次积分；已签到时 `code!=0` 且 `msg` 提示 |

业务成功码：`code == 0`（脚本按 `code/errno/status/ret/resultCode` 顺序取码）。错误文案优先取
`msg / message / errmsg / info`。

- 登录失败文案命中 `/未注册|不存在|未绑定|请先|注册|激活/`：微信号尚未注册/绑定会员。
- 签到文案命中 `/已签|签过|签到过|重复|已完成|明天|已经/`：今日已签。
- 签到文案命中 `/token|登录|未授权|失效|过期|未登录|鉴权|重新登录/`：清 token、重新登录后重试一次。
- 签到文案命中 `/请先授权|请授权|未注册|未绑定|绑定手机|完善.*信息|注册会员/`：需先在小程序授权/注册会员。

## 请求头 / 签名

```text
User-Agent: Mozilla/5.0 (Linux; Android 12; M2012K11AC ...) MicroMessenger/8.0.48.2580(0x28003036) ... MiniProgramEnv/android
authority: petcare-consumer.marschina.com
Accept: application/json, text/plain, */*
Content-Type: application/x-www-form-urlencoded   # 仅登录 POST
```

请求签名（GET/POST 通用，原脚本 `signParams`）：

```text
keys      = 本次请求全部业务参数的 key 升序
base      = keys.map(k => `${k}=${params[k]}`).join("&")
signature = md5(base + "GQWwdCoVdn7SXtdf")     # 小写十六进制
最终参数  = { ...params, signature }            # signature 不参与签名串
```

- 登录：`signature` 覆盖 `store_id, r, code, type, login_first, channel, timestamp, _version, _platform`；同一份带签名的参数既放 query 又放 form body。
- 其他接口：`signature` 覆盖 `store_id, access_token, timestamp, _version, _platform, r, type`，全部放 query。
- `store_id=42`、`SIGN_SALT`、`_version=2.8.9`、`_platform=wx` 是应用级固定常量，非个人凭证。
- `timestamp` 为秒级时间；每次请求单独生成。

## 缓存

- key：`auth`
- 内容：`{ token, nickname, updatedAt }`
- TTL：7 天
- 有缓存时直接使用；`api/user/member` 返回 401/403 或登录类文案时清缓存、重新 `ctx.yyb.getCode({ appId })` 登录并重试一次。
- 签到接口遇到登录失效也会清 token、重登并重试一次（`sign(false)` 防止循环）。

## 注册 / 积分 / 商品

- 注册：原脚本没有注册/绑定接口，只有提示。登录文案命中注册/未绑定关键词，或签到返回
  `/请先授权|请授权|未注册|未绑定|绑定手机|完善.*信息|注册会员/` 时，抛
  `ctx.manualRequired(message, { details: { action: 'register' } })`，提示先在小程序授权登录/注册会员。
- 积分：`api/user/member` 的 `data.user_info.integral`。签到后再次查询并用最新余额调用
  `ctx.points.sync({ balance, estimated: false })`；签到响应里的 `data.integral` 记入 `metrics.earned`。
- `products.js`：未新增。原脚本没有商品/优惠券列表接口，未猜路径。

## 当前状态 / 验证

- `node --check data/apps/mscxh/scripts/sign-in.js` 通过。
- 本地 mock 覆盖：登录签名（独立复算 md5 一致）、登录 form/query 双写、积分查询、签到成功、今日已签、
  缓存 token、token 失效重登、登录未注册转人工、积分同步。
- 未连接真实 YYB / 玛氏服务端联调；签名算法按原脚本逐字保留。

## 阻塞 / 风险

1. 新微信号如果尚未在玛氏宠享会授权/注册会员，登录或签到会被服务端拒绝，脚本转人工，不代注册、不代过手机号授权。
2. 签到接口是 GET 且所有参数（含 `access_token`）都在 URL query 中，平台日志/代理可能记录完整 URL；脚本自身不打印 token。
3. `timestamp` 依赖本机时间，如果偏差过大可能签名过期；脚本不做本地时钟校正。
4. 未执行 `pnpm import:apps`，未写数据库，未做微信 UI 自动化。
