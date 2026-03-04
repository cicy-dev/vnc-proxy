#!/bin/bash
# Auto-start measure_window for all VNC displays

SCRIPT="/home/w3c_offical/projects/vnc-proxy/measure_window.py"
BASE_PORT=13430
DISPLAYS=(":1" ":2" ":3" ":4")

install_pkg() {
    pkg="$1"
    if command -v apt-get >/dev/null 2>&1; then
        if [ "$(id -u)" -eq 0 ]; then
            DEBIAN_FRONTEND=noninteractive apt-get update -y && DEBIAN_FRONTEND=noninteractive apt-get install -y "$pkg"
        elif command -v sudo >/dev/null 2>&1; then
            if sudo -n true >/dev/null 2>&1; then
                sudo -n DEBIAN_FRONTEND=noninteractive apt-get update -y && sudo -n DEBIAN_FRONTEND=noninteractive apt-get install -y "$pkg"
            else
                return 1
            fi
        else
            return 1
        fi
    else
        return 1
    fi
}

ensure_python_tk() {
    if /usr/bin/python3 -c "import tkinter" >/dev/null 2>&1; then
        return 0
    fi
    echo "python3-tk missing, trying auto-install..."
    if install_pkg python3-tk; then
        /usr/bin/python3 -c "import tkinter" >/dev/null 2>&1
        return $?
    fi
    return 1
}

if ! ensure_python_tk; then
    echo "⚠️  tkinter is unavailable and auto-install was not possible."
    echo "Continuing in headless mode (HTTP API only)."
    echo "To enable measure window UI: sudo apt-get update && sudo apt-get install -y python3-tk"
fi

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
    XAUTH_PATH="${HOME:-/home/$(whoami)}/.Xauthority"
    DISPLAY=$display XAUTHORITY="$XAUTH_PATH" nohup /usr/bin/python3 "$SCRIPT" --display $display > /tmp/measure_$port.log 2>&1 &
    sleep 1
done
