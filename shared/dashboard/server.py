#!/usr/bin/env python3
"""
Agent监控看板服务器
提供API接口供前端获取进度数据
"""

import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

PROGRESS_DIR = Path.home() / ".openclaw" / "shared" / "progress"
DASHBOARD_DIR = Path.home() / ".openclaw" / "shared" / "dashboard"

class DashboardHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # 简化日志输出
        pass
    
    def do_GET(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        if path == '/api/progress':
            self.handle_progress_api()
        elif path == '/':
            self.handle_index()
        else:
            self.handle_static(path)
    
    def handle_progress_api(self):
        """返回所有Agent进度"""
        progress_list = []
        
        if PROGRESS_DIR.exists():
            for f in PROGRESS_DIR.glob("*.json"):
                try:
                    with open(f, 'r', encoding='utf-8') as fp:
                        progress_list.append(json.load(fp))
                except Exception as e:
                    print(f"读取进度文件失败 {f}: {e}")
        
        # 按时间排序
        progress_list.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        
        self.send_json_response(progress_list)
    
    def handle_index(self):
        """返回主页"""
        index_file = DASHBOARD_DIR / "index.html"
        if index_file.exists():
            self.send_file_response(index_file, 'text/html')
        else:
            self.send_error_response(404, "Dashboard not found")
    
    def handle_static(self, path):
        """处理静态文件"""
        # 安全处理路径
        safe_path = path.lstrip('/')
        file_path = DASHBOARD_DIR / safe_path
        
        # 确保文件在dashboard目录内
        try:
            file_path.resolve().relative_to(DASHBOARD_DIR.resolve())
        except ValueError:
            self.send_error_response(403, "Forbidden")
            return
        
        if file_path.exists() and file_path.is_file():
            content_type = self.get_content_type(file_path.suffix)
            self.send_file_response(file_path, content_type)
        else:
            self.send_error_response(404, "Not found")
    
    def get_content_type(self, suffix):
        """获取文件类型"""
        types = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.gif': 'image/gif',
        }
        return types.get(suffix, 'application/octet-stream')
    
    def send_json_response(self, data):
        """发送JSON响应"""
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
    
    def send_file_response(self, file_path, content_type):
        """发送文件响应"""
        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error_response(500, str(e))
    
    def send_error_response(self, code, message):
        """发送错误响应"""
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode())


def run_server(port=8080):
    """启动服务器"""
    import os
    import signal
    
    server = HTTPServer(('localhost', port), DashboardHandler)
    
    # 保存PID文件
    pid_file = PROGRESS_DIR / "dashboard.pid"
    pid_file.parent.mkdir(parents=True, exist_ok=True)
    with open(pid_file, 'w') as f:
        f.write(str(os.getpid()))
    
    print(f"🍑 水果Agent监控看板已启动!")
    print(f"📊 访问地址: http://localhost:{port}")
    print(f"📡 API地址: http://localhost:{port}/api/progress")
    print(f"📝 PID文件: {pid_file}")
    print(f"🛑 按 Ctrl+C 停止")
    
    def signal_handler(sig, frame):
        print("\n👋 收到停止信号，正在关闭...")
        if pid_file.exists():
            pid_file.unlink()
        server.shutdown()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 服务器已停止")
        server.shutdown()
        if pid_file.exists():
            pid_file.unlink()


if __name__ == '__main__':
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    run_server(port)

