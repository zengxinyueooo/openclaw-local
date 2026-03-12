#!/bin/bash
# 启动水果Agent监控看板

echo "🍑 启动水果Agent监控看板..."

# 检查Python
if command -v python3 &> /dev/null; then
    PYTHON=python3
elif command -v python &> /dev/null; then
    PYTHON=python
else
    echo "❌ 未找到Python，请先安装"
    exit 1
fi

# 启动服务器
PORT=${1:-8080}
$PYTHON ~/.openclaw/shared/dashboard/server.py $PORT &

# 保存PID
PID=$!
echo $PID > ~/.openclaw/shared/progress/dashboard.pid

echo "✅ 看板已启动!"
echo "📊 访问: http://localhost:$PORT"
echo "📝 PID: $PID"
echo ""
echo "停止命令: kill $PID"
