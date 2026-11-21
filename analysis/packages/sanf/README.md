# 三福会员中心

## 基本信息

| 项 | 值 |
| --- | --- |
| 名称 | 三福会员中心 |
| AppID | `wxfe13a2a5df88b058` |
| 平台 | 微信小程序 |
| 分类 | 会员 / 福币 / 商城 |
| 图标 | `assets/icon.svg`（占位，待替换为官方图标） |
| 状态 | 已解包，接口已定位，待真实账号验证 |
| 包版本 | 420 |
| 解包时间 | 2026-11-13 |
| 参考脚本 | `N:\myProject\qinglong-script\mini-program\sanf.js` |

## 文档

- [概览](docs/overview.md)
- [接口](docs/api.md)
- [积分](docs/points.md)
- [加密/签名](docs/crypto.md)
- [商品](docs/products.md)
- [活动](docs/activities.md)

## 已确认

- 登录：YYB code → `wxMiniAppLogin` → `sid` + `curCusId` + `sessionKey`。
- 请求头：`Sf-Authorization: sid`、`cusId: curCusId`；body/query 也带 `sid`。
- 福币余额：`GET customer/getPoint` → `restMoney`。
- 即将过期：`historyPoint`；有效期：`nextYear`，**年末过期**。
- 签到状态：`onSignDetail` → `signIn`；签到：`onSign`。
- 签到日历/规则：`getSignLogsList` → `signRule`、`signStatus`、`keepSignDays`。
- 商品：`listPointExchangeCoupon` / `listPointExchangeCouponNew`。
- 商品详情：`getPointExchangeCoupon`。
- 兑换：`usePointExchangeCoupon`；`data="completeMsg"` 需完善资料。
- 任务入口：签到、购买商品、点亮勋章、评价订单；勋章/自动化/赠礼有独立接口。
- 普通接口未发现签名/加密；会员卡/云支付另有 MD5 签名链路，首期不需要。

## 网络根 URL

| id | 根 URL | 用途 | 脚本需要 | 白名单 |
| --- | --- | --- | --- | --- |
| `crm` | `https://crm.sanfu.com` | 登录/签到/福币/商品/兑换 | 是 | 是 |
| `m` | `https://m.sanfu.com` | 服务器时间/H5 | 可选 | 否 |
| `img` | `https://img.sanfu.com` | 图片/静态资源 | 否 | 否 |
| `tcrm` | `https://tcrm.sanfu.com` | 会员卡/云平台 | 否（首期） | 否 |
| `cashier` | `https://cashier.cloud.sanfu.com` | 云支付/二维码 | 否（首期） | 否 |
| `ab` | `https://ab.sanfu.com:26666` | 开关/配置 | 否 | 否 |
| `track` | `https://track.sanfu.com` | 埋点 | 否 | 否 |

- 应用网络模式：`whitelist`。
- 脚本 manifest 只声明 `crm.sanfu.com`。
- 其他根 URL 只记录，不加入脚本白名单。

## 脚本拆分

| 功能 | 脚本 | 说明 |
| --- | --- | --- |
| 登录/会话 | `common/auth` | `ensureSession`、`login`、`getSession` |
| 手动登录 | `login` | 测试/首次绑定 |
| 签到 | `sign_in` | 状态→签到→复查 |
| 福币 | `points` | `getPoint`，余额+过期 |
| 商品 | `products` | 列表/详情 |
| 兑换 | `redeem` | 券/权益，后续 |
| 活动 | `activities` | 勋章/任务/自动化，后续 |
| 注册 | `register` | 手机号/注册，待验证 |

## 待验证

- [ ] `nextYear` 真实格式
- [ ] 商品库存/限购字段
- [ ] 兑换成功/失败/完善信息真实返回
- [ ] 注册/手机号能否用 YYB
- [ ] 勋章/活动状态字段
- [ ] 证书校验/设备指纹
- [ ] 官方图标

## 风险

- 接口版本/headers 可能变化。
- 兑换/领取是写操作，必须先确认幂等与结果。
- 注册/手机号依赖 `sessionKey` + `encryptedData` + `iv`，YYB 是否等价待测。
