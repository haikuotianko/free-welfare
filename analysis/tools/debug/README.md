# 运行时调试工具

## WMPFDebugger（首选）

- 地址：https://github.com/evi0s/WMPFDebugger
- 许可证：GPLv2
- 平台：Windows x86_64 / macOS arm64 / Linux x86_64（桌面微信运行时）
- 能力：用 Chrome DevTools 调试 PC 微信里的小程序，查看 JS、Network、Console、Storage、断点。

### 环境

- Node.js LTS v22+
- yarn
- Chrome/Edge
- PC 微信（WMPF 版本需在支持列表，或尝试 `--auto-detect`）

### 使用

```bash
git clone https://github.com/evi0s/WMPFDebugger
cd WMPFDebugger
yarn
npx tsx src/index.ts
```

1. 保持调试器运行。
2. PC 微信打开目标小程序。
3. 浏览器打开 `devtools://devtools/bundled/inspector.html?ws=127.0.0.1:62000`。
4. Sources 格式化代码，搜接口路径/字段；Network 清空后手动操作一次签到/兑换。
5. 记录请求到 `analysis/packages/<key>/fixtures/`（脱敏）。

### 注意

- 顺序：先启动调试器 → 再开小程序 → 最后开 DevTools。
- 微信/WMPF 更新可能导致偏移失效，需要等适配。
- 内嵌 WebView 是独立进程，Network 可能看不到；见项目 `EXTENSION.md`。
- 云函数/服务端逻辑看不到。
- 只用于分析，不要放进生产服务器。

## 微信开发者工具

- 用于导入 KillWxapkg 还原后的工程，辅助阅读 WXML/WXSS/JS。
- 需要项目配置/AppID；不是在线小程序调试的替代品。
