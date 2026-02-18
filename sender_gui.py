#!/usr/bin/env python3
"""GUI sender to test the measure_window proxy API"""

import tkinter as tk
import requests
import json

API_TOKEN = "6568a729f18c9903038ff71e70aa1685888d9e8f4ca34419b9a5d9cf784ffdf1"
BASE_PORT = 13430

def get_port(display_num):
    return BASE_PORT + display_num

def send_text():
    display = entry.get().strip()
    text = text_box.get("1.0", tk.END).strip()
    
    if not display.startswith(':'):
        display = ':' + display
    
    try:
        display_num = int(display.split(':')[1])
        port = get_port(display_num)
    except:
        result_label.config(text=f"Invalid display: {display}", fg="red")
        return
    
    url = f"http://localhost:{port}/api/type"
    
    try:
        resp = requests.post(url, json={"text": text, "target": display}, timeout=10)
        data = resp.json()
        
        if data.get("success"):
            result_label.config(text=f"✓ Sent to {display}: {text[:30]}...", fg="green")
        else:
            result_label.config(text=f"Error: {data.get('error')}", fg="red")
    except Exception as e:
        result_label.config(text=f"Failed: {e}", fg="red")

# GUI
root = tk.Tk()
root.title("VNC Text Sender")
root.geometry("400x250")

tk.Label(root, text="Display (:1, :2, etc):").pack(pady=5)
entry = tk.Entry(root, width=20)
entry.insert(0, ":2")
entry.pack()

tk.Label(root, text="Text to send:").pack(pady=5)
text_box = tk.Text(root, height=5, width=40)
text_box.insert("1.0", "test")
text_box.pack()

btn = tk.Button(root, text="Send", command=send_text, bg="blue", fg="white")
btn.pack(pady=10)

result_label = tk.Label(root, text="", fg="green")
result_label.pack()

root.mainloop()
