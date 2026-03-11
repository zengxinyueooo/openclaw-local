#!/usr/bin/env python3
"""
小红书 Mac App 自动化登录脚本 🍠✨
使用 PyAutoGUI 控制 Mac App
"""

import subprocess
import time
import sys

def get_app_window():
    """获取小红书 App 窗口位置"""
    # 使用 AppleScript 获取窗口位置
    script = '''
    tell application "System Events"
        tell process "rednote"
            return {position, size} of window 1
        end tell
    end tell
    '''
    try:
        result = subprocess.run(['osascript', '-e', script], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            # 解析输出
            return result.stdout.strip()
    except Exception as e:
        print(f"获取窗口失败: {e}")
    return None

def click_login_button():
    """点击登录按钮"""
    # 这里需要根据实际界面坐标点击
    # 先截图看看界面
    print("请确保小红书 App 已打开并显示登录界面")
    print("由于安全限制，需要手动操作：")
    print("1. 点击【手机号登录】")
    print("2. 输入手机号")
    print("3. 点击【获取验证码】")
    print("4. 输入验证码")
    print("5. 点击【登录】")

if __name__ == "__main__":
    print("🍠 小红书 Mac App 登录助手")
    print("=" * 40)
    
    # 检查 App 是否运行
    result = subprocess.run(['pgrep', '-x', 'rednote'], capture_output=True)
    if result.returncode != 0:
        print("⚠️  小红书 App 未运行，正在启动...")
        subprocess.run(['open', '-a', 'rednote'])
        time.sleep(3)
    
    # 获取窗口信息
    window = get_app_window()
    if window:
        print(f"✅ 找到窗口: {window}")
    else:
        print("⚠️  无法获取窗口信息（需要辅助功能权限）")
    
    print("\n💡 由于 macOS 安全限制，自动化需要：")
    print("   1. 系统偏好设置 → 安全性与隐私 → 辅助功能")
    print("   2. 添加 Terminal 或 Python 到允许列表")
    print("\n📝 请手动完成登录流程")
