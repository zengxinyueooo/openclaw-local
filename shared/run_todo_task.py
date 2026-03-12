#!/usr/bin/env python3
"""
执行待办事项UI任务
"""

import sys
sys.path.insert(0, "/Users/zengxinyue/.openclaw/shared")

from claude_code_auto import ClaudeCodeAuto

def main():
    print("🍊 小橙开始执行任务: 待办事项UI")
    print("=" * 60)
    
    agent = ClaudeCodeAuto(
        task_id="task-003-todo-ui",
        task_description="""创建一个简单的前端待办事项(Todo)应用：

功能：
1. 添加新的待办事项
2. 删除待办事项  
3. 标记待办事项为已完成/未完成
4. 显示待办事项列表
5. 过滤显示（全部/进行中/已完成）

技术要求：
- 使用原生 HTML5 + CSS3 + JavaScript
- 不需要任何框架
- 数据保存在浏览器 localStorage
- 界面简洁美观
- 响应式设计

请创建：
- index.html
- style.css  
- app.js

完成后请测试功能正常，并明确说"任务完成"。""",
        requirements=[
            "HTML5+CSS3+JS",
            "localStorage数据持久化",
            "响应式设计",
            "简洁美观UI",
            "完整功能实现"
        ]
    )
    
    result = agent.run()
    
    print("\n" + "=" * 60)
    if result["success"]:
        print("✅ 任务执行成功！")
        print(f"📄 创建文件: {result['files_created']}")
        
        # 显示文件内容
        for f in result['files_created'][:3]:
            filepath = f"/Users/zengxinyue/.openclaw/workspace-coder/{f}"
            if os.path.exists(filepath):
                print(f"\n📄 {f}:")
                with open(filepath) as fp:
                    print(fp.read()[:500])
    else:
        print("❌ 任务执行失败")
        print(f"错误: {result.get('error', '未知错误')}")
    
    print("=" * 60)

if __name__ == "__main__":
    import os
    main()
