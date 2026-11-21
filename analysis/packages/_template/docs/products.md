# 商品 / 权益

## 列表

```http
GET/POST <path>
```

字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id |  |  |
| name |  |  |
| points |  |  |
| stock |  |  |
| limit |  |  |
| status |  |  |
| start_at / end_at |  |  |

## 详情

```http
GET/POST <path>
```

## 兑换

```http
POST <path>
```

- 是否需要支付/运费：
- 是否需要地址：
- 是否限购：
- 订单查询：
- 幂等/request_id：

## 状态

- on_sale / sold_out / upcoming / ended
- 库存是否实时：
- 补货规律：

## 待确认

- [ ] 列表分页
- [ ] 库存字段
- [ ] 限购字段
- [ ] 兑换结果确认
