#!/usr/bin/env bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

CLUSTER_NAME="kubectl-ui-test"
CLUSTER_2_NAME="kubectl-ui-test-2"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Stopping Kubectl-UI Test Cluster(s)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if kind is installed
if ! command -v kind &> /dev/null; then
    echo -e "${RED}❌ kind is not installed${NC}"
    exit 1
fi

# Function to delete a cluster
delete_cluster() {
    local CLUSTER=$1
    local CONTEXT="kind-${CLUSTER}"

    # Check if cluster exists
    if ! kind get clusters 2>/dev/null | grep -q "^${CLUSTER}$"; then
        echo -e "${YELLOW}⚠️  Cluster '${CLUSTER}' does not exist${NC}"
        return 1
    fi

    # Show current resources before deletion
    echo -e "${BLUE}Current cluster resources for ${CLUSTER}:${NC}"
    echo ""
    kubectl config use-context "${CONTEXT}" 2>/dev/null || true
    echo -e "${YELLOW}Pods in all namespaces:${NC}"
    kubectl get pods --all-namespaces --no-headers 2>/dev/null | wc -l | xargs echo "  Count:"
    echo ""

    # Delete cluster
    echo -e "${BLUE}Deleting cluster ${CLUSTER}...${NC}"
    kind delete cluster --name "${CLUSTER}"

    echo -e "${GREEN}✓ Cluster '${CLUSTER}' deleted successfully${NC}"
    echo ""

    return 0
}

# Check for --all flag
DELETE_ALL=false
if [ "$1" = "--all" ]; then
    DELETE_ALL=true
fi

# Delete clusters based on flags
DELETED_ANY=false

if [ "$DELETE_ALL" = true ] || [ "$1" = "-2" ]; then
    delete_cluster "${CLUSTER_2_NAME}" && DELETED_ANY=true
fi

if [ "$DELETE_ALL" = true ] || [ -z "$1" ] || [ "$1" = "-1" ]; then
    delete_cluster "${CLUSTER_NAME}" && DELETED_ANY=true
fi

if [ "$DELETE_ALL" = false ] && [ "$1" != "-1" ] && [ "$1" != "-2" ]; then
    echo -e "${YELLOW}Usage:${NC}"
    echo "  ./stop-cluster.sh           - Delete main cluster"
    echo "  ./stop-cluster.sh -2        - Delete second cluster only"
    echo "  ./stop-cluster.sh --all     - Delete both clusters"
    echo ""
fi

echo -e "${BLUE}Remaining clusters:${NC}"
REMAINING=$(kind get clusters 2>/dev/null)
if [ -z "$REMAINING" ]; then
    echo "  None"
else
    echo "$REMAINING"
fi
echo ""

if [ "$DELETE_ALL" = true ]; then
    echo -e "${YELLOW}Note:${NC} All test clusters have been removed from kubeconfig."
    echo "To start new clusters, run: ./start-cluster.sh"
else
    echo -e "${YELLOW}Note:${NC} Remaining cluster context(s) are still in kubeconfig."
fi
echo ""

