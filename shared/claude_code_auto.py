#!/usr/bin/env python3
"""
Claude Code 完全自动化执行
使用 expect 实现真正的自动交互
"""

import subprocess
import os
import sys
import time
import json
from pathlib import Path
from datetime import datetime

SHARED_DIR = Path.home() / ".openclaw" / "shared"
PROGRESS_DIR = SHARED_DIR / "progress"
WORKSPACE_CODER = Path.home() / ".openclaw" / "workspace-coder"


class ClaudeCodeAuto:
    """完全自动化的 Claude Code 执行器"""
    
    def __init__(self, task_id: str, task_description: str, requirements: list = None):
        self.task_id = task_id
        self.task_description = task_description
        self.requirements = requirements or []
        self.workspace = str(WORKSPACE_CODER)
        self.output_file = f"/tmp/claude_{task_id}_output.txt"
        
    def run(self) -> dict:
        """执行任务并返回结果"""
        print(f"\n{'='*60}")
        print(f"🍊 Coding Agent: {self.task_id}")
        print(f"{'='*60}\n")
        
        # 更新进度
        self._update_progress("running", 10, "启动 Claude Code...")
        
        # 构建任务提示
        task_prompt = self._build_prompt()
        
        # 使用 expect 执行
        result = self._run_expect(task_prompt)
        
        # 检查结果
        files_created = self._check_files()
        
        # 完成
        self._update_progress("completed", 100, "任务完成", {
            "files_created": files_created,
            "output_file": self.output_file
        })
        
        return {
            "success": len(files_created) > 0,
            "task_id": self.task_id,
            "files_created": files_created,
            "output": result.get("output", "")
        }
    
    def _build_prompt(self) -> str:
        """构建任务提示"""
        req_text = "; ".join(self.requirements)
        return f"""请完成以下任务：{self.task_description}
要求：{req_text}
请创建必要的文件，完成后明确说"任务完成"并列出创建的文件名。"""
    
    def _run_expect(self, task_prompt: str) -> dict:
        """使用 expect 运行 Claude Code"""
        print("🚀 启动 Claude Code 自动交互...")
        
        # 检查 expect 是否安装
        try:
            subprocess.run(["which", "expect"], check=True, capture_output=True)
        except:
            print("❌ expect 未安装，尝试用 brew 安装...")
            subprocess.run(["brew", "install", "expect"], check=False)
        
        # 构建命令
        cmd = [
            "expect",
            str(SHARED_DIR / "claude_code_expect.exp"),
            self.workspace,
            task_prompt,
            self.output_file
        ]
        
        print(f"📤 发送任务: {task_prompt[:80]}...")
        self._update_progress("running", 30, "执行任务...")
        
        # 执行
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120
            )
            
            print(f"✅ 执行完成")
            print(f"📄 输出文件: {self.output_file}")
            
            # 读取输出
            output = ""
            if os.path.exists(self.output_file):
                with open(self.output_file, 'r') as f:
                    output = f.read()
            
            return {
                "success": result.returncode == 0,
                "returncode": result.returncode,
                "output": output,
                "stderr": result.stderr
            }
            
        except subprocess.TimeoutExpired:
            print("⏰ 执行超时")
            return {"success": False, "error": "timeout"}
        except Exception as e:
            print(f"❌ 执行失败: {e}")
            return {"success": False, "error": str(e)}
    
    def _check_files(self) -> list:
        """检查创建的文件"""
        print("\n📁 检查创建的文件...")
        
        # 获取执行前的文件列表
        before_files = set()
        
        # 获取当前文件列表
        current_files = set(os.listdir(self.workspace))
        
        # 排除已知文件
        exclude = {'IDENTITY.md', 'TASKS.md', 'MEMORY.md', 'SOUL.md', 
                   'AGENTS.md', 'TOOLS.md', 'CLAUDE_CODE_GUIDE.md', 
                   'scripts', '.git'}
        
        new_files = current_files - exclude - before_files
        
        if new_files:
            print(f"✅ 发现新文件: {new_files}")
        else:
            print("⚠️ 未发现新文件")
            # 列出所有文件
            print(f"📁 当前文件: {current_files - exclude}")
        
        return list(new_files)
    
    def _update_progress(self, status: str, progress: int, message: str, details: dict = None):
        """更新进度"""
        PROGRESS_DIR.mkdir(parents=True, exist_ok=True)
        
        data = {
            "agent_id": "coder",
            "task_id": self.task_id,
            "status": status,
            "progress": progress,
            "message": message,
            "timestamp": datetime.now().isoformat(),
            "details": details or {}
        }
        
        progress_file = PROGRESS_DIR / f"coder-{self.task_id}.json"
        with open(progress_file, 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"📊 {progress}% - {message}")


def main():
    """测试"""
    agent = ClaudeCodeAuto(
        task_id="task-todo-ui",
        task_description="创建一个简单的前端待办事项(Todo)应用，使用HTML+CSS+JS，可以添加/删除/标记完成待办事项，数据保存在localStorage",
        requirements=["HTML+CSS+JS", "localStorage", "响应式"]
    )
    
    result = agent.run()
    
    print(f"\n{'='*60}")
    print("执行结果:")
    print(f"  成功: {result['success']}")
    print(f"  创建文件: {result['files_created']}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
