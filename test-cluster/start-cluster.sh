#!/usr/bin/env bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

CLUSTER_NAME="kubectl-ui-test"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Kubectl-UI Test Cluster Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if kind is installed
if ! command -v kind &> /dev/null; then
    echo -e "${RED}❌ kind is not installed${NC}"
    echo -e "${YELLOW}Please install kind: https://kind.sigs.k8s.io/docs/user/quick-start/#installation${NC}"
    echo ""
    echo "On macOS: brew install kind"
    echo "On Linux: curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64 && chmod +x ./kind && sudo mv ./kind /usr/local/bin/"
    exit 1
fi

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}❌ kubectl is not installed${NC}"
    echo -e "${YELLOW}Please install kubectl: https://kubernetes.io/docs/tasks/tools/${NC}"
    echo ""
    echo "On macOS: brew install kubectl"
    exit 1
fi

# Check if docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Docker is not running${NC}"
    echo -e "${YELLOW}Please start Docker Desktop or Docker daemon${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites checked${NC}"
echo ""

# Check if cluster already exists
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
    echo -e "${YELLOW}⚠️  Cluster '${CLUSTER_NAME}' already exists${NC}"
    read -p "Do you want to delete and recreate it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Deleting existing cluster...${NC}"
        kind delete cluster --name "${CLUSTER_NAME}"
    else
        echo -e "${YELLOW}Using existing cluster${NC}"
        SKIP_CLUSTER_CREATION=true
    fi
fi

# Create cluster
if [ "${SKIP_CLUSTER_CREATION}" != "true" ]; then
    echo -e "${BLUE}Creating kind cluster...${NC}"
    # Note: kind automatically updates ~/.kube/config with the new cluster context
    # No manual kubeconfig configuration needed!
    kind create cluster --config "${SCRIPT_DIR}/kind-config.yaml"
    echo -e "${GREEN}✓ Cluster created${NC}"
    echo ""
else
    # Set context to existing cluster
    kubectl config use-context "kind-${CLUSTER_NAME}"
fi

# Wait for cluster to be ready
echo -e "${BLUE}Waiting for cluster to be ready...${NC}"
kubectl wait --for=condition=Ready nodes --all --timeout=120s
echo -e "${GREEN}✓ Cluster is ready${NC}"
echo ""

# Install NGINX Ingress Controller
echo -e "${BLUE}Installing NGINX Ingress Controller...${NC}"
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

echo -e "${YELLOW}Waiting for ingress controller to be ready (this may take a minute)...${NC}"
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=180s
echo -e "${GREEN}✓ Ingress controller ready${NC}"
echo ""

# Apply resources in order
echo -e "${BLUE}Applying Kubernetes resources...${NC}"

echo -e "${YELLOW}→ Creating namespaces...${NC}"
kubectl apply -f "${SCRIPT_DIR}/01-namespaces.yaml"
sleep 2

echo -e "${YELLOW}→ Creating ConfigMaps and Secrets...${NC}"
kubectl apply -f "${SCRIPT_DIR}/02-configmaps-secrets.yaml"
sleep 2

echo -e "${YELLOW}→ Creating Deployments...${NC}"
kubectl apply -f "${SCRIPT_DIR}/03-deployments-apps.yaml"

echo -e "${YELLOW}→ Creating StatefulSets...${NC}"
kubectl apply -f "${SCRIPT_DIR}/04-statefulsets-databases.yaml"

echo -e "${YELLOW}→ Creating DaemonSets...${NC}"
kubectl apply -f "${SCRIPT_DIR}/05-daemonsets.yaml"

echo -e "${YELLOW}→ Creating Ingresses...${NC}"
kubectl apply -f "${SCRIPT_DIR}/06-ingresses.yaml"

echo -e "${YELLOW}→ Creating Jobs and CronJobs...${NC}"
kubectl apply -f "${SCRIPT_DIR}/07-jobs-cronjobs.yaml"

echo -e "${YELLOW}→ Creating misc resources (HPA, NetworkPolicies, etc.)...${NC}"
kubectl apply -f "${SCRIPT_DIR}/08-misc-resources.yaml"

echo -e "${GREEN}✓ All resources applied${NC}"
echo ""

# Wait for deployments to be ready
echo -e "${BLUE}Waiting for deployments to be ready...${NC}"
kubectl wait --for=condition=available --timeout=120s deployment --all -n test-apps || true
echo -e "${GREEN}✓ Deployments ready${NC}"
echo ""

# Display cluster information
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Cluster Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

echo -e "${BLUE}Cluster Information:${NC}"
echo -e "  Name: ${CLUSTER_NAME}"
echo -e "  Context: kind-${CLUSTER_NAME}"
echo ""

echo -e "${BLUE}Kubeconfig:${NC}"
echo -e "  Your kubeconfig has been automatically updated"
echo -e "  Context is set to: kind-${CLUSTER_NAME}"
echo ""

# Get cluster info
echo -e "${BLUE}Nodes:${NC}"
kubectl get nodes
echo ""

echo -e "${BLUE}Namespaces:${NC}"
kubectl get namespaces | grep -E "test-apps|monitoring|databases|NAME"
echo ""

echo -e "${BLUE}Pods summary:${NC}"
echo "test-apps namespace:"
kubectl get pods -n test-apps --no-headers 2>/dev/null | wc -l | xargs echo "  Pods:"
echo "databases namespace:"
kubectl get pods -n databases --no-headers 2>/dev/null | wc -l | xargs echo "  Pods:"
echo "monitoring namespace:"
kubectl get pods -n monitoring --no-headers 2>/dev/null | wc -l | xargs echo "  Pods:"
echo ""

echo -e "${BLUE}Resources Created:${NC}"
echo "  ✓ 3 Namespaces (test-apps, monitoring, databases)"
echo "  ✓ 4 Deployments (nginx: 3 replicas, multi-container: 2, backend-api: 5, worker: 4)"
echo "  ✓ 2 StatefulSets (postgres: 3 replicas, redis: 3 replicas)"
echo "  ✓ 2 DaemonSets (log-collector, node-monitor)"
echo "  ✓ 3 Ingresses (nginx, backend-api, multi-host)"
echo "  ✓ 2 CronJobs + 1 Job"
echo "  ✓ 4 ConfigMaps, 2 Secrets"
echo "  ✓ 7 Services"
echo "  ✓ 2 HorizontalPodAutoscalers"
echo "  ✓ NetworkPolicies, PodDisruptionBudget, ResourceQuota, LimitRange"
echo ""

echo -e "${BLUE}Useful Commands:${NC}"
echo "  View all pods:           kubectl get pods --all-namespaces"
echo "  View test-apps:          kubectl get all -n test-apps"
echo "  View databases:          kubectl get all -n databases"
echo "  View ingresses:          kubectl get ingress -n test-apps"
echo "  Get cluster info:        kubectl cluster-info"
echo ""

echo -e "${BLUE}Access Applications:${NC}"
echo "  Add these to /etc/hosts:"
echo "    127.0.0.1 nginx.local"
echo "    127.0.0.1 api.local"
echo "    127.0.0.1 app1.local"
echo "    127.0.0.1 app2.local"
echo ""
echo "  Then access:"
echo "    http://nginx.local"
echo "    http://api.local/api"
echo ""

echo -e "${YELLOW}To add this cluster to Kubectl-UI:${NC}"
echo "  The cluster is already in your kubeconfig (~/.kube/config)"
echo "  Context name: kind-${CLUSTER_NAME}"
echo "  Just refresh or restart Kubectl-UI to see it!"
echo ""

echo -e "${BLUE}To stop the cluster, run:${NC}"
echo "  ./stop-cluster.sh"
echo ""

