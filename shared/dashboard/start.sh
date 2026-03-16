#!/bin/bash
# 启动Agent监控看板

echo "🍑 启动水果Agent监控看板..."
echo ""

# 检查Python
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 需要安装Python3"
    exit 1
fi

# 默认端口
PORT=${1:-8080}

# 启动服务器
echo "📊 看板地址: http://localhost:$PORT"
echo "📡 API地址: http://localhost:$PORT/api/status"
echo ""
python3 server.py $PORT
