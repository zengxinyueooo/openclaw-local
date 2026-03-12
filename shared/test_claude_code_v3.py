#!/usr/bin/env python3
"""测试 Claude Code 自动交互 v3 - 改进输入方式"""

import subprocess
import os
import sys
import time
import pty
import select
import fcntl
import termios
import struct

def set_terminal_size(fd, rows=30, cols=100):
    """设置终端大小"""
    size = struct.pack('HHHH', rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, size)

def main():
    print("🍊 启动 Claude Code...")
    
    master_fd, slave_fd = pty.openpty()
    set_terminal_size(slave_fd)
    
    env = os.environ.copy()
    env['TERM'] = 'xterm-256color'
    
    process = subprocess.Popen(
        ["mc", "--code"],
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        cwd=str(os.path.expanduser("~/.openclaw/workspace-coder")),
        env=env,
        preexec_fn=os.setsid
    )
    
    os.close(slave_fd)
    
    # 设置非阻塞
    fl = fcntl.fcntl(master_fd, fcntl.F_GETFL)
    fcntl.fcntl(master_fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)
    
    def send_input(text, delay=0.5):
        """发送输入"""
        print(f"📤 发送: {text[:50]}...")
        os.write(master_fd, text.encode('utf-8'))
        os.write(master_fd, b'\r\n')  # 回车换行
        time.sleep(delay)
    
    def read_output(timeout=2):
        """读取输出"""
        output = []
        start = time.time()
        while time.time() - start < timeout:
            try:
                ready, _, _ = select.select([master_fd], [], [], 0.1)
                if ready:
                    data = os.read(master_fd, 4096).decode('utf-8', errors='ignore')
                    if data:
                        output.append(data)
                        print(data, end='', flush=True)
            except:
                pass
        return ''.join(output)
    
    # 1. 等待启动
    print("⏳ 等待启动...")
    time.sleep(5)
    read_output(3)
    
    # 2. 同意协议
    print("\n📤 发送同意...")
    send_input("y", delay=3)
    read_output(3)
    
    # 3. 等待就绪
    print("\n⏳ 等待就绪...")
    for i in range(30):
        out = read_output(1)
        if '❯' in out or 'claude' in out.lower():
            print(f"✅ 就绪 (第{i+1}秒)")
            break
    else:
        print("⚠️ 超时，继续...")
    
    # 4. 发送任务（单行）
    print("\n📤 发送任务...")
    task = '请创建一个index.html文件，内容是"<h1>Hello World</h1>"，完成后说"完成"'
    send_input(task, delay=2)
    
    # 5. 等待执行
    print("\n⏳ 等待执行...")
    all_output = []
    for i in range(60):  # 等待60秒
        out = read_output(1)
        all_output.append(out)
        
        # 检测完成
        combined = ''.join(all_output)
        if '完成' in combined or 'done' in combined.lower():
            print(f"\n✅ 检测到完成！({i+1}秒)")
            break
        
        # 检测文件创建提示
        if 'index.html' in combined and ('create' in combined.lower() or '创建' in combined):
            print(f"\n📄 检测到创建文件！({i+1}秒)")
    
    # 6. 保存输出
    full_output = ''.join(all_output)
    with open('/tmp/claude_v3.log', 'w') as f:
        f.write(full_output)
    print(f"\n📝 输出已保存")
    
    # 7. 关闭
    print("\n🛑 关闭...")
    process.terminate()
    try:
        process.wait(timeout=5)
    except:
        process.kill()
    os.close(master_fd)
    
    # 8. 检查结果
    todo_file = os.path.expanduser("~/.openclaw/workspace-coder/index.html")
    if os.path.exists(todo_file):
        print(f"✅ 成功！文件: {todo_file}")
        with open(todo_file) as f:
            print("📄 内容:", f.read()[:200])
        return True
    else:
        print("❌ 文件未创建")
        # 列出目录内容
        files = os.listdir(os.path.expanduser("~/.openclaw/workspace-coder"))
        print(f"📁 目录文件: {files}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
