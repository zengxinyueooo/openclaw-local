#!/usr/bin/env python3
"""
Agent进度上报客户端
供小橙、小葡调用，上报任务进度
"""

import json
import time
import urllib.request
from datetime import datetime


class AgentClient:
    """Agent客户端，用于上报进度"""
    
    def __init__(self, agent_id, server_url="http://localhost:8080"):
        self.agent_id = agent_id
        self.server_url = server_url
        self.task_start_time = None
        
    def _send_update(self, **data):
        """发送更新到服务器"""
        try:
            url = f"{self.server_url}/api/status"
            # 实际这里应该使用POST，但简单起见先用GET读取当前状态
            # 真实场景需要实现POST接口
            pass
        except Exception as e:
            print(f"上报失败: {e}")
    
    def start_task(self, task_name):
        """开始任务"""
        self.task_start_time = time.time()
        print(f"🚀 [{self.agent_id}] 开始任务: {task_name}")
        # 这里可以写入共享文件或调用API
        
    def update_progress(self, progress, message=""):
        """更新进度 (0-100)"""
        elapsed = time.time() - self.task_start_time if self.task_start_time else 0
        elapsed_str = f"{int(elapsed//60):02d}:{int(elapsed%60):02d}"
        
        bar = "█" * (progress // 5) + "░" * (20 - progress // 5)
        print(f"⏳ [{self.agent_id}] [{bar}] {progress}% | {elapsed_str} | {message}")
        
    def log(self, level, message):
        """记录日志"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        icons = {
            "info": "ℹ️",
            "success": "✅",
            "error": "❌",
            "warning": "⚠️"
        }
        icon = icons.get(level, "📝")
        print(f"{icon} [{self.agent_id}] [{timestamp}] {message}")
        
    def complete_task(self, result=""):
        """完成任务"""
        elapsed = time.time() - self.task_start_time if self.task_start_time else 0
        elapsed_str = f"{int(elapsed//60):02d}:{int(elapsed%60):02d}"
        
        print(f"✅ [{self.agent_id}] 任务完成! 耗时: {elapsed_str}")
        if result:
            print(f"📄 结果: {result}")


# 便捷函数
def create_client(agent_id):
    """创建Agent客户端"""
    return AgentClient(agent_id)


if __name__ == '__main__':
    # 测试
    client = create_client("coder")
    client.start_task("测试任务")
    
    for i in range(0, 101, 10):
        client.update_progress(i, f"处理中...{i}%")
        time.sleep(0.5)
    
    client.complete_task("测试完成!")
