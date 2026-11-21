# 分析工具

按用途分三类：

| 目录 | 用途 | 工具 |
| --- | --- | --- |
| `unpack/` | 静态解包/反编译 | KillWxapkg、unveilr、wxappUnpacker |
| `debug/` | 运行时调试 | WMPFDebugger、微信开发者工具 |
| `capture/` | 抓包 | mitmproxy、Reqable、Charles |
| `wechat/` | PC 微信小程序包抓取 | `fetch-mini-program.ps1`（搜索/打开/等待下载/关闭） |

## 约定

- 工具二进制/源码放各自的 `bin/` 或外部目录，**不要提交**（`.gitignore` 已忽略 `analysis/tools/*/bin/*`）。
- README 里记录：项目地址、许可证、支持平台、版本要求、常用命令、已知限制。
- 只把工具用于本人有权分析的小程序；不要公开分发解包代码。
- 解包产物统一输出到 `analysis/packages/<key>/unpacked/`。
- 抓包文件（HAR）放 `analysis/packages/<key>/fixtures/`，默认不提交；需要提交时先脱敏成 `*.example.json`。
