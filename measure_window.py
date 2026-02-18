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
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("")
        self.root.geometry("100x100+0+0")
        self.root.attributes("-topmost", True)
        self.root.overrideredirect(True)
        
        self.dragging = False
        self.drag_start_x = 0
        self.drag_start_y = 0
        self.win_start_x = 0
        self.win_start_y = 0
        
        self.setup_ui()
        self.bind_events()
        self.update_positions()
        
    def setup_ui(self):
        self.frame = tk.Frame(self.root, bg="#333333", relief="raised", bd=1)
        self.frame.pack(fill="both", expand=True)
        
        self.lbl_tl = tk.Label(self.frame, text="TL: 0,0", bg="#333333", fg="white", font=("Arial", 8))
        self.lbl_tl.place(x=2, y=2)
        
        self.lbl_tr = tk.Label(self.frame, text="TR: 0,0", bg="#333333", fg="white", font=("Arial", 8))
        self.lbl_tr.place(x=2, y=2, anchor="ne")
        
        self.lbl_bl = tk.Label(self.frame, text="BL: 0,0", bg="#333333", fg="white", font=("Arial", 8))
        self.lbl_bl.place(x=2, y=2, anchor="sw")
        
        self.lbl_br = tk.Label(self.frame, text="BR: 0,0", bg="#333333", fg="white", font=("Arial", 8))
        self.lbl_br.place(x=2, y=2, anchor="se")
        
        self.lbl_center = tk.Label(self.frame, text="100x100", bg="#333333", fg="yellow", font=("Arial", 10, "bold"))
        self.lbl_center.place(relx=0.5, rely=0.5, anchor="center")
        
    def bind_events(self):
        self.frame.bind("<Button-1>", self.on_click)
        self.frame.bind("<B1-Motion>", self.on_drag)
        self.frame.bind("<ButtonRelease-1>", self.on_release)
        
        for widget in [self.lbl_tl, self.lbl_tr, self.lbl_bl, self.lbl_br, self.lbl_center]:
            widget.bind("<Button-1>", self.on_click)
            widget.bind("<B1-Motion>", self.on_drag)
            widget.bind("<ButtonRelease-1>", self.on_release)
            
    def on_click(self, event):
        self.dragging = True
        self.drag_start_x = event.x
        self.drag_start_y = event.y
        self.win_start_x = self.root.winfo_x()
        self.win_start_y = self.root.winfo_y()
        
    def on_drag(self, event):
        if self.dragging:
            dx = event.x - self.drag_start_x
            dy = event.y - self.drag_start_y
            new_x = self.win_start_x + dx
            new_y = self.win_start_y + dy
            self.root.geometry(f"+{new_x}+{new_y}")
            self.update_positions()
            
    def on_release(self, event):
        self.dragging = False
        
    def update_positions(self):
        x = self.root.winfo_x()
        y = self.root.winfo_y()
        w = self.root.winfo_width()
        h = self.root.winfo_height()
        
        self.lbl_tl.config(text=f"TL: {x},{y}")
        self.lbl_tr.config(text=f"TR: {x+w},{y}")
        self.lbl_bl.config(text=f"BL: {x},{y+h}")
        self.lbl_br.config(text=f"BR: {x+w},{y+h}")
        self.lbl_center.config(text=f"{w}x{h}")
        
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
    num = int(display.split(':')[1] if ':' in display else '1')
    port = BASE_PORT + num
    
    print(f'Starting {display} -> port {port}')
    
    threading.Thread(target=lambda: start_proxy(port), daemon=True).start()
    MeasureWindow().run()
