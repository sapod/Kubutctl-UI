#!/bin/bash

# Print help instructions
if [[ "$1" == "--help" ]]; then
  echo "Usage: $0 [--version <tag>] [--extra-ports \"PORT1:PORT1,PORT2:PORT2,...\"] [--backend-port <PORT>] [--frontend-port <PORT>]"
  echo "\nOptions:"
  echo "  --version        Docker image tag to use (default: latest)"
  echo "  --extra-ports    Comma-separated list of additional ports to map (e.g. 8081:8081,8888:8888) if host networking is not available."
  echo "  --backend-port   Set BACKEND_PORT environment variable in the container and map the port (e.g. --backend-port 12345)"
  echo "  --frontend-port  Set FRONTEND_PORT environment variable in the container and map the port (e.g. --frontend-port 5174)"
  echo "\nDescription:"
  echo "  Attempts to start the kubectl-ui Docker container with host networking."
  echo "  If host networking fails, falls back to explicit port mappings:"
  echo "    -p 5173:5173 -p 5174:5174 -p 9229:9229 -p 9000-9010:9000-9010 plus any extra ports you specify."
  echo "  Example:"
  echo "    $0 --version 1.2.3 --extra-ports \"8081:8081,8888:8888\" --backend-port 12345 --frontend-port 5174"
  exit 0
fi

# Parse arguments for version, extra ports, backend port, and frontend port
EXTRA_PORTS=""
IMAGE_TAG="latest"
BACKEND_PORT=""
FRONTEND_PORT=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --extra-ports)
      EXTRA_PORTS="$2"
      shift 2
      ;;
    --version)
      IMAGE_TAG="$2"
      shift 2
      ;;
    --backend-port)
      BACKEND_PORT="$2"
      shift 2
      ;;
    --frontend-port)
      FRONTEND_PORT="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# Check for username
if [ -z "$USER" ]; then
  echo "Error: USER environment variable not set."
  exit 1
fi
USERNAME="$USER"

IMAGE_NAME="sapod/kubectl-ui:${IMAGE_TAG}"
CONTAINER_NAME="kubectl-ui"

# Pull the latest image before running
echo "Updating Docker image: $IMAGE_NAME"
docker pull $IMAGE_NAME
if [ $? -ne 0 ]; then
  echo "Failed to pull Docker image: $IMAGE_NAME"
  exit 1
fi

# Build extra -p args if provided
EXTRA_P_ARGS=""
if [ -n "$EXTRA_PORTS" ]; then
  IFS=',' read -ra PORTS_ARR <<< "$EXTRA_PORTS"
  for p in "${PORTS_ARR[@]}"; do
    EXTRA_P_ARGS+=" -p $p"
  done
fi

# Add -e BACKEND_PORT and FRONTEND_PORT if specified
BACKEND_PORT_ARG=""
FRONTEND_PORT_ARG=""
BACKEND_PORT_MAPPING="-p 5174:5174"
FRONTEND_PORT_MAPPING="-p 5173:5173"
if [ -n "$BACKEND_PORT" ]; then
  BACKEND_PORT_ARG=" -e BACKEND_PORT=$BACKEND_PORT"
  BACKEND_PORT_MAPPING="-p $BACKEND_PORT:$BACKEND_PORT"
fi
if [ -n "$FRONTEND_PORT" ]; then
  FRONTEND_PORT_ARG=" -e FRONTEND_PORT=$FRONTEND_PORT"
  FRONTEND_PORT_MAPPING="-p $FRONTEND_PORT:$FRONTEND_PORT"
fi

HOST_NET_CMD="docker run -d --restart always --network host \
  -v ~/.kube:/root/.kube \
  -v ~/.kube:/Users/${USERNAME}/.kube \
  -v ~/.aws:/root/.aws \
  -e KUBECONFIG=/root/.kube/config${BACKEND_PORT_ARG}${FRONTEND_PORT_ARG} \
  --add-host kubernetes.docker.internal:host-gateway \
  --name ${CONTAINER_NAME} \
  ${IMAGE_NAME}"

PORTS_CMD="docker run -d --restart always \
  ${FRONTEND_PORT_MAPPING} ${BACKEND_PORT_MAPPING} -p 9229:9229 -p 9000-9010:9000-9010${EXTRA_P_ARGS} \
  -v ~/.kube:/root/.kube \
  -v ~/.kube:/Users/${USERNAME}/.kube \
  -v ~/.aws:/root/.aws \
  -e KUBECONFIG=/root/.kube/config${BACKEND_PORT_ARG}${FRONTEND_PORT_ARG} \
  --add-host kubernetes.docker.internal:host-gateway \
  --name ${CONTAINER_NAME} \
  ${IMAGE_NAME}"

# clean previous runs
echo "Cleaning up any existing container named ${CONTAINER_NAME}..."
docker rm -f ${CONTAINER_NAME} >/dev/null 2>&1 && echo "Removed existing container ${CONTAINER_NAME}."

# Try host network first
if eval "$HOST_NET_CMD" >/dev/null 2>&1; then
  echo "✔ Container started with host networking."
else
  echo "Container starting with host network failed. Removing any existing container and retrying with explicit port mappings."
  docker rm -f ${CONTAINER_NAME} >/dev/null 2>&1 && echo "Removed existing container ${CONTAINER_NAME}."
  if eval "$PORTS_CMD" >/dev/null 2>&1; then
    echo "✔ Container started with port mappings."
    echo "WARNING: Host network mode failed. Port forwarding available in ports 9000-9010 and 9229 (inspect port) only, plus any extra ports you specified."
    [ -n "$EXTRA_PORTS" ] && echo "EXTRA_PORTS: $EXTRA_PORTS"
  else
    echo "Failed to start container with port mappings. Please check Docker logs."
    exit 1
  fi
fi
