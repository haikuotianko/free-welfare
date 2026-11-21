# 所有女生（suoyounvsheng）迁移记录

## 基本信息

- 应用 key：`suoyounvsheng`
- 名称：所有女生
- AppID：`wx7d1403fe84339669`
- 最新包：`analysis/packages/suoyounvsheng/unpacked-1724`
- 平台脚本：`data/apps/suoyounvsheng/scripts/sign-in.js`
- 应用清单：`data/apps/suoyounvsheng/app.json`
- API Base：`https://7.wawo.cc/api`
- 默认签到活动码：`D2L0T1T4`
- 当前状态：已接入并启用，真实账号签到成功（今日已签）
- 只接签到接口，没有新增积分/商品/活动脚本

## 签到接口

| 用途 | 方法/路径 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| 微信登录 | `POST /identity/common/login` | JSON `{code, platform:"wx_app", businessLine:1}` | 成功 `code="000"`，`data.accessToken`、`data.cardNo` |
| 签到状态 | `POST /activity/wx/task/sign/signMsg` | JSON `{cardNo}` | `data.signed=1` 表示今日已签；`data.months[].signList` 为签到日期 |
| 签到 | `POST /activity/wx/task/sign/signIn` | header `activityCode`，body `{}` | 成功 `code="000"`；已签返回 `code="999"`、`message="今日已签到"` |

## 请求头

```text
Content-Type: application/json
AccessToken: <登录返回 accessToken>
activityCode: D2L0T1T4   # 仅签到接口需要
```

## 登录与缓存

- 用 `ctx.yyb.getCode({ appId })` 取微信 code。
- 缓存 key：`auth`
- 内容：`{ token, cardNo, userInfo, updatedAt }`
- TTL：7 天
- 缓存 token 失效时清缓存、重新登录并重试一次。
- 活动码可用应用环境变量 `activityCode` 覆盖，默认 `D2L0T1T4`。
- 登录成功但没有 `cardNo` 时抛 `ctx.manualRequired`，提示先在小程序注册会员。

## 错误处理

- 成功判断：`String(code) === "000"`。
- 已签到：`data.signed=1`，或签到返回文案包含 `已签/重复/已完成/上限`。
- 未登录/过期：清缓存重登。
- 奖励文案只使用响应里的 `cumulativeSignReward/reward` 字段，没有时显示“签到成功”。

## 验证

- `node --check data/apps/suoyounvsheng/scripts/sign-in.js` 通过。
- 真实账号运行：
  - 首次：`登录成功` → `今日已签到`
  - 再次：`使用缓存 token` → `今日已签到`
