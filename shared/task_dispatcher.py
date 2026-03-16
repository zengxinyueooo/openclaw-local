#!/usr/bin/env python3
"""
小桃的任务派发器
用于通过sessions_spawn派活给子Agent，并监控进度
"""

import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# 添加shared目录到路径
sys.path.insert(0, str(Path(__file__).parent))

from progress_reporter import ProgressReporter, get_all_progress, clear_progress

# Agent配置
AGENTS = {
    "coder": {
        "name": "小橙",
        "icon": "🍊",
        "workspace": Path.home() / ".openclaw" / "workspace-coder",
        "description": "Coding Agent，擅长写代码、重构、Code Review"
    },
    "researcher": {
        "name": "小葡",
        "icon": "🍇",
        "workspace": Path.home() / ".openclaw" / "workspace-researcher",
        "description": "Research Agent，擅长查资料、调研、读文档"
    }
}

SHARED_DIR = Path.home() / ".openclaw" / "shared"


class TaskDispatcher:
    """任务派发器"""
    
    def __init__(self):
        self.tasks = {}
        
    def dispatch(self, agent_id: str, task_id: str, task_description: str, 
                 requirements: list = None, priority: str = "中"):
        """
        派发任务给指定Agent
        
        Args:
            agent_id: coder 或 researcher
            task_id: 任务ID
            task_description: 任务描述
            requirements: 任务要求列表
            priority: 优先级（高/中/低）
        """
        if agent_id not in AGENTS:
            print(f"❌ 未知Agent: {agent_id}")
            return False
        
        agent = AGENTS[agent_id]
        print(f"\n{'='*50}")
        print(f"{agent['icon']} 派发任务给{agent['name']}")
        print(f"{'='*50}")
        print(f"📋 任务ID: {task_id}")
        print(f"📝 任务描述: {task_description}")
        print(f"🔥 优先级: {priority}")
        print(f"📁 Workspace: {agent['workspace']}")
        
        # 更新Agent的TASKS.md
        self._update_tasks_md(agent_id, task_id, task_description, requirements, priority)
        
        # 初始化进度
        reporter = ProgressReporter(agent_id, task_id)
        reporter.start(f"任务已派发: {task_description[:50]}...")
        
        # 创建任务执行脚本
        script_content = self._generate_task_script(agent_id, task_id, task_description, requirements)
        script_path = SHARED_DIR / f"task_{agent_id}_{task_id}.py"
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(script_content)
        
        print(f"\n✅ 任务已创建: {script_path}")
        print(f"🚀 可以使用以下命令执行:")
        print(f"   python {script_path}")
        print(f"   或通过 sessions_spawn 执行")
        
        return {
            "agent_id": agent_id,
            "task_id": task_id,
            "script_path": str(script_path),
            "status": "dispatched"
        }
    
    def _update_tasks_md(self, agent_id: str, task_id: str, description: str, 
                         requirements: list, priority: str):
        """更新Agent的TASKS.md"""
        agent = AGENTS[agent_id]
        tasks_md = agent['workspace'] / "TASKS.md"
        
        # 读取现有内容
        content = ""
        if tasks_md.exists():
            with open(tasks_md, 'r', encoding='utf-8') as f:
                content = f.read()
        
        # 生成新任务条目
        req_str = "\n".join([f"  - [ ] {r}" for r in (requirements or [])])
        new_task = f"""### [PENDING] {task_id}: {description[:30]}...
- **优先级**: {"🔴" if priority == "高" else "🟡" if priority == "中" else "🟢"} {priority}
- **描述**: {description}
- **要求**:
{req_str}
- **进度**: 0%
- **状态**: 待开始
- **创建时间**: {datetime.now().strftime('%Y-%m-%d %H:%M')}

"""
        
        # 插入到待办任务部分
        if "## 待办任务" in content:
            content = content.replace("## 待办任务\n\n", f"## 待办任务\n\n{new_task}")
        else:
            content = f"# {agent['name']}的任务清单 {agent['icon']}\n\n## 待办任务\n\n{new_task}\n" + content
        
        # 写回文件
        with open(tasks_md, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"📝 已更新 {tasks_md}")
    
    def _generate_task_script(self, agent_id: str, task_id: str, description: str, requirements: list):
        """生成任务执行脚本"""
        agent = AGENTS[agent_id]
        req_list = json.dumps(requirements or [], ensure_ascii=False)
        
        if agent_id == "coder":
            # Coding Agent 使用 Claude Code
            return self._generate_coder_script(task_id, description, requirements, agent)
        else:
            # 其他 Agent 使用默认脚本
            return self._generate_default_script(agent_id, task_id, description, requirements, agent)
    
    def _generate_coder_script(self, task_id: str, description: str, requirements: list, agent: dict):
        """生成 Coding Agent 的 Claude Code 脚本"""
        req_list = json.dumps(requirements or [], ensure_ascii=False)
        
        return f'''#!/usr/bin/env python3
"""
Coding Agent 任务脚本 - {task_id}
使用 Claude Code 自动执行编码任务
自动生成于 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
"""

import sys
import time
sys.path.insert(0, "{SHARED_DIR}")

from claude_code_runner import run_coding_task

def main():
    print("🍊 小橙启动 Claude Code 任务执行")
    print("=" * 50)
    
    # 任务信息
    task_description = """{description}"""
    requirements = {req_list}
    
    print(f"📋 任务ID: {task_id}")
    print(f"📝 任务描述: {{task_description[:100]}}...")
    print(f"📋 要求: {{len(requirements)}} 项")
    print()
    
    # 调用 Claude Code 执行任务
    result = run_coding_task(
        task_id="{task_id}",
        task_description=task_description,
        requirements=requirements,
        workspace="{agent['workspace']}"
    )
    
    print()
    print("=" * 50)
    if result["success"]:
        print("✅ 任务执行成功！")
        print(f"📄 输出长度: {{len(result.get('output', ''))}} 字符")
    else:
        print("❌ 任务执行失败")
        print(f"返回码: {{result['returncode']}}")
    
    return result

if __name__ == "__main__":
    main()
'''
    
    def _generate_default_script(self, agent_id: str, task_id: str, description: str, 
                                  requirements: list, agent: dict):
        """生成默认任务脚本"""
        req_list = json.dumps(requirements or [], ensure_ascii=False)
        
        return f'''#!/usr/bin/env python3
"""
任务执行脚本 - {agent_id} / {task_id}
自动生成于 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
"""

import sys
import time
sys.path.insert(0, "{SHARED_DIR}")

from progress_reporter import ProgressReporter

def main():
    # 初始化进度上报
    reporter = ProgressReporter("{agent_id}", "{task_id}")
    
    # 任务信息
    task_description = """{description}"""
    requirements = {req_list}
    
    print(f"🚀 开始执行任务: {task_id}")
    print(f"📝 任务描述: {{task_description}}")
    
    # 标记开始
    reporter.start("正在分析任务...")
    time.sleep(1)
    
    # TODO: 在这里实现具体的任务逻辑
    steps = [
        (20, "正在读取输入数据..."),
        (40, "正在处理数据..."),
        (60, "正在生成结果..."),
        (80, "正在保存文件..."),
    ]
    
    for progress, message in steps:
        reporter.update(progress, message)
        time.sleep(1)
    
    # 标记完成
    result = {{
        "output_file": "result_{task_id}.txt",
        "summary": "任务执行完成"
    }}
    reporter.complete("任务执行成功！", result)
    
    print(f"✅ 任务完成: {task_id}")
    return result

if __name__ == "__main__":
    main()
'''
    
    def monitor(self, agent_id: str = None, task_id: str = None):
        """监控任务进度"""
        print(f"\n{'='*50}")
        print(f"🍑 小桃监控中心")
        print(f"{'='*50}")
        
        progress_list = get_all_progress()
        
        if agent_id:
            progress_list = [p for p in progress_list if p['agent_id'] == agent_id]
        if task_id:
            progress_list = [p for p in progress_list if p['task_id'] == task_id]
        
        if not progress_list:
            print("📭 暂无任务进度")
            return []
        
        # 统计
        stats = {{
            'running': len([p for p in progress_list if p['status'] == 'running']),
            'completed': len([p for p in progress_list if p['status'] == 'completed']),
            'failed': len([p for p in progress_list if p['status'] == 'failed']),
            'pending': len([p for p in progress_list if p['status'] == 'pending']),
        }}
        
        print(f"\n📊 任务统计:")
        print(f"   🟡 运行中: {stats['running']}")
        print(f"   🟢 已完成: {stats['completed']}")
        print(f"   🔴 失败: {stats['failed']}")
        print(f"   ⏳ 待处理: {stats['pending']}")
        
        print(f"\n📋 任务详情:")
        for p in progress_list[:10]:  # 只显示最近10个
            agent = AGENTS.get(p['agent_id'], {{'icon': '🤖', 'name': p['agent_id']}})
            status_emoji = {{
                'running': '🟡',
                'completed': '🟢',
                'failed': '🔴',
                'pending': '⏳'
            }}.get(p['status'], '⚪')
            
            print(f"\n   {agent['icon']} {agent['name']} | {p['task_id']}")
            print(f"   {status_emoji} {p['status']} | {p['progress']}% | {p['message']}")
            print(f"   ⏱️ 已用时: {p.get('elapsed_seconds', 0)}秒")
        
        return progress_list
    
    def list_agents(self):
        """列出所有可用Agent"""
        print(f"\n{'='*50}")
        print(f"🍑 水果Agent团队")
        print(f"{'='*50}")
        
        for agent_id, info in AGENTS.items():
            print(f"\n{info['icon']} {info['name']} ({agent_id})")
            print(f"   📁 Workspace: {info['workspace']}")
            print(f"   📝 {info['description']}")
        
        print(f"\n🍑 小桃 (main) - 主管Agent")
        print(f"   负责派活和监控")


# 命令行接口
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="小桃的任务派发器")
    parser.add_argument("command", choices=["dispatch", "monitor", "list", "clear"])
    parser.add_argument("--agent", "-a", help="Agent ID (coder/researcher)")
    parser.add_argument("--task", "-t", help="任务ID")
    parser.add_argument("--desc", "-d", help="任务描述")
    parser.add_argument("--priority", "-p", default="中", choices=["高", "中", "低"])
    
    args = parser.parse_args()
    
    dispatcher = TaskDispatcher()
    
    if args.command == "dispatch":
        if not args.agent or not args.task or not args.desc:
            print("❌ 缺少参数: --agent, --task, --desc")
            sys.exit(1)
        dispatcher.dispatch(args.agent, args.task, args.desc, priority=args.priority)
    
    elif args.command == "monitor":
        dispatcher.monitor(args.agent, args.task)
    
    elif args.command == "list":
        dispatcher.list_agents()
    
    elif args.command == "clear":
        clear_progress(args.agent, args.task)
        print("✅ 进度已清理")
