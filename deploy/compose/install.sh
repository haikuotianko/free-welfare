#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.nas.yml}"
RAW_BASE="${FW_RAW_BASE:-https://raw.githubusercontent.com/haikuotianko/free-welfare/main/deploy/compose}"

if ! command -v docker >/dev/null 2>&1; then
  echo "未找到 docker，请先安装 Docker / Container Manager。"
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "未找到 curl，请先安装 curl 后重试。"
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "需要 Docker Compose v2（docker compose）。"
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "下载 $COMPOSE_FILE ..."
  curl -fsSL "$RAW_BASE/$COMPOSE_FILE" -o "$COMPOSE_FILE"
fi

rand_base64() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32 | tr -d '\r\n'
  else
    head -c 32 /dev/urandom | base64 | tr -d '\r\n'
  fi
}

rand_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
  else
    head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

replace_env() {
  key="$1"
  value="$2"
  awk -v k="$key" -v v="$value" 'BEGIN { FS=OFS="=" } $1 == k { print k "=" v; next } { print }' .env > .env.tmp
  mv .env.tmp .env
}

if [ -f .env ]; then
  echo "检测到现有 .env，保留配置，不覆盖。"
else
  echo "下载 .env.example ..."
  curl -fsSL "$RAW_BASE/.env.example" -o .env

  db_password="$(rand_hex)"
  app_key="$(rand_base64)"
  session_key="$(rand_base64)"

  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  if [ -z "$host_ip" ]; then
    host_ip="$(ip route get 1 2>/dev/null | awk '{print $7; exit}' || true)"
  fi
  if [ -z "$host_ip" ]; then
    host_ip="$(ip -4 addr show scope global 2>/dev/null | awk '/inet / { print $2; exit }' | cut -d/ -f1 || true)"
  fi
  if [ -z "$host_ip" ]; then
    host_ip="localhost"
  fi

  replace_env POSTGRES_PASSWORD "$db_password"
  replace_env DATABASE_URL "postgresql://welfare:$db_password@postgres:5432/welfare?schema=public"
  replace_env APP_ENCRYPTION_KEY "$app_key"
  replace_env AUTH_SESSION_SECRET "$session_key"
  replace_env APP_URL "${APP_URL:-http://$host_ip:31888}"
  replace_env YYB_DOCKER_NETWORK "${YYB_DOCKER_NETWORK:-qinglong_default}"
  replace_env CHECKPOINT_DISABLE "1"
  replace_env PRISMA_HIDE_UPDATE_MESSAGE "1"
  chmod 600 .env 2>/dev/null || true

  echo "已生成 $PWD/.env"
fi

network="$(grep -E '^YYB_DOCKER_NETWORK=' .env 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '\r' || true)"
network="${network:-qinglong_default}"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN=1：配置已生成，跳过网络创建和容器启动。"
  echo "网络：$network"
  exit 0
fi

if ! docker network inspect "$network" >/dev/null 2>&1; then
  echo "创建 YYB 共用网络：$network"
  docker network create "$network"
fi

echo "拉取并启动 Free Welfare ..."
docker compose -f "$COMPOSE_FILE" pull api worker
docker compose -f "$COMPOSE_FILE" up -d --no-build
docker compose -f "$COMPOSE_FILE" ps

app_url="$(grep -E '^APP_URL=' .env 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '\r' || true)"
echo
echo "启动完成：${app_url:-http://服务器IP:31888}"
echo "首次打开时创建管理员；YYB 地址和 token 可以在设置页填写。"
