#!/bin/bash
# Auto-start measure_window for all VNC displays

SCRIPT="/home/w3c_offical/projects/vnc-proxy/measure_window.py"
BASE_PORT=13430
DISPLAYS=(":1" ":2" ":3" ":4")

for display in "${DISPLAYS[@]}"; do
    port=$((BASE_PORT + ${display#:}))
    
    # Check if already running
    if ! nc -z localhost $port 2>/dev/null; then
        echo "Starting measure_window for $display on port $port"
        nohup /usr/bin/python3 "$SCRIPT" --display $display > /tmp/measure_$port.log 2>&1 &
    else
        echo "measure_window for $display already running on port $port"
    fi
done
