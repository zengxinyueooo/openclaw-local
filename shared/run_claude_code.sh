#!/bin/bash
# 启动 Claude Code 并自动执行任务
# 用法: ./run_claude_code.sh "任务描述"

TASK_DESC="${1:-请写一个Python脚本，读取JSON文件并统计字段频率}"
WORKSPACE="${2:-$HOME/.openclaw/workspace-coder}"

echo "🍊 小橙启动 Claude Code..."
echo "📁 工作目录: $WORKSPACE"
echo "📝 任务: $TASK_DESC"
echo ""
echo "========================================"
echo "请按以下步骤操作:"
echo "  1. 看到协议提示后输入 y 回车"
echo "  2. 等待 Claude Code 加载完成 (约10-30秒)"
echo "  3. 看到提示符后，粘贴下面的任务描述:"
echo "========================================"
echo ""
echo "$TASK_DESC"
echo ""
echo "========================================"
echo ""

# 切换目录
cd "$WORKSPACE" || exit 1

# 启动 Claude Code
exec mc --code
