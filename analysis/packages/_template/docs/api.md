# 接口清单

## 约定

- Base URL：
- 公共 Header：
- 鉴权方式：
- 时间戳/nonce：
- 错误码：

## 登录

```http
POST <path>
Content-Type: application/json
<其他头>

{
  "code": "<YYB wx.login code>"
}
```

响应：

```json
{}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |

错误：

| 码/文案 | 含义 | 处理 |
| --- | --- | --- |

## 签到

```http
POST <path>
...
```

## 积分/余额

```http
GET/POST <path>
...
```

## 商品

```http
GET/POST <path>
...
```

## 活动

```http
GET/POST <path>
...
```

## 备注

- 分页：
- 限流：
- 风控：
- 验证码：
