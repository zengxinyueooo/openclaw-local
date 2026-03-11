#!/bin/bash
# 成长沉淀 - 自动备份脚本 🍑✨
# 功能：检查 ~/.openclaw/workspace/ 目录变更，自动提交并推送到 GitHub

set -e

# 配置
OPENCLAW_DIR="${HOME}/.openclaw/workspace"
REPO_URL="https://github.com/zengxinyueooo/openclaw-local.git"
BACKUP_BRANCH="main"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🍑 成长沉淀备份脚本启动...${NC}"

# 检查目录是否存在
if [ ! -d "$OPENCLAW_DIR" ]; then
    echo -e "${RED}✗ 错误：目录 $OPENCLAW_DIR 不存在${NC}"
    exit 1
fi

cd "$OPENCLAW_DIR"

# 检查是否是 git 仓库
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}⚠ 目录不是 git 仓库，正在初始化...${NC}"
    git init
    git remote add origin "$REPO_URL"
    echo -e "${GREEN}✓ Git 仓库初始化完成${NC}"
fi

# 检查远程仓库
if ! git remote get-url origin &>/dev/null; then
    echo -e "${YELLOW}⚠ 添加远程仓库...${NC}"
    git remote add origin "$REPO_URL"
fi

# 获取当前日期
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H:%M:%S)

# 检查是否有变更
echo -e "${YELLOW}🔍 检查文件变更...${NC}"
git add -A

# 检查是否有内容需要提交
if git diff --cached --quiet; then
    echo -e "${GREEN}✓ 没有文件变更，无需备份${NC}"
    echo "BACKUP_STATUS=无需备份（无变更）"
    exit 0
fi

# 获取变更统计
CHANGED_FILES=$(git diff --cached --name-only | wc -l)
INSERTIONS=$(git diff --cached --stat | tail -1 | grep -oE '[0-9]+ insertion' | awk '{s+=$1} END {print s}')
DELETIONS=$(git diff --cached --stat | tail -1 | grep -oE '[0-9]+ deletion' | awk '{s+=$1} END {print s}')

echo -e "${GREEN}📊 变更统计：${NC}"
echo "   - 变更文件数: $CHANGED_FILES"
echo "   - 新增行数: ${INSERTIONS:-0}"
echo "   - 删除行数: ${DELETIONS:-0}"

# 提交变更
echo -e "${YELLOW}💾 正在提交变更...${NC}"
git commit -m "growth-diary: 沉淀备份 ${DATE} ${TIME}

- 变更文件: ${CHANGED_FILES} 个
- 新增行数: ${INSERTIONS:-0}
- 删除行数: ${DELETIONS:-0}

自动备份 by 成长沉淀 skill 🍑"

# 先拉取远程更新
echo -e "${YELLOW}🔄 同步远程更新...${NC}"
git pull origin "$BACKUP_BRANCH" --rebase || true

# 推送到远程
echo -e "${YELLOW}🚀 推送到 GitHub...${NC}"
if git push origin "$BACKUP_BRANCH" 2>&1; then
    echo -e "${GREEN}✓ 备份完成！已推送到 ${REPO_URL}${NC}"
    echo "BACKUP_STATUS=✅ 已备份 (${CHANGED_FILES} 个文件)"
else
    echo -e "${RED}✗ 推送失败，尝试设置上游分支...${NC}"
    git push -u origin "$BACKUP_BRANCH" 2>&1 || {
        echo -e "${RED}✗ 备份失败，请检查网络或仓库权限${NC}"
        echo "BACKUP_STATUS=❌ 备份失败"
        exit 1
    }
    echo -e "${GREEN}✓ 备份完成！已推送到 ${REPO_URL}${NC}"
    echo "BACKUP_STATUS=✅ 已备份 (${CHANGED_FILES} 个文件)"
fi

exit 0
