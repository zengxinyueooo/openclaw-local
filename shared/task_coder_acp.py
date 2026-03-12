#!/usr/bin/env python3
"""
使用 OpenClaw ACP 调用 Claude Code
通过 sessions_spawn 创建 ACP 会话执行编码任务
"""

import subprocess
import sys
import os
import json
import time
from pathlib import Path

SHARED_DIR = Path.home() / ".openclaw" / "shared"
PROGRESS_DIR = SHARED_DIR / "progress"
WORKSPACE_CODER = Path.home() / ".openclaw" / "workspace-coder"


def update_progress(task_id: str, status: str, progress: int, message: str, details: dict = None):
    """更新进度"""
    PROGRESS_DIR.mkdir(parents=True, exist_ok=True)
    
    data = {
        "agent_id": "coder",
        "task_id": task_id,
        "status": status,
        "progress": progress,
        "message": message,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "details": details or {}
    }
    
    progress_file = PROGRESS_DIR / f"coder-{task_id}.json"
    with open(progress_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"📊 {progress}% - {message}")


def run_with_acp(task_id: str, task_description: str):
    """
    使用 OpenClaw ACP 调用 Claude Code
    这会创建一个独立的 ACP 会话来执行 mc --code
    """
    print(f"\n{'='*60}")
    print(f"🍊 Coding Agent (ACP模式): {task_id}")
    print(f"{'='*60}\n")
    
    update_progress(task_id, "running", 10, "启动 ACP 会话...")
    
    # 构建任务提示
    prompt = f"""请在当前目录下完成以下编程任务：

{task_description}

要求：
- 代码要有详细注释
- 要有错误处理
- 使用类型注解
- 包含文档字符串

请直接创建文件并编写代码，完成后报告创建的文件列表。
"""
    
    # 使用 openclaw CLI 创建 ACP 会话
    # 注意：这需要 openclaw 支持 ACP 模式
    cmd = [
        "openclaw", "sessions", "spawn",
        "--runtime", "acp",
        "--agentId", "coder",
        "--cwd", str(WORKSPACE_CODER),
        "--task", prompt,
        "--timeout", "300"
    ]
    
    print(f"🚀 启动 ACP 会话...")
    print(f"📁 工作目录: {WORKSPACE_CODER}")
    
    update_progress(task_id, "running", 30, "执行中...")
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=310
        )
        
        print(f"✅ ACP 执行完成")
        print(f"📄 输出:\n{result.stdout}")
        
        if result.stderr:
            print(f"⚠️  错误:\n{result.stderr}")
        
        update_progress(task_id, "completed", 100, "任务完成", {
            "returncode": result.returncode,
            "output": result.stdout[:1000]
        })
        
        return {
            "success": result.returncode == 0,
            "output": result.stdout,
            "error": result.stderr
        }
        
    except subprocess.TimeoutExpired:
        update_progress(task_id, "failed", 100, "执行超时")
        return {"success": False, "error": "timeout"}
    except Exception as e:
        update_progress(task_id, "failed", 100, f"错误: {e}")
        return {"success": False, "error": str(e)}


def main():
    """测试"""
    task_id = "task-003-todo-ui"
    task_desc = """创建一个简单的前端待办事项(Todo)应用：
- 可以添加/删除/标记完成待办事项
- 使用 HTML+CSS+JS
- 数据保存在 localStorage
- 响应式设计

请创建 index.html, style.css, app.js 三个文件。"""
    
    result = run_with_acp(task_id, task_desc)
    
    print(f"\n{'='*60}")
    print(f"结果: {result['success']}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
