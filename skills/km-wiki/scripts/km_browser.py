#!/usr/bin/env python3
"""
学城(KM)浏览器操作辅助脚本
用法:
    python km_browser.py navigate <url>       # 导航到指定URL
    python km_browser.py content              # 获取页面文本内容
    python km_browser.py tables               # 获取所有表格数据(JSON)
    python km_browser.py screenshot <path>    # 截图保存到指定路径
    python km_browser.py check                # 检查浏览器和页面状态
"""

import sys
import json
import base64
import time
import urllib.request

def get_cdp_url():
    """获取可用的 CDP WebSocket URL"""
    try:
        tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json/list", timeout=5).read())
        # 优先选择 km.sankuai.com 页面
        for t in tabs:
            if t.get('type') == 'page' and 'km.sankuai.com' in t.get('url', ''):
                return t['webSocketDebuggerUrl'], t
        # 否则选择任意 page 类型
        for t in tabs:
            if t.get('type') == 'page':
                return t['webSocketDebuggerUrl'], t
        return None, None
    except Exception as e:
        return None, None

def send_cdp(ws_url, method, params=None):
    """发送 CDP 命令"""
    import websocket
    ws = websocket.create_connection(ws_url, timeout=30)
    cmd = {"id": 1, "method": method}
    if params:
        cmd["params"] = params
    ws.send(json.dumps(cmd))
    result = json.loads(ws.recv())
    ws.close()
    return result

def navigate(url):
    """导航到指定 URL"""
    ws_url, tab = get_cdp_url()
    if not ws_url:
        print(json.dumps({"error": "No browser tab available"}))
        return False
    
    result = send_cdp(ws_url, "Page.navigate", {"url": url})
    if 'error' in result:
        print(json.dumps({"error": result['error']}))
        return False
    
    print(json.dumps({"success": True, "frameId": result.get('result', {}).get('frameId')}))
    return True

def get_content():
    """获取页面文本内容"""
    ws_url, tab = get_cdp_url()
    if not ws_url:
        print(json.dumps({"error": "No browser tab available"}))
        return
    
    js = """
    (function() {
        const content = document.querySelector('.ct-editor-content');
        const title = document.title;
        const url = window.location.href;
        const text = content ? content.innerText : document.body.innerText;
        return JSON.stringify({title, url, text});
    })()
    """
    result = send_cdp(ws_url, "Runtime.evaluate", {"expression": js, "returnByValue": True})
    value = result.get('result', {}).get('result', {}).get('value')
    if value:
        print(value)
    else:
        print(json.dumps({"error": "Failed to get content", "raw": result}))

def get_tables():
    """获取所有表格数据"""
    ws_url, tab = get_cdp_url()
    if not ws_url:
        print(json.dumps({"error": "No browser tab available"}))
        return
    
    js = """
    (function() {
        return JSON.stringify(Array.from(document.querySelectorAll('table')).map((t, i) => ({
            index: i,
            headers: Array.from(t.querySelectorAll('th, thead td')).map(th => th.textContent.trim()),
            rows: Array.from(t.querySelectorAll('tbody tr, tr')).slice(1).map(tr => 
                Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
            )
        })));
    })()
    """
    result = send_cdp(ws_url, "Runtime.evaluate", {"expression": js, "returnByValue": True})
    value = result.get('result', {}).get('result', {}).get('value')
    if value:
        print(value)
    else:
        print(json.dumps({"error": "Failed to get tables", "raw": result}))

def screenshot(path):
    """截图并保存"""
    ws_url, tab = get_cdp_url()
    if not ws_url:
        print(json.dumps({"error": "No browser tab available"}))
        return False
    
    result = send_cdp(ws_url, "Page.captureScreenshot", {"format": "png"})
    if 'result' in result and 'data' in result['result']:
        img_data = base64.b64decode(result['result']['data'])
        with open(path, 'wb') as f:
            f.write(img_data)
        print(json.dumps({"success": True, "path": path, "size": len(img_data)}))
        return True
    else:
        print(json.dumps({"error": "Screenshot failed", "raw": result}))
        return False

def check():
    """检查浏览器状态"""
    try:
        version = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json/version", timeout=5).read())
        tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json/list", timeout=5).read())
        
        km_tabs = [t for t in tabs if 'km.sankuai.com' in t.get('url', '')]
        sso_tabs = [t for t in tabs if 'ssosv.sankuai.com' in t.get('url', '') or 'Login' in t.get('title', '')]
        
        status = {
            "browser": version.get('Browser'),
            "tabs_count": len(tabs),
            "km_tabs": len(km_tabs),
            "sso_detected": len(sso_tabs) > 0,
            "current_urls": [t.get('url', '')[:80] for t in tabs if t.get('type') == 'page']
        }
        
        if sso_tabs:
            status["warning"] = "SSO login page detected - need to inject cookie"
        
        print(json.dumps(status, indent=2))
    except Exception as e:
        print(json.dumps({"error": f"Browser not available: {e}"}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    cmd = sys.argv[1]
    
    if cmd == "navigate" and len(sys.argv) >= 3:
        navigate(sys.argv[2])
    elif cmd == "content":
        get_content()
    elif cmd == "tables":
        get_tables()
    elif cmd == "screenshot" and len(sys.argv) >= 3:
        screenshot(sys.argv[2])
    elif cmd == "check":
        check()
    else:
        print(__doc__)
        sys.exit(1)
