# 积分 / 商品 / 活动接口矩阵

记录已经从解包代码落地到平台脚本的接口。最后更新：2026-11-16。

| 应用 | 积分接口 | 商品接口 | 活动/任务接口 | 脚本状态 |
| --- | --- | --- | --- | --- |
| `sanf` | 三福现有接口 | 三福现有接口 | 签到活动 | 已验证 |
| `aima` | `GET /aima/wxclient/member/IndexInfo` | `POST /aima/wxclient/product/awards/deploy_up:search` | `POST /aima/wxclient/vip/member/point_tasks:search` | 积分 40、商品 37、任务 3 |
| `nwdjg` | `GET /scrm-promotion-service/mini/wly/user/info` | — | 签到 | 积分 110 |
| `campari` | `POST /cgs-api/wxApi/wechatUser/apiGetWechatUserInfo` | `POST /cgs-api/wxApi/pointCommodity/getPointCommodityList` | `POST /cgs-api/wxApi/point/getClockTaskStatus` | 积分 17、商品 20、任务 3 |
| `nestle` | `POST pointsservice/api/Points/getuserbalance` | — | `POST activityservice/api/task/getlist` | 巢币 14、任务 11 |
| `dasenlin` | `GET /member-center/entrance/getUserInfo`（`crmMemberInfo.integral`） | 积分商城子包未下载 | 签到/种人参 | 积分 2 |
| `huazhu` | `POST /personalCenter/rightAndInterest/getBriefInfo`（`basicInfo.point`） | H5 积分商城 | 签到 | 积分 4 |
| `lvbizi` | `GET https://h5.youzan.com/wscump/integral/user_points.json` | pointstore 子包未下载 | 有赞签到 | 积分 20 |
| `wugenvboshi` | 同上（有赞） | pointstore 子包未下载 | 有赞签到 | 积分 20 |
| `hrj` | `POST /api3/onecrm/point/ec/mbp/userInfo/queryUserAssetInfo`（`availablePoint`） | 微盟商城 | 签到 | 积分 0 |
| `tnjy` | `POST /api/Person/index`（`userInfo.score`） | `GET /api/unishop.product/index`（商城，积分属性未确认） | 签到 | 环保币 0 |
| `feihe` | 未找到；`/api/member/mine` 不含积分 | — | 签到任务 | 待抓包 |
| `fyzq` | `POST /mobile/business/sign/info/getCheckinInfo`（`integralCnt`） | `POST /min/min-homePage/choice_goods_list`（奇豆商品） | `POST /min/min-activity/get_coin_activity_list`（当前返回空） | 奇豆 10、商品 15 |
| `skyworth` | 签到脚本内同步 | — | 签到 | 待 RSA 私钥 |
| `aiguo` / `babycare` / `bydhy` | 未解包 | — | 签到 | 待账号/包 |

## 注意事项

- `dasenlin` 的积分商城页面在 `apps/member/integralMall`，但微信缓存只下载了 `apps/member/main` 子包，页面 JS 仍是 1 行占位，无法确认商品接口。
- `lvbizi` / `wugenvboshi` 的 `packages/pointstore` 也是占位页；已解包的 `_packages_shop_` 不包含 pointstore 代码。
- `hrj` 的 `queryUserAssetInfo` 需要 `customInfo`、`request` 和 `targetBasicInfo`（productId 146 / productInstanceId 8689224273），否则返回“请求参数不合法”。
- `campari` 商品库存 `totalCount` 为 0 时按“不限库存”处理，状态用 `shelfFlag` / `downShelfTime` 判断，不能直接按 0 库存判售罄。
- `nestle` 的 `getuserbalance` 返回 `data` 直接就是数值，不是对象。
- `tnjy` 的 `/api/Person/index` 返回 `data.userInfo.score`；环保币为 0 时也会正常写入。
- `campari` 的 `getClockTaskStatus` 只有 3 个布尔状态，没有积分数；任务积分显示为空。
