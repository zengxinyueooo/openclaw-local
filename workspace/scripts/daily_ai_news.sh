#!/bin/bash
# 每日AI新闻抓取脚本
# 每天早上10点执行

DATE=$(date +%Y-%m-%d)
LOG_FILE="/Users/zengxinyue/.openclaw/workspace/logs/ai_news_${DATE}.log"
TAVILY_KEY="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"

# 创建日志目录
mkdir -p /Users/zengxinyue/.openclaw/workspace/logs

echo "[$(date)] 开始抓取AI新闻..." >> "$LOG_FILE"

# 使用Tavily skill抓取AI新闻
export TAVILY_API_KEY="$TAVILY_KEY"
cd /Users/zengxinyue/.openclaw/skills/tavily-search
node scripts/search.mjs "AI人工智能最新新闻" --topic news -n 10 > /tmp/ai_news_raw.txt 2>> "$LOG_FILE"

# 检查抓取结果并整理
if [ -f /tmp/ai_news_raw.txt ]; then
    echo "[$(date)] 新闻抓取完成，开始整理摘要..." >> "$LOG_FILE"
    
    # 使用Node脚本整理摘要
    node /Users/zengxinyue/.openclaw/workspace/scripts/summarize_news.mjs /tmp/ai_news_raw.txt > /tmp/ai_news_summary.txt 2>> "$LOG_FILE"
    
    if [ -f /tmp/ai_news_summary.txt ]; then
        echo "[$(date)] 摘要整理完成" >> "$LOG_FILE"
        # 保存到workspace供查看
        cp /tmp/ai_news_summary.txt "/Users/zengxinyue/.openclaw/workspace/logs/ai_news_summary_${DATE}.txt"
        
        # 发送消息给宝宝（通过小桃）- 待daxiang认证后启用
        # cat /tmp/ai_news_summary.txt | openclaw message send --to zengxinyue04
    else
        echo "[$(date)] 摘要整理失败" >> "$LOG_FILE"
    fi
else
    echo "[$(date)] 新闻抓取失败" >> "$LOG_FILE"
fi

echo "[$(date)] AI新闻抓取任务结束" >> "$LOG_FILE"