#!/usr/bin/env bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

CLUSTER_NAME="kubectl-ui-test"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Stopping Kubectl-UI Test Cluster${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if kind is installed
if ! command -v kind &> /dev/null; then
    echo -e "${RED}❌ kind is not installed${NC}"
    exit 1
fi

# Check if cluster exists
if ! kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
    echo -e "${YELLOW}⚠️  Cluster '${CLUSTER_NAME}' does not exist${NC}"
    echo ""
    echo "Available clusters:"
    kind get clusters
    exit 0
fi

# Ask for confirmation
echo -e "${YELLOW}This will delete the cluster '${CLUSTER_NAME}' and all its resources.${NC}"
read -p "Are you sure? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Aborted${NC}"
    exit 0
fi

# Show current resources before deletion
echo -e "${BLUE}Current cluster resources:${NC}"
echo ""
kubectl config use-context "kind-${CLUSTER_NAME}" 2>/dev/null || true
echo -e "${YELLOW}Pods in test-apps:${NC}"
kubectl get pods -n test-apps --no-headers 2>/dev/null | wc -l | xargs echo "  Count:"
echo -e "${YELLOW}Pods in databases:${NC}"
kubectl get pods -n databases --no-headers 2>/dev/null | wc -l | xargs echo "  Count:"
echo -e "${YELLOW}Pods in monitoring:${NC}"
kubectl get pods -n monitoring --no-headers 2>/dev/null | wc -l | xargs echo "  Count:"
echo ""

# Delete cluster
echo -e "${BLUE}Deleting cluster...${NC}"
# Note: kind automatically removes the cluster context from ~/.kube/config
kind delete cluster --name "${CLUSTER_NAME}"

echo -e "${GREEN}✓ Cluster deleted successfully${NC}"
echo ""

echo -e "${BLUE}Remaining clusters:${NC}"
REMAINING=$(kind get clusters 2>/dev/null)
if [ -z "$REMAINING" ]; then
    echo "  None"
else
    echo "$REMAINING"
fi
echo ""

echo -e "${YELLOW}Note:${NC} The kubeconfig entry for 'kind-${CLUSTER_NAME}' has been removed."
echo "To start a new cluster, run: ./start-cluster.sh"
echo ""

