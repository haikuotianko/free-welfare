param(
  [string]$Version = ((Get-Content (Join-Path $PSScriptRoot '..\..\package.json') -Raw | ConvertFrom-Json).version),
  [switch]$SkipBuild,
  [switch]$SkipNodeDownload
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$release = Join-Path $root 'release\windows'
$stage = Join-Path $release 'stage'
$payload = Join-Path $release 'payload.zip'
$installer = Join-Path $release "Free-Welfare-Setup-$Version.exe"
$icon = Join-Path $root 'deploy\windows\free-welfare.ico'
$program = Join-Path $root 'deploy\windows\installer\Program.cs'

Write-Host "Free Welfare Windows 安装包：$Version"

if (-not $SkipBuild) {
  Push-Location $root
  try {
    Write-Host '构建平台…'
    npm run npm:build
    if ($LASTEXITCODE -ne 0) { throw '构建失败' }
  } finally {
    Pop-Location
  }
}

if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Path $stage | Out-Null
New-Item -ItemType Directory -Path $release -Force | Out-Null

Write-Host '复制应用文件…'
$exclude = @('node_modules', '.git', 'data', 'release', 'analysis', 'site', 'docs', 'tests', 'examples', '.github')
$xd = @('/XD') + $exclude
robocopy $root $stage /E @xd /XF '.env' '*.log' | Out-Null
if ($LASTEXITCODE -gt 7) { throw "robocopy 失败：$LASTEXITCODE" }

$runtime = Join-Path $stage 'runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
if (-not $SkipNodeDownload -and -not (Test-Path (Join-Path $runtime 'node.exe'))) {
  Write-Host '下载 Node.js 22 运行时…'
  $listing = Invoke-WebRequest -Uri 'https://nodejs.org/dist/latest-v22.x/' -UseBasicParsing
  $match = [regex]::Match($listing.Content, 'node-v([0-9.]+)-win-x64\.zip')
  if (-not $match.Success) { throw '无法从 nodejs.org 找到 Node 22 Windows 包' }
  $zipName = $match.Value
  $zipPath = Join-Path $release $zipName
  if (-not (Test-Path $zipPath)) {
    Invoke-WebRequest -Uri ("https://nodejs.org/dist/latest-v22.x/" + $zipName) -OutFile $zipPath
  }
  $extract = Join-Path $release 'node-extract'
  if (Test-Path $extract) { Remove-Item -Recurse -Force $extract }
  Expand-Archive -Path $zipPath -DestinationPath $extract -Force
  $nodeDir = Get-ChildItem $extract -Directory | Select-Object -First 1
  if (-not $nodeDir) { throw 'Node.js 压缩包解压失败' }
  Copy-Item (Join-Path $nodeDir.FullName '*') $runtime -Recurse -Force
}

if (-not (Test-Path (Join-Path $runtime 'node.exe'))) {
  Write-Warning '未包含 runtime\node.exe；安装包将依赖系统 Node.js。'
}

Write-Host '生成安装负载…'
if (Test-Path $payload) { Remove-Item -Force $payload }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $payload -CompressionLevel Optimal

$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw '找不到 csc.exe（需要 .NET Framework 4.x）' }

Write-Host '编译安装程序…'
if (Test-Path $installer) { Remove-Item -Force $installer }
& $csc /nologo /codepage:65001 /target:exe "/out:$installer" "/resource:$payload,payload.zip" "/win32icon:$icon" /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll $program
if ($LASTEXITCODE -ne 0) { throw '安装程序编译失败' }

$size = [Math]::Round((Get-Item $installer).Length / 1MB, 1)
Write-Host "安装包已生成：$installer（$size MB）"
