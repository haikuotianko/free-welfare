# 分析包

每个小程序一个目录：`analysis/packages/<key>/`。

## 当前分析包

| key | 名称 | 状态 | 备注 |
| --- | --- | --- | --- |
| `sanf` | 三福福利中心 | verified | 登录/签到/积分/商品/抢购/兑换 |
| `aima` | 爱玛会员俱乐部 | partial | 签到/积分/商品/任务已接入 |
| `campari` | 金巴厘杯中空间 | partial | 签到/积分/商品/任务已接入 |
| `nestle` | 雀巢会员俱乐部 | partial | 签到/巢币/任务已接入 |
| `nwdjg` | 浓五的酒馆 | partial | 签到/积分已接入 |
| `dasenlin` | 大参林会员 | partial | 签到/积分已接入；积分商城页面未随包下载 |
| `huazhu` | 华住会 | partial | 签到/积分已接入 |
| `lvbizi` / `wugenvboshi` | 绿鼻子 / 五个女博士 | partial | 签到/积分已接入；pointstore 页面未随包下载 |
| `hrj` | 好人家 | partial | 签到/积分已接入 |
| `tnjy` | 天牛旧衣回收 | partial | 签到/环保币已接入 |
| `feihe` | 飞鹤会员 | draft | 主包+子包已解包；积分接口待确认 |
| `fyzq` | 风云再起北京 | partial | 已用极简解包器绕过格式化失败；签到/奇豆商品已接入 |
| `skyworth` | 创维会员中心 | draft | 主包已解包；签到脚本内同步积分 |
| `aiguo` / `babycare` / `bydhy` | — | draft | 本机暂未找到 wxapkg |

> 解包产物默认不提交；`aiguo`、`babycare`、`bydhy` 本机暂未找到 wxapkg。

## 结构

```text
<key>/
  README.md           # 索引：名称、AppID、状态、文档入口
  metadata.yaml       # 结构化元数据（UI/脚本可读）
  docs/
    overview.md       # 包信息、加密、登录流程、脚本计划
    api.md            # 接口清单、请求/响应、错误码
    points.md         # 积分/福币规则、有效期
    crypto.md         # 签名/加密/解密
    products.md       # 商品/权益
    activities.md     # 活动/任务
  unpacked/           # 解包文件（gitignore）
  fixtures/           # 脱敏请求/响应（gitignore）
  screenshots/        # 截图（gitignore）
  assets/             # 图标等可公开资源
```

## 新建

1. 复制 `_template/` 为 `<key>/`。
2. 填 `metadata.yaml`。
3. 用 KillWxapkg 解包到 `unpacked/`。
4. 用 WMPFDebugger/抓包确认接口。
5. 填 `docs/`，区分“已验证/待确认”。
6. 按 `docs` 写脚本。

## 命名

- `key` 用 ASCII：`sanf`、`aima`、`mlgogo`。
- 中文名写在 `metadata.yaml` 的 `name`。
- 一个 AppID 一个目录；同主体多小程序分别建目录。

## 最小可用文档

后续写脚本的人至少需要：

- 名称、AppID、图标、分类；
- 网络根 URL（可能多个）+ 哪些是脚本需要/加入白名单；
- 登录接口 + code 字段 + 会话字段；
- 签到/积分/商品/活动接口；
- 积分规则 + 有效期（或明确“未知”）；
- 加密/签名方式（或明确“未发现”）；
- 错误码/已签到判断；
- 需要哪些功能脚本、哪些公共模块。
