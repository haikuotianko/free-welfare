# 飞鹤会员（feihe）

- AppID：`wx4205ec55b793245e`
- 解包版本：433（主包）+ `_subPackages_xmhMainProcess_.wxapkg`
- 分析状态：草稿

## 已确认接口

| 能力 | 接口 | 说明 |
| --- | --- | --- |
| 登录 | `GET /api/starMember/getUserToken?code=` | 返回 token |
| 签到任务 | `GET /api/member/signin/tofinish?taskType=DJSYQD` | 上报任务 |
| 签到领奖 | `GET /api/member/signin/completeTask?taskType=DJSYQD` | 当前账号返回业务错误 |
| 会员资料 | `GET /api/member/mine` | 只返回 crmId/openId/等级等，不含积分 |
| 任务明细 | `GET /api/member/signin/taskDetail` | 待确认参数和积分字段 |

## 未完成

- 积分余额接口：主包 `/api/member/mine` 不返回积分；积分页在 `subPackages/xmhMainProcess/myIntegral`，但该子包的 app-service 未能拆出 JS。
- 签到 `completeTask` 对当前账号返回业务错误，可能需要账号资格或活动状态。
- 下一步：用抓包确认 `/subPackages/xmhMainProcess/myIntegral` 实际请求，或换解包工具拆出子包 app-service。

## 平台脚本

- `data/apps/feihe/scripts/sign-in.js`（停用）
- 未注册积分脚本，避免写入错误余额。
