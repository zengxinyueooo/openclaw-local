#!/bin/bash

# Agent Dashboard 启动脚本

cd "$(dirname "$0")/server"

echo "🚀 启动 Agent Dashboard 服务器..."
echo "📍 访问地址: http://localhost:3210"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

node index.js
