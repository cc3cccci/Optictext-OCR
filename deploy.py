import paramiko
from scp import SCPClient
import os
import sys

# Configuration
HOST = "192.168.31.21"
USER = "root"
PASS = "1234"
REMOTE_PATH = "/root/optictext-ocr"

def create_ssh_client(server, port, user, password):
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(server, port, user, password, look_for_keys=False, allow_agent=False)
    return client

def progress(filename, size, sent):
    sys.stdout.write(f"\rUploading {filename}: {float(sent)/float(size)*100:.2f}%")

def deploy():
    print(f"Connecting to {HOST}...")
    try:
        ssh = create_ssh_client(HOST, 22, USER, PASS)
        scp = SCPClient(ssh.get_transport(), progress=progress)
    except Exception as e:
        print(f"Connection failed: {e}")
        return

    print(f"\nConnected. Creating remote directory {REMOTE_PATH}...")
    ssh.exec_command(f"mkdir -p {REMOTE_PATH}")
    ssh.exec_command(f"mkdir -p {REMOTE_PATH}/backend")
    ssh.exec_command(f"mkdir -p {REMOTE_PATH}/components")
    
    # Define files to transfer
    # We transfer: Dockerfile, docker-compose.yml, package.json, vite.config.ts, tsconfig.json, index.html, index.tsx, App.tsx, types.ts, constants.ts
    # Directories: backend, components
    
    files_to_transfer = [
        "Dockerfile", "docker-compose.yml", "package.json", "vite.config.ts", 
        "tsconfig.json", "index.html", "index.tsx", "App.tsx", "types.ts", "constants.ts", ".env.local"
    ]
    
    print("Transferring root files...")
    for f in files_to_transfer:
        if os.path.exists(f):
            scp.put(f, remote_path=REMOTE_PATH)
        else:
            print(f"Skipping {f} (not found)")

    print("\nTransferring backend...")
    # Cleanest way for directory is recursive put, but scp.put(recursive=True) can be tricky with excludes.
    # We'll just explicitly transfer the backend folder contents we need.
    backend_files = [f for f in os.listdir("backend") if f.endswith(".py") or f == "requirements.txt"]
    for f in backend_files:
        scp.put(os.path.join("backend", f), remote_path=f"{REMOTE_PATH}/backend")

    print("\nTransferring components...")
    if os.path.exists("components"):
        component_files = os.listdir("components")
        for f in component_files:
             scp.put(os.path.join("components", f), remote_path=f"{REMOTE_PATH}/components")
    
    scp.close()

    # Diagnose Docker Registry Issue
    print("\nChecking /etc/docker/daemon.json...")
    stdin, stdout, stderr = ssh.exec_command("cat /etc/docker/daemon.json")
    daemon_json = stdout.read().decode().strip()
    print(f"Current daemon.json: {daemon_json}")
    
    print("\nFiles transferred. Building and starting Docker containers...")
    stdin, stdout, stderr = ssh.exec_command(f"cd {REMOTE_PATH} && docker compose up --build -d")
    
    # Stream output
    while True:
        line = stdout.readline()
        if not line:
            break
        print(line.strip())
        
    err = stderr.read().decode()
    if err:
        print(f"STDERR: {err}")
        
    ssh.close()
    print("\nDeployment command finished.")

if __name__ == "__main__":
    deploy()
