# 23 青龙脚本接入进度

目标：把 `N:\myProject\QLScriptPublic\wxapp` 里需要的微信小程序脚本迁到平台，覆盖注册、签到、积分、商品/兑换的完整流程。解包用于确认接口，青龙脚本用于参考加密/签名，不直接运行青龙脚本。

## 1. 当前状态

- `QLScriptPublic/wxapp` 实际 162 个 `.js` 脚本，按主 AppID 去重后 155 个；其中包含大量同应用变体、旧版和多账号脚本。
- 以 README 的 49 个应用为主清单，项目现有 62 个应用目录（61 个 `app.json` + 手工接入的 `sanf`），覆盖 61 个主 AppID。
- 另有 95 个主 AppID 尚未接入，清单见 `docs/24-remaining-ql-apps.md`；这些是 README 之外的零散脚本，不代表 95 个必须全部接入的新应用。
- 本轮新增并跑通：`feihe`、`guyu`、`ajier`、`baimazhixuan`、`bluedash`、`casetify`、`hlyili`、`ddyx`、`gyjj`、`gujiajiaju`、`haitian`、`qqhyjlb`、`zbs`、`longfor`、`nissin`、`wx_xlxyh`、`fsdlb`、`kekoukele`、`roki`、`tmj`、`choubao`、`colorful`、`fej`、`jyxe`、`wb`、`ykb_all`、`nice`、`tslj`、`nxdc`、`rytyn`、`wrn`、`jdbclub`、`zippo`、`hisense_aijia`、`tclx_lc`、`oppo`、`rio`、`jtc`、`xchy`、`txdt`、`ydyc`。
- 其中 `gujiajiaju`、`qqhyjlb` 的 YYB 手机号授权自动注册成功；`haitian` 手机号授权登录成功；`feihe` 使用新版 `/signin/sign` + `/getSignInfo` 签到成功；`guyu`、`ajier`、`baimazhixuan` 手动注册后签到成功。
- 手动注册要求：`guyu`、`ajier` 注册时需勾选注册协议，`ajier` 还需绑定手机号，`baimazhixuan` 需填写额外表单；完整清单见 [25 应用注册状态](25-registration-status.md)。
- 已迁但卡在授权/签名：`dks`（手机号授权回调返回 ok，但签到仍提示未授权）、`fafa`（注册接口拒绝 YYB 手机号数据）、`haier`（只支持短信注册，需先在小程序注册）。
- 包已缓存、待接入的还有：`choubao`、`colorful`、`fej`、`fsdlb`、`iqoo`、`kekoukele`、`longfor`、`mfd`、`nissin`、`roki`、`tmj`、`wx_xlxyh`、`zbs`、`zhanma`。

## 2. 应用清单

状态说明：✅ 已接入并跑过；📦 已有包/已抓包；⬜ 待抓包；⏸ 需要账号注册/人工处理。

| key | 应用 | AppID | 青龙脚本 | 状态 |
| --- | --- | --- | --- | --- |
| `sanf` | 三福福利中心 | `wxfe13a2a5df88b058` | `sanf.js` | ✅ 签到/积分/兑换 |
| `aima` | 爱玛会员俱乐部 | `wx2dcfb409fd5ddfb4` | `aima.js` | ✅ 签到/积分/商品/任务 |
| `nwdjg` | 浓五的酒馆 | `wxed3cf95a14b58a26` | `nwdjg.js` | ✅ 签到/积分 |
| `fyzq` | 风云再起北京 | `wxbc00cc79a68e2305` | `fyzq.js` | ✅ 签到/积分/商品 |
| `tnjy` | 天牛旧衣回收 | `wx887c2f947bffa76e` | `tnjy.js` | ✅ 签到/积分 |
| `dasenlin` | 大参林会员 | `wx16ed9a8bbb188228` | `dasenlin.js` | ✅ 签到/积分 |
| `campari` | 金巴厘杯中空间 | `wx059d0e2508ab7045` | `campari.js` | ✅ 签到/积分/商品/任务 |
| `lvbizi` | 绿鼻子 | `wxb5e0776d46610093` | `lvbizi.js` | ✅ 签到/积分 |
| `wugenvboshi` | 五个女博士 | `wx271704a01704744b` | `wugenvboshi.js` | ✅ 签到/积分 |
| `nestle` | 雀巢会员俱乐部 | `wxc5db704249c9bb31` | `nestle.js` | ✅ 签到/积分/任务 |
| `huazhu` | 华住会 | `wx286efc12868f2559` | `huazhu.js` | ✅ 签到/积分 |
| `bydhy` | 比亚迪海洋 | `wxf62054ec313d6f53` | `bydhy.js` | ✅ 签到 |
| `aiguo` | 爱裹旧衣回收 | `wx4ff260333d3c5ddd` | `aiguo.js` | ✅ 签到/积分/一键注册 |
| `skyworth` | 创维会员中心 | `wxff438d3c60c63fb6` | `skyworth.js` | ✅ 签到/积分/RSA |
| `babycare` | Babycare | `wxab5642d7bced2dcc` | `babycare.js` | ✅ 签到；401 待查 |
| `feihe` | 飞鹤会员 | `wx4205ec55b793245e` | `feihe.js` | ✅ 签到（新版 sign/getSignInfo 接口） |
| `hrj` | 好人家 | `wx160c589739c6f8b0` | `hrj.js` | ✅ 签到；账号资格待查 |
| `bluedash` | BLUE DASH 布鲁大师 | `wx73555499305578f8` | `bluedash.js` | ✅ 签到/积分 |
| `casetify` | CASETiFY | `wxd0c71d6bf928a416` | `casetify.js` | ✅ 签到 |
| `hlyili` | 活力伊利 | `wx06af0ef532292cd3` | `hlyili.js` | ✅ 签到/积分 |
| `ddyx` | 铛铛一下 | `wxe378d2d7636c180e` | `ddyx.js` | ✅ 签到（红包） |
| `gyjj` | 国乐酱酒 | `wxeff120e4d11594c0` | `gyjj.js` | ✅ 签到/积分/商品 12 |
| `gujiajiaju` | 顾家家居 | `wx0770280d160f09fe` | `gujiajiaju.js` | ✅ 签到/积分（自动注册） |
| `haitian` | 海天美味馆 | `wx7a890ea13f50d7b6` | `haitian.js` | ✅ 签到/积分/商品 48（手机号登录） |
| `qqhyjlb` | 洽洽会员俱乐部 | `wxc72491b6cd007333` | `qqhyjlb.js` | ✅ 签到/积分/商品 5（自动注册） |
| `dks` | 戴可思 | `wx9d46d96c4c35a53a` | `yz9d.js` | ⏸ 有包；登录/积分/签到活动已通，手机号授权后签到仍失败 |
| `guyu` | 谷雨 | `wxda948f3be0afc375` | `guyu.js` | ✅ 签到/积分（手动注册，勾选协议） |
| `ajier` | 安吉尔会员 | `wxc4a1f99a6c90c1a4` | `ajier.js` | ✅ 签到（手动注册，勾选协议） |
| `baimazhixuan` | 白马智选 | `wx51f8cb2a7578f42f` | `baimazhixuan.js` | ✅ 签到（手动注册，填写额外表单） |
| `choubao` | 臭宝乐园 | `wx2206cca563f6f937` | `choubao.js` | ✅ 签到/积分/商品 24 |
| `colorful` | colorful 七彩虹 | `wx49018277e65fc3e1` | `colorful.js` | ✅ 签到（手机号授权） |
| `fej` | 敷尔佳 | `wx7ff0b3a99cb13b43` | `fej.js` | ✅ 签到 |
| `fsdlb` | 逢三得利吧 | `wxb33ed03c6c715482` | `fsdlb.js` | ✅ 签到/积分（+3） |
| `iqoo` | iQOO 社区 | `wxcf4266fbc9463132` | `iqoo.js` | ✅ 263 版用户资料密文登录，签到/抽奖成功 |
| `kekoukele` | 可口可乐 | `wxa5811e0426a94686` | `kekoukele.js` | ✅ 签到/快乐瓶（+1） |
| `longfor` | 龙湖天街 | `wx50282644351869da` | `longfor.js` | ✅ 签到/珑珠（+5） |
| `mfd` | 麦富迪会员 | `wx278a2ed79c5182f8` | `mfd.js` | ✅ 最新接口已对齐，签到成功 |
| `nissin` | 日清食品 | `wx21b71db59d93bd6d` | `nissin.js` | ✅ 签到/积分/商品 15 |
| `roki` | 老板电器 ROKI | `wxba70fb8e3eb3aab9` | `roki.js` | ✅ 签到/积分 |
| `tmj` | 谭木匠会员俱乐部 | `wxc6f9e3b38b25b840` | `tmj.js` | ✅ 签到/积分（+10） |
| `wx_xlxyh` | 骁龙骁友会 | `wx026c06df6adc5d06` | `wx_xlxyh.js` | ✅ 签到/任务（+10 芯动值） |
| `zbs` | 植白说 | `wx6b6c5243359fe265` | `zbs.js` | ✅ 签到/积分/商品 9（7 商品 + 2 券） |
| `zhanma` | 战马能量星球 | `wx94dca6ef07a54c55` | `zhanma.js` | ✅ 182 版缓存登录 `skey`，签到/任务成功 |
| `bqs` | 倍轻松 BREO | `wx61457400e4212cec` | `bqs.js` / `BREO.py` | ⏸ 登录返回 uid=null，需激活会员 |
| `fafa` | 发发藏宝洞 | `wxd15ddc3916302f35` | `fafa.js` | ⏸ 有包；注册接口返回“微信版本过低”，需真实手机号授权 |
| `parkson` | 呼啦圈 Parkson | `wx89a714fb03b61b99` | `parkson.js` | ⏸ 登录成功，手机号注册接口 400 |
| `lieer` | 烈儿宝贝 | `wxf98a118ca21bbf5f` | `lieer.js` | ⏸ 登录成功，手机号注册接口 400 |
| `haier` | 海尔智家 | `wxe24b2f1f4e378891` | `haier.js` | ⏸ 有包；只支持短信注册，需先在小程序注册 |
| `jingyoujia` | 劲友家 | `wx10bc773e0851aedd` | `jingyoujia.js` | ⏸ 登录成功，当前无签到活动 |
| `jyxe` | 旧衣小二 | `wx426d52c8130b8559` | `jyxe.js` | ✅ 签到成功（AppID 已按脚本修正） |
| `kangshifu` | 康师傅畅饮社 | `wx54f3e6a00f7973a7` | `kangshifu.js` | ✅ 908 版 `club.ksf.cn` / `nclub.ksf.cn`，签到成功 |
| `miqilin` | 米其林会员 | `wx14413dafd16b9540` | `miqilin.js` | ⏸ 最新包已移除每日分享任务 |
| `musi` | 慕思 | `wx03527497c5369a2c` | `musi.js` | ⏸ 登录成功，会员行为接口缺 memberId |
| `mxbc` | 蜜雪冰城 | `wx7696c66d2245d107` | `mxbc.js` | ⏸ 青龙模式已接入，需账号/应用环境变量 `MXBC_ACCESS_TOKEN`（App 抓包） |
| `nice` | 纳爱斯品质生活 | `wx231879a144b5879e` | `nice.js` | ✅ 手机号授权注册；签到 +5 积分 |
| `qmsd` | 全棉时代 | `wxdfcaa44b1aa891a7` | `qmsd.js` / `quanmianshidai.py` | ⏸ bind=no，需先注册/绑定会员 |
| `stokke` | stokke | `wxe232c36aaca3dc1a` | `stokke.js` | ⏸ 登录返回 register/无 token，需注册 |
| `tslj` | 谢瑞麟 | `wx439d0e0cc6742818` | `tslj.js` | ✅ 手机号授权注册；签到 +5 积分 |
| `wb` | 花生帮粉丝俱乐部 | `wx841a8e9e6972a9a6` | `wb.js` | ✅ 签到 +20 能量；浏览任务 3 个 |
| `yingshujufeng` | 影视飓风 | `wx92782ef90ebc836d` | `yingshujufeng.js` | ⏸ 登录/积分通，签到需手机号授权 |
| `ykb_all` | 盈客宝电玩 | `wxf133aa0a4f191ffc` | `ykb_all.js` | ✅ 签到（signed=false，收益卡信息缺失） |
| `wx_midea` | 美的会员 | `wx03925a39ca94b161` | `wx_midea.js` | ⏸ Cookie 手动配置，脚本默认停用 |
| `nxdc` | 奈雪 | `wxab7430e6e8b9a4ab` | `nxdc.js` | ✅ 签到 |
| `rytyn` | 认养一头牛 | `wx0408f3f20d769a2f` | `rytyn.js` | ✅ 签到/积分（+3） |
| `wrn` | 薇诺娜 | `wx250394ab3f680bfa` | `wrn.js` | ✅ 签到 |
| `jdbclub` | 加多宝Club | `wx8371875e443e177f` | `jdbclub.js` | ✅ 手机号注册；签到成功 |
| `hlzj` | 海澜之家 | `wx315431cc3b5e930f` | `hlzj.js` | ⏸ 已找到新版包 `wx3c0de42fb467063e`，待接入 |
| `mcyp` | 名创优品 | `wx2a212470bade49bf` | `mcyp.js` | ⏸ 账号未注册，需人工注册 |
| `zippo` | zippo会员 | `wxaa75ffd8c2d75da7` | `zippo.js` | ✅ 签到成功 |
| `xmsq` | 小米社区 | `wx240a4a764023c444` | `xmsq.js` | ✅ 首次登录用 YYB `operateWxData(webapi_getuserinfo)` 取资料密文，签到成功 |
| `camel` | 骆驼 CAMEL | `wxa82836302320ca29` | `camel.js` | ⏸ 有赞签到要求手机号授权 |
| `hisense_aijia` | 海信爱家 | `wxf488d623a17cd7b5` | `hisense_aijia.js` | ✅ 手机号授权登录；签到 +5 积分 |
| `tclx_lc` | 同程旅行里程 | `wx336dcaf6a1ecf632` | `tclx_lc.js` | ✅ 签到 +2 里程 |
| `thyc` | 途虎养车 | `wx27d20205249c56a3` | `thyc.js` | ⏸ 登录提示需绑定手机号 |
| `oppo` | OPPO | `wxe705c556754a1de2` | `oppo.js` | ✅ 签到（已签，积分 2） |
| `rio` | RIO 微醺俱乐部 | `wx225b10f204323da5` | `rio.js` | ✅ 签到（今日已签） |
| `qutaoka` | 趣淘卡 | `wx479a4a95ec031d79` | `qutaoka.js` | ⏸ 登录返回请求参数错误 |
| `maopu` | 毛铺草本酒 | `wxefd0fe341e06b815` | `maopu.js` | ⏸ 签到要求先完善个人信息 |
| `mobil` | 美孚臻享俱乐部 | `wx46f9572cac706c22` | `mobil.js` | ⏸ 需完善会员资料（need_improve_user_info=1） |
| `mscxh` | 玛氏宠享会 | `wxd96d7e6249780c6a` | `mscxh.js` | ⏸ 签到要求先授权/注册 |
| `jtc` | 捷停车 | `wx24b70f0ad2a9a89a` | `jtc.js` | ✅ 签到（今日已签） |
| `jlc` | 嘉立创 | `wx6c7b851c877dba42` | `jlc.js` | ⏸ 需先绑定嘉立创账号 |
| `jsb` | 杰士邦会员中心 | `wxacda8953c4c431bc` | `jsb.js` | ✅ 新版有赞店铺已接入，签到成功 |
| `xchy` | 携程会员 | `wx0e6ed4f51db9d078` | `xchy.js` | ✅ 签到成功，积分 +8 |
| `xiaodangjia` | 小铛家 | `wx7f5bc6f204abc629` | `xiaodangjia.js` | ⏸ 25 版手机号授权登录仍返回系统繁忙 |
| `xzyy` | 小紫有约 | `wx3db193ecdebd3fea` | `xzyy.js` | ⏸ YYB 取码连续 HTTP 502 |
| `wanjiale` | 万家乐会员俱乐部 | `wx07b7a339bb2cf065` | `wanjiale.js` | ⏸ 需先在小程序注册会员 |
| `wanyazhenxuan` | 丸丫甄选 | `wx35322299c6492f6e` | `wanyazhenxuan.js` | ⏸ 有赞签到要求手机号授权 |
| `yuexihui` | 中粮悦喜会 | `wx4a9b92a0680e7b29` | `yuexihui.js` | ⏸ 登录接口 HTTP 503 |
| `sf` | 顺丰速运 | `wxd4185d00bf7e08ac` | `sf.js` | ✅ 最新签到接口已对齐，签到成功 |
| `txdt` | 腾讯地图 | `wx7643d5f831302ab0` | `txdt.js` | ✅ 签到（今日已签，金币 20） |
| `wph` | 唯品会 | `wxe9714e742209d35f` | `wph.js` | ⏸ 未绑定唯品会账户 |
| `rrk` | 红人库 | `wx44356198837c0121` | `rrk.js` | ⏸ 商户无在用的签到实例 |
| `shanyi` | 善羿科技 | `wxc59eee06736849e8` | `shanyi.js` | ⏸ 设备已绑定其他账号 |
| `sinsin` | sinsin | `wxdc40acf03fc92e6f` | `sinsin.js` | ⏸ 签到要求手机号授权 |
| `txq` | 汤星奇 | `wx9bb6d5ac457bd69d` | `txq.js` | ⏸ 签到活动已结束（statusFlag=2） |
| `wzy` | 喂自由 | `wx75813e4a771649e5` | `wzy.js` | ⏸ 官方每日签到活动已结束 |
| `ydyc` | 优点云创 | `wx96eb3beaea480465` | `ydyc.js` | ✅ 今日已签到，积分 22500 |
| `smgc` | 上美广场 | `wxd63e2335d44317ea` | `smgc.js` | ✅ 新版单商场接口已接入，签到成功 |
| `szgc` | 深圳春茧未来荟 | `wx6b10d95e92283e1c` | `szgc.js` | ⏸ 服务端要求 legacy TLS |
| `trsj` | 甜润世界 | `wx210e40a77dbe7a27` | `trsj.js` | ⏸ 101 版登录正常，签到要求先绑定手机号；500/502 已加重试 |
| `aierxinxuan` | 爱儿心选 | `wx1fb666a33da7ac88` | `sign-in.js` | ✅ 164 版；WAF 路径绕过后签到成功 |
| `malawangzi` | 麻辣王子 | `wxe8189d7d692db172` | `sign-in.js` | ✅ 6 版数云互动；活动 7475 签到成功 |
| `suoyounvsheng` | 所有女生 | `wx7d1403fe84339669` | `sign-in.js` | ✅ 1724 版；活动码 D2L0T1T4 签到成功 |

> `qmsd` 已核对：`nice.js` 是纳爱斯 `wx231879a144b5879e`；`qmsd.js`/`quanmianshidai.py` 是全棉时代 `wxdfcaa44b1aa891a7`。
> `wx_midea.js` 没有 `wx` 开头的 AppID，可能是公众号 Cookie 流程，需单独评估。
> 账号级环境变量：账号页每个应用卡片可配置，JSON 存于 `SiteAccount.envVars`，运行时优先于应用默认环境变量；未配置或值为空时使用应用默认值。

## 3. 2026-11-16 最新包复查

按要求用微信重新搜索并打开最新版小程序，抓包后复查：

- **`nice` 纳爱斯**：最新包 306。登录 `POST /v2/user_login` 首次返回 `status=0`，随后用 YYB `encryptedData/iv` + 新 `code` 再提交同一接口，返回 token，注册成功；签到 +5 积分。已启用。
- **`tslj` 谢瑞麟**：最新包 25。登录 `POST /api/auth/login` 返回 `is_register=false`，用 `POST /api/user/decryptMobile`（`encrypted_data/iv` 表单）注册成功，签到 +5 积分。已启用。
- **`mxbc` 蜜雪冰城**：最新包 313。签名从旧 RSA 改为 `enhanceMD5`（`md5(排序参数 + salt)` + 4 段 int32），版本头 `2.8.66`；脚本已更新。签到 `GET /v1/customer/signin` 仍返回 `请升级至最新版本`，服务端做了版本/灰度限制，保持停用。
- **`musi` 慕思**：最新包 253。补到 `POST /user/wechatlogin/userreg` 和 `POST /member/wechatlogin/registered`；`userreg` 能创建用户并返回手机号/token，但 `registered` 返回 `101 未登录/请重新登录获取授权`，`selectuserinfo` 仍为空，保持停用。
- **`parkson` 呼啦圈**：最新包 43。注册仍用 `PUT /user/registerOrBindUser` 的 legacy `encryptedData/ivStr`；YYB 授权数据仍返回 HTTP 400，保持停用。
- **`kangshifu` 康师傅**：最新包 908。登录仍只返回 `data.member`、不返回 token；手机号流程依赖未缓存的 `shop` 分包，保持停用。
- **`bqs`、`qmsd`、`lieer`、`stokke`**：本轮微信搜索打开的结果 AppID 与清单不一致，未拿到目标主包，仍需用正确名称/结果索引补抓。

## 4. 注册/授权阻塞

新应用普遍不是“脚本没写”，而是账号还没在目标小程序注册。已验证 **YYB 手机号授权对部分应用有效**：

- **`gujiajiaju` 顾家**：`/club-server/api/user/authorize/register` 接受 YYB `encryptedData/iv`，首次运行自动注册并签到成功。
- **`qqhyjlb` 洽洽**：`/upms/wechat_user/updateBase` 接受 YYB 手机号授权 `code`，首次运行自动注册、登录并签到成功。
- **`haitian` 海天**：`/wechat/mini/phoneNew/login` 手机号授权登录成功，签到和积分同步正常。

当前已验证的阻塞点：

- **`ajier` 安吉尔**：`/api/member/app/wxLogin` 返回 token，但没有 `buyerUserId`，服务端视为未注册；注册接口需要继续从包里定位或改为人工注册。
- **`baimazhixuan` 白马智选**：登录直接返回 `71606 该用户未注册`；需要找注册接口或用手机号授权注册。
- **`fafa` 发发藏宝洞**：已找到 `PUT /user/registerOrBindUser`，参数为 `encryptedData/ivStr/validateType=2/registerOrBind=2`；用 YYB `getPhoneAuth` 的 encryptedData 请求返回 `400 当前微信版本过低，请升级后使用`。YYB 取到的手机号授权数据被目标服务端按微信版本/水印拒绝，需要真实客户端授权或新版手机号 code。
- **`dks` 戴可思**：`/passport/mobile/native/callback.json` 返回 `{code:0,msg:"ok"}`，但签到仍返回 `用户手机号未授权`；UIC 回调可能需要真实 uic 会话 cookie，单靠 access_token 不够。
- **`guyu` 谷雨**：登录成功，`getMyAllPoint`/签到提示 `授权失败`；用缓存 token 直接请求积分接口返回 `success=false, code=2025, msg=授权失败`，重新登录不恢复，按账号未完成会员授权处理，见 [25 应用注册状态](25-registration-status.md)。

结论：平台现有 `ctx.yyb.getPhoneAuth` 能拿到手机号授权数据，但**目标小程序的注册接口是否接受这份数据取决于目标服务端的水印/版本校验**。不能假设所有应用都能自动注册；需要逐个验证，不能自动注册的应用应标记为人工注册并保留脚本。

## 5. 接入流程

1. 用 `analysis/tools/wechat/fetch-mini-program.ps1` 抓包：
   ```powershell
   pwsh -File analysis/tools/wechat/fetch-mini-program.ps1 -Name "<小程序名>" -AppId <appid>
   ```
   同名应用用 `-ResultIndex` 选择，最终以主包 AppID 为准。
2. 用 `KillWxapkg` 解包到 `analysis/packages/<key>/unpacked/`。
3. 对照青龙脚本确认登录、注册、签到、积分、商品、兑换接口和加密/签名。
4. 在 `data/apps/<key>/` 写 `app.json` + `scripts/sign-in.js`（必要时 `points.js`、`products.js`、`exchange.js`）。
5. `pnpm import:apps -- --bind-all` 导入并绑定账号。
6. 手动触发一次 Run，确认登录/签到/积分；商品脚本先只读，确认字段后再做兑换。
7. 更新本文件和 `docs/21-app-catalog.md`。

## 6. SDK 能力评估

已有能力：

- `ctx.yyb.getCode` / `getPhoneAuth`：取 code 和手机号授权，覆盖大部分登录/注册入口。
- `ctx.http` / `createLegacyAdapter`：请求、headers、query、body、超时。
- `ctx.cache` / `ctx.session`：token 缓存。
- `ctx.points.sync`：积分余额、过期、规则说明。
- `ctx.products.sync`：商品/券同步，支持库存、限购、状态、时间、小程序码。
- `ctx.orders.record`：兑换/抢购订单记录。
- `ctx.activities`：活动同步、进度、完成。
- `ctx.manualRequired` / `ctx.authExpired`：人工处理/登录失效。
- Run action：脚本可以返回 `details.action = 'register'`，前端提供“一键注册”。

需要评估/补齐：

1. **商品兑换入口**：目前商品页只能看，不能直接触发兑换脚本。平台有 `Order` 和脚本 args，但没有“商品 → 兑换脚本”的通用动作。
   - 建议：给 Product 增加 `redeemCapability`/`redeemScriptId`，商品卡片增加“兑换”按钮，排队 Run 并传 `ctx.input.productExternalId`。
   - 先做只读预检脚本（余额/库存/时间），确认多个应用都需要后再做通用入口。
2. **注册资料**：不同小程序注册字段不同（手机号、验证码、姓名、生日、地址）。`ctx.yyb.getPhoneAuth` 只能提供手机号授权，验证码/短信类需要人工。
   - 建议：保持每个应用自己的注册函数；需要人工时用 `ctx.manualRequired` 或 `details.action='register'`。
3. **商品详情**：`ctx.products.get` 只有平台缓存，没有远端详情接口。兑换前需要脚本自己查远端详情。
   - 暂不补 SDK；脚本内处理。
4. **订单查询**：平台只记录脚本产生的订单，不主动同步远端订单状态。
   - 暂不补；需要时在脚本里查远端并 `ctx.orders.update`。
5. **设备指纹/验证码/滑块**：部分应用有风控，SDK 不提供绕过能力；脚本应明确失败原因并转人工。

## 7. 下一步

- 继续补抓 `bqs`、`qmsd`、`lieer`、`stokke` 的最新主包（本轮搜索结果 AppID 不一致），并复查 `kangshifu` 的 `shop` 分包。
- 继续排查 `mxbc` 签到接口的服务端版本限制、`musi` 注册 token 作用域问题；`parkson`/`fafa`/`dks` 需要真实客户端手机号授权。
- 再按 README 顺序抓包/接入其余应用；同名应用统一用 AppID 校验。
- 每个应用至少保证：登录、签到/任务、积分；有商品接口的补 `products.js`，有兑换接口的补 `exchange.js`。
- 商品兑换通用入口等确认 2-3 个应用的真实兑换接口后再做，避免先做半套 UI。
- 每个应用接入后先跑一次真实 Run，确认登录/签到/积分/商品，再决定是否 `enabled: true`。
- 每批完成后更新本文件、`docs/21-app-catalog.md` 和 `CHANGELOG.md`。
