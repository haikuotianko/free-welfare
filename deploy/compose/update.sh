#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
if [ ! -f "$COMPOSE_FILE" ]; then
  echo "找不到 compose 文件：$COMPOSE_FILE"
  exit 1
fi

echo "更新前请先备份数据库和 data/。"
echo "使用：$COMPOSE_FILE"

docker compose -f "$COMPOSE_FILE" pull api worker
docker compose -f "$COMPOSE_FILE" up -d --no-build
docker compose -f "$COMPOSE_FILE" ps
