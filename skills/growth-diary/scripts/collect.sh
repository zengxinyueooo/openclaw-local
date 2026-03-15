#!/bin/bash
# 成长沉淀 - 收集脚本 🍑✨
# 功能：收集当日对话内容，生成成长日记

set -e

# 配置
MEMORY_DIR="${HOME}/.openclaw/workspace/memory"
TEMPLATE_FILE="${HOME}/.openclaw/workspace/skills/growth-diary/templates/diary.md"
DATE=$(date +%Y-%m-%d)
WEEKDAY=$(date +%A)
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
DIARY_FILE="${MEMORY_DIR}/${DATE}.md"

# 确保目录存在
mkdir -p "$MEMORY_DIR"

# 计算第几天
calculate_day_number() {
    local count=1
    if [ -d "$MEMORY_DIR" ]; then
        count=$(ls -1 "$MEMORY_DIR"/*.md 2>/dev/null | wc -l)
        count=$((count + 1))
    fi
    echo "$count"
}

# 获取 Git 变更统计
get_git_changes() {
    cd "${HOME}/.openclaw"
    
    # 获取修改的文件
    MODIFIED=$(git diff --name-only 2>/dev/null || echo "")
    
    # 获取新增的文件
    NEW_FILES=$(git ls-files --others --exclude-standard 2>/dev/null || echo "")
    
    # 获取删除的文件
    DELETED=$(git diff --name-only --diff-filter=D 2>/dev/null || echo "")
    
    echo "${MODIFIED}|${NEW_FILES}|${DELETED}"
}

# 主函数
main() {
    local day_number=$(calculate_day_number)
    local changes=$(get_git_changes)
    local modified=$(echo "$changes" | cut -d'|' -f1)
    local new=$(echo "$changes" | cut -d'|' -f2)
    local deleted=$(echo "$changes" | cut -d'|' -f3)
    
    # 格式化文件列表
    format_files() {
        local files="$1"
        if [ -z "$files" ]; then
            echo "- 无"
        else
            echo "$files" | sed 's/^/- /'
        fi
    }
    
    # 生成日记内容
    cat > "$DIARY_FILE" << EOF
# 第 ${day_number} 天：待宝宝补充总结

宝宝成长日记 · 第 ${day_number} 天 🍑✨

---

## 📅 今日概览

| 项目 | 内容 |
|------|------|
| 日期 | ${DATE} |
| 星期 | ${WEEKDAY} |
| 对话轮数 | 待统计 |
| 主要任务 | 待补充 |

---

## 🕳️ 踩坑记录

<!-- 桃桃会在这里记录宝宝踩过的坑 -->

### 坑点一：待补充
- **现象**：
- **原因**：
- **解决**：
- **教训**：

---

## 🌱 成长收获

<!-- 桃桃会在这里记录宝宝的成长 -->

- 

---

## 🍑 桃桃点评

宝宝今天超棒的！继续加油呀～✨

---

## 📎 相关文件

### 修改的文件
$(format_files "$modified")

### 新增的文件
$(format_files "$new")

### 删除的文件
$(format_files "$deleted")

---

*沉淀时间：${TIMESTAMP}*
*备份状态：待备份*
EOF

    echo "✅ 日记模板已生成：${DIARY_FILE}"
    echo "DAY_NUMBER=${day_number}"
}

main "$@"
