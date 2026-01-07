#!/bin/sh

LOGS_DIR="logs"
BACKEND_LOG="$LOGS_DIR/backend.log"

# Set default BACKEND_PORT if not set
if [ -z "$BACKEND_PORT" ]; then
  BACKEND_PORT=5174
fi

# Set default FRONTEND_PORT if not set
if [ -z "$FRONTEND_PORT" ]; then
  FRONTEND_PORT=5173
fi

echo "Starting Kubectl-UI app services in Docker..."

# Create logs directory if not exists
mkdir -p "$LOGS_DIR"

# Start backend with auto-restart
echo "Starting backend..."
(
  while true; do
    env PORT=$BACKEND_PORT npm run server >> "$BACKEND_LOG" 2>&1
    echo "$(date): Backend died! Restarting in 5 seconds..." >> "$BACKEND_LOG"
    sleep 5
  done
) &

# Start frontend in foreground (keeps container alive)
echo "Starting frontend..."
exec env VITE_BE_PORT=$BACKEND_PORT npm run prod -- --port $FRONTEND_PORT
