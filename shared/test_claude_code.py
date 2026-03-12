#!/usr/bin/env python3
"""测试 Claude Code 自动交互"""

import subprocess
import os
import sys
import time
import pty
import select
import fcntl
import threading
import queue

# 启动 mc --code
print("🍊 启动 Claude Code...")

master_fd, slave_fd = pty.openpty()

process = subprocess.Popen(
    ["mc", "--code"],
    stdin=slave_fd,
    stdout=slave_fd,
    stderr=slave_fd,
    cwd=str(os.path.expanduser("~/.openclaw/workspace-coder")),
    preexec_fn=os.setsid
)

os.close(slave_fd)

# 设置非阻塞
fl = fcntl.fcntl(master_fd, fcntl.F_GETFL)
fcntl.fcntl(master_fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)

output_queue = queue.Queue()

def read_output():
    """读取输出"""
    while process.poll() is None:
        try:
            ready, _, _ = select.select([master_fd], [], [], 0.1)
            if ready:
                data = os.read(master_fd, 1024).decode('utf-8', errors='ignore')
                if data:
                    output_queue.put(data)
                    print(data, end='', flush=True)
        except:
            pass

# 启动读取线程
thread = threading.Thread(target=read_output)
thread.daemon = True
thread.start()

print("⏳ 等待 Claude Code 启动...")
time.sleep(5)

# 检查是否有协议提示
print("\n🤖 检查协议...")

# 尝试发送 y
time.sleep(2)
print("\n📤 发送同意...")
os.write(master_fd, b"y\n")

time.sleep(3)

# 发送任务
print("\n📤 发送任务...")
task = """请创建一个简单的HTML页面，显示"Hello World"。
只需要一个index.html文件。
完成后说"任务完成"。"""

os.write(master_fd, task.encode('utf-8') + b'\n')

print("\n⏳ 等待响应...")
time.sleep(30)  # 等待30秒

# 关闭
print("\n🛑 关闭会话...")
process.terminate()
try:
    process.wait(timeout=5)
except:
    process.kill()

os.close(master_fd)
print("\n✅ 测试结束")
