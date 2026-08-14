#!/usr/bin/env bash
#
# 在 Mac mini(或任意开发机)上构建 arm64 Docker 镜像,打包传到 Armbian 设备并直接部署。
# 设备端不再构建镜像(规避 Docker Hub 不可达 / 弱设备构建慢),只做 docker load + compose up。
#
# 用法:
#   ./deploy_image.sh                 构建 -> 打包 -> 传输 -> 加载 -> 启动 -> 健康检查
#   ./deploy_image.sh --check         仅检查设备条件(架构 / docker / compose / 端口)
#   ./deploy_image.sh --skip-build    复用本机已有镜像,跳过构建
#   ./deploy_image.sh --host 192.168.50.35 --user root --ssh-port 22 --insecure
#
# 认证(二选一,均通过环境变量):
#   export DEPLOY_SSH_KEY="$HOME/.ssh/id_rsa"   # 私钥(推荐)
#   export DEPLOY_PASSWORD='********'            # 密码,需本机安装 sshpass
#
# 可覆盖变量:DEPLOY_HOST DEPLOY_USER DEPLOY_SSH_PORT DEPLOY_DIR DEPLOY_IMAGE DEPLOY_PLATFORM
#
# 说明:目标设备为 aarch64(Armbian),因此默认构建 linux/arm64。
# Apple Silicon 的 Mac mini 原生即可构建 arm64;Intel Mac 需 Docker Desktop 已启用 QEMU/binfmt。
set -eo pipefail

HOST="${DEPLOY_HOST:-192.168.50.35}"
SSH_USER="${DEPLOY_USER:-root}"
SSH_PORT="${DEPLOY_SSH_PORT:-22}"
REMOTE_DIR="${DEPLOY_DIR:-/root/optictext-ocr}"
IMAGE="${DEPLOY_IMAGE:-optictext-ocr:latest}"
PLATFORM="${DEPLOY_PLATFORM:-linux/arm64}"
SERVICE_PORT=9999
COMPOSE_FILE="docker-compose.deploy.yml"
ARCHIVE="optictext-ocr-image.tar.gz"

DO_CHECK=0
DO_BUILD=1
INSECURE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="$2"; shift 2;;
    --user) SSH_USER="$2"; shift 2;;
    --ssh-port) SSH_PORT="$2"; shift 2;;
    --remote-dir) REMOTE_DIR="$2"; shift 2;;
    --image) IMAGE="$2"; shift 2;;
    --platform) PLATFORM="$2"; shift 2;;
    --check) DO_CHECK=1; shift;;
    --skip-build) DO_BUILD=0; shift;;
    --insecure) INSECURE=1; shift;;
    -h|--help) awk 'NR>=3 && /^#/{sub(/^# ?/,"");print;next} NR>=3{exit}' "$0"; exit 0;;
    *) echo "未知参数: $1(用 --help 查看用法)"; exit 1;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

[[ -f "$COMPOSE_FILE" ]] || { echo "缺少 ${COMPOSE_FILE},请在仓库根目录运行本脚本"; exit 1; }

# 组装 ssh/scp 命令(支持私钥或 sshpass 密码,--insecure 跳过主机指纹校验)
SSH_BASE=(ssh -p "$SSH_PORT" -o ConnectTimeout=15)
SCP_BASE=(scp -P "$SSH_PORT" -o ConnectTimeout=15)
if [[ "$INSECURE" == "1" ]]; then
  SSH_BASE+=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null)
  SCP_BASE+=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null)
fi
if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
  SSH_BASE+=(-i "$DEPLOY_SSH_KEY")
  SCP_BASE+=(-i "$DEPLOY_SSH_KEY")
fi
PREFIX=()
if [[ -n "${DEPLOY_PASSWORD:-}" ]]; then
  command -v sshpass >/dev/null 2>&1 || {
    echo "已设置 DEPLOY_PASSWORD,但本机未安装 sshpass(macOS: brew install hudochenkov/sshpass/sshpass)"
    exit 1
  }
  PREFIX=(sshpass -p "$DEPLOY_PASSWORD")
fi

remote() { "${PREFIX[@]}" "${SSH_BASE[@]}" "${SSH_USER}@${HOST}" "$@"; }
copy()   { "${PREFIX[@]}" "${SCP_BASE[@]}" "$1" "${SSH_USER}@${HOST}:$2"; }

echo "==> 目标设备: ${SSH_USER}@${HOST}:${SSH_PORT}   部署目录: ${REMOTE_DIR}"

check_device() {
  echo "==> 检查设备条件…"
  local arch docker compose port
  arch="$(remote 'uname -m' || true)"
  if [[ "$arch" == "aarch64" || "$arch" == "arm64" ]]; then
    echo "[通过] 架构 $arch"
  else
    echo "[失败] 架构 '${arch:-未知}'(需 aarch64;若连不上请检查 SSH/--insecure)"; return 1
  fi
  docker="$(remote 'docker --version 2>/dev/null' || true)"
  if [[ -n "$docker" ]]; then echo "[通过] $docker"; else echo "[失败] 设备未安装 Docker"; return 1; fi
  compose="$(remote 'docker compose version 2>/dev/null' || true)"
  if [[ -n "$compose" ]]; then echo "[通过] $compose"; else echo "[失败] 设备缺 docker compose v2 插件"; return 1; fi
  port="$(remote "ss -tlnp 2>/dev/null | grep ':${SERVICE_PORT} ' | head -1" || true)"
  if [[ -z "$port" ]]; then
    echo "[通过] 端口 ${SERVICE_PORT} 空闲"
  elif echo "$port" | grep -q docker; then
    echo "[通过] 端口 ${SERVICE_PORT} 被旧容器占用,部署时将自动替换"
  else
    echo "[失败] 端口 ${SERVICE_PORT} 被非 docker 进程占用: $port"; return 1
  fi
}

if [[ "$DO_CHECK" == "1" ]]; then
  check_device && echo "==> 设备条件检查通过"
  exit $?
fi
check_device || { echo "设备条件不满足,已中止(可修正后重试)"; exit 2; }

if [[ "$DO_BUILD" == "1" ]]; then
  echo "==> 在本机构建镜像 ${IMAGE}(${PLATFORM})…"
  if docker buildx version >/dev/null 2>&1; then
    docker buildx build --platform "$PLATFORM" -t "$IMAGE" --load .
  else
    echo "    未检测到 buildx,回退到 docker build --platform(需 Docker Desktop 已启用 QEMU)"
    docker build --platform "$PLATFORM" -t "$IMAGE" .
  fi
else
  echo "==> 跳过构建,复用本机镜像 ${IMAGE}"
  docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "本机不存在镜像 ${IMAGE}(去掉 --skip-build 先构建)"; exit 1; }
fi

echo "==> 导出并压缩镜像 -> ${ARCHIVE}"
docker save "$IMAGE" | gzip > "$ARCHIVE"
echo "    镜像包大小: $(du -h "$ARCHIVE" | cut -f1)"

echo "==> 传输镜像与 compose 文件到设备…"
remote "mkdir -p '${REMOTE_DIR}/data/images' '${REMOTE_DIR}/data/originals'"
copy "$COMPOSE_FILE" "${REMOTE_DIR}/${COMPOSE_FILE}"
copy "$ARCHIVE" "${REMOTE_DIR}/${ARCHIVE}"

echo "==> 在设备上 docker load 并启动容器…"
remote "cd '${REMOTE_DIR}' && gunzip -c '${ARCHIVE}' | docker load && docker compose -f '${COMPOSE_FILE}' up -d --remove-orphans && rm -f '${ARCHIVE}'"

rm -f "$ARCHIVE"

echo "==> 等待服务就绪(模型 warmup 可能数十秒)…"
URL="http://${HOST}:${SERVICE_PORT}/api/health"
for i in $(seq 1 40); do
  BODY="$(curl -sf "$URL" 2>/dev/null || true)"
  echo "  [$i] ${BODY:-无响应}"
  if echo "$BODY" | grep -qE '"model_loaded":[[:space:]]*true'; then
    echo "==> 部署完成!浏览器访问: http://${HOST}:${SERVICE_PORT}"
    echo "    提示:可在设备上运行 'docker image prune -f' 回收旧镜像空间(勿删 data/)。"
    exit 0
  fi
  sleep 3
done
echo "!! 健康检查超时。请在设备上查看日志: ssh ${SSH_USER}@${HOST} 'docker logs --tail 80 optictext-ocr'"
exit 1
