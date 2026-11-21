# 02 微信自动化调研

本文回答四个问题：

1. 怎么拿到在线小程序的代码/调试信息？
2. 怎么拿小程序登录信息？YYB-Go-Enhanced 提供了什么？
3. 怎么解包小程序，补商品/活动接口？
4. 三福会员签到这个首个脚本怎么落地？

结论：

- **调试/逆向**：WMPFDebugger（PC 微信运行时调试）+ KillWxapkg（静态解包）+ mitmproxy/Reqable（抓包）。
- **生产取码**：YYB-Go-Enhanced，提供目标小程序的 **一次性 `wx.login` code**。
- **业务登录**：脚本拿 code 去目标小程序后端换业务 token/sid。
- **平台**：负责账号、站点、脚本订阅、调度、日志、通知，不直接碰业务接口。

---

## 1. WMPFDebugger：在线小程序运行时调试

### 1.1 它是什么

WMPF = WeChat Mini Program Framework，PC 微信里运行小程序/小游戏的运行时。WMPFDebugger 通过 Frida patch WMPF 的 CDP 过滤器和条件判断，把私有 protobuf 调试协议转成标准 Chrome DevTools Protocol。

用途：没有源码时，也能看小程序的 JS、网络请求、Console、Storage、断点调用栈。

### 1.2 环境与限制

- Windows x86_64：支持一批 WMPF 版本（README 会列最新适配版本），可尝试 `--auto-detect`。
- macOS arm64：支持特定 WMPF 版本。
- Linux x86_64：支持特定版本，但仍是桌面微信运行时，不是服务器方案。
- 依赖 Node.js LTS v22+、yarn、Chrome/Edge、Frida。
- 只适用于 PC 微信；微信/WMPF 更新会导致偏移失效。
- 内嵌 WebView 是独立进程，Network 可能看不到；见 `EXTENSION.md`。
- 云函数/服务端逻辑看不到；代码可能混淆/压缩。
- GPLv2；`src/third-party` 代码版权归腾讯；不要随意分发衍生代码。

### 1.3 使用步骤

```bash
git clone https://github.com/evi0s/WMPFDebugger
cd WMPFDebugger
yarn
npx tsx src/index.ts
```

1. 保持调试器运行。
2. 在 PC 微信打开目标小程序。
3. Chrome/Edge 打开 `devtools://devtools/bundled/inspector.html?ws=127.0.0.1:62000`。
4. Sources 格式化代码，搜索 `wx.request`、`login`、`sign`、`token`、`encrypt`、`fubi` 等。
5. Network 清空后手动操作一次签到/兑换，记录 URL、headers、body、response。
6. Application/Storage 看缓存里的 `sid`、token、活动配置。

顺序：**先启动调试器 → 再开小程序 → 最后开 DevTools**。

### 1.4 典型分析

- 在 Network 找到登录/签到/商品/活动请求。
- 在 Sources 搜 URL 路径或字段名，定位调用处。
- 看签名/时间戳/nonce/AES/设备参数怎么生成。
- 看响应里的成功码、已签到标记、积分字段、库存/限购字段。
- 复制成 curl/TS，脱敏后作为 fixture。

---

## 2. KillWxapkg：静态解包

### 2.1 它是什么

[Ackites/KillWxapkg](https://github.com/Ackites/KillWxapkg) 是纯 Go 实现的小程序反编译工具，MIT：

- 自动解密 `.wxapkg`
- 自动解包，美化 JS/JSON/WXML/WXSS
- 还原工程目录，可用微信开发者工具打开
- 支持 Hook 开 F12（仅 Windows、特定版本、有封号风险）
- 支持重新打包、敏感数据导出

### 2.2 用法

```bash
KillWxapkg -id=wxfe13a2a5df88b058 \
  -in=<wxapkg文件或目录> \
  -out=<输出目录> \
  -restore -pretty
```

- 包来源：PC 微信缓存目录，或 Android `appbrand/pkg`（需要 root）。
- `-id` 是 AppID；已解密的包可省略。
- `-hook` 只建议用小号，且有版本限制；我们主要用解密/解包。
- 解包后搜 `crm.sanfu.com`、`fubi`、`onSign`、`goods`、`coupon`、`exchange`、`activity`。

### 2.3 边界

- 解包代码版权归原作者/腾讯；**不要提交到开源仓库**，不要再分发。
- 只把接口路径、字段结构、脱敏样本写进脚本/文档。
- 混淆/加密/分包可能让静态分析不完整；最终以真实请求为准。

---

## 3. YYB-Go-Enhanced：登录与取码

### 3.1 它是什么

YYB-Go-Enhanced 是“应用宝协议服务 + 微信账号管理平台”：

- 手机微信扫码授权，保存登录凭据。
- 后台续期，尽量保持账号可用。
- 支持 YYB / PCMgr / GameAssist 多渠道。
- 提供 `/wxapp/*`、`/wx/*` 协议接口和 `/integration/*` 集成接口。
- 内置青龙/呆呆/Arcadia 联动、代理、掉线通知、运行日志。

**每个使用者部署自己的 YYB**；平台通过集成 API 连接，不共享 YYB。

> 版本提示：先访问你的 YYB 实例的 `/integration/module-manifest.json` 或 `/openapi.json`，确认存在 `/integration/accounts`、`/integration/actions/get-code`。较旧版本可能没有这些接口，需要升级 YYB。

### 3.2 关键认知：code ≠ 业务 token

```text
YYB 保存的微信授权
  → POST /wxapp/getCode {ref, app_id}
  → 一次性 wx.login code
  → 脚本发给目标小程序后端（如 /wxMiniAppLogin）
  → 业务 token / sid / user_id
  → 签到、积分、商品、活动接口
```

- code 短期、一次性，不能缓存/复用。
- 业务 token 过期后要重新取 code 登录。
- 有些小程序要手机号授权（`/wxapp/getPhoneNumber`）或 `operateWxData`/云函数。
- 不是所有小程序都能全自动；验证码/注册/支付要转人工。

### 3.3 平台使用的集成接口

| 令牌 | 保护范围 | 用途 |
| --- | --- | --- |
| `YYB_INTEGRATION_TOKEN` | `/integration/*` | 平台同步账号、取码、刷新状态 |
| `YYB_PROTOCOL_TOKEN` | `/wx/*`、`/wxapp/*` | 兼容脚本/高级协议调用 |

#### 账号列表

```http
GET /integration/accounts
Authorization: Bearer <YYB_INTEGRATION_TOKEN>
```

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "items": [
      {
        "id": 1,
        "display_name": "备注或昵称",
        "remark": "备注",
        "status": "alive",
        "openid_masked": "oXXXXX***XXXX",
        "scan_product": "yyb",
        "updated_at": 1794554228
      }
    ],
    "count": 1
  }
}
```

> 实测 `updated_at` 可能是 Unix 秒（如 `1794554228`），不是 ISO 字符串；平台同步时要兼容秒/毫秒/ISO。

#### 取码

```http
POST /integration/actions/get-code
Authorization: Bearer <YYB_INTEGRATION_TOKEN>
Content-Type: application/json

{"ref": "1", "app_id": "wxfe13a2a5df88b058"}
```

```json
{
  "account_id": 1,
  "result": { "code": "0123456789abcdef0123456789abcdef" }
}
```

#### 刷新账号

```http
POST /integration/actions/refresh-account
Authorization: Bearer <YYB_INTEGRATION_TOKEN>
Content-Type: application/json

{"ref": "1"}
```

#### 手机号 / operateWxData

`/integration/*` 没有手机号和通用转发；平台内部代理调用：

```http
POST /wxapp/getPhoneNumber
POST /wxapp/operateWxData
Authorization: Bearer <YYB_PROTOCOL_TOKEN>
```

脚本只拿平台的一次性 run token，不接触协议令牌。

### 3.4 状态与错误

| 状态/错误 | 含义 | 动作 |
| --- | --- | --- |
| `status=alive` | 账号可用 | 正常调度 |
| `status=session_only` | 部分会话可用 | 降级/提示补授权 |
| `409` + `rescan_required=true` | 账号明确失效 | 停止任务，通知重扫 |
| `502` | 上游/网络/业务失败 | 区分临时错误，有限重试 |
| `429` | YYB 本地限流/熔断 | 按 `Retry-After` 退避 |
| `401` | 令牌错误 | 配置错误，立即告警 |

不要把任意失败都当“账号失效”；重扫成本很高。

### 3.5 多渠道账号

同一个微信可合并 YYB/PCMgr/GameAssist 多渠道账号：

- 平台只用主账号 ID；成员 ID 直调可能返回 `409` 和 `data.primary_ref`。
- 主渠道失效但成员可用时，YYB 内部调度，平台不需要为每个渠道各跑一遍。

---

## 4. 三福会员签到（首个脚本）

### 4.1 已有脚本

文件：`N:\myProject\qinglong-script\mini-program\sanf.js`

- AppID：`wxfe13a2a5df88b058`
- Base URL：`https://crm.sanfu.com`
- 登录：`POST /ms-sanfu-wechat-customer-core/customer/core/wxMiniAppLogin`
  - body：`{ code, appid, shoId:"", userId:"", sourceWxsceneid:1027, sourceUrl:"pages/ucenter_index/ucenter_index" }`
  - 成功 `code=200`，`data.sid` 作为会话
- 签到：`POST /ms-sanfu-wechat-common/customer/onSign`
  - body：`{ signWay: 0, sid }`
  - 成功 `code=200`，`data.fubi` 是这次签到相关的福币数（脚本按“获得 X 福币”展示；它不一定等于总余额，需另找会员信息接口确认），`data.onKeepSignDay` 是连签天数
- 已签到按成功处理；会话失效清缓存、重登一次；不打印 code/sid。
- 请求头：`Content-Type: application/json`、`User-Agent`（MicroMessenger/WMPF）、`Referer: https://servicewechat.com/<appid>/385/page-frame.html`、`xweb_xhr: 1`。

### 4.2 解包后补到的接口

现有 `sanf.js` 只有登录/签到/`fubi`。解包（包版本 420）后已找到：

- 福币余额/过期：`GET ms-sanfu-wechat-customer/customer/getPoint`
  - `restMoney`：余额
  - `historyPoint`：即将过期数量
  - `nextYear`：有效期截止；年末过期
- 签到状态：`onSignDetail` → `signIn` / `onKeepSignDay`
- 签到日历/规则：`getSignLogsList`
- 签到：`onSign` → `giftMoneyAdd` / `giftMoneyKeep` / `daysForGift`
- 商品：`listPointExchangeCoupon` / `listPointExchangeCouponNew`
- 商品详情：`getPointExchangeCoupon`
- 兑换：`usePointExchangeCoupon`
- 活动：`badge/*`、`automation/*`、`gift/*`、`game/*`
- 请求头：`Sf-Authorization: sid` + `cusId`
- 普通接口未发现签名/加密

所以现在不是“找不到接口”，而是“待真实账号验证字段/写操作”。三福实现规格见 [08 三福脚本规格](08-sanf-adapter.md)，分析文档见 [analysis/packages/sanf](../analysis/packages/sanf/README.md)。

### 4.3 移植到平台脚本

现有 `sanf.js` 是“一个文件循环所有账号 + 读写本地缓存”。平台版改为：

- **一次运行一个账号**（平台循环/调度），避免跨账号缓存和并发问题。
- `ctx.yyb.getCode()` 取 code，不直接读 `YYB_SERVER`。
- `ctx.http.post()` 发请求，平台做域名校验、限流、日志脱敏。
- `ctx.session.get/set('sid')` 代替 `fs` 缓存。
- `login()` / `signIn()` / `points()` 三个标准能力。
- 签到后复查或用签到响应里的 `fubi` 作为余额；重复运行按“已签到”成功处理。

---

## 5. 新脚本接入手册

### 第 1 步：确认目标

- 小程序名称、AppID、主体。
- 是否需要会员注册/手机号绑定。
- 积分规则、商品/券、活动、过期规则。
- 是否有验证码/风控/设备指纹。

### 第 2 步：解包/调试

- KillWxapkg 解包，搜 API 路径、字段名。
- WMPFDebugger 开 Network，走一遍登录/签到/商品/活动。
- 记录 URL、method、headers、body、response。
- 定位签名/加密/时间戳/nonce。

### 第 3 步：验证登录

- 用 YYB 取一次 code。
- 用 curl/TS 调登录接口，确认能换到业务 token/sid。
- 区分：code 无效、未授权、需要手机号/注册、签名不对。

### 第 4 步：实现能力

按 [05 脚本系统](05-script-system.md)：

```text
login -> sign_in -> points -> products -> activities -> redeem/grab
```

先只读，再写操作；先单账号，再多账号。

### 第 5 步：幂等与复查

- 签到前查状态；签到后复查。
- 领奖前查是否已领；领奖后复查。
- 兑换前检查积分/库存/限购/地址；下单后查订单。
- 失败区分“未提交/已提交未确认/已成功”。

### 第 6 步：提交订阅源

- manifest、adapter、README、脱敏 fixture、测试。
- CI 校验 + 维护者审核。
- 合并后发布版本，平台用户更新。

---

## 6. 结论

- **WMPFDebugger 负责“看懂运行时”**。
- **KillWxapkg 负责“看静态代码”**。
- **YYB 负责“生产取码”**。
- **脚本负责“业务接口”**。
- **平台负责“账号、订阅、调度、日志、通知”**。
- 四层解耦，任何一层变化都不至于推倒重来。
