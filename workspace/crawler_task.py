#!/usr/bin/env python3
"""
网页爬虫任务 - 下载10个网页并分析标题和字数
"""

import requests
import time
import re
from html.parser import HTMLParser

# 10个要下载的网页URL
urls = [
    "https://www.example.com",
    "https://www.wikipedia.org",
    "https://www.github.com",
    "https://www.stackoverflow.com",
    "https://www.python.org",
    "https://www.mozilla.org",
    "https://www.apple.com",
    "https://www.google.com",
    "https://www.microsoft.com",
    "https://www.amazon.com"
]

class TitleParser(HTMLParser):
    """HTML解析器，用于提取标题"""
    def __init__(self):
        super().__init__()
        self.in_title = False
        self.title = ""
    
    def handle_starttag(self, tag, attrs):
        if tag.lower() == 'title':
            self.in_title = True
    
    def handle_endtag(self, tag):
        if tag.lower() == 'title':
            self.in_title = False
    
    def handle_data(self, data):
        if self.in_title:
            self.title += data

def extract_title(html):
    """从HTML中提取标题"""
    parser = TitleParser()
    try:
        parser.feed(html)
        return parser.title.strip() if parser.title.strip() else "无标题"
    except:
        # 备用方案：使用正则
        match = re.search(r'<title[^>]*>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
        return match.group(1).strip() if match else "无法提取标题"

def download_and_analyze():
    """下载网页并分析"""
    results = []
    success_count = 0
    
    print("🍑 开始下载网页任务...\n")
    
    for i, url in enumerate(urls, 1):
        print(f"[{i}/10] 正在下载: {url}")
        
        try:
            # 设置超时和请求头
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0'
            }
            response = requests.get(url, headers=headers, timeout=15, allow_redirects=True)
            response.raise_for_status()
            
            # 获取内容
            html = response.text
            title = extract_title(html)
            char_count = len(html)
            
            result = {
                'url': url,
                'title': title,
                'char_count': char_count,
                'status': '成功'
            }
            success_count += 1
            
            print(f"   ✓ 标题: {title[:50]}{'...' if len(title) > 50 else ''}")
            print(f"   ✓ 字数: {char_count:,} 字符\n")
            
        except Exception as e:
            result = {
                'url': url,
                'title': f"下载失败: {str(e)[:50]}",
                'char_count': 0,
                'status': '失败'
            }
            print(f"   ✗ 失败: {str(e)[:80]}\n")
        
        results.append(result)
        
        # 间隔2秒（最后一个不需要等待）
        if i < len(urls):
            print("   ⏳ 等待2秒...")
            time.sleep(2)
    
    # 汇总报告
    print("=" * 60)
    print("📊 任务完成汇总")
    print("=" * 60)
    print(f"总网页数: {len(urls)}")
    print(f"成功下载: {success_count}")
    print(f"下载失败: {len(urls) - success_count}")
    print("\n详细结果:")
    
    for r in results:
        status_icon = "✓" if r['status'] == '成功' else "✗"
        print(f"  {status_icon} {r['url']}")
        print(f"     标题: {r['title'][:40]}{'...' if len(r['title']) > 40 else ''}")
        print(f"     字数: {r['char_count']:,} 字符")
    
    print(f"\n🍑 任务完成！成功下载了 {success_count} 个网页~")
    return success_count

if __name__ == "__main__":
    download_and_analyze()
