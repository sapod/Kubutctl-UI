#!/bin/sh

PID_FILE=".kubelens_pids"
LOGS_DIR="logs"
BACKEND_LOG="$LOGS_DIR/backend.log"
FRONTEND_LOG="$LOGS_DIR/frontend.log"

BACKEND_PORT=3001
FRONTEND_PORT=5173

# -----------------------------
# Check if services are already running
# -----------------------------
is_listening() {
  lsof -i :"$1" >/dev/null 2>&1
}

if is_listening "$BACKEND_PORT" || is_listening "$FRONTEND_PORT"; then
  echo "Kubectl-UI app is already running."
  echo "Backend port ($BACKEND_PORT) or frontend port ($FRONTEND_PORT) is in use."
  exit 0
fi

echo "Starting Kubelens services..."

# -----------------------------
# Install dependencies if needed
# -----------------------------
if [ ! -d "node_modules" ]; then
  echo "node_modules not found. Installing dependencies..."
  npm install || exit 1
fi

# Create logs directory if not exists
mkdir -p "$LOGS_DIR"

# Clear old logs
: > "$BACKEND_LOG"
: > "$FRONTEND_LOG"

# -----------------------------
# Start backend
# -----------------------------
echo "Starting backend..."
nohup npm run server > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

# -----------------------------
# Start frontend
# -----------------------------
echo "Starting frontend..."
nohup npm run dev > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

# -----------------------------
# Save PIDs
# -----------------------------
echo "$BACKEND_PID" > "$PID_FILE"
echo "$FRONTEND_PID" >> "$PID_FILE"

echo "Services started successfully 🚀"
echo "Backend PID:  $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "PIDs saved to $PID_FILE"
echo ""
echo "Frontend available at: http://localhost:5173/"
