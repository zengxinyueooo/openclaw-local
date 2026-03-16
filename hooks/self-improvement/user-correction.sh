#!/bin/bash
# User Correction Hook for OpenClaw
# Triggers when user corrects the agent

set -e

# Output reminder as system context
cat << 'EOF'
<self-improvement-correction>
🍑 宝宝纠正了小桃！需要立即记录到 PITFALLS.md

记录格式：
## [COR-YYYYMMDD-XXX] 简短描述

**发生时间**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
**宝宝纠正**: [纠正内容]
**小桃错误**: [哪里做错了]
**正确做法**: [应该怎么做]
**预防措施**: [下次如何避免]

处理流程：
1. 立即反思错误原因
2. 记录到 PITFALLS.md
3. 经宝宝同意后加入 MEMORY.md

参考：PITFALLS.md 中的"错误反思规则"
</self-improvement-correction>
EOF
