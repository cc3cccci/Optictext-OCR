# 部署交接文档(供本机可 SSH 的 Agent 执行)

把本文件整段交给内网电脑上的 Agent。Agent 只需按「执行步骤」和「验收清单」顺序跑命令,不要改 Dockerfile apt 层、不要 `docker compose build --pull`、不要把 SSH 密码写入任何文件或 git。

## 任务

将分支 `cursor/system-ux-optimization-139c` 部署到内网 Armbian 设备,替换当前 OCR 服务,并完成验收。设备上构建镜像大约 3–10 分钟;首次启动还要等模型 warmup(健康检查 `start_period` 90 秒)。

本分支包含 PR #1(离线化/历史持久化/PDF)以及后续系统与体验优化(异步识别、线程限制、图文互链、手机拍照、可检索 PDF)。

## 目标环境(此前已预检,一般不用再排查)

- 设备:`192.168.50.35`,Armbian,aarch64,内存约 3.2G,磁盘空闲约 6.5G
- SSH:`root@192.168.50.35:22`
- **密码/密钥由用户提供,只放环境变量,严禁写入仓库、文档、日志、截图**
- Docker + docker compose v2 已就绪
- 对外端口:`9999`(容器内 8000)。若被旧容器占用,属正常升级;`deploy.py` 会 `--remove-orphans` 替换
- 设备 **Docker Hub 通常不可达**:必须使用本地已缓存的 `node:20-slim`、`python:3.10-slim`;构建时**禁止** `--pull`
- npm / pip 已在 Dockerfile 配好国内源(npmmirror / 清华 PyPI)
- 远程目录:`/root/optictext-ocr`
- 数据卷:`/root/optictext-ocr/data`(识别历史 + 原件)。**不要删除该目录**

## 执行机器前提(跑本文档命令的那台电脑)

- 与设备同一内网,能 SSH 到 `192.168.50.35`
- git、Python 3.8+、curl
- `pip install paramiko scp requests pillow pymupdf`

## 硬性约束

1. 密码只通过 `DEPLOY_PASSWORD` 传入;或用 `DEPLOY_SSH_KEY` 指向已有私钥。不要 `echo` 进文件,不要写进 commit。
2. 不要修改 `Dockerfile` 里 `apt-get install libgl1 libglib2.0-0` 那一层(设备靠这层缓存离线构建)。
3. 不要使用 `docker compose build --pull` / `docker compose up --pull always`。
4. 不要 `rm -rf /root/optictext-ocr/data`。
5. 首次 SSH 若报 unknown host,加 `--insecure`(仅内网);不要把 AutoAdd 写进业务代码以外的地方。
6. 部署后先等 `/api/health` 的 `model_loaded` 为 true,再上传图片(warmup 未完成时识别会排队或失败)。

## 执行步骤

```bash
# 1. 获取本分支代码
git clone -b cursor/system-ux-optimization-139c https://github.com/cc3cccci/Optictext-OCR.git
cd Optictext-OCR
# 若已有仓库:
# git fetch origin cursor/system-ux-optimization-139c
# git checkout cursor/system-ux-optimization-139c
# git pull origin cursor/system-ux-optimization-139c

# 2. 认证(向用户索取,二选一)
export DEPLOY_PASSWORD='<用户提供的SSH密码>'
# 或: export DEPLOY_SSH_KEY="$HOME/.ssh/id_rsa"

# 3. 预检。预期项为 [通过]。
#    「端口 9999 被旧版容器占用,部署时将自动替换」是正常现象。
#    若报主机指纹未知:在下面两条命令后加 --insecure
python deploy.py --check

# 4. 上传代码 → 设备上构建镜像 → 替换容器
python deploy.py
```

成功标志:终端出现 `部署完成!浏览器访问: http://192.168.50.35:9999`。

构建日志里若出现从 Docker Hub pull `node:20-slim` / `python:3.10-slim` 失败,说明误用了 `--pull` 或本地缓存丢失,按文末「故障排查」处理,不要反复重试空拉。

## 部署后等待就绪

模型 warmup 可能要几十秒。在验收前循环等到健康检查成功:

```bash
for i in $(seq 1 40); do
  BODY=$(curl -sf http://192.168.50.35:9999/api/health || true)
  echo "$BODY"
  echo "$BODY" | grep -q '"model_loaded": true' && echo "服务就绪" && break
  sleep 3
done
```

预期 JSON 类似:

```json
{"status":"ok","model_loaded":true,"threads":2}
```

`threads` 应为 `2`。若 `model_loaded` 一直 false,拉容器日志,不要继续上传。

## 验收清单(按顺序,全部在执行机上跑)

当前识别是**异步**的:`POST /api/ocr` 会马上返回 `id` 和 `status: PROCESSING`,必须轮询 `GET /api/scans/<id>` 直到 `READY` 或 `ERROR`。不要用「POST 返回里立刻有识别全文」当成功标准。

```bash
HOST=http://192.168.50.35:9999

# 1. 健康检查
curl -s "$HOST/api/health"
# 预期: model_loaded true, threads 2

# 2. 前端离线:页面 200,有 OpticText,无外网 CDN
curl -sI "$HOST/" | head -n 1
curl -s "$HOST/" | grep -c "OpticText"
# 下一行应无匹配(exit 1 也算正确,表示没引用外网)
curl -s "$HOST/" | grep -E "cdn.tailwindcss|esm.sh|fonts.googleapis" && echo "发现外网引用(失败)" || echo "无外网引用(正确)"

# 3. 异步上传 + 轮询(1x1 透明 PNG,识别文本为空算正常,关键是能 READY)
echo 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' | base64 -d > /tmp/probe.png
RESP=$(curl -s -F "file=@/tmp/probe.png;type=image/png" "$HOST/api/ocr")
echo "$RESP"
ID=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['id'])" "$RESP")
echo "scan id=$ID"
for i in $(seq 1 40); do
  S=$(curl -s "$HOST/api/scans/$ID")
  echo "$S" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status'), d.get('error_message',''))"
  echo "$S" | grep -q '"status": "READY"' && echo "识别完成" && break
  echo "$S" | grep -q '"status": "ERROR"' && echo "识别失败" && echo "$S" && exit 1
  sleep 2
done
# 列表不应包含 extracted_text 全文
curl -s "$HOST/api/scans" | python3 -c "import json,sys; a=json.load(sys.stdin); print('list_ok', isinstance(a,list), 'no_full_text', all('extracted_text' not in x for x in a))"
# 清理探针记录
curl -s -X DELETE "$HOST/api/scans/$ID"

# 4. 超大文件应 413,非法类型应 400
python3 - <<'PY'
import requests
r = requests.post("http://192.168.50.35:9999/api/ocr", files={"file": ("a.txt", b"hello", "text/plain")}, timeout=15)
print("illegal", r.status_code)  # 预期 400
r = requests.post("http://192.168.50.35:9999/api/ocr", files={"file": ("big.png", b"0"*(21*1024*1024), "image/png")}, timeout=60)
print("too_large", r.status_code)  # 预期 413
PY

# 5. 持久化:重启后历史仍在(先留一条再重启)
RESP=$(curl -s -F "file=@/tmp/probe.png;type=image/png" "$HOST/api/ocr")
KEEP_ID=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['id'])" "$RESP")
for i in $(seq 1 40); do
  curl -sf "$HOST/api/scans/$KEEP_ID" | grep -q '"status": "READY"' && break
  sleep 2
done
ssh root@192.168.50.35 'docker restart optictext-ocr'
# 重启后同样要等 warmup
for i in $(seq 1 40); do
  curl -sf "$HOST/api/health" | grep -q '"model_loaded": true' && break
  sleep 3
done
curl -s "$HOST/api/scans" | grep -q "$KEEP_ID" && echo "重启后记录仍在(正确)" || echo "记录丢失(失败)"
curl -s -X DELETE "$HOST/api/scans/$KEEP_ID"
```

完整冒烟(中文图、PDF 文本层、排版切换、可检索 PDF、重试、删除;会自己清理测试数据):

```bash
pip install requests pillow pymupdf
python backend/test_api.py http://192.168.50.35:9999
# 预期:结果:32 项通过,0 项失败
```

建议再用浏览器打开 `http://192.168.50.35:9999` 看一眼:

- 上传一张带中文的照片,信息栏出现队列/耗时,识别框可点、点框能对上右侧文本
- 手机访问同一地址,顶栏有「拍照」
- 失败记录刷新后还在,可点「重新识别」
- 导出 TXT 与「导出 PDF」(可检索 PDF,不是以前的 jsPDF)

## 部署后清理(可选,勿删 data)

```bash
ssh root@192.168.50.35 'docker image prune -f'
```

## 故障排查

- **SSH 主机指纹未知**:`python deploy.py --check --insecure` 再 `python deploy.py --insecure`。
- **预检失败「端口被其他非 docker 进程占用」**:`ssh root@192.168.50.35 "ss -tlnp | grep :9999"` 处理占用,或改 `docker-compose.yml` 端口。
- **构建时基础镜像拉取失败**:确认没有 `--pull`;`ssh root@192.168.50.35 "docker images | grep -E 'node|python'"` 应能看到 `node:20-slim` 与 `python:3.10-slim`。
- **npm install 失败**:改 `Dockerfile` 里 `registry.npmmirror.com` 为设备能访问的源后重跑 `python deploy.py`(不要改 apt 层)。
- **pip install 失败**:把清华源换成 `https://pypi.org/simple` 后重跑。
- **health 一直 model_loaded false**:`ssh root@192.168.50.35 'docker logs --tail 80 optictext-ocr'`。
- **POST /api/ocr 一直转圈/浏览器超时**:这版已改为立即返回,若仍长时间无响应,看容器是否 OOM:`ssh root@192.168.50.35 'docker stats --no-stream optictext-ocr'`。compose 内存上限 2G。
- **磁盘不足**:`ssh root@192.168.50.35 'docker system prune -f'`(仍不要删 `data/`)。
- **旧容器名占端口**:当前容器名固定为 `optictext-ocr`;`docker compose up -d --build --remove-orphans` 会换掉旧服务名。

## 回滚

旧镜像可能仍叫 `optictext-ocr-optictext-ocr:latest`(更早一次部署),新镜像是 `optictext-ocr:latest`。回滚不要动 `data/`:

```bash
ssh root@192.168.50.35
cd /root/optictext-ocr
docker compose down
# 若旧镜像还在:
docker run -d --name optictext-ocr-rollback --restart always -p 9999:8000 optictext-ocr-optictext-ocr:latest
# 若要从本仓库上一个已构建镜像回滚,改用:
# docker images | grep optictext
```

新版数据在 `/root/optictext-ocr/data/`(含 `scans.db`、`images/`、`originals/`)。旧版容器读不到这套库也无妨;再升级时数据还在。

## 本轮相对上一版多出来的行为(验收时不要当成回归)

- `POST /api/ocr` 立即返回,`status` 先是 `PROCESSING`,需轮询详情
- `GET /api/scans` 没有 `extracted_text` 全文,只有 `text_preview`
- `GET /api/health` 多了 `threads`
- 新增 `POST /api/scans/{id}/retry`、`POST /api/scans/{id}/reflow`、`GET /api/scans/{id}/export.pdf`
- 容器限制 2G 内存、约 3 CPU、推理线程 2;弱设备上单张识别仍可能要数秒到数十秒,这是预期
