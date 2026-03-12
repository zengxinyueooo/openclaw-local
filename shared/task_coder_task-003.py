#!/usr/bin/env python3
"""
Coding Agent 任务脚本 - task-003
使用 Claude Code 自主交互完成UI界面开发
"""

import sys
sys.path.insert(0, "/Users/zengxinyue/.openclaw/shared")

from claude_code_agent import CodingAgent

def main():
    print("🍊 小橙启动任务: 简单待办事项UI界面")
    print("=" * 60)
    
    # 定义任务
    task_description = """请创建一个简单的前端待办事项(Todo)应用：

功能需求：
1. 可以添加新的待办事项
2. 可以删除待办事项
3. 可以标记待办事项为已完成/未完成
4. 显示待办事项列表
5. 数据保存在浏览器的 localStorage 中

技术要求：
- 使用原生 HTML5 + CSS3 + JavaScript
- 不需要任何框架
- 界面简洁美观，有基本的样式
- 响应式设计，适配手机和电脑

请创建以下文件：
- index.html (主页面)
- style.css (样式文件)
- app.js (JavaScript逻辑)

完成后请测试功能是否正常，并报告创建的文件列表。"""

    requirements = [
        "HTML5 + CSS3 + JavaScript",
        "localStorage 数据持久化",
        "响应式设计",
        "简洁美观的UI",
        "完整的功能实现"
    ]
    
    # 创建Agent并运行
    agent = CodingAgent(
        task_id="task-003",
        task_description=task_description,
        requirements=requirements
    )
    
    # 运行多轮交互
    result = agent.run()
    
    print("\n" + "=" * 60)
    if result["success"]:
        print("✅ 任务执行成功！")
        print(f"📊 对话轮数: {result['rounds']}")
        print(f"📝 结果: {result['reason']}")
    else:
        print("❌ 任务执行失败")
        print(f"原因: {result.get('error', '未知错误')}")
    
    return result

if __name__ == "__main__":
    main()
