# 静态解包工具

## KillWxapkg（首选）

- 地址：https://github.com/Ackites/KillWxapkg
- 许可证：MIT
- 平台：Windows / Linux / macOS（Go 编译）
- 能力：自动解密 `.wxapkg`、解包、还原工程目录、美化 JS/JSON/WXML/WXSS、可选 Hook 开 F12。

### 本机已放置

```text
analysis/tools/unpack/bin/KillWxapkg.exe
版本：2.4.1 windows/amd64
SHA-256：2DF29B47D054F320B48AE0797547C201BB2D7E841AB243FFBBB0318E7319F1B0
```

> `bin/` 已被 `.gitignore` 忽略，不会提交二进制。换机器时按下方 Releases 重新下载。

### 安装

从 Releases 下载对应平台二进制，放到 `analysis/tools/unpack/bin/`（不要提交），或自行编译：

```bash
git clone https://github.com/Ackites/KillWxapkg.git
cd KillWxapkg
go mod tidy
go build
```

### 常用命令

```bash
# 解密 + 解包 + 还原目录 + 美化
KillWxapkg -id=<AppID> \
  -in=<wxapkg文件或目录> \
  -out=analysis/packages/<key>/unpacked \
  -restore -pretty

# 只解包已解密的包
KillWxapkg -in=<目录> -out=<输出目录> -restore -pretty

# Hook 开 F12（仅 Windows，特定版本，有封号风险，建议小号）
KillWxapkg -hook
```

### 注意

- `-hook` 只支持 Windows 且列了特定 WMPF 版本，有封号风险；优先用 WMPFDebugger。
- 解包代码版权归原作者/腾讯；不要提交到仓库或公开分发。
- 混淆/分包/加密可能让静态分析不完整，最终以真实请求为准。

## 极简解包器（绕过格式化失败）

KillWxapkg 会在保存前格式化 JSON/JS。如果包里存在非标准 JSON（例如
`/.vscode/launch.json`），会直接中断，导致整个包没有输出。

此时先用 `-save` 拿到解密后的包，再用仓库内的极简解包器只拆文件：

```bash
KillWxapkg -id=<AppID> -in=<wxapkg> -out=analysis/packages/<key>/decrypted -save -noClean
node analysis/tools/unpack/extract-wxapkg.cjs \
  analysis/packages/<key>/decrypted/__APP__.wxapkg \
  analysis/packages/<key>/unpacked
```

特点：

- 只拆文件，不格式化、不还原目录美化；
- 保留原始 `app-service.js` / `page-frame.js`，适合搜索接口；
- 会跳过 `..` 等不安全路径；
- 输入必须是已解密的 wxapkg（首字节 `0xBE`）。

`fyzq` 就是用这个方式成功解包的。

## 其他可选

| 工具 | 用途 | 备注 |
| --- | --- | --- |
| unveilr | `.wxapkg` 解包/格式化 | Node 生态，适合补充 |
| wxappUnpacker | 老牌解包 | 维护状态/兼容性需确认 |
| 微信开发者工具 | 导入还原后的工程 | 需要 AppID/项目配置 |

## 输出

统一输出到：

```text
analysis/packages/<key>/unpacked/
```

该目录默认被 `.gitignore` 忽略。
