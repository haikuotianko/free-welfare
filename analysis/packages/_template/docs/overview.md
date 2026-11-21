# 概览

## 包信息

- 名称：
- AppID：
- 版本：
- 来源：
- 解包日期：
- 入口页面：
- 主体/开发者：

## 网络根 URL

| id | 根 URL | 用途 | 脚本需要 | 白名单 |
| --- | --- | --- | --- | --- |
| api |  | 业务接口 | 是 | 是 |
| img |  | 图片/静态资源 | 否 | 否 |

- 应用网络模式：`whitelist`
- 脚本只走 SDK `ctx.http`。

## 加密与传输

- 传输：TLS
- 请求签名：
- 请求加密：
- 响应加密：
- 本地存储加密：
- 证书校验：
- 备注：

## 登录流程

```text
YYB getCode
  -> POST <login_endpoint>
  -> 字段...
  -> 会话...
  -> 后续请求如何携带...
```

## 会话

- 字段：
- 类型：body/header/cookie
- 有效期：
- 失效表现：
- 刷新方式：

## 脚本计划

| 功能 | 脚本 | 公共模块 |
| --- | --- | --- |
| 登录 | `login` | `auth` |
| 签到 | `sign_in` | `auth` |
| 积分 | `points` | `auth` |
| 商品 | `products` | `auth` |
| 活动 | `activities` | `auth` |
| 注册 | `register` | `auth` |

## 待确认

- [ ] ...
