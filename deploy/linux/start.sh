#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

if ! command -v node >/dev/null 2>&1; then
  echo "请先安装 Node.js 22+"
  exit 1
fi

if [ ! -d node_modules ] || [ ! -f apps/api/dist/main.js ]; then
  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund
  else
    npm install --no-audit --no-fund
  fi
  npm run npm:build
  npm install --prefix deploy/native --no-audit --no-fund
fi

exec node deploy/native/launcher.mjs
