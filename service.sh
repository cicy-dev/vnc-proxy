#!/bin/bash
# vnc-proxy 后端服务管理

PORT=13335
LOG=/tmp/server.log
SCRIPT=~/projects/vnc-proxy/server/index.cjs

case "$1" in
  start)
    if ss -tlnp | grep -q ":$PORT "; then
      echo "✅ 已在运行 (port $PORT)"
    else
      nohup node $SCRIPT >> $LOG 2>&1 &
      sleep 2
      if ss -tlnp | grep -q ":$PORT "; then
        echo "✅ 启动成功 (port $PORT)"
      else
        echo "❌ 启动失败，查看 $LOG"
      fi
    fi
    ;;
  stop)
    pkill -f "node.*vnc-proxy/server/index.cjs"
    echo "✅ 已停止"
    ;;
  status)
    if ss -tlnp | grep -q ":$PORT "; then
      echo "✅ 运行中 (port $PORT)"
    else
      echo "❌ 未运行"
    fi
    ;;
  *)
    echo "用法: $0 {start|stop|status}"
    ;;
esac
