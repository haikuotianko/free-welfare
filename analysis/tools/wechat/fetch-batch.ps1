#requires -Version 7
<#
.SYNOPSIS
  批量抓取小程序包。每个应用按名称搜索，AppID 校验失败时自动尝试下一个搜索结果。

.EXAMPLE
  pwsh -File analysis/tools/wechat/fetch-batch.ps1 -AppsJson analysis/tools/wechat/apps.json
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $AppsJson,

  [int] $MaxResults = 4,

  [int] $WaitSeconds = 10
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$fetch = Join-Path $PSScriptRoot 'fetch-mini-program.ps1'

function Get-PackagesRoot {
  $usersRoot = Join-Path $env:APPDATA 'Tencent\xwechat\radium\users'
  $candidates = Get-ChildItem $usersRoot -Directory |
    ForEach-Object { Join-Path $_.FullName 'applet\packages' } |
    Where-Object { Test-Path $_ } |
    Sort-Object { (Get-Item $_).LastWriteTime } -Descending
  return @($candidates)[0]
}

function Test-PackageCached([string] $packagesRoot, [string] $appId) {
  $dir = Join-Path $packagesRoot $appId
  if (-not (Test-Path $dir)) { return $false }
  return [bool](Get-ChildItem $dir -Recurse -Filter '*.wxapkg' -File -ErrorAction SilentlyContinue | Select-Object -First 1)
}

$apps = Get-Content $AppsJson -Raw | ConvertFrom-Json
$packagesRoot = Get-PackagesRoot

foreach ($app in $apps) {
  if (-not $app.name -or -not $app.appId) { continue }
  Write-Host ''
  Write-Host "===== $($app.key) / $($app.name) / $($app.appId)"
  if (Test-PackageCached $packagesRoot $app.appId) {
    Write-Host '已缓存，跳过。'
    continue
  }

  $ok = $false
  for ($index = 0; $index -lt $MaxResults; $index++) {
    try {
      & $fetch -Name $app.name -AppId $app.appId -ResultIndex $index -WaitSeconds $WaitSeconds 2>&1 |
        ForEach-Object { Write-Host $_ }
    } catch {
      Write-Warning ("抓取失败（result {0}）：{1}" -f $index, $_.Exception.Message)
    }
    if (Test-PackageCached $packagesRoot $app.appId) {
      $ok = $true
      break
    }
  }

  if ($ok) {
    Write-Host "OK: $($app.key)"
  } else {
    Write-Warning "FAILED: $($app.key) $($app.name)"
  }
}
