#!/usr/bin/env python3
"""
Agent进度上报工具
用于SubAgent向主管Agent（小桃）报告任务进度
"""

import json
import os
import time
from datetime import datetime
from pathlib import Path

PROGRESS_DIR = Path.home() / ".openclaw" / "shared" / "progress"

class ProgressReporter:
    """进度上报器"""
    
    def __init__(self, agent_id: str, task_id: str):
        self.agent_id = agent_id
        self.task_id = task_id
        self.progress_file = PROGRESS_DIR / f"{agent_id}-{task_id}.json"
        self.start_time = time.time()
        
    def report(self, status: str, progress: int, message: str, details: dict = None):
        """
        上报进度
        
        Args:
            status: pending/running/completed/failed
            progress: 0-100
            message: 状态描述
            details: 额外详情
        """
        elapsed = time.time() - self.start_time
        
        data = {
            "agent_id": self.agent_id,
            "task_id": self.task_id,
            "status": status,
            "progress": progress,
            "message": message,
            "timestamp": datetime.now().isoformat(),
            "elapsed_seconds": round(elapsed, 2),
            "details": details or {}
        }
        
        # 确保目录存在
        PROGRESS_DIR.mkdir(parents=True, exist_ok=True)
        
        # 写入进度文件
        with open(self.progress_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        print(f"[{self.agent_id}] {status}: {progress}% - {message}")
        return data
    
    def start(self, message: str = "任务开始"):
        """标记任务开始"""
        return self.report("running", 0, message)
    
    def update(self, progress: int, message: str, details: dict = None):
        """更新进度"""
        return self.report("running", progress, message, details)
    
    def complete(self, message: str = "任务完成", result: dict = None):
        """标记任务完成"""
        return self.report("completed", 100, message, result)
    
    def fail(self, message: str, error: str = None):
        """标记任务失败"""
        return self.report("failed", 0, message, {"error": error})


def get_all_progress():
    """获取所有Agent的进度（供小桃监控使用）"""
    if not PROGRESS_DIR.exists():
        return []
    
    progress_list = []
    for f in PROGRESS_DIR.glob("*.json"):
        try:
            with open(f, 'r', encoding='utf-8') as fp:
                progress_list.append(json.load(fp))
        except:
            pass
    
    # 按时间排序
    progress_list.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
    return progress_list


def clear_progress(agent_id: str = None, task_id: str = None):
    """清理进度文件"""
    if not PROGRESS_DIR.exists():
        return
    
    if agent_id and task_id:
        # 清理特定任务
        f = PROGRESS_DIR / f"{agent_id}-{task_id}.json"
        if f.exists():
            f.unlink()
    elif agent_id:
        # 清理该Agent的所有任务
        for f in PROGRESS_DIR.glob(f"{agent_id}-*.json"):
            f.unlink()
    else:
        # 清理所有
        for f in PROGRESS_DIR.glob("*.json"):
            f.unlink()


if __name__ == "__main__":
    # 测试代码
    reporter = ProgressReporter("coder", "task-001")
    reporter.start("开始编写JSON统计脚本")
    time.sleep(1)
    reporter.update(30, "正在读取JSON文件...")
    time.sleep(1)
    reporter.update(60, "正在生成柱状图...")
    time.sleep(1)
    reporter.complete("脚本完成！", {"file": "json_stats.py"})
    
    print("\n所有进度:")
    for p in get_all_progress():
        print(f"  {p['agent_id']}: {p['progress']}% - {p['message']}")
