#!/usr/bin/env python3
"""
测试Dashboard - 模拟小葡执行调研任务
"""

import sys
import time
sys.path.insert(0, '/Users/zengxinyue/.openclaw/shared/dashboard')

from agent_client import create_client

# 创建小葡客户端
client = create_client("researcher")

# 开始任务
client.start_task("调研Java 21新特性")
client.log("info", "开始搜索Java 21官方文档...")
time.sleep(2)

# 模拟进度
steps = [
    (10, "搜索Virtual Threads资料"),
    (25, "阅读官方文档"),
    (40, "整理Sequenced Collections特性"),
    (55, "搜索实际应用案例"),
    (70, "对比Java 17和21的差异"),
    (85, "编写调研报告大纲"),
    (95, "生成最终报告"),
]

for progress, message in steps:
    client.update_progress(progress, message)
    client.log("info", message)
    time.sleep(1.5)

# 完成
client.log("success", "调研报告已生成")
client.complete_task("Java 21新特性调研报告.md")
print("\n✅ 任务完成！请刷新看板页面查看效果")
