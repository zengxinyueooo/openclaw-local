#!/usr/bin/env python3
"""
🌤️ 天气查询小工具
随机生成的有趣代码～可以查任意城市天气！
"""

import sys
import urllib.request
import urllib.parse


def get_weather(city):
    """查询指定城市的天气"""
    # 对城市名进行 URL 编码
    encoded_city = urllib.parse.quote(city)
    
    # wttr.in API 地址
    url = f"https://wttr.in/{encoded_city}?format=3"
    
    try:
        # 发送请求
        with urllib.request.urlopen(url, timeout=10) as response:
            weather = response.read().decode('utf-8').strip()
            return weather
    except Exception as e:
        return f"查询失败啦: {e}"


def get_detailed_weather(city):
    """查询详细天气信息"""
    encoded_city = urllib.parse.quote(city)
    url = f"https://wttr.in/{encoded_city}?format=%l:+%c+%t+%h+%w"
    
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            weather = response.read().decode('utf-8').strip()
            return weather
    except Exception as e:
        return f"查询失败啦: {e}"


def main():
    """主函数"""
    print("🌤️ 欢迎使用天气查询工具！")
    print("-" * 30)
    
    # 获取城市名
    if len(sys.argv) > 1:
        city = sys.argv[1]
    else:
        city = input("请输入城市名: ").strip()
    
    if not city:
        print("城市名不能为空哦～")
        return
    
    print(f"\n正在查询 {city} 的天气...")
    print("-" * 30)
    
    # 查询天气
    result = get_detailed_weather(city)
    print(result)
    print("-" * 30)
    print("查询完成！🍑✨")


if __name__ == "__main__":
    main()
