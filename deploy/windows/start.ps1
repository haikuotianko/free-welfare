param(
  [switch]$SkipSetup
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $Root

$runtime = Join-Path $Root 'runtime'
$localNode = Join-Path $runtime 'node.exe'
if (Test-Path $localNode) {
  $node = $localNode
} else {
  $node = (Get-Command node -ErrorAction Stop).Source
}
$env:PATH = "$(Split-Path $node);$env:PATH"

$api = Join-Path $Root 'apps\api\dist\main.js'
$native = Join-Path $Root 'deploy\native\node_modules\embedded-postgres'
if (-not $SkipSetup -and (-not (Test-Path $api) -or -not (Test-Path $native))) {
  Write-Host '首次运行，先初始化 Free Welfare…'
  & (Join-Path $PSScriptRoot 'setup.ps1') -Root $Root
}

& $node (Join-Path $Root 'deploy\native\launcher.mjs')
