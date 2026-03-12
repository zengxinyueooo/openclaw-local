#!/usr/bin/env python3
"""
Coding Agent 任务脚本 - task-002
使用 Claude Code 执行编码任务
自动生成于 2026-03-12 21:14:31
"""

import os
import sys
import subprocess

# 任务信息
TASK_DESCRIPTION = """请写一个Python脚本，实现以下功能：
1. 读取一个JSON文件
2. 统计其中某个字段的出现频率
3. 生成一个可视化的柱状图（用matplotlib）
4. 保存为PNG图片

要求：
- 代码要有详细的注释
- 要有完善的错误处理
- 要有命令行参数支持（输入文件、输出文件、字段名）
- 使用类型注解
- 包含文档字符串

完成后请在工作目录下创建 json_stats.py 文件。"""

WORKSPACE = "/Users/zengxinyue/.openclaw/workspace-coder"

def main():
    print("🍊 小橙准备启动 Claude Code...")
    print("=" * 60)
    print()
    print("📋 任务ID: task-002")
    print("📝 任务描述: JSON数据统计可视化脚本")
    print()
    print("⚠️  即将打开 Claude Code 交互界面")
    print("   请按以下步骤操作：")
    print("   1. 看到协议提示后输入 y 回车")
    print("   2. 等待 Claude Code 加载完成")
    print("   3. 看到提示符后，粘贴任务描述（已复制到剪贴板）")
    print()
    print("=" * 60)
    print()
    
    # 显示任务描述，方便复制
    print("📋 任务描述（请复制）：")
    print("-" * 60)
    print(TASK_DESCRIPTION)
    print("-" * 60)
    print()
    
    input("按回车键启动 Claude Code...")
    
    # 切换目录并启动 mc --code
    os.chdir(WORKSPACE)
    
    # 使用 exec 替换当前进程，保留终端交互
    os.execvp("mc", ["mc", "--code"])

if __name__ == "__main__":
    main()
