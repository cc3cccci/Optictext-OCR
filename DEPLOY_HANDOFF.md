# 部署交接文档(供内网侧 Agent 执行)

## 任务

将分支 `cursor/ocr-ux-optimization-383e` 部署到内网 Armbian 设备,替换正在运行的旧版 OCR 服务,并完成验收。整个过程预计 10-20 分钟(设备上构建镜像约 3-10 分钟)。

## 目标环境(已远程预检确认,无需重复排查)

- 设备:`192.168.50.35`,Armbian OS 25.11 noble,aarch64,内存 3.2G,磁盘空闲 6.5G
- SSH:`root@192.168.50.35:22`,**密码由用户提供,通过环境变量传入,严禁写入任何文件或仓库**
- Docker 29.1.3 + docker compose v2.40 已就绪
- 服务端口:`9999`。当前被旧版容器 `optictext-ocr-optictext-ocr-1` 占用——这是正常的升级替换场景,部署命令已内置 `--remove-orphans` 自动替换,无需手动停止
- 设备 **Docker Hub 不可达**(正常,不需处理):基础镜像 `node:20-slim`、`python:3.10-slim` 已在设备本地缓存,构建时**不要**使用 `--pull`
- npm/pip 已在 Dockerfile 中配置国内镜像源(npmmirror / 清华 PyPI)

## 执行机器前提(运行本文档命令的电脑)

- 与设备同一内网,可 SSH 到 `192.168.50.35`
- 已安装 git、Python 3.8+
- `pip install paramiko scp`

## 执行步骤

```bash
# 1. 获取代码(二选一)
git clone -b cursor/ocr-ux-optimization-383e https://github.com/cc3cccci/Optictext-OCR.git
cd Optictext-OCR
# 或在已有仓库中:
# git fetch origin cursor/ocr-ux-optimization-383e && git checkout cursor/ocr-ux-optimization-383e

# 2. 设置 SSH 密码(向用户索取,勿写入文件)
export DEPLOY_PASSWORD='<用户提供的SSH密码>'

# 3. 部署条件预检(预期全部 [通过];端口 9999 显示"被旧版容器占用,部署时将自动替换"属正常)
python deploy.py --check

# 4. 部署(上传代码 -> 设备上构建镜像 -> 替换旧容器)
python deploy.py
```

成功标志:输出 `部署完成!浏览器访问: http://192.168.50.35:9999`。

## 验收清单(按顺序执行)

```bash
# 1. 健康检查:预期 {"status":"ok","model_loaded":true}
curl -s http://192.168.50.35:9999/api/health

# 2. 前端页面:预期 HTTP 200,且内容包含 OpticText、不含任何外网 CDN 域名
curl -s http://192.168.50.35:9999/ | grep -c "OpticText"
curl -s http://192.168.50.35:9999/ | grep -cE "cdn.tailwindcss|esm.sh|googleapis" || echo "无外网引用(正确)"

# 3. 上传识别链路(1x1 测试图,预期返回 200 与 JSON 记录,text 为空属正常)
echo 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' | base64 -d > /tmp/probe.png
curl -s -F "file=@/tmp/probe.png;type=image/png" http://192.168.50.35:9999/api/ocr
# 记下返回 JSON 中的 "id",验收后删除该测试记录:
# curl -s -X DELETE http://192.168.50.35:9999/api/scans/<id>

# 4. 历史接口:预期返回 JSON 数组
curl -s http://192.168.50.35:9999/api/scans

# 5. 持久化验证:重启容器后步骤 4 的记录应仍然存在
ssh root@192.168.50.35 'docker restart optictext-ocr' && sleep 10
curl -s http://192.168.50.35:9999/api/scans
```

可选的完整验收(覆盖中文识别、PDF、编辑、删除等 19 项用例,会自动清理测试数据):

```bash
pip install requests pillow pymupdf
python backend/test_api.py http://192.168.50.35:9999
# 预期输出:结果:19 项通过,0 项失败
```

建议再用浏览器打开 `http://192.168.50.35:9999` 人工确认:上传一张带中文的真实图片,检查识别结果、原图上的识别框、编辑自动保存、历史搜索、导出 TXT/PDF(PDF 中文不乱码)。

## 部署后清理(可选)

```bash
# 回收旧版镜像与构建缓存占用的磁盘空间
ssh root@192.168.50.35 'docker image prune -f'
```

## 故障排查

- **预检失败"端口被其他进程占用"**(非 docker 进程):`ss -tlnp | grep :9999` 查明来源后处理,或修改 `docker-compose.yml` 换端口。
- **构建时基础镜像拉取失败**:确认执行的命令没有带 `--pull`;`docker images | grep -E "node|python"` 确认 `node:20-slim` 与 `python:3.10-slim` 存在。
- **npm install 失败**:设备到 npmmirror 不通,修改 `Dockerfile` 中 registry 为其他可达源后重试。
- **pip install 失败**:清华源临时不可用,把 `Dockerfile` 中 `-i https://pypi.tuna.tsinghua.edu.cn/simple` 改为 `-i https://pypi.org/simple`(设备实测官方 PyPI 可达)。
- **health 返回 model_loaded:false**:`ssh root@192.168.50.35 'docker logs --tail 50 optictext-ocr'` 查看 OCR 引擎初始化错误。
- **磁盘不足**:`ssh root@192.168.50.35 'docker system prune -f'` 后重试。

## 回滚方案

旧版镜像 `optictext-ocr-optictext-ocr:latest` 仍保留在设备上(新镜像名为 `optictext-ocr:latest`,互不覆盖)。需要回滚时:

```bash
ssh root@192.168.50.35
cd /root/optictext-ocr && docker compose down
docker run -d --name optictext-ocr-rollback --restart always \
  -p 9999:8000 optictext-ocr-optictext-ocr:latest
```

说明:新版数据目录 `/root/optictext-ocr/data/`(识别历史)旧版不会读取,回滚不受影响;再次升级时数据仍在。

## 变更摘要(供了解背景)

本次部署的分支包含:前端完全离线化(内网无外网也能正常加载)、识别历史后端持久化(SQLite + 图片落盘,刷新/重启/换设备不丢)、PDF 识别支持、真实识别框、中文界面与中文 PDF 导出、上传体验优化、OCR 并发保护等。详见仓库 `README.md` 与 PR #1。
