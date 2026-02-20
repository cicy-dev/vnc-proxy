#!/bin/bash
# Auto-start measure_window for all VNC displays

SCRIPT="/home/w3c_offical/projects/vnc-proxy/measure_window.py"
BASE_PORT=13430
DISPLAYS=(":1" ":2" ":3" ":4")

for display in "${DISPLAYS[@]}"; do
    port=$((BASE_PORT + ${display#:}))
    
    # Check if port is in use, kill existing process if so
    if nc -z localhost $port 2>/dev/null; then
        echo "Port $port in use, killing existing process..."
        pid=$(lsof -t -i:$port 2>/dev/null)
        if [ -n "$pid" ]; then
            kill $pid 2>/dev/null
            sleep 1
            # Wait for port to be released
            while nc -z localhost $port 2>/dev/null; do
                sleep 0.5
            done
            echo "Port $port is now free"
        fi
    fi
    
    echo "Starting measure_window for $display on port $port"
    nohup /usr/bin/python3 "$SCRIPT" --display $display > /tmp/measure_$port.log 2>&1 &
    sleep 1
done
