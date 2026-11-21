# 爱玛会员俱乐部（aima）

- AppID：`wx2dcfb409fd5ddfb4`
- 解包版本：228
- 分析状态：部分验证（签到、积分、商品、任务已实测）

## 目录

```text
unpacked/        # KillWxapkg 解包产物（已 gitignore）
metadata.yaml    # 应用/网络/接口摘要
docs/api.md      # 接口清单
```

## 已知能力

| 能力 | 接口 | 平台脚本 | 状态 |
| --- | --- | --- | --- |
| 登录 | `POST /aima/wxclient/user/members:login` | `common.js` | 已验证 |
| 签到 | `POST /aima/wxclient/mkt/activities/sign:join` | `sign-in.js` | 已验证 |
| 积分 | `GET /aima/wxclient/member/IndexInfo` | `points.js` | 已验证（当前 40） |
| 积分商品 | `POST /aima/wxclient/product/awards/deploy_up:search` | `products.js` | 已验证（37 个积分商品） |
| 会员任务 | `POST /aima/wxclient/vip/member/point_tasks:search` | `activities.js` | 已验证（3 个任务） |

## 注意

- 商品接口会返回现金商品，脚本用 `exchange: true` + `storePoint > 0` 过滤。
- 请求头签名是 MD5，不涉及请求体加密。
- 活动 `joinStatus` 的完成语义仍需对照真实页面确认。
