import tkinter as tk
import sys
import os
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import subprocess

BASE_PORT = 13430

class ProxyHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/type':
            length = int(self.headers['Content-Length'])
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
                text = data.get('text', '').strip()
                target = data.get('target', ':0')
                
                print(f'[proxy] "{text}" -> {target}', flush=True)
                
                env = os.environ.copy()
                env['DISPLAY'] = target
                
                # 先获取当前窗口名字
                result = subprocess.run(
                    ['xdotool', 'getactivewindow', 'getwindowname'],
                    timeout=3,
                    env=env,
                    capture_output=True,
                    text=True
                )
                winname = result.stdout.strip().lower() if result.stdout else ''
                
                # 检查是否是终端或 VS Code
                is_terminal = any(x in winname for x in ['terminal', 'term', 'console', 'shell', 'bash', 'zsh', 'vscode', 'code'])
                
                if is_terminal:
                    # 终端/VS Code：使用剪贴板粘贴
                    print(f'[proxy] terminal/vscode detected: {winname}', flush=True)
                    subprocess.run(
                        ['bash', '-c', f'echo -n "$1" | xsel --clipboard --input', '_', text],
                        timeout=5,
                        env=env,
                        capture_output=True
                    )
                    import time
                    time.sleep(0.3)
                    subprocess.run(
                        ['xdotool', 'getactivewindow', 'windowfocus'],
                        timeout=5,
                        env=env,
                        capture_output=True
                    )
                    time.sleep(0.1)
                    subprocess.run(
                        ['xdotool', 'key', '--clearmodifiers', 'ctrl+v'],
                        timeout=5,
                        env=env,
                        capture_output=True
                    )
                    time.sleep(1)
                    # 发送 Enter
                    subprocess.run(
                        ['xdotool', 'key', 'Return'],
                        timeout=5,
                        env=env,
                        capture_output=True
                    )
                else:
                    # 非终端：先复制到剪贴板再粘贴
                    subprocess.run(
                        ['bash', '-c', f'echo -n "$1" | xsel --clipboard --input', '_', text],
                        timeout=5,
                        env=env,
                        capture_output=True
                    )
                    
                    import time
                    time.sleep(0.1)
                    
                    # 聚焦并粘贴 (尝试 Ctrl+V 和 Ctrl+Shift+V)
                    subprocess.run(
                        ['xdotool', 'getactivewindow', 'windowfocus'],
                        timeout=5,
                        env=env,
                        capture_output=True
                    )
                    
                    time.sleep(0.05)
                    
                    # 先尝试 Ctrl+V
                    subprocess.run(
                        ['xdotool', 'key', '--clearmodifiers', 'ctrl+v'],
                        timeout=5,
                        env=env,
                        capture_output=True
                    )
                    
                    time.sleep(0.05)
                    
                    # 如果没反应，尝试 Ctrl+Shift+V
                    subprocess.run(
                        ['xdotool', 'key', '--clearmodifiers', 'ctrl+shift+v'],
                        timeout=5,
                        env=env,
                        capture_output=True
                    )
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True}).encode())
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        pass

class MeasureWindow:
    def __init__(self, display_num):
        self.display_num = display_num
        self.cmd_port = 8100 + display_num
        
        self.root = tk.Tk()
        self.root.title("")
        self.root.geometry("150x150+30+30")
        self.root.attributes("-topmost", True)
        self.root.overrideredirect(True)
        
        self.drag_x = 0
        self.drag_y = 0
        self.resize_w = 0
        self.resize_h = 0
        self.resize_x = 0
        self.resize_y = 0
        self.resize_corner = ""
        
        self.setup_ui()
        self.bind_events()
        self.root.update_idletasks()
        self.root.after(100, self.update_info)
        
    def setup_ui(self):
        self.main_frame = tk.Frame(self.root, bg="#333333", highlightthickness=1, highlightbackground="gray")
        self.main_frame.pack(fill="both", expand=True)
        
        style = {"bg": "#00ff00", "fg": "black", "font": ("Arial", 8, "bold")}
        h = 14
        
        self.lbl_tl = tk.Label(self.main_frame, **style)
        self.lbl_tl.place(relx=0, rely=0, anchor="nw", height=h)
        
        self.lbl_tr = tk.Label(self.main_frame, **style)
        self.lbl_tr.place(relx=1, rely=0, anchor="ne", height=h)
        
        self.lbl_bl = tk.Label(self.main_frame, **style)
        self.lbl_bl.place(relx=0, rely=1, anchor="sw", height=h)
        
        self.lbl_br = tk.Label(self.main_frame, **style)
        self.lbl_br.place(relx=1, rely=1, anchor="se", height=h)
        
        self.lbl_size = tk.Label(
            self.main_frame, 
            text="WxH", 
            bg="#333333", 
            fg="yellow", 
            font=("Arial", 10, "bold")
        )
        self.lbl_size.place(relx=0.5, rely=0.5, anchor="center")
        
    def update_info(self):
        w = self.root.winfo_width()
        h = self.root.winfo_height()
        x = self.root.winfo_x()
        y = self.root.winfo_y()
        
        self.lbl_tl.config(text=f"{x},{y}")
        self.lbl_tr.config(text=f"{x+w},{y}")
        self.lbl_bl.config(text=f"{x},{y+h}")
        self.lbl_br.config(text=f"{x+w},{y+h}")
        self.lbl_size.config(text=f"{w}x{h}")
        
    def bind_events(self):
        def start_drag(e):
            self.drag_x = e.x
            self.drag_y = e.y
        def do_drag(e):
            nx = self.root.winfo_x() + (e.x - self.drag_x)
            ny = self.root.winfo_y() + (e.y - self.drag_y)
            nx = max(0, nx)
            ny = max(0, ny)
            self.root.geometry(f"+{nx}+{ny}")
            self.update_info()
            
        self.main_frame.bind("<Button-1>", start_drag)
        self.main_frame.bind("<B1-Motion>", do_drag)
        self.lbl_size.bind("<Button-1>", start_drag)
        self.lbl_size.bind("<B1-Motion>", do_drag)
        
        def start_resize(corner):
            def handler(e):
                self.resize_w = self.root.winfo_width()
                self.resize_h = self.root.winfo_height()
                self.resize_x = e.x_root
                self.resize_y = e.y_root
                self.resize_corner = corner
            return handler
        def do_resize(e):
            corner = self.resize_corner
            nw = self.resize_w + (e.x_root - self.resize_x)
            nh = self.resize_h + (e.y_root - self.resize_y)
            nx = self.root.winfo_x()
            ny = self.root.winfo_y()
            
            if nw >= 100 and nh >= 100:
                if corner in ("tl", "bl"):
                    nx = max(0, self.root.winfo_x() - (nw - self.resize_w))
                if corner in ("tl", "tr"):
                    ny = max(0, self.root.winfo_y() - (nh - self.resize_h))
                self.root.geometry(f"{nw}x{nh}+{nx}+{ny}")
                self.update_info()
                
        self.lbl_tl.bind("<Button-1>", start_resize("tl"))
        self.lbl_tl.bind("<B1-Motion>", do_resize)
        self.lbl_tr.bind("<Button-1>", start_resize("tr"))
        self.lbl_tr.bind("<B1-Motion>", do_resize)
        self.lbl_bl.bind("<Button-1>", start_resize("bl"))
        self.lbl_bl.bind("<B1-Motion>", do_resize)
        self.lbl_br.bind("<Button-1>", start_resize("br"))
        self.lbl_br.bind("<B1-Motion>", do_resize)
        
    def update_positions(self):
        self.update_info()
        
    def run(self):
        self.root.mainloop()

def get_display():
    for i, arg in enumerate(sys.argv):
        if arg in ['--display', '-d'] and i + 1 < len(sys.argv):
            return sys.argv[i + 1]
        if arg.startswith('--display='):
            return arg.split('=')[1]
    return ':1'

def start_proxy(port):
    server = HTTPServer(('0.0.0.0', port), ProxyHandler)
    print(f'🚀 Proxy on :{port}')
    server.serve_forever()

if __name__ == "__main__":
    display = get_display()
    os.environ['DISPLAY'] = display
    num = int(display.split(':')[1] if ':' in display else '1')
    port = BASE_PORT + num
    
    print(f'Starting {display} -> port {port}')
    
    threading.Thread(target=lambda: start_proxy(port), daemon=True).start()
    MeasureWindow(num).run()
