param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
Set-Location $Root

$runtime = Join-Path $Root 'runtime'
$localNode = Join-Path $runtime 'node.exe'
$localNpm = Join-Path $runtime 'npm.cmd'

if (Test-Path $localNode) {
  $node = $localNode
} else {
  $node = (Get-Command node -ErrorAction Stop).Source
}

if (Test-Path $localNpm) {
  $npm = $localNpm
} else {
  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
}

$env:PATH = "$(Split-Path $node);$env:PATH"

Write-Host "Free Welfare 初始化目录：$Root"
Write-Host "Node：$node"

if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
  if (Test-Path (Join-Path $Root 'package-lock.json')) {
    Write-Host '安装依赖（npm ci）…'
    & $npm ci --no-audit --no-fund
  } else {
    Write-Host '安装依赖（npm install）…'
    & $npm install --no-audit --no-fund
  }
  if ($LASTEXITCODE -ne 0) { throw '依赖安装失败' }
}

if (-not $SkipBuild) {
  Write-Host '构建平台（首次需要几分钟）…'
  & $npm run npm:build
  if ($LASTEXITCODE -ne 0) { throw '构建失败' }
}

$native = Join-Path $Root 'deploy\native\node_modules\embedded-postgres'
if (-not (Test-Path $native)) {
  Write-Host '安装内置 PostgreSQL…'
  & $npm install --prefix deploy/native --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw '内置 PostgreSQL 安装失败' }
}

Write-Host '初始化完成。'
