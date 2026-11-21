# 抓包工具

## 推荐

| 工具 | 平台 | 说明 |
| --- | --- | --- |
| mitmproxy | Win/mac/Linux | 命令行/Web UI，脚本扩展强，适合导出 HAR |
| Reqable | Win/mac/Linux/移动 | 国产，HTTP/HTTPS/WebSocket 调试，界面友好 |
| Charles | Win/mac | 老牌，HTTPS 抓包/HAR |

## 流程

1. 启动抓包工具，设置系统/浏览器代理。
2. 安装并信任 CA 证书。
3. PC 微信打开小程序，操作登录/签到/商品/活动。
4. 导出 HAR。
5. **脱敏**：删除 `code`、`sid`、`token`、`cookie`、`authorization`、手机号、OpenID、真实账号。
6. 放到 `analysis/packages/<key>/fixtures/`（默认 gitignore；需要提交时用 `*.example.json`）。

## 注意

- 部分小程序有证书校验/双向认证，抓包可能失败；用 WMPFDebugger 的 Network 作为补充。
- 微信内置浏览器/WebView 是独立进程，可能需要单独代理。
- 不要在公开 issue/仓库贴未脱敏 HAR。
- 抓包只用于本人有权分析的账号和小程序。
