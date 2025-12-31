#!/bin/sh

LOGS_DIR="logs"
BACKEND_LOG="$LOGS_DIR/backend.log"

echo "Starting Kubectl-UI app services in Docker..."

# Create logs directory if not exists
mkdir -p "$LOGS_DIR"

# Start backend in background
echo "Starting backend..."
nohup npm run server > "$BACKEND_LOG" 2>&1 &

# Start frontend in foreground (keeps container alive)
echo "Starting frontend..."
exec npm run dev
