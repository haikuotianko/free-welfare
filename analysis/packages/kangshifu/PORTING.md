# 康师傅畅饮社（kangshifu）迁移记录

## 基本信息

- 应用 key：`kangshifu`
- 名称：康师傅畅饮社
- AppID：`wx54f3e6a00f7973a7`
- 青龙源脚本：`N:\myProject\QLScriptPublic\wxapp\kangshifu.js`
- 平台脚本：`data/apps/kangshifu/scripts/sign-in.js`
- 应用清单：`data/apps/kangshifu/app.json`
- 最新包：`analysis/packages/kangshifu/unpacked-908`
- API Base：`https://club.ksf.cn/`
- 论坛/会员 Base：`https://nclub.ksf.cn/pro/`
- 当前状态：已用真实 YYB 账号联调，登录、会员信息、签到状态正常，签到返回“今日已签到”
- 是否启用：`enabled: true`

## 接口清单

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 登录 | `POST /whale-member/api/login/login` | JSON `{code, inviterId, inviterType, inviterMatchUserId, spUrl}` | 成功 `code=0`，`data.token`；请求头不需要旧 `skey` |
| 会员信息 | `GET /whale-member/api/member/getMemberInfo` | query `token`；请求头 `token` | 返回昵称、手机号、积分 |
| 签到状态 | `POST /api/signIn/integralSignInList` | form `token` | `data.signIs=true` 表示今日已签 |
| 签到 | `POST /api/signIn/integralSignIn` | form 空体 | 成功 `code=0`；重复签到按文案兜底 |
| 积分 | 会员信息字段 | - | `integral/point/points/score` 任一存在即同步 |

## 关键修复（2026-11-17，908 版）

1. 旧包使用 `club.biqr.cn` / `nclub.gdshcm.com`；908 版改为 `club.ksf.cn` / `nclub.ksf.cn`，旧域名登录会返回“登录响应未返回 token”。
2. 平台 HTTP 适配器必须用 `rawBody` 发送 form；之前把 form 字符串放进 `body`，适配器会再 JSON 序列化，签到状态接口返回 500。
3. 908 版登录后 token 同时用于请求头 `token` 和 form 字段 `token`；两种形式均实测可用。
4. 签到状态接口已实网验证 `signIs=true`，签到 POST 未重复执行（今日已签）。

## 注册 / 积分 / 商品

- 注册：原脚本没有独立注册接口，登录即注册/绑定。
- 积分：会员信息接口返回积分，脚本会同步余额。
- 商品：本次只核对签到链路，未新增商品脚本。

## 验证

- `node --check data/apps/kangshifu/scripts/sign-in.js` 通过。
- 真实账号运行：`登录成功：测试账号`、`用户：测试账号，积分：205`、`今日已签到`。
