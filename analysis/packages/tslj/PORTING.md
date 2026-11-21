# 谢瑞麟（tslj）迁移记录

- AppID：`wx439d0e0cc6742818`
- 最新缓存包：`25`（2026-11-16 抓取）
- 解包目录：`analysis/packages/tslj/unpacked`；原始代码：`analysis/packages/tslj/raw/app-service.js`

## 接口

- `POST /api/auth/login`：`{ code }`，返回 `data.user_info`（`token`、`openid`、`is_register`）。
- `POST /api/user/decryptMobile`：`application/x-www-form-urlencoded`，`{ encrypted_data, iv, shopCode, salesrepId, register_source, invite_user_id }`；手机号授权注册，返回 `mobile`、`member_id`、`card_no`、`is_register=true`。
- `POST /api/user/index`：`openid`，查积分与签到任务。
- `POST /api/userSignIn/signIn`：`openid`，签到。

## 注册流程（本次新增）

1. `/api/auth/login` 后如果 `user_info.is_register` 为假，调用 `ctx.yyb.getPhoneAuth({ appId })` 取 `encryptedData` / `iv`。
2. 以表单提交 `/api/user/decryptMobile`。`encrypted_data` / `iv` 只做一次表单编码；不要再手动 `encodeURIComponent`，否则服务端报 `illegal base64 data`。
3. 返回 `member_id` 即注册成功，继续签到。

## 实跑结果

- 2026-11-16：手机号授权注册成功（`member_id=f316...`），签到成功，累计 1 天，+5 积分。
- 脚本每次运行都重新登录，避免旧缓存 token 跳过 `is_register` 判断。
