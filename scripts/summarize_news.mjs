#!/usr/bin/env node
// 小葡🍇的AI新闻整理脚本
// 读取Tavily搜索结果，整理成简洁摘要

import { readFileSync } from 'fs';

const rawFile = process.argv[2] || '/tmp/ai_news_raw.txt';

try {
  const content = readFileSync(rawFile, 'utf-8');
  
  // 提取Answer部分
  const answerMatch = content.match(/## Answer\n\n([\s\S]+?)(?=\n\n---|$)/);
  const answer = answerMatch ? answerMatch[1].trim() : '暂无摘要';
  
  // 提取Sources
  const sourcesMatch = content.match(/## Sources\n\n([\s\S]+)/);
  const sourcesSection = sourcesMatch ? sourcesMatch[1] : '';
  
  // 解析每条新闻
  const sourceBlocks = sourcesSection.split(/\n\n- \*\*/).filter(Boolean);
  const newsItems = sourceBlocks.map(block => {
    const titleMatch = block.match(/\*\*(.+?)\*\*/);
    const urlMatch = block.match(/(https?:\/\/[^\s]+)/);
    const relevanceMatch = block.match(/relevance: (\d+)%/);
    
    return {
      title: titleMatch ? titleMatch[1] : '未知标题',
      url: urlMatch ? urlMatch[1] : '',
      relevance: relevanceMatch ? relevanceMatch[1] : '0'
    };
  });

  // 输出整理后的格式
  console.log('📰 AI新闻摘要\n');
  console.log('【概述】');
  console.log(answer);
  console.log('\n【详细来源】');
  newsItems.forEach((item, index) => {
    console.log(`${index + 1}. ${item.title}`);
    console.log(`   相关度: ${item.relevance}% | ${item.url}\n`);
  });
  
} catch (err) {
  console.error('读取新闻文件失败:', err.message);
  process.exit(1);
}
