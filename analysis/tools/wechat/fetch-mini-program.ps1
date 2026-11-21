#requires -Version 7
<#
.SYNOPSIS
  在 PC 微信里搜索并打开一个小程序，等它把 wxapkg 下载到本机缓存后关闭窗口。

.DESCRIPTION
  只用于抓取小程序包做静态分析，不读取小程序页面内容。
  依赖：微信 4.x 已登录、小程序面板可用、Windows UI Automation。

.EXAMPLE
  pwsh -File analysis/tools/wechat/fetch-mini-program.ps1 -Name "CASETiFY"

.EXAMPLE
  pwsh -File analysis/tools/wechat/fetch-mini-program.ps1 -Name "BLUE DASH" -AppId wx73555499305578f8
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string] $Name,

  [string] $AppId = '',

  [int] $WaitSeconds = 12,

  [int] $ResultIndex = 0,

  [switch] $KeepOpen,

  [switch] $SkipIfCached,

  [string] $WeChatPackagesRoot = ''
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class WxNative {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
'@

[WxNative]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null

function Get-VisibleWindows([string[]] $ProcessNames) {
  $result = [System.Collections.Generic.List[object]]::new()
  $callback = [WxNative+EnumWindowsProc] {
    param($handle, $state)
    if (-not [WxNative]::IsWindowVisible($handle)) { return $true }
    $title = [System.Text.StringBuilder]::new(512)
    [WxNative]::GetWindowText($handle, $title, $title.Capacity) | Out-Null
    $processId = [uint32]0
    [WxNative]::GetWindowThreadProcessId($handle, [ref]$processId) | Out-Null
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $process -or $ProcessNames -notcontains $process.ProcessName) { return $true }
    $rect = [WxNative+RECT]::new()
    [WxNative]::GetWindowRect($handle, [ref]$rect) | Out-Null
    $result.Add([pscustomobject]@{
      Handle = $handle
      Process = $process.ProcessName
      ProcessId = $processId
      Title = $title.ToString()
      X = $rect.Left
      Y = $rect.Top
      Width = $rect.Right - $rect.Left
      Height = $rect.Bottom - $rect.Top
    })
    return $true
  }
  [WxNative]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
  return $result
}

function Get-WeChatMainWindow {
  $windows = Get-VisibleWindows @('Weixin', 'WeChat')
  $window = $windows |
    Where-Object { $_.Title -and $_.Width -gt 300 -and $_.Height -gt 300 } |
    Sort-Object Width -Descending |
    Select-Object -First 1
  if (-not $window) {
    throw '没有找到已登录的 PC 微信主窗口。请先打开微信并登录。'
  }
  return $window
}

function Find-Control($root, $controlType, [scriptblock] $filter = $null) {
  $condition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    $controlType
  )
  $matches = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
  for ($index = 0; $index -lt $matches.Count; $index++) {
    $element = $matches.Item($index)
    if (-not $filter -or (& $filter $element)) { return $element }
  }
  return $null
}

function Get-ControlList($root, $controlType, [scriptblock] $filter = $null) {
  $condition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    $controlType
  )
  $matches = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
  $result = [System.Collections.Generic.List[object]]::new()
  for ($index = 0; $index -lt $matches.Count; $index++) {
    $element = $matches.Item($index)
    if (-not $filter -or (& $filter $element)) { $result.Add($element) }
  }
  return $result
}

function Invoke-Click([int] $x, [int] $y) {
  [WxNative]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 80
  [WxNative]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  [WxNative]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}

function Click-Element($element) {
  $rect = $element.Current.BoundingRectangle
  if ($rect.Width -le 0 -or $rect.Height -le 0) {
    throw '目标控件没有可点击区域。'
  }
  Invoke-Click ([int]($rect.X + $rect.Width / 2)) ([int]($rect.Y + $rect.Height / 2))
}

function Get-WeChatPackagesRoot([string] $override) {
  if ($override) { return $override }
  $usersRoot = Join-Path $env:APPDATA 'Tencent\xwechat\radium\users'
  if (-not (Test-Path $usersRoot)) {
    throw "没有找到微信 4.x 缓存目录：$usersRoot"
  }
  $candidates = Get-ChildItem $usersRoot -Directory |
    ForEach-Object { Join-Path $_.FullName 'applet\packages' } |
    Where-Object { Test-Path $_ } |
    Sort-Object { (Get-Item $_).LastWriteTime } -Descending
  if (-not $candidates) {
    throw "微信缓存目录下没有 applet\packages：$usersRoot"
  }
  return @($candidates)[0]
}

function Get-PackageSnapshot([string] $root) {
  if (-not (Test-Path $root)) { return @{} }
  $snapshot = @{}
  Get-ChildItem $root -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
    $snapshot[$_.FullName] = $_.LastWriteTimeUtc
  }
  return $snapshot
}

function Wait-SearchDocument($root, [string] $keyword, [int] $timeoutSeconds = 10) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  do {
    $documents = Get-ControlList $root ([System.Windows.Automation.ControlType]::Document) {
      param($element)
      $name = $element.Current.Name
      return $name -and $name -like '*_搜索*' -and $name -like "*$keyword*"
    }
    if ($documents.Count -gt 0) {
      return $documents[$documents.Count - 1]
    }
    Start-Sleep -Milliseconds 400
  } while ((Get-Date) -lt $deadline)
  return $null
}

function Open-MiniProgramPanel($root) {
  $edit = Find-Control $root ([System.Windows.Automation.ControlType]::Edit) {
    param($element)
    $rect = $element.Current.BoundingRectangle
    return (
      $element.Current.Name -match '搜索|Search' -and
      -not $element.Current.IsOffscreen -and
      $rect.Width -gt 100 -and
      $rect.Height -gt 20
    )
  }
  if ($edit) { return $edit }

  $panelButton = Get-ControlList $root ([System.Windows.Automation.ControlType]::Button) {
    param($element)
    $rect = $element.Current.BoundingRectangle
    return $element.Current.Name -eq '小程序' -and $rect.X -lt 700
  } | Select-Object -First 1
  if ($panelButton) {
    Click-Element $panelButton
    Start-Sleep -Milliseconds 1000
  }

  $deadline = (Get-Date).AddSeconds(8)
  do {
    $edit = Find-Control $root ([System.Windows.Automation.ControlType]::Edit) {
      param($element)
      $rect = $element.Current.BoundingRectangle
      return (
        $element.Current.Name -match '搜索|Search' -and
        -not $element.Current.IsOffscreen -and
        $rect.Width -gt 100 -and
        $rect.Height -gt 20
      )
    }
    if ($edit) { return $edit }
    Start-Sleep -Milliseconds 400
  } while ((Get-Date) -lt $deadline)
  return $null
}

function Search-MiniProgram($root, [string] $keyword) {
  $edit = Open-MiniProgramPanel $root
  if (-not $edit) {
    throw '没有找到小程序搜索框。请确认微信小程序面板可以正常打开。'
  }

  Click-Element $edit
  Start-Sleep -Milliseconds 350
  $edit.SetFocus()
  Start-Sleep -Milliseconds 200
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  [System.Windows.Forms.SendKeys]::SendWait('{DEL}')
  Start-Sleep -Milliseconds 150

  $previousClipboard = $null
  try { $previousClipboard = Get-Clipboard -Raw -TextFormatType Text -ErrorAction SilentlyContinue } catch {}
  Set-Clipboard -Value $keyword
  [System.Windows.Forms.SendKeys]::SendWait('^v')
  Start-Sleep -Milliseconds 900
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')

  $document = Wait-SearchDocument $root $keyword 12
  if (-not $document) {
    throw "搜索「$keyword」后没有出现匹配的结果页，可能搜不到该小程序，或搜索框仍停留在上一次结果。"
  }
  Start-Sleep -Milliseconds 1200

  if ($null -ne $previousClipboard) {
    try { Set-Clipboard -Value $previousClipboard } catch {}
  }
  return $document
}

function Get-ResultTitles($document) {
  return @(
    Get-ControlList $document ([System.Windows.Automation.ControlType]::Text) {
      param($element)
      $rect = $element.Current.BoundingRectangle
      $docRect = $document.Current.BoundingRectangle
      $offsetX = $rect.X - $docRect.X
      return (
        $rect.Top -gt $docRect.Top + 100 -and
        $offsetX -gt 80 -and
        $offsetX -lt 165 -and
        $rect.Width -gt 60 -and
        $rect.Width -lt 240 -and
        $rect.Height -gt 18 -and
        $rect.Height -lt 32
      )
    } | Sort-Object { $_.Current.BoundingRectangle.Top }
  )
}

function Wait-NewMiniProgramWindow([object[]] $existingHandles, [int] $timeoutSeconds = 20) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  do {
    $windows = Get-VisibleWindows @('WeChatAppEx', 'WeChat')
    foreach ($window in $windows) {
      if ($existingHandles -contains $window.Handle) { continue }
      if (-not $window.Title) { continue }
      if ($window.Title -eq '小程序') { continue }
      if ($window.Width -lt 250 -or $window.Height -lt 300) { continue }
      return $window
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  return $null
}

function Close-Window($window) {
  [WxNative]::PostMessage($window.Handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
  Start-Sleep -Milliseconds 1200
}

$packagesRoot = Get-WeChatPackagesRoot $WeChatPackagesRoot
Write-Host "缓存根目录：$packagesRoot"
if ($AppId) { Write-Host "目标 AppID：$AppId" }

if ($SkipIfCached -and $AppId) {
  $cachedRoot = Join-Path $packagesRoot $AppId
  if (Test-Path $cachedRoot) {
    $cachedFiles = @(Get-ChildItem $cachedRoot -Recurse -File | Sort-Object FullName)
    Write-Host "缓存已存在，跳过搜索：$cachedRoot"
    foreach ($file in $cachedFiles) {
      Write-Host ("  {0}  {1:N1} KB" -f $file.FullName.Substring($packagesRoot.Length + 1), ($file.Length / 1KB))
    }
    exit 0
  }
}

function Get-WeChatSearchTarget {
  $windows = Get-VisibleWindows @('Weixin', 'WeChatAppEx', 'WeChat') |
    Where-Object { $_.Title -and $_.Width -gt 300 -and $_.Height -gt 300 }
  foreach ($window in $windows) {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($window.Handle)
    if (-not $root) { continue }
    $edit = Find-Control $root ([System.Windows.Automation.ControlType]::Edit) {
      param($element)
      $rect = $element.Current.BoundingRectangle
      return (
        $element.Current.Name -match '搜索|Search' -and
        -not $element.Current.IsOffscreen -and
        $rect.Width -gt 100 -and
        $rect.Height -gt 20
      )
    }
    if ($edit) {
      return [pscustomobject]@{ Window = $window; Root = $root }
    }
  }
  $main = Get-WeChatMainWindow
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($main.Handle)
  return [pscustomobject]@{ Window = $main; Root = $root }
}

$searchTarget = Get-WeChatSearchTarget
$wechat = $searchTarget.Window
[WxNative]::ShowWindow($wechat.Handle, 9) | Out-Null
[WxNative]::SetWindowPos($wechat.Handle, [IntPtr](-1), 0, 0, 0, 0, 0x0001 -bor 0x0002) | Out-Null
[WxNative]::SetForegroundWindow($wechat.Handle) | Out-Null
Start-Sleep -Milliseconds 400
[WxNative]::SetWindowPos($wechat.Handle, [IntPtr](-2), 0, 0, 0, 0, 0x0001 -bor 0x0002) | Out-Null
Start-Sleep -Milliseconds 250

$root = $searchTarget.Root
if (-not $root) { throw '无法读取微信窗口的 UI Automation 节点。' }

$beforePackages = Get-PackageSnapshot $packagesRoot
$beforeWindows = @(Get-VisibleWindows @('WeChatAppEx', 'WeChat') | ForEach-Object { $_.Handle })
$startedAt = Get-Date

Write-Host "微信窗口：$($wechat.Title) ($($wechat.Width)x$($wechat.Height))"
Write-Host "搜索小程序：$Name"
$document = Search-MiniProgram $root $Name

# 结果页右侧是结果卡片，左侧浮层是搜索建议；点卡片右侧避免点到建议。
$resultTitles = @(Get-ResultTitles $document)
if ($resultTitles.Count -gt 0) {
  Write-Host '搜索结果：'
  for ($index = 0; $index -lt [Math]::Min($resultTitles.Count, 6); $index++) {
    $prefix = if ($index -eq $ResultIndex) { '→' } else { ' ' }
    Write-Host ("  {0} {1}. {2}" -f $prefix, ($index + 1), $resultTitles[$index].Current.Name)
  }
}

$clickX = [int]($document.Current.BoundingRectangle.Right - 90)
if ($resultTitles.Count -gt $ResultIndex) {
  $targetRect = $resultTitles[$ResultIndex].Current.BoundingRectangle
  $clickY = [int]($targetRect.Top + $targetRect.Height / 2)
} else {
  $clickY = [int]($document.Current.BoundingRectangle.Top + 165 + $ResultIndex * 105)
}
Invoke-Click $clickX $clickY

$miniProgram = Wait-NewMiniProgramWindow $beforeWindows 15
if (-not $miniProgram) {
  # 某些版本的结果卡片标题更靠下，再试一次。
  Invoke-Click $clickX ([int]($document.Current.BoundingRectangle.Top + 215 + $ResultIndex * 105))
  $miniProgram = Wait-NewMiniProgramWindow $beforeWindows 15
}
if (-not $miniProgram) {
  throw "点击「$Name」的第一个结果后没有打开小程序窗口。"
}

Write-Host "已打开：$($miniProgram.Title)，等待 ${WaitSeconds}s 下载小程序包…"
Start-Sleep -Seconds $WaitSeconds

if (-not $KeepOpen) {
  Close-Window $miniProgram
  Write-Host "已关闭：$($miniProgram.Title)"
} else {
  Write-Host "保持打开：$($miniProgram.Title)"
}

Start-Sleep -Milliseconds 800
$afterPackages = Get-PackageSnapshot $packagesRoot
$newFiles = @()
foreach ($path in $afterPackages.Keys) {
  $isNew = -not $beforePackages.ContainsKey($path)
  $isChanged = $beforePackages.ContainsKey($path) -and $afterPackages[$path] -gt $beforePackages[$path]
  if ($isNew -or $isChanged) {
    if ($afterPackages[$path] -ge $startedAt.ToUniversalTime().AddSeconds(-10)) {
      $newFiles += Get-Item $path
    }
  }
}

if ($AppId) {
  $expected = Join-Path $packagesRoot $AppId
  if (Test-Path $expected) {
    $newFiles = @(Get-ChildItem $expected -Recurse -File)
  }
}

if ($newFiles.Count -eq 0 -and -not $AppId) {
  # 包可能已经在打开前缓存；取最近修改的 appid 目录作为兜底。
  $recentRoot = Get-ChildItem $packagesRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge (Get-Date).AddMinutes(-5) } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($recentRoot) {
    $newFiles = @(Get-ChildItem $recentRoot.FullName -Recurse -File)
  }
}

$newFiles = @($newFiles | Sort-Object FullName)
if ($newFiles.Count -eq 0) {
  Write-Warning "没有检测到 wxapkg。缓存目录：$packagesRoot"
  exit 2
}

$groups = $newFiles | Group-Object {
  $relative = $_.FullName.Substring($packagesRoot.Length + 1)
  $relative.Split([System.IO.Path]::DirectorySeparatorChar)[0]
}

$mainGroup = $groups |
  Where-Object { $_.Group.Name -contains '__APP__.wxapkg' } |
  Sort-Object { ($_.Group | Where-Object Name -eq '__APP__.wxapkg' | Select-Object -First 1).Length } -Descending |
  Select-Object -First 1

Write-Host ''
if ($mainGroup) { Write-Host "主包 AppID：$($mainGroup.Name)" }
Write-Host "检测到 $($newFiles.Count) 个包文件："
foreach ($group in ($groups | Sort-Object Name)) {
  Write-Host "[$($group.Name)]"
  foreach ($file in ($group.Group | Sort-Object Name)) {
    $relative = $file.FullName.Substring($packagesRoot.Length + 1)
    $name = $file.Name
    $tag = if ($name -eq '__APP__.wxapkg') { '主包' } elseif ($name -like '*PLUGINCODE*') { '插件' } else { '分包' }
    Write-Host ("  {0}  {1,8:N1} KB  {2}" -f $name, ($file.Length / 1KB), $tag)
  }
}
Write-Host ''
Write-Host "缓存根目录：$packagesRoot"

exit 0
