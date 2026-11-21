# 小程序分析目录

这里放**小程序解包、调试、抓包、接口分析**的产出。目标：后续写脚本时，只读 `analysis/packages/<key>/` 下的文档就能知道：

- 小程序叫什么、AppID、图标、分类、版本；
- 网络根 URL（可能多个），哪些脚本需要/加入白名单；
- 数据是否加密/签名，怎么解密/验签；
- 登录流程、接口、字段、错误码；
- 积分规则、有效期、余额/流水接口；
- 商品/活动/兑换接口；
- 需要哪些功能脚本、哪些公共模块。

## 目录

```text
analysis/
  README.md
  tools/
    README.md
    unpack/          # 静态解包工具（KillWxapkg 等）
    debug/           # 运行时调试（WMPFDebugger 等）
    capture/         # 抓包（mitmproxy/Reqable 等）
  packages/
    README.md
    _template/       # 新分析包的模板
    sanf/            # 三福会员
      README.md
      metadata.yaml
      docs/
        overview.md
        api.md
        points.md
        crypto.md
        products.md
        activities.md
      unpacked/      # 解包文件（gitignore）
      fixtures/      # 脱敏请求/响应（gitignore）
      screenshots/   # 截图（gitignore）
      assets/        # 图标等可公开资源
```

## 工作流

```text
1. 获取 wxapkg
   -> 解包工具：KillWxapkg -id=<AppID> -in=<包/目录> -out=... -restore -pretty
2. 解包产物放到 analysis/packages/<key>/unpacked/
3. 用 WMPFDebugger/抓包确认实际请求
4. 填写 metadata.yaml + docs/
5. 按 docs 写脚本：一个功能一个脚本，公共逻辑放 common
6. 脚本仓库发布，平台订阅安装
```

## 规则

- **不要提交解包代码、HAR、截图、真实 token/手机号/OpenID**；这些目录已在 `.gitignore`。
- 文档只写接口路径、字段结构、脱敏示例、算法说明。
- 解包代码版权归原作者/腾讯；不要公开再分发。
- 每个分析包用 ASCII key（如 `sanf`），中文名称写在 `metadata.yaml` / README。
- 文档要区分“已验证”和“待确认”，不要把猜测写成事实。
- 积分有效期、库存、限购这类字段，必须写清楚来源接口和是否验证过。

## 和脚本的关系

- `analysis/packages/<key>/` 是“情报”；
- 脚本仓库里的 `scripts/<key>/<function>/` 是“实现”；
- 公共登录/加密/解密放 `scripts/<key>/common/` 或全局 `packages/common/`；
- 平台按“应用 → 功能脚本”管理启用/停用/版本/源更新。

详细脚本结构见 [docs/11 脚本结构](../docs/11-script-structure.md)。
