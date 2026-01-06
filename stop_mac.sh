#!/bin/sh

PID_FILE=".kubelens_pids"

kill_pid() {
  PID="$1"
  if kill -0 "$PID" 2>/dev/null; then
    echo "Stopping process $PID..."
    kill "$PID"
  fi
}

kill_port() {
  PORT="$1"
  PIDS=$(lsof -ti tcp:"$PORT")
  if [ -n "$PIDS" ]; then
    echo "Stopping processes on port $PORT..."
    echo "$PIDS" | xargs kill
  fi
}

echo "Stopping Kubelens services..."

if [ -f "$PID_FILE" ]; then
  while read -r PID; do
    kill_pid "$PID"
  done < "$PID_FILE"

  rm -f "$PID_FILE"
  echo "PID file removed."
else
  echo "PID file not found. Falling back to port-based cleanup..."
  kill_port 5174
  kill_port 5173
fi

echo "Services stopped."
