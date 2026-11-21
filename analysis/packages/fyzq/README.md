# 风云再起北京（fyzq）

- AppID：`wxbc00cc79a68e2305`
- 解包版本：56
- 分析状态：部分验证（签到、奇豆商品已实测）
- 解包方式：KillWxapkg 在 `.vscode/launch.json` 格式化处失败，改用
  `analysis/tools/unpack/extract-wxapkg.cjs` 拆已解密包。

## 网络

- Base URL：`https://applet.njqsmx.com`
- 请求格式：`application/x-www-form-urlencoded`
- 公共参数：`deviceType=4`、`channel=wxxcx`、`token`、`sign`
- 签名：把参数按键名排序拼成 `k=v&k=v`，加双引号后 AES-128-ECB 加密，
  密钥 `rwCyegYqZjtnBPND`，Base64 去掉 `=`。

## 接口

| 能力 | 接口 | 成功码 | 关键字段 |
| --- | --- | --- | --- |
| 登录 | `POST /min/min-user/find_brand_key` | `code=1` | `data.data.token` |
| 签到状态 | `POST /mobile/business/sign/info/getCheckinInfo` | `header.code=0` | `checkStatus`、`integralCnt`、`consecutiveDay` |
| 签到 | `POST /mobile/business/sign/info/signIn` | `header.code=0` | `currentReward`、`currentSignDay` |
| 奇豆商品 | `POST /min/min-homePage/choice_goods_list` | `code=1` | `goodsId`、`goodsName`、`integral`、`stock`、`totalLimit` |
| 奇豆活动 | `POST /min/min-activity/get_coin_activity_list` | `code=1` | 当前返回空列表 |
| 积分明细 | `POST /min/min-user/queryPointsLog` | `code=1` | `cardId`、`cardNum`、`qType` |

签到两个接口使用 `{ header, body }` 信封；商品/活动使用普通表单。

## 平台脚本

- `data/apps/fyzq/scripts/sign-in.js`：登录、签到、同步奇豆
- `data/apps/fyzq/scripts/points.js`：独立查询奇豆余额
- `data/apps/fyzq/scripts/products.js`：同步 15 个奇豆商品

## 注意

- 商品积分字段是 `integral`；`discountIntegral > 0` 时优先用折扣价。
- `totalLimit` 按限购数写入；`stock` 为 0 时标记售罄。
- 活动接口当前返回空，未落同步脚本。
