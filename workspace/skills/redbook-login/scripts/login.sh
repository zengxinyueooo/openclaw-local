#!/bin/bash
# 小红书扫码登录脚本 🍠✨

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🍠 小红书扫码登录启动...${NC}"
echo ""

# 检查 Chrome 是否运行
if ! pgrep -x "Google Chrome" > /dev/null; then
    echo -e "${BLUE}ℹ️ 正在启动 Chrome...${NC}"
    open -a "Google Chrome"
    sleep 2
fi

# 打开小红书登录页
echo -e "${BLUE}🌐 正在打开小红书登录页...${NC}"
open "https://www.xiaohongshu.com/sign_in"

echo ""
echo -e "${GREEN}✅ 请按以下步骤操作：${NC}"
echo ""
echo "1️⃣  等待页面加载完成（显示二维码）"
echo "2️⃣  打开手机小红书 App"
echo "3️⃣  点击首页右上角的 '+' → 选择'扫一扫'"
echo "4️⃣  扫描电脑屏幕上的二维码"
echo "5️⃣  在手机上确认登录"
echo ""
echo -e "${YELLOW}⏳ 等待登录完成...（按 Ctrl+C 取消）${NC}"
echo ""

# 等待用户确认登录完成
echo -e "${BLUE}💡 登录完成后，请在此终端按回车键继续${NC}"
read -p "👉 已登录完成？按回车继续..."

echo ""
echo -e "${GREEN}✅ 登录流程完成！${NC}"
echo ""
echo -e "${BLUE}📋 下一步：使用 browser 工具提取 Cookie${NC}"
echo ""

exit 0
