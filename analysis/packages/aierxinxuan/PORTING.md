# 爱儿心选（aierxinxuan）迁移记录

## 基本信息

- 应用 key：`aierxinxuan`
- 名称：爱儿心选
- AppID：`wx1fb666a33da7ac88`
- 最新包：`analysis/packages/aierxinxuan/unpacked-164`
- 平台脚本：`data/apps/aierxinxuan/scripts/sign-in.js`
- 应用清单：`data/apps/aierxinxuan/app.json`
- API Base：`https://msmarket.msx.digitalyili.com/gateway/api`
- tenant-id：`1678248156573593602`
- 当前状态：已接入并启用，真实账号签到成功（今日已签）
- 只接签到接口，没有新增积分/商品/活动脚本

## 签到接口

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 微信登录 | `POST /auth/account/milk/powder/login` | JSON `{jsCode}` | 成功 `status=true`，`data.accessToken`、`data.userInfo` |
| 签到状态 | `GET /member//sign/status` | 无 | `data.signed=true` 表示今日已签；`data.signList` 为签到日期 |
| 签到 | `POST /member//daily/sign` | JSON `{}` | 成功 `status=true`，`data.dailySign`、`data.continuationSign` |

### WAF 说明

小程序把 `/member/sign/status`、`/member/daily/sign` 通过 `wx.cloud` 云托管网关访问，直接请求会被腾讯云 WAF 返回 403 HTML。测试发现把路径写成 `/member//sign/status`、`/member//daily/sign` 可以绕过 WAF 的路径规则，后端会把多余斜杠归一化并正常处理。

## 请求头

```text
content-type: application/json
tenant-id: 1678248156573593602
access-token: <登录返回 accessToken>
```

## 登录与缓存

- 用 `ctx.yyb.getCode({ appId })` 取微信 code。
- 缓存 key：`auth`
- 内容：`{ token, userInfo, updatedAt }`
- TTL：7 天
- 缓存 token 失效时清缓存、重新登录并重试一次。

## 错误处理

- 成功判断：`status === true` 或 `success === true`。
- 已签到：`data.signed === true`。
- 未登录/过期：清缓存重登。
- 需要注册/绑定手机号：抛 `ctx.manualRequired`，`details.action = "register"`。

## 验证

- `node --check data/apps/aierxinxuan/scripts/sign-in.js` 通过。
- 真实账号运行：
  - 首次：`登录成功：***` → `今日已签到`
  - 再次：`使用缓存 token` → `今日已签到`
