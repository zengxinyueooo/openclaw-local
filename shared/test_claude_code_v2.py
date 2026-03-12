#!/usr/bin/env python3
"""测试 Claude Code 自动交互 v2"""

import subprocess
import os
import sys
import time
import pty
import select
import fcntl
import threading
import queue
import re

def main():
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
    
    output_buffer = []
    
    def read_all_output(timeout=5):
        """读取所有可用输出"""
        start = time.time()
        while time.time() - start < timeout:
            try:
                ready, _, _ = select.select([master_fd], [], [], 0.5)
                if ready:
                    data = os.read(master_fd, 2048).decode('utf-8', errors='ignore')
                    if data:
                        output_buffer.append(data)
                        print(data, end='', flush=True)
            except:
                pass
    
    print("⏳ 等待 Claude Code 启动...")
    time.sleep(5)
    read_all_output(3)
    
    # 检查是否需要同意
    print("\n🤖 检查协议...")
    full_output = ''.join(output_buffer)
    
    if 'agree' in full_output.lower() or 'y/n' in full_output.lower():
        print("📤 发送同意...")
        os.write(master_fd, b"y\r\n")
        time.sleep(2)
        read_all_output(3)
    
    # 等待就绪（检测提示符）
    print("\n⏳ 等待就绪...")
    for _ in range(20):  # 最多等20秒
        read_all_output(1)
        full_output = ''.join(output_buffer)
        # 检测就绪标志
        if any(marker in full_output for marker in ['❯', '>>>', '╭─', '╰─', 'claude']):
            print("✅ Claude Code 已就绪！")
            break
    
    # 发送任务
    print("\n📤 发送任务...")
    task = """请创建一个简单的HTML页面，显示"Hello World"。只需要一个index.html文件。完成后说"任务完成"。"""
    
    for line in task.split('\n'):
        os.write(master_fd, line.encode('utf-8') + b'\n')
        time.sleep(0.2)
    os.write(master_fd, b'\n')
    
    print("\n⏳ 等待执行...")
    
    # 等待任务完成或超时
    start_time = time.time()
    while time.time() - start_time < 60:  # 最多等60秒
        read_all_output(2)
        full_output = ''.join(output_buffer)
        
        # 检测完成
        if '任务完成' in full_output or 'done' in full_output.lower():
            print("\n✅ 检测到任务完成！")
            break
        
        # 检测文件创建
        if 'index.html' in full_output and 'create' in full_output.lower():
            print("\n📄 检测到文件创建！")
    
    # 保存输出
    with open('/tmp/claude_output.txt', 'w') as f:
        f.write(full_output)
    print(f"\n📝 输出已保存到 /tmp/claude_output.txt")
    
    # 关闭
    print("\n🛑 关闭会话...")
    process.terminate()
    try:
        process.wait(timeout=5)
    except:
        process.kill()
    
    os.close(master_fd)
    print("\n✅ 测试结束")
    
    # 检查是否创建了文件
    todo_file = os.path.expanduser("~/.openclaw/workspace-coder/index.html")
    if os.path.exists(todo_file):
        print(f"✅ 文件已创建: {todo_file}")
        with open(todo_file) as f:
            print("\n📄 文件内容预览:")
            print(f.read()[:500])
    else:
        print("❌ 文件未创建")

if __name__ == "__main__":
    import signal
    
    def timeout_handler(signum, frame):
        print("\n⏰ 超时退出")
        sys.exit(1)
    
    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(90)  # 90秒超时
    
    try:
        main()
    except KeyboardInterrupt:
        print("\n👋 用户中断")
    finally:
        signal.alarm(0)
