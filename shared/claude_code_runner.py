#!/usr/bin/env python3
"""
Claude Code 自动化调用工具
用于 Coding Agent 自动启动 Claude Code 并执行任务
"""

import subprocess
import sys
import os
import time
import pty
import select
import fcntl
import struct
import termios
from pathlib import Path

# 配置
CLAUDE_CODE_CMD = ["mc", "--code"]
TIMEOUT = 300  # 5分钟超时


def check_mc_installed():
    """检查 mc 命令是否可用"""
    try:
        subprocess.run(["mc", "--version"], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def run_claude_code_interactive(task_description: str, cwd: str = None):
    """
    在交互式终端中启动 Claude Code
    使用 os.execvp 替换当前进程，保留终端交互能力
    
    Args:
        task_description: 任务描述
        cwd: 工作目录
    
    Returns:
        不会返回，当前进程会被替换
    """
    # 检查 mc 是否安装
    if not check_mc_installed():
        print("❌ mc 命令未找到，请先安装 CatPaw CLI")
        print("   安装命令: brew install catpaw 或 npm install -g catpaw")
        sys.exit(1)
    
    print(f"🍊 小橙启动 Claude Code...")
    print(f"📁 工作目录: {cwd or os.getcwd()}")
    print(f"📝 任务: {task_description[:80]}...")
    print("\n" + "="*50)
    print("⚠️  请按以下步骤操作：")
    print("   1. 看到协议提示后输入: y 然后回车")
    print("   2. 等待 Claude Code 就绪")
    print("   3. 粘贴以下任务描述：")
    print("="*50)
    print(f"\n{task_description}\n")
    print("="*50)
    print("🚀 正在启动 Claude Code...\n")
    
    # 切换工作目录
    if cwd:
        os.chdir(cwd)
    
    # 替换当前进程为 mc --code
    # 这样用户可以直接在终端与 Claude Code 交互
    os.execvp("mc", ["mc", "--code"])


def run_claude_code_auto(task_description: str, cwd: str = None, timeout: int = TIMEOUT):
    """
    自动启动 Claude Code 并执行任务（后台模式）
    
    Args:
        task_description: 任务描述，会作为初始 prompt 发送给 Claude Code
        cwd: 工作目录
        timeout: 超时时间（秒）
    
    Returns:
        dict: 包含 stdout, stderr, returncode 的结果
    """
    # 检查 mc 是否安装
    if not check_mc_installed():
        print("❌ mc 命令未找到，请先安装 CatPaw CLI")
        return {
            "success": False,
            "returncode": -1,
            "output": "mc command not found",
            "error": "CatPaw CLI not installed"
        }
    
    print(f"🍊 小橙启动 Claude Code (自动模式)...")
    print(f"📁 工作目录: {cwd or os.getcwd()}")
    print(f"📝 任务: {task_description[:80]}...")
    
    # 创建伪终端
    master_fd, slave_fd = pty.openpty()
    
    # 设置终端大小
    cols, rows = 80, 24
    size = struct.pack('HHHH', rows, cols, 0, 0)
    fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, size)
    
    # 设置非阻塞模式
    fl = fcntl.fcntl(master_fd, fcntl.F_GETFL)
    fcntl.fcntl(master_fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)
    
    env = os.environ.copy()
    env['TERM'] = 'xterm-256color'
    
    try:
        # 启动 Claude Code 进程
        process = subprocess.Popen(
            CLAUDE_CODE_CMD,
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            cwd=cwd,
            env=env,
            preexec_fn=os.setsid
        )
        
        os.close(slave_fd)
        
        output_buffer = []
        agreement_sent = False
        task_sent = False
        ready_detected = False
        start_time = time.time()
        last_output_time = time.time()
        
        while process.poll() is None and (time.time() - start_time) < timeout:
            # 检查是否有输出
            ready, _, _ = select.select([master_fd], [], [], 0.1)
            
            if ready:
                try:
                    data = os.read(master_fd, 4096).decode('utf-8', errors='ignore')
                    if data:
                        output_buffer.append(data)
                        sys.stdout.write(data)
                        sys.stdout.flush()
                        last_output_time = time.time()
                        
                        # 检测是否需要同意协议
                        if not agreement_sent:
                            # 检测各种协议提示
                            agreement_patterns = [
                                "agree", "terms of service", "y/n", "yes/no",
                                "(y/n)", "[y/n]", "[Y/n]", "Do you agree",
                                "Please confirm", "Continue?", "Accept"
                            ]
                            if any(p.lower() in data.lower() for p in agreement_patterns):
                                print("\n🤖 检测到协议确认，自动同意...")
                                time.sleep(0.5)
                                os.write(master_fd, b"y\r")
                                time.sleep(0.5)
                                os.write(master_fd, b"\n")
                                agreement_sent = True
                                print("✅ 已发送同意")
                        
                        # 检测 Claude Code 就绪
                        elif agreement_sent and not task_sent:
                            # 检测就绪提示
                            ready_patterns = [
                                "claude", ">>>", "╭─", "╰─", "┌─", "└─",
                                "how can i help", "ready", "initialized",
                                "╭──", "╰──", "┌──", "└──"
                            ]
                            if any(p.lower() in data.lower() for p in ready_patterns):
                                if not ready_detected:
                                    ready_detected = True
                                    print(f"\n🚀 Claude Code 已就绪，3秒后发送任务...")
                                    time.sleep(3)
                                    # 发送任务描述
                                    task_lines = task_description.strip().split('\n')
                                    for line in task_lines:
                                        os.write(master_fd, line.encode('utf-8') + b'\n')
                                        time.sleep(0.1)
                                    os.write(master_fd, b'\n')
                                    task_sent = True
                                    print("✅ 任务已发送")
                        
                except (OSError, IOError) as e:
                    if e.errno != 11:  # EAGAIN
                        break
            
            # 如果长时间没有输出，可能是卡住了
            if time.time() - last_output_time > 30 and not task_sent:
                print("\n⏳ 等待 Claude Code 就绪...")
                last_output_time = time.time()
            
            time.sleep(0.05)
        
        # 任务发送后，继续运行一段时间
        if task_sent:
            print("\n🔄 任务执行中，继续监控...")
            end_time = time.time() + 60  # 再监控60秒
            while process.poll() is None and time.time() < end_time:
                ready, _, _ = select.select([master_fd], [], [], 0.1)
                if ready:
                    try:
                        data = os.read(master_fd, 1024).decode('utf-8', errors='ignore')
                        if data:
                            output_buffer.append(data)
                            sys.stdout.write(data)
                            sys.stdout.flush()
                    except:
                        pass
                time.sleep(0.1)
        
        # 终止进程
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except:
                process.kill()
        
        full_output = ''.join(output_buffer)
        
        return {
            "success": process.returncode == 0 if process.returncode is not None else task_sent,
            "returncode": process.returncode,
            "output": full_output,
            "agreement_sent": agreement_sent,
            "task_sent": task_sent
        }
        
    finally:
        try:
            os.close(master_fd)
        except:
            pass
        try:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=2)
        except:
            try:
                process.kill()
            except:
                pass


def run_coding_task(task_id: str, task_description: str, requirements: list = None, 
                    workspace: str = None, interactive: bool = True):
    """
    完整的 Coding Agent 任务流程
    
    Args:
        task_id: 任务ID
        task_description: 任务描述
        requirements: 任务要求列表
        workspace: 工作目录
        interactive: 是否使用交互模式（打开终端让用户操作）
    
    Returns:
        dict: 任务执行结果（交互模式下不会返回）
    """
    from progress_reporter import ProgressReporter
    
    # 初始化进度上报
    reporter = ProgressReporter("coder", task_id)
    reporter.start("启动 Claude Code...")
    
    # 构建完整的任务提示
    req_text = "\n".join([f"- {r}" for r in (requirements or [])])
    full_prompt = f"""请完成以下编程任务：

{task_description}

要求：
{req_text}

请：
1. 先分析需求
2. 创建必要的文件
3. 编写代码
4. 测试运行
5. 报告完成状态

完成后请更新 TASKS.md 标记任务完成。

工作目录: {workspace or str(Path.home() / '.openclaw' / 'workspace-coder')}"""
    
    if interactive:
        # 交互模式：打开终端让用户操作
        reporter.update(50, "正在打开 Claude Code 交互界面...")
        print("\n" + "="*60)
        print("🍊 小橙正在启动 Claude Code 交互界面")
        print("="*60)
        print("\n📋 任务已准备好，请按提示操作：")
        print("   1. 看到协议提示后输入 y 回车")
        print("   2. 等待 Claude Code 加载完成")
        print("   3. 任务描述会自动发送或手动粘贴")
        print("\n" + "="*60)
        
        # 使用交互模式启动
        run_claude_code_interactive(
            task_description=full_prompt,
            cwd=workspace or str(Path.home() / ".openclaw" / "workspace-coder")
        )
        # 注意：这行不会执行，因为 os.execvp 会替换当前进程
    else:
        # 自动模式：尝试自动运行
        reporter.update(20, "正在启动 Claude Code (自动模式)...")
        
        result = run_claude_code_auto(
            task_description=full_prompt,
            cwd=workspace or str(Path.home() / ".openclaw" / "workspace-coder")
        )
        
        if result["success"]:
            reporter.complete("Claude Code 任务执行完成", {
                "output_length": len(result.get("output", "")),
                "agreement_sent": result["agreement_sent"],
                "task_sent": result["task_sent"]
            })
        else:
            reporter.fail("Claude Code 执行失败", result.get("output", "")[-500:])
        
        return result


if __name__ == "__main__":
    # 测试
    result = run_coding_task(
        task_id="test-001",
        task_description="写一个 Python 函数，计算斐波那契数列",
        requirements=["使用递归", "添加类型注解", "包含文档字符串"]
    )
    
    print("\n" + "="*50)
    print(f"成功: {result['success']}")
    print(f"返回码: {result['returncode']}")
    print(f"输出长度: {len(result['output'])}")
