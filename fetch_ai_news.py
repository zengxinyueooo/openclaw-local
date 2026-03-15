#!/usr/bin/env python3
"""
🍇 小葡的 AI 新闻爬虫
爬取最新的 AI 新闻标题
"""

import urllib.request
import urllib.parse
import re
import ssl

# 忽略 SSL 证书验证
ssl._create_default_https_context = ssl._create_unverified_context

def fetch_bing_news():
    """从 Bing 新闻搜索获取 AI 相关新闻"""
    query = urllib.parse.quote("人工智能 AI 最新")
    url = f"https://www.bing.com/news/search?q={query}"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
    
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as response:
            html = response.read().decode('utf-8', errors='ignore')
            
            # 提取新闻标题
            # Bing 新闻标题通常在 class="title" 的 a 标签中
            titles = re.findall(r'<a[^>]*class="title"[^>]*>([^<]+)</a>', html)
            
            return titles[:10]  # 返回前10条
    except Exception as e:
        return [f"获取新闻失败: {e}"]


def fetch_hacker_news():
    """从 Hacker News 获取热门 AI 相关新闻"""
    url = "https://hn.algolia.com/api/v1/search?query=artificial+intelligence&hitsPerPage=10"
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=15) as response:
            import json
            data = json.loads(response.read().decode('utf-8'))
            
            titles = []
            for hit in data.get('hits', []):
                title = hit.get('title', '')
                if title:
                    titles.append(title)
            
            return titles[:10]
    except Exception as e:
        return [f"获取 HN 新闻失败: {e}"]


def main():
    print("🍇 小葡正在为您搜集 AI 新闻...")
    print("=" * 50)
    
    print("\n📰 来自 Bing 新闻:")
    print("-" * 50)
    bing_news = fetch_bing_news()
    for i, title in enumerate(bing_news, 1):
        print(f"{i}. {title}")
    
    print("\n🔥 来自 Hacker News:")
    print("-" * 50)
    hn_news = fetch_hacker_news()
    for i, title in enumerate(hn_news, 1):
        print(f"{i}. {title}")
    
    print("\n" + "=" * 50)
    print("🍇 新闻搜集完成！")


if __name__ == "__main__":
    main()
