"""OpticText OCR 一键部署脚本(在内网电脑上运行,目标为 Armbian 设备)。

用法:
    python deploy.py                 上传代码并在设备上构建、启动(替换旧容器)
    python deploy.py --check         仅检查设备部署条件,不部署
    python deploy.py --host 192.168.50.35 --port 9999

认证:优先使用环境变量 DEPLOY_SSH_KEY(私钥路径)+ 可选 DEPLOY_PASSWORD。
未提供密钥时交互输入密码。默认校验 known_hosts;旧设备可用 --insecure 跳过。

依赖:pip install paramiko scp
"""
import argparse
import getpass
import os
import sys
from typing import Optional

import paramiko
from scp import SCPClient

DEFAULT_HOST = "192.168.50.35"
DEFAULT_SSH_PORT = 22
DEFAULT_USER = "root"
DEFAULT_REMOTE_PATH = "/root/optictext-ocr"
SERVICE_PORT = 9999

# 需要上传的文件与目录(相对仓库根目录)
ROOT_FILES = [
    "Dockerfile", "docker-compose.yml",
    "package.json", "package-lock.json",
    "vite.config.ts", "tsconfig.json",
    "tailwind.config.js", "postcss.config.js",
    "index.html", "index.tsx", "index.css",
    "App.tsx", "types.ts", "constants.ts", "api.ts", "utils.ts",
]
DIRS = ["backend", "components", "public"]
EXCLUDE_NAMES = {"__pycache__", "node_modules", ".git", "data", "dist"}


def create_ssh_client(
    host: str,
    port: int,
    user: str,
    password: Optional[str],
    key_filename: Optional[str],
    insecure: bool,
) -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    if insecure:
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    else:
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
    connect_kw = dict(
        hostname=host,
        port=port,
        username=user,
        timeout=15,
        allow_agent=not bool(key_filename),
        look_for_keys=not bool(key_filename),
    )
    if key_filename:
        connect_kw["key_filename"] = key_filename
    if password:
        connect_kw["password"] = password
    client.connect(**connect_kw)
    return client


def run_remote(ssh: paramiko.SSHClient, command: str) -> str:
    _stdin, stdout, _stderr = ssh.exec_command(command)
    return stdout.read().decode(errors="replace").strip()


# ---------------- 部署条件预检 ----------------

def preflight_check(ssh: paramiko.SSHClient) -> bool:
    """检查设备部署条件,返回是否全部通过(警告不阻塞)。"""
    ok = True
    print("\n===== 部署条件预检 =====\n")

    arch = run_remote(ssh, "uname -m")
    if arch == "aarch64":
        print(f"[通过] CPU 架构: {arch}")
    else:
        print(f"[失败] CPU 架构: {arch}(需要 aarch64,onnxruntime 无 32 位 ARM 安装包)")
        ok = False

    mem_kb = run_remote(ssh, "grep MemAvailable /proc/meminfo | awk '{print $2}'")
    try:
        mem_gb = int(mem_kb) / 1024 / 1024
        status = "通过" if mem_gb >= 1.0 else "警告"
        print(f"[{status}] 可用内存: {mem_gb:.1f} GB(建议 >= 1GB)")
    except ValueError:
        print("[警告] 无法读取内存信息")

    disk = run_remote(ssh, "df -BG --output=avail / | tail -1 | tr -dc '0-9'")
    try:
        disk_gb = int(disk)
        status = "通过" if disk_gb >= 4 else "警告"
        print(f"[{status}] 根分区可用空间: {disk_gb} GB(建议 >= 4GB)")
    except ValueError:
        print("[警告] 无法读取磁盘信息")

    docker_ver = run_remote(ssh, "docker --version 2>/dev/null")
    if docker_ver:
        print(f"[通过] {docker_ver}")
    else:
        print("[失败] 未安装 Docker")
        ok = False

    compose_ver = run_remote(ssh, "docker compose version 2>/dev/null")
    if compose_ver:
        print(f"[通过] {compose_ver}")
    else:
        print("[失败] 未安装 docker compose v2 插件")
        ok = False

    base_images = run_remote(
        ssh,
        "docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^(node:20-slim|python:3.10-slim)$' | sort | uniq",
    )
    hub = run_remote(
        ssh,
        "timeout 6 curl -sIo /dev/null -w '%{http_code}' https://registry-1.docker.io/v2/ 2>/dev/null || echo unreachable",
    )
    hub_ok = hub not in ("", "unreachable", "000")
    if hub_ok:
        print(f"[通过] Docker Hub 可达(HTTP {hub})")
    elif "node:20-slim" in base_images and "python:3.10-slim" in base_images:
        print("[通过] Docker Hub 不可达,但基础镜像已在本地缓存,可离线构建")
    else:
        print("[失败] Docker Hub 不可达且缺少基础镜像 node:20-slim / python:3.10-slim")
        ok = False

    pypi = run_remote(
        ssh,
        "timeout 6 curl -sIo /dev/null -w '%{http_code}' https://pypi.tuna.tsinghua.edu.cn/simple/ 2>/dev/null || echo unreachable",
    )
    if pypi not in ("", "unreachable", "000"):
        print(f"[通过] 清华 PyPI 镜像可达(HTTP {pypi})")
    else:
        print("[警告] 清华 PyPI 镜像不可达,pip 安装依赖可能失败(可修改 Dockerfile 换源)")

    npm = run_remote(
        ssh,
        "timeout 6 curl -sIo /dev/null -w '%{http_code}' https://registry.npmmirror.com/ 2>/dev/null || echo unreachable",
    )
    if npm not in ("", "unreachable", "000"):
        print(f"[通过] npmmirror 镜像可达(HTTP {npm})")
    else:
        print("[警告] npmmirror 不可达,前端依赖安装可能失败(可修改 Dockerfile 换源)")

    port_owner = run_remote(
        ssh,
        f"ss -tlnp 2>/dev/null | grep ':{SERVICE_PORT} ' | head -1",
    )
    if not port_owner:
        print(f"[通过] 端口 {SERVICE_PORT} 空闲")
    elif "docker" in port_owner:
        print(f"[通过] 端口 {SERVICE_PORT} 被旧版容器占用,部署时将自动替换")
    else:
        print(f"[失败] 端口 {SERVICE_PORT} 被其他进程占用:{port_owner}")
        ok = False

    print("\n===== 预检结束 =====\n")
    return ok


# ---------------- 文件上传 ----------------

def upload_project(ssh: paramiko.SSHClient, remote_path: str) -> None:
    sftp = ssh.open_sftp()

    def ensure_remote_dir(path: str) -> None:
        try:
            sftp.stat(path)
        except FileNotFoundError:
            parent = os.path.dirname(path.rstrip("/"))
            if parent and parent != path:
                ensure_remote_dir(parent)
            sftp.mkdir(path)

    def put_file(local: str, remote: str) -> None:
        sftp.put(local, remote)
        print(f"  上传 {local}")

    def put_dir(local_dir: str, remote_dir: str) -> None:
        ensure_remote_dir(remote_dir)
        for name in sorted(os.listdir(local_dir)):
            if name in EXCLUDE_NAMES or name.endswith(".pyc"):
                continue
            local = os.path.join(local_dir, name)
            remote = f"{remote_dir}/{name}"
            if os.path.isdir(local):
                put_dir(local, remote)
            else:
                put_file(local, remote)

    ensure_remote_dir(remote_path)
    print("上传项目文件:")
    for f in ROOT_FILES:
        if os.path.exists(f):
            put_file(f, f"{remote_path}/{f}")
        else:
            print(f"  跳过 {f}(不存在)")
    for d in DIRS:
        if os.path.isdir(d):
            put_dir(d, f"{remote_path}/{d}")
    sftp.close()


# ---------------- 构建与启动 ----------------

def build_and_start(ssh: paramiko.SSHClient, remote_path: str) -> int:
    # --remove-orphans:替换旧版 compose 项目中服务名不同的遗留容器,避免 9999 端口冲突
    command = (
        f"cd {remote_path} && "
        f"docker compose up -d --build --remove-orphans 2>&1"
    )
    print("\n开始在设备上构建并启动(弱设备上首次构建可能需要几分钟)…\n")
    _stdin, stdout, _stderr = ssh.exec_command(command, get_pty=True)
    for line in iter(stdout.readline, ""):
        print(line.rstrip())
    return stdout.channel.recv_exit_status()


def main() -> None:
    parser = argparse.ArgumentParser(description="OpticText OCR 部署脚本")
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"设备地址(默认 {DEFAULT_HOST})")
    parser.add_argument("--ssh-port", type=int, default=DEFAULT_SSH_PORT, help="SSH 端口(默认 22)")
    parser.add_argument("--user", default=DEFAULT_USER, help=f"SSH 用户(默认 {DEFAULT_USER})")
    parser.add_argument("--remote-path", default=DEFAULT_REMOTE_PATH, help="设备上的部署目录")
    parser.add_argument("--check", action="store_true", help="仅执行部署条件预检")
    parser.add_argument("--skip-check", action="store_true", help="跳过预检直接部署")
    parser.add_argument("--insecure", action="store_true", help="不校验 SSH 主机指纹(仅内网旧设备)")
    parser.add_argument("--ssh-key", default=os.environ.get("DEPLOY_SSH_KEY"), help="SSH 私钥路径")
    args = parser.parse_args()

    password = os.environ.get("DEPLOY_PASSWORD")
    if not args.ssh_key and not password:
        password = getpass.getpass(f"{args.user}@{args.host} 的 SSH 密码: ")

    print(f"连接 {args.user}@{args.host}:{args.ssh_port} …")
    try:
        ssh = create_ssh_client(
            args.host, args.ssh_port, args.user, password, args.ssh_key, args.insecure,
        )
    except Exception as e:
        print(f"连接失败: {e}")
        if "Unknown server" in str(e) or "not found in known_hosts" in str(e).lower():
            print("提示:首次连接可加 --insecure,或先把设备公钥写入 ~/.ssh/known_hosts")
        sys.exit(1)

    try:
        if args.check:
            ok = preflight_check(ssh)
            sys.exit(0 if ok else 2)

        if not args.skip_check:
            if not preflight_check(ssh):
                print("预检未通过,已中止部署(可用 --skip-check 强制继续)。")
                sys.exit(2)

        upload_project(ssh, args.remote_path)
        code = build_and_start(ssh, args.remote_path)
        if code == 0:
            print(f"\n部署完成!浏览器访问: http://{args.host}:{SERVICE_PORT}")
            print("提示:可在设备上运行 `docker image prune -f` 回收旧镜像占用的空间。")
        else:
            print(f"\n部署命令退出码 {code},请检查上方构建日志。")
            sys.exit(code)
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
