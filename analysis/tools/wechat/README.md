# 微信小程序包抓取

用 PC 微信搜索并打开小程序，等包下载到本机缓存后自动关闭窗口。只用于获取 `.wxapkg` 做静态分析，不读取小程序页面。

## 环境

- Windows + PowerShell 7（`pwsh`）
- 已登录的 PC 微信 4.x
- 微信“发现 → 小程序”面板可用

## 用法

```powershell
# 按名称搜索，自动打开第一个结果
pwsh -File analysis/tools/wechat/fetch-mini-program.ps1 -Name "CASETiFY"

# 已知 AppID 时校验并列出该应用的全部包
pwsh -File analysis/tools/wechat/fetch-mini-program.ps1 `
  -Name "CASETiFY" -AppId wxd0c71d6bf928a416

# 同名小程序有多个时，先看脚本打印的结果列表，再用 -ResultIndex 选第 N 个（从 0 开始）
pwsh -File analysis/tools/wechat/fetch-mini-program.ps1 -Name "谷雨" -ResultIndex 1

# 已缓存则直接列出包，不打开微信
pwsh -File analysis/tools/wechat/fetch-mini-program.ps1 `
  -Name "戴可思" -AppId wx9d46d96c4c35a53a -SkipIfCached

# 批量：按 apps.json 里的名称/AppID 抓取，AppID 不匹配时自动尝试下一个搜索结果
pwsh -File analysis/tools/wechat/fetch-batch.ps1 -AppsJson analysis/tools/wechat/apps.json
```

参数：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `-Name` | 必填 | 微信里搜索的小程序名称 |
| `-AppId` | 空 | 已知 AppID；用于校验/直接列出缓存，不参与选择结果 |
| `-ResultIndex` | `0` | 点击第几个搜索结果，从 0 开始 |
| `-WaitSeconds` | `12` | 打开小程序后等待下载的秒数 |
| `-SkipIfCached` | 关闭 | 配合 `-AppId`，缓存已存在时直接退出 |
| `-KeepOpen` | 关闭 | 不关闭小程序窗口（调试用） |

## 输出

脚本会打印：

- 实际打开的窗口标题
- 主包 AppID（`__APP__.wxapkg` 所在的缓存目录）
- 主包、分包、插件的文件大小
- 微信缓存根目录

微信 4.x 的包通常在：

```text
%APPDATA%\Tencent\xwechat\radium\users\<用户>\applet\packages\<AppID>\<版本>\
```

## 注意

- 脚本会模拟鼠标点击搜索框和结果卡片，运行期间不要移动鼠标或切换窗口。
- 同名小程序可能不止一个。先看脚本列出的搜索结果，用 `-ResultIndex` 选择；最终以输出的主包 AppID 为准。
- 包下载需要时间；如果只看到 `__APP__.wxapkg` 而缺少分包，可以增大 `-WaitSeconds` 后重跑。
- 关闭窗口后包可能从 AppID 根目录移动到版本子目录，脚本会递归查找。
- 抓包仅用于接口/字段分析，不要提交解包产物、真实 token 或截图到仓库。
