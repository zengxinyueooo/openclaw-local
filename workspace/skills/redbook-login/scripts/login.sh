#!/bin/bash
#
# 小红书手机号登录脚本 🍠✨
# 支持手机号+验证码登录

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

COOKIE_FILE="${HOME}/.openclaw/workspace/.secrets/redbook-cookie.txt"

echo -e "${YELLOW}🍠 小红书手机号登录${NC}"
echo ""

# 检查 Chrome 是否运行
if ! pgrep -x "Google Chrome" > /dev/null; then
    echo -e "${YELLOW}⚠️  Chrome 未运行，正在启动...${NC}"
    open -a "Google Chrome"
    sleep 3
fi

# 打开小红书登录页
echo -e "${BLUE}🌐 正在打开小红书登录页...${NC}"
open "https://www.xiaohongshu.com/login"
sleep 3

echo ""
echo -e "${GREEN}✅ 页面已打开！${NC}"
echo ""
echo -e "${YELLOW}请按以下步骤操作：${NC}"
echo "1. 在页面上点击【手机号登录】"
echo "2. 输入手机号并点击【获取验证码】"
echo ""

# 提示用户输入手机号
read -p "📱 请输入手机号 (+86): " phone

if [ -z "$phone" ]; then
    echo -e "${RED}❌ 手机号不能为空${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}📲 请查看手机短信，获取验证码${NC}"

# 提示用户输入验证码
read -p "🔑 请输入验证码: " code

if [ -z "$code" ]; then
    echo -e "${RED}❌ 验证码不能为空${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}⏳ 正在登录...${NC}"

# 等待登录完成
echo "请在浏览器中完成登录，然后按回车键继续..."
read

# 提取 Cookie
echo -e "${BLUE}🔍 正在提取 Cookie...${NC}"

# 使用 osascript 获取 Chrome 的 Cookie（仅限 macOS）
# 注意：这需要 Chrome 开启远程调试或使用其他方式

# 简化方案：提示用户手动复制 Cookie
echo ""
echo -e "${YELLOW}💡 请按以下步骤获取 Cookie：${NC}"
echo "1. 在小红书页面按 F12 打开开发者工具"
echo "2. 切换到 Application/应用 标签"
echo "3. 左侧选择 Cookies → https://www.xiaohongshu.com"
echo "4. 复制所有 Cookie 值"
echo ""

read -p "是否已准备好粘贴 Cookie? (y/n): " ready

if [ "$ready" != "y" ]; then
    echo -e "${YELLOW}⏸️  登录流程已暂停，准备好后重新运行脚本${NC}"
    exit 0
fi

# 创建 secrets 目录
mkdir -p "$(dirname "$COOKIE_FILE")"

echo ""
echo -e "${BLUE}📝 请粘贴 Cookie 字符串 (粘贴后按 Ctrl+D 结束):${NC}"
cat > "$COOKIE_FILE"

# 设置权限
chmod 600 "$COOKIE_FILE"

echo ""
echo -e "${GREEN}✅ Cookie 已保存！${NC}"
echo -e "📁 文件位置: ${COOKIE_FILE}"
echo ""
echo -e "${YELLOW}🍠 小红书登录完成！${NC}"

# 显示保存的 Cookie（隐藏敏感信息）
echo ""
echo -e "${BLUE}📋 保存的 Cookie 预览:${NC}"
head -c 100 "$COOKIE_FILE"
echo "..."
