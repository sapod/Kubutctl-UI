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

# TLS configuration is already applied via kind-config.yaml's containerdConfigPatches
# No need for manual configuration - kind handles it during cluster creation
if [ "${SKIP_CLUSTER_CREATION}" != "true" ]; then
    echo -e "${GREEN}✓ TLS configuration applied via kind-config.yaml${NC}"
    echo -e "${YELLOW}  (containerdConfigPatches includes insecure_skip_verify for Docker registries)${NC}"
    echo ""
fi

# Apply resources in order
echo -e "${BLUE}Applying Kubernetes resources...${NC}"
echo ""

echo -e "${YELLOW}→ Creating namespaces...${NC}"
kubectl apply -f "${SCRIPT_DIR}/01-namespaces.yaml"

# Wait for namespaces to be active before proceeding
echo -e "${YELLOW}  Waiting for namespaces to be ready...${NC}"
for ns in test-apps monitoring databases; do
  kubectl wait --for=jsonpath='{.status.phase}'=Active namespace/$ns --timeout=30s 2>/dev/null || true
done
sleep 2
echo -e "${GREEN}✓ Namespaces created and ready${NC}"

echo -e "${YELLOW}→ Creating ConfigMaps and Secrets...${NC}"
kubectl apply -f "${SCRIPT_DIR}/02-configmaps-secrets.yaml"
sleep 2
echo -e "${GREEN}✓ ConfigMaps and Secrets created${NC}"

echo -e "${YELLOW}→ Creating Deployments...${NC}"
kubectl apply -f "${SCRIPT_DIR}/03-deployments-apps.yaml"
echo -e "${GREEN}✓ Deployments created${NC}"
sleep 1

echo -e "${YELLOW}→ Creating StatefulSets...${NC}"
kubectl apply -f "${SCRIPT_DIR}/04-statefulsets-databases.yaml"
echo -e "${GREEN}✓ StatefulSets created${NC}"
sleep 1

echo -e "${YELLOW}→ Creating DaemonSets...${NC}"
kubectl apply -f "${SCRIPT_DIR}/05-daemonsets.yaml"
echo -e "${GREEN}✓ DaemonSets created${NC}"
sleep 1

echo -e "${YELLOW}→ Creating Jobs and CronJobs...${NC}"
kubectl apply -f "${SCRIPT_DIR}/07-jobs-cronjobs.yaml"
echo -e "${GREEN}✓ Jobs and CronJobs created${NC}"
sleep 1

echo -e "${YELLOW}→ Creating misc resources (PVC, HPA, NetworkPolicies, ResourceQuota, etc.)...${NC}"
kubectl apply -f "${SCRIPT_DIR}/08-misc-resources.yaml"
echo -e "${GREEN}✓ Misc resources created${NC}"
sleep 1

echo ""
echo -e "${GREEN}✓ Core resources applied${NC}"
echo ""

# Wait for deployments to be ready
echo -e "${BLUE}Waiting for deployments to be ready...${NC}"
kubectl wait --for=condition=available --timeout=120s deployment --all -n test-apps || true
echo -e "${GREEN}✓ Deployments ready${NC}"
echo ""

echo -e "${GREEN}✓ All core resources applied${NC}"
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
echo "  ✓ 2 CronJobs (db-backup, cleanup-job) + 1 Job (init-job)"
echo "  ✓ 3 Ingresses (nginx-ingress, backend-api-ingress, multi-host-ingress)"
echo "  ✓ 1 PVC (shared-storage) used by worker deployment"
echo "  ✓ 4 ConfigMaps, 2 Secrets"
echo "  ✓ 7 Services"
echo "  ✓ 2 HorizontalPodAutoscalers (nginx-hpa, backend-api-hpa)"
echo "  ✓ 1 PodDisruptionBudget, 1 ResourceQuota, 1 LimitRange"
echo "  ✓ 3 NetworkPolicies"
echo ""

echo -e "${BLUE}Useful Commands:${NC}"
echo "  View all pods:           kubectl get pods --all-namespaces"
echo "  View test-apps:          kubectl get all -n test-apps"
echo "  View databases:          kubectl get all -n databases"
echo "  View cronjobs:           kubectl get cronjobs --all-namespaces"
echo "  View ingresses:          kubectl get ingress -n test-apps"
echo "  View PV/PVC:             kubectl get pv,pvc --all-namespaces"
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

# Install NGINX Ingress Controller and create Ingresses (at the very end)
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Installing Ingress Controller${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

echo -e "${BLUE}Installing NGINX Ingress Controller...${NC}"
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
echo -e "${GREEN}✓ Ingress controller resources created${NC}"
echo ""

echo -e "${YELLOW}Waiting for ingress controller to be ready (max 60s)...${NC}"
if kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=60s 2>/dev/null; then
  echo -e "${GREEN}✓ Ingress controller is ready${NC}"
  echo ""

  # Now create the ingresses
  echo -e "${BLUE}Creating Ingresses...${NC}"
  if kubectl apply -f "${SCRIPT_DIR}/06-ingresses.yaml"; then
    echo -e "${GREEN}✓ Ingresses created successfully${NC}"
    echo ""
    echo -e "${BLUE}Ingresses:${NC}"
    kubectl get ingress -n test-apps
  else
    echo -e "${YELLOW}⚠️  Could not create ingresses${NC}"
    echo -e "${YELLOW}   You can manually apply later with: kubectl apply -f ${SCRIPT_DIR}/06-ingresses.yaml${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  Ingress controller is still starting up${NC}"
  echo -e "${YELLOW}   This is normal - it will continue starting in the background${NC}"
  echo -e "${YELLOW}   You can create ingresses manually later with:${NC}"
  echo -e "${YELLOW}   kubectl apply -f ${SCRIPT_DIR}/06-ingresses.yaml${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
