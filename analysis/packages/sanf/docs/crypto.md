# 三福会员加密/签名

## 1. 结论

| 项 | 结论 | 依据 |
| --- | --- | --- |
| 传输 | TLS | `https://crm.sanfu.com` |
| 普通接口签名 | **未发现** | 登录/签到/福币/商品接口走 `sf-req2.js` 的普通 `b()` 分支 |
| 普通接口加密 | **未发现** | 请求体是明文 JSON |
| 响应加密 | **未发现** | 直接解析 JSON |
| 会话 | `Sf-Authorization: sid` + `cusId` | `utils/sf-req2.js` 的请求头 |
| 本地缓存 | App 明文缓存 `sid` 48h | `sf-auth.js` 设置 172800 秒 |
| 手机号 | `encryptedData` + `iv` + `sessionKey` | `auth/index.js` |
| 证书校验 | 未知 | 待抓包确认 |

> 结论只覆盖登录、签到、福币、商品/券、任务入口这些接口；会员卡/云支付/二维码是另一条链路，见下。

## 2. 普通请求

`utils/sf-req2.js` 的 `b()`：

```text
header:
  Sf-Authorization: <sid>
  cusId: <cardid>
  content-Type: application/json
body/query:
  sid: <sid>（业务参数里通常也带）
```

- GET 参数拼 query；POST 发 JSON。
- 没有 `sign/signature/timestamp/nonce` 参与普通接口。
- 现有 `sanf.js` 只把 `sid` 放 body 也能跑，但平台脚本建议 header + body 都带，贴近 App。

## 3. 特殊签名链路（不是普通接口）

`utils/sf-req2.js` 里另有一条 `S()`/`I()` 链路，用于会员卡/云支付/二维码等：

- 参数含 `appid`、`nonceStr`、`timestamp`、`mchId`、业务数据。
- 排序拼接后加硬编码 key，MD5 大写。
- Header 形如：

```text
Authorization: <MD5>_<appid>_GZW_<nonce>_<timestamp>
```

- 这条链路使用 `tcrm.sanfu.com` / `cashier.cloud.sanfu.com`，不是 `crm.sanfu.com` 的登录/签到/福币/商品接口。
- 代码里有硬编码 key；**不要写进公开文档/仓库**。
- 我们首期不做会员卡/云支付/二维码，不需要复现这条签名。

## 4. 会话

- `sid`：登录返回，放 `Sf-Authorization`；App 本地缓存 48 小时。
- `cardid`：登录返回 `curCusId`，放 `cusId`。
- `sessionKey`：登录返回，用于手机号 `encryptedData` 解密；敏感，不日志。
- `openid`/`unionid`：敏感，不日志。
- 业务失败 `code=40301`：未登录/会话失效，重新取 code 登录一次。

## 5. 手机号/注册

- `updateMobile` / `analyseMobileAuthInfo` / `wxMiniAppCustomerRegister` 需要：
  - `encryptedData`
  - `iv`
  - `sessionKey`（登录返回）
  - `sid`
- YYB `/wxapp/getPhoneNumber` 是否能提供等价的 `encryptedData`/`iv`，需要实测。
- 不要把手机号、`encryptedData`、`iv`、`sessionKey` 写日志/提交仓库。

## 6. 待确认

- [ ] 商品/兑换接口是否也走普通无签名链路（代码看是）
- [ ] 是否有证书校验/设备指纹
- [ ] `sessionKey` 是否能配合 YYB 手机号授权完成注册
- [ ] `nextYear` 的格式
- [ ] 会员卡/云支付签名是否需要复现（首期不需要）
