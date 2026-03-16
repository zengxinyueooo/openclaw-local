#!/usr/bin/env python3
"""
在 sandbox 中注入 cookie 到 Chromium
"""
import json
import os
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def wait_for_cdp(host="127.0.0.1", port=9222, timeout=30):
    """等待 Chrome DevTools Protocol 可用"""
    import socket
    start = time.time()
    while time.time() - start < timeout:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            result = sock.connect_ex((host, port))
            sock.close()
            if result == 0:
                return True
        except:
            pass
        time.sleep(1)
    return False

def get_cdp_connection():
    """获取 CDP WebSocket 连接"""
    import requests
    import websocket

    resp = requests.get("http://127.0.0.1:9222/json")
    pages = resp.json()

    if not pages:
        print("❌ 没有找到浏览器页面")
        return None, None

    ws_url = pages[0]["webSocketDebuggerUrl"]
    print(f"连接到: {ws_url}")

    ws = websocket.create_connection(ws_url)
    return ws, ws_url

def inject_cookies(cookies, ws):
    """通过 CDP 注入 cookie"""
    success_count = 0
    for i, cookie in enumerate(cookies):
        params = {
            "name": cookie["name"],
            "value": cookie["value"],
            "domain": cookie.get("domain", ".sankuai.com"),
            "path": cookie.get("path", "/"),
            "secure": cookie.get("secure", True),
            "httpOnly": cookie.get("httpOnly", True)
        }

        ws.send(json.dumps({
            "id": i + 1,
            "method": "Network.setCookie",
            "params": params
        }))

        result = json.loads(ws.recv())
        if result.get("result", {}).get("success", False):
            success_count += 1
            if any(key in cookie["name"].lower() for key in ["sso", "citadel", "misid"]):
                print(f"  ✓ {cookie['name']}")
        else:
            print(f"  ✗ {cookie['name']}: {result}")

    return success_count

def query_all_cookies(ws, filter_domain=None):
    """查询浏览器中的所有 cookie"""
    print("\n📋 查询浏览器中的所有 cookie...")
    
    ws.send(json.dumps({
        "id": 9999,
        "method": "Network.getAllCookies"
    }))
    
    result = json.loads(ws.recv())
    all_cookies = result.get("result", {}).get("cookies", [])
    
    if filter_domain:
        all_cookies = [c for c in all_cookies if filter_domain in c.get("domain", "")]
    
    print(f"\n共找到 {len(all_cookies)} 个 cookie" + (f" (过滤域名: {filter_domain})" if filter_domain else ""))
    print("-" * 80)
    
    cookies_by_domain = {}
    for cookie in all_cookies:
        domain = cookie.get("domain", "unknown")
        if domain not in cookies_by_domain:
            cookies_by_domain[domain] = []
        cookies_by_domain[domain].append(cookie)
    
    for domain in sorted(cookies_by_domain.keys()):
        print(f"\n🌐 {domain}")
        for cookie in cookies_by_domain[domain]:
            name = cookie.get("name", "")
            value = cookie.get("value", "")
            display_value = value[:50] + "..." if len(value) > 50 else value
            http_only = "🔒" if cookie.get("httpOnly") else "  "
            secure = "🔐" if cookie.get("secure") else "  "
            print(f"  {http_only}{secure} {name} = {display_value}")
    
    print("-" * 80)
    return all_cookies

def main():
    # 查找 cookies.json - 优先使用同目录下的文件
    possible_paths = [
        os.path.join(SCRIPT_DIR, "cookies.json"),
        "./cookies.json",
        "/tmp/cookies.json",
        "/root/cookies.json",
    ]

    cookie_file = None
    for path in possible_paths:
        if os.path.exists(path):
            cookie_file = path
            break

    if not cookie_file:
        print("❌ 找不到 cookies.json 文件")
        print("   请确保文件在以下位置之一:")
        for p in possible_paths:
            print(f"   - {p}")
        sys.exit(1)

    print(f"读取: {cookie_file}")
    with open(cookie_file, "r", encoding="utf-8") as f:
        cookies = json.load(f)

    print(f"共 {len(cookies)} 个 cookie")

    # 检查依赖
    try:
        import requests
        import websocket
    except ImportError:
        print("\n安装依赖...")
        os.system("pip3 install requests websocket-client")
        import requests
        import websocket

    # 等待 CDP
    print("\n等待 Chromium CDP 就绪...")
    if not wait_for_cdp():
        print("❌ Chromium CDP 未就绪，请确保 Chromium 正在运行")
        sys.exit(1)

    # 获取 CDP 连接
    ws, ws_url = get_cdp_connection()
    if not ws:
        sys.exit(1)

    try:
        print("注入 cookie...")
        count = inject_cookies(cookies, ws)

        print(f"\n✅ 成功注入 {count}/{len(cookies)} 个 cookie")
        
        query_all_cookies(ws, filter_domain="sankuai.com")
        
        print("\n提示: 如果还是被拦截，可能需要刷新页面或清除浏览器缓存后重试")
    finally:
        ws.close()

if __name__ == "__main__":
    main()
