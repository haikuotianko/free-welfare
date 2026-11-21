# 21 应用接入目录

本目录记录从 `N:\myProject\qinglong-script\mini-program` 迁移到平台的应用脚本。

## 1. 批量导入

每个应用一个目录：

```text
data/apps/<key>/
  app.json
  scripts/sign-in.js
```

导入命令：

```bash
pnpm import:apps -- --bind-all
```

- `--bind-all`：把所有 `alive` 微信账号绑定到导入的应用。
- 默认按 `app.json` 的 `enabled` 决定是否启用脚本。
- 重复导入会用 `app.json` 覆盖脚本启停、cron、参数和能力；手动改过的启停状态如需保留，请同步改 `app.json`。
- 导入不会删除 `app.json` 中已经移除的脚本；删除应用脚本请到应用详情手动删除。
- `app.json` 的 `env` 会创建空的加密环境变量，不会覆盖已有值。
- 导入是幂等的，可重复执行。
- 应用商店：`pnpm build:app-source` 生成 `data/app-store/index.json`，在“应用商店 → 本地目录”订阅 `local://app-store/index.json` 即可看到全部应用并下载/更新；详见 [22 应用商店与应用源](22-app-store.md)。

## 2. 当前应用

| key | 名称 | AppID | 积分名称 | 定时 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `sanf` | 三福福利中心 | `wxfe13a2a5df88b058` | 福币 | `43 8 * * *` / `0 9 * * *` | 已接入 |
| `nwdjg` | 浓五的酒馆 | `wxed3cf95a14b58a26` | 积分 | `30 9 * * *` | 已接入 |
| `fyzq` | 风云再起北京 | `wxbc00cc79a68e2305` | 奇豆 | `20 8 * * *` | 已接入 |
| `tnjy` | 天牛旧衣回收 | `wx887c2f947bffa76e` | 环保币 | `34 8 * * *` | 已接入 |
| `dasenlin` | 大参林会员 | `wx16ed9a8bbb188228` | 积分 | `35 8 * * *` | 已接入 |
| `campari` | 金巴厘杯中空间 | `wx059d0e2508ab7045` | 积分 | `31 8 * * *` | 已接入 |
| `lvbizi` | 绿鼻子 | `wxb5e0776d46610093` | 积分 | `30 8 * * *` | 已接入 |
| `wugenvboshi` | 五个女博士 | `wx271704a01704744b` | 积分 | `30 8 * * *` | 已接入 |
| `aima` | 爱玛会员俱乐部 | `wx2dcfb409fd5ddfb4` | 积分 | `33 8 * * *` | 已接入 |
| `nestle` | 雀巢会员俱乐部 | `wxc5db704249c9bb31` | 巢币 | `20 8 * * *` | 已接入 |
| `huazhu` | 华住会 | `wx286efc12868f2559` | 积分 | `35 8 * * *` | 已接入 |
| `bydhy` | 比亚迪海洋 | `wxf62054ec313d6f53` | 积分 | `51 8 * * *` | 已接入 |
| `aiguo` | 爱裹旧衣回收 | `wx4ff260333d3c5ddd` | 积分 | `46 8 * * *` | 已接入 |
| `bluedash` | BLUE DASH 布鲁大师 | `wx73555499305578f8` | 积分 | `30 8 * * *` | 已接入 |
| `casetify` | CASETiFY | `wxd0c71d6bf928a416` | 积分 | `46 8 * * *` | 已接入 |
| `hlyili` | 活力伊利 | `wx06af0ef532292cd3` | 积分 | `48 8 * * *` | 已接入 |
| `ddyx` | 铛铛一下 | `wxe378d2d7636c180e` | 红包 | `32 8 * * *` | 已接入（红包签到） |
| `gyjj` | 国乐酱酒 | `wxeff120e4d11594c0` | 积分 | `30 9 * * *` / `20 9 * * *` | 已接入（签到/积分/商品） |
| `gujiajiaju` | 顾家家居 | `wx0770280d160f09fe` | 积分 | `41 8 * * *` | 已接入（自动注册） |
| `haitian` | 海天美味馆 | `wx7a890ea13f50d7b6` | 积分 | `30 11 * * *` / `20 9 * * *` | 已接入（签到/积分/商品） |
| `qqhyjlb` | 洽洽会员俱乐部 | `wxc72491b6cd007333` | 积分 | `39 8 * * *` / `20 9 * * *` | 已接入（自动注册） |
| `zbs` | 植白说 | `wx6b6c5243359fe265` | 积分 | `30 8 * * *` / `20 9 * * *` | 已接入（签到/积分/商品） |
| `longfor` | 龙湖天街 | `wx50282644351869da` | 珑珠 | `35 8 * * *` | 已接入（签到） |
| `nissin` | 日清食品 | `wx21b71db59d93bd6d` | 积分 | `28 8 * * *` / `20 9 * * *` | 已接入（签到/积分/商品） |
| `wx_xlxyh` | 骁龙骁友会 | `wx026c06df6adc5d06` | 芯动值 | `20 9 * * *` | 已接入（签到/任务） |
| `fsdlb` | 逢三得利吧 | `wxb33ed03c6c715482` | 积分 | `30 9 * * *` | 已接入（签到/积分） |
| `kekoukele` | 可口可乐 | `wxa5811e0426a94686` | 快乐瓶 | `30 9 * * 1` | 已接入（签到） |
| `roki` | 老板电器 ROKI | `wxba70fb8e3eb3aab9` | 积分 | `30 8 * * *` | 已接入（签到/积分） |
| `tmj` | 谭木匠会员俱乐部 | `wxc6f9e3b38b25b840` | 积分 | `36 8 * * *` | 已接入（签到/积分） |
| `choubao` | 臭宝乐园 | `wx2206cca563f6f937` | 嗦粉币 | `30 9 * * *` / `20 9 * * *` | 已接入（签到/积分/商品） |
| `colorful` | colorful 七彩虹 | `wx49018277e65fc3e1` | 积分 | `30 10 * * *` | 已接入（签到） |
| `fej` | 敷尔佳 | `wx7ff0b3a99cb13b43` | 积分 | `20 8 * * *` | 已接入（签到） |
| `jyxe` | 旧衣小二 | `wx426d52c8130b8559` | 积分 | `38 8 * * *` | 已接入（签到） |
| `wb` | 花生帮粉丝俱乐部 | `wx841a8e9e6972a9a6` | 能量 | `41 8 * * *` | 已接入（签到/浏览任务） |
| `ykb_all` | 盈客宝电玩 | `wxf133aa0a4f191ffc` | 积分 | `45 8 * * *` | 已接入（签到，收益卡待确认） |
| `nice` | 纳爱斯品质生活 | `wx231879a144b5879e` | 积分 | `31 8 * * *` | 已接入（手机号授权注册/签到） |
| `tslj` | 谢瑞麟 | `wx439d0e0cc6742818` | 积分 | `30 9 * * *` | 已接入（手机号授权注册/签到） |
| `nxdc` | 奈雪 | `wxab7430e6e8b9a4ab` | 积分 | `45 8 * * *` | 已接入（签到） |
| `rytyn` | 认养一头牛 | `wx0408f3f20d769a2f` | 积分 | `17 9 * * *` | 已接入（签到/积分） |
| `wrn` | 薇诺娜 | `wx250394ab3f680bfa` | 积分 | `41 8 * * *` | 已接入（签到） |
| `jdbclub` | 加多宝Club | `wx8371875e443e177f` | 积分 | `5 10 * * *` | 已接入（手机号注册/签到） |
| `zippo` | zippo会员 | `wxaa75ffd8c2d75da7` | 积分 | `44 8 * * *` | 已接入（签到） |
| `hisense_aijia` | 海信爱家 | `wxf488d623a17cd7b5` | 积分 | `30 8 * * *` | 已接入（手机号授权/签到） |
| `tclx_lc` | 同程旅行里程 | `wx336dcaf6a1ecf632` | 里程 | `21 8 * * *` | 已接入（签到） |
| `oppo` | OPPO | `wxe705c556754a1de2` | 积分 | `21 8 * * *` | 已接入（签到） |
| `rio` | RIO 微醺俱乐部 | `wx225b10f204323da5` | 积分 | `33 8 * * *` | 已接入（签到） |
| `jtc` | 捷停车 | `wx24b70f0ad2a9a89a` | 积分 | `57 8 * * *` | 已接入（签到） |
| `xchy` | 携程会员 | `wx0e6ed4f51db9d078` | 积分 | `24 7,19 * * *` | 已接入（签到） |
| `txdt` | 腾讯地图 | `wx7643d5f831302ab0` | 金币 | `18 8 * * *` | 已接入（签到） |
| `ydyc` | 优点云创 | `wx96eb3beaea480465` | 积分 | `24 8 * * *` | 已接入（签到） |
| `babycare` | Babycare | `wxab5642d7bced2dcc` | 积分 | `41 8 * * *` | 接口验证失败 |
| `feihe` | 飞鹤会员 | `wx4205ec55b793245e` | 积分 | `30 8 * * *` | 已接入（新版签到接口） |
| `hrj` | 好人家 | `wx160c589739c6f8b0` | 积分 | `36 8 * * *` | 账号不符合条件 |
| `skyworth` | 创维会员中心 | `wxff438d3c60c63fb6` | 维豆 | `38 8 * * *` | 已接入 |

## 3. 待处理

| 应用 | 原因 | 下一步 |
| --- | --- | --- |
| `babycare` | 登录成功，签到状态接口返回 `401 验证失败` | 检查账号是否注册/接口是否变更，必要时抓包更新 |
| `hrj` | 登录成功，签到接口返回“用户不符合签到条件” | 检查账号是否满足活动条件 |

## 4. 解包进度

已在本机 PC 微信缓存中找到并解包 14 个应用（版本目录不同），并补充解包了 `_apps_member_main_`、`_onecrm_extension_package_`、`_packages_memberCenter_`、`_pages_member_`、`_packages_shop_` 等子包：

| 应用 | 解包版本 | 状态 |
| --- | --- | --- |
| `aima` | 228 | 已解包，签到/积分/商品/任务已接入 |
| `nwdjg` | 270 | 已解包，积分已接入 |
| `campari` | 70 | 已解包，积分/商品/任务已接入 |
| `feihe` | 433 + 子包 | 已解包主包和 `xmhMainProcess` 子包；积分接口仍未找到 |
| `dasenlin` | 1028 + 子包 | 已解包主包和 member 子包；积分已接入，积分商城页面未随包下载 |
| `huazhu` | 591 + 子包 | 已解包主包和 memberCenter 子包；积分已接入 |
| `nestle` | 498 + 子包 | 已解包主包和 member 子包；积分/任务已接入 |
| `lvbizi` / `wugenvboshi` | 235 / 142 + 子包 | 已解包主包和 shop 子包；积分已接入，pointstore 页面未随包下载 |
| `hrj` | 125 + 子包 | 已解包主包和 onecrm 子包；积分已接入 |
| `tnjy` | 7 | 已解包主包；积分已接入 |
| `skyworth` | 386 | 已解包主包 |
| `fyzq` | 56 | 已用极简解包器绕过 `.vscode/launch.json` 格式化失败；签到/奇豆商品已接入 |
| `aiguo` | 269 | 已解包；登录、手机号授权注册、签到、积分已接入 |
| `bluedash` | 43 | 已解包；登录、签到、积分查询已接入 |
| `casetify` | 185 | 已解包；登录、积分商城签到已接入 |
| `hlyili` | 931 | 已解包；登录、积分查询、签到已接入 |
| `ddyx` | 872 | 已解包；登录、签到、签到进度已接入（红包） |
| `gyjj` | 89 | 已解包；登录、签到、积分、积分商品已接入 |
| `gujiajiaju` | 306 | 已解包；手机号自动注册、签到、积分已接入 |
| `haitian` | 817 | 已解包；手机号登录、签到、积分、积分商品已接入 |
| `qqhyjlb` | 550 | 已解包；手机号自动注册、签到、积分、积分商品已接入 |
| `babycare` / `bydhy` | — | 本机未找到 wxapkg，需要先在微信打开一次 |

解包产物在 `analysis/packages/<key>/unpacked/`，默认不提交。

## 5. 脚本覆盖

| 应用 | 脚本 | 说明 |
| --- | --- | --- |
| `aima` | `sign-in.js`、`points.js`、`products.js`、`activities.js` | 签到/积分/商品/任务已启用 |
| `campari` | `sign-in.js`、`points.js`、`products.js`、`activities.js` | 签到/积分/商品/任务已启用 |
| `nestle` | `sign-in.js`、`points.js`、`activities.js` | 签到/巢币/任务已启用 |
| `nwdjg`、`dasenlin`、`huazhu`、`lvbizi`、`wugenvboshi`、`hrj`、`tnjy` | `sign-in.js`、`points.js` | 积分接口来自解包，独立积分脚本已启用 |
| `fyzq` | `sign-in.js`、`points.js`、`products.js` | 签到/奇豆/商品已启用；活动接口当前返回空 |
| `skyworth` | `sign-in.js` | 签到脚本内同步积分 |
| `bluedash` | `sign-in.js` | 登录、签到记录、签到、积分查询；token 缓存与失效重登 |
| `casetify` | `sign-in.js` | 登录、积分商城签到状态、签到；token 缓存与失效重登 |
| `hlyili` | `sign-in.js` | 微信云网关请求头、登录、积分查询、每日签到 |
| `ddyx` | `sign-in.js` | 登录、签到、签到进度；无积分余额，奖励为红包/券 |
| `gyjj` | `sign-in.js`、`products.js` | 登录、签到、积分、积分商品同步 |
| `gujiajiaju` | `sign-in.js` | 手机号自动注册、登录、签到、积分 |
| `haitian` | `sign-in.js`、`products.js` | 手机号授权登录、签到、积分、积分商品同步 |
| `qqhyjlb` | `sign-in.js`、`products.js` | 手机号自动注册、签到、积分、积分商品同步 |
| `aiguo` | `sign-in.js` | 签到/积分已启用；未注册时显示“一键注册”，用户点击后使用 YYB 手机号授权注册 |
| `babycare`、`bydhy`、`feihe` | `sign-in.js` | 账号/资格/接口问题，积分待确认 |

## 6. 迁移约定

- 平台脚本必须导出 `{ async run(ctx) }`，一个 Run 只处理当前账号。
- 旧青龙脚本用 `createLegacyAdapter(ctx)` 迁移；详见 [20 脚本开发指南](20-script-development-guide.md)。
- 不使用 `fs` / `https` / `process.env`；HTTP 统一走 `ctx.http`。
- 需要额外域名时写入 `app.json.rootUrls`，重新导入即可更新白名单。
- 需要密钥时写入 `app.json.env`，导入会创建空环境变量，值只在平台 UI 填写。
