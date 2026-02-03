# Kubectl-UI Test Cluster

This directory contains scripts and manifests to create a comprehensive local Kubernetes test cluster for testing Kubectl-UI with various resource types.

## Overview

The test cluster uses **kind** (Kubernetes in Docker) to create a local multi-node cluster with:

- **3 nodes** (1 control-plane, 2 workers)
- **3 namespaces** with different types of applications
- **Multiple resource types** for comprehensive testing
- **NGINX Ingress Controller** for testing ingress resources

## Prerequisites

Before starting, ensure you have:

1. **Docker Desktop** or Docker daemon running
2. **kind** - Kubernetes in Docker
   ```bash
   # macOS
   brew install kind
   
   # Linux
   curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
   chmod +x ./kind
   sudo mv ./kind /usr/local/bin/
   ```

3. **kubectl** - Kubernetes CLI
   ```bash
   # macOS
   brew install kubectl
   
   # Linux - see https://kubernetes.io/docs/tasks/tools/
   ```

## Quick Start

### Start the Cluster

```bash
cd test-cluster
chmod +x start-cluster.sh stop-cluster.sh
./start-cluster.sh
```

This will:
1. Create a kind cluster with 3 nodes
2. Install NGINX Ingress Controller
3. Deploy all test resources
4. Automatically configure your kubeconfig (~/.kube/config)

The cluster will be added to your kubeconfig as `kind-kubectl-ui-test` - no manual configuration needed!

### Stop the Cluster

```bash
./stop-cluster.sh
```

This will delete the entire cluster and clean up resources.

## Quick Reference

- **Cluster Name**: kubectl-ui-test
- **Context**: kind-kubectl-ui-test
- **Nodes**: 3 (1 control-plane, 2 workers)
- **Namespaces**: test-apps, monitoring, databases
- **Total Pods**: ~26 across all namespaces
- **Total Containers**: ~35 (includes multi-container pods)

See the [Useful Commands](#useful-commands) section below for common kubectl commands.

## Resources Created

### Namespaces (3)
- `test-apps` - Main application namespace
- `monitoring` - Monitoring and logging tools
- `databases` - Database services

### Deployments (4)
1. **nginx-deployment** (3 replicas, 1 container/pod)
   - NGINX web server
   - ConfigMap volume mounted
   - Liveness and readiness probes

2. **multi-container-app** (2 replicas, 3 containers/pod)
   - Main application container
   - Log collector sidecar
   - Metrics exporter sidecar

3. **backend-api** (5 replicas, 2 containers/pod)
   - API container
   - Redis cache sidecar
   - Environment variables from ConfigMap/Secret

4. **worker-deployment** (4 replicas, 1 container/pod)
   - Background worker pods

**Total Deployment Pods: ~14**

### StatefulSets (2)
1. **postgres** (3 replicas)
   - PostgreSQL database cluster
   - Persistent storage per pod
   - Headless service for discovery

2. **redis** (3 replicas)
   - Redis cache cluster
   - Persistent storage
   - Headless service

**Total StatefulSet Pods: 6**

### DaemonSets (2)
1. **log-collector** - Runs on every node
2. **node-monitor** - Node monitoring agent

**Total DaemonSet Pods: ~6 (2 per node)**

### Services (7)
- `nginx-service` - ClusterIP for NGINX
- `backend-api-service` - ClusterIP for API
- `postgres-service` - ClusterIP for PostgreSQL
- `postgres-headless` - Headless for StatefulSet
- `redis-service` - ClusterIP for Redis
- `redis-headless` - Headless for Redis
- Plus ingress-nginx services

### Ingresses (3)
1. **nginx-ingress** - Routes to NGINX service
   - Host: `nginx.local`
   
2. **backend-api-ingress** - Routes to API service
   - Host: `api.local`
   - Paths: `/api`, `/health`
   
3. **multi-host-ingress** - Multiple hosts
   - Hosts: `app1.local`, `app2.local`

### ConfigMaps (4)
- `app-config` - Application configuration
- `monitoring-config` - Monitoring settings
- Various configurations for different apps

### Secrets (2)
- `db-credentials` - Database passwords
- `api-tokens` - API keys and tokens

### Jobs & CronJobs (3)
- `init-job` - One-time initialization
- `db-backup` - Hourly backup CronJob
- `cleanup-job` - Daily cleanup CronJob

### Other Resources
- **HorizontalPodAutoscalers** (2) - Auto-scaling for NGINX and API
- **NetworkPolicies** (3) - Network access control
- **PodDisruptionBudget** (1) - High availability configuration
- **ResourceQuota** (1) - Resource limits per namespace
- **LimitRange** (1) - Default resource limits
- **PersistentVolumeClaims** - Storage claims

## Total Resources

- **~26+ pods** running across all namespaces
- **All major Kubernetes resource types** represented
- **Multiple pod configurations** (1-3 containers per pod)
- **Various deployment strategies** (Deployment, StatefulSet, DaemonSet)

## Accessing Applications

### Option 1: Port Forward (Easiest)

```bash
# NGINX
kubectl port-forward -n test-apps svc/nginx-service 8080:80

# Backend API
kubectl port-forward -n test-apps svc/backend-api-service 8081:8080

# PostgreSQL
kubectl port-forward -n databases svc/postgres-service 5432:5432
```

Then access:
- NGINX: http://localhost:8080
- API: http://localhost:8081

### Option 2: Ingress (Requires /etc/hosts)

Add to `/etc/hosts`:
```
127.0.0.1 nginx.local
127.0.0.1 api.local
127.0.0.1 app1.local
127.0.0.1 app2.local
```

Then access:
- http://nginx.local
- http://api.local/api

## Testing with Kubectl-UI

Once the cluster is running:

1. **Open Kubectl-UI**
2. The cluster appears as `kind-kubectl-ui-test` in your contexts
3. Switch to this context in Kubectl-UI
4. Explore all the resources!

### Things to Test

- ✅ **Multi-namespace view** - Switch between test-apps, databases, monitoring
- ✅ **Different pod types** - Deployments, StatefulSets, DaemonSets
- ✅ **Multi-container pods** - View logs from different containers
- ✅ **Services and endpoints** - See how services route to pods
- ✅ **Ingresses** - View ingress rules and backends
- ✅ **ConfigMaps and Secrets** - Browse configurations
- ✅ **Jobs and CronJobs** - Watch job executions
- ✅ **Scaling** - Test HPA behavior
- ✅ **Port forwarding** - Forward ports from Kubectl-UI
- ✅ **Logs** - Stream logs from various pods
- ✅ **Shell access** - Execute into pods
- ✅ **Resource metrics** - CPU and memory usage

## Useful Commands

```bash
# View all pods across namespaces
kubectl get pods --all-namespaces

# View specific namespace
kubectl get all -n test-apps
kubectl get all -n databases
kubectl get all -n monitoring

# Watch pod status
kubectl get pods -n test-apps -w

# View ingresses
kubectl get ingress -n test-apps

# Check HPA status
kubectl get hpa -n test-apps

# View logs
kubectl logs -n test-apps deployment/nginx-deployment
kubectl logs -n test-apps deployment/multi-container-app -c app

# Execute into a pod
kubectl exec -it -n test-apps deployment/nginx-deployment -- sh

# Port forward
kubectl port-forward -n test-apps svc/nginx-service 8080:80

# Delete specific resources
kubectl delete deployment nginx-deployment -n test-apps

# Scale deployment
kubectl scale deployment nginx-deployment -n test-apps --replicas=5
```

## Troubleshooting

### Cluster won't start
```bash
# Check Docker is running
docker ps

# Check kind installation
kind version

# View kind cluster logs
kind get clusters
docker ps | grep kubectl-ui-test
```

### Pods not starting
```bash
# Check pod status
kubectl get pods -n test-apps

# View pod events
kubectl describe pod <pod-name> -n test-apps

# Check node status
kubectl get nodes
kubectl describe node <node-name>
```

### Ingress not working
```bash
# Check ingress controller
kubectl get pods -n ingress-nginx

# Check ingress resources
kubectl get ingress -n test-apps

# View ingress controller logs
kubectl logs -n ingress-nginx deployment/ingress-nginx-controller
```

### Reset everything
```bash
# Delete and recreate cluster
./stop-cluster.sh
./start-cluster.sh
```

## File Structure

```
test-cluster/
├── README.md                          # This file
├── kind-config.yaml                   # Kind cluster configuration
├── start-cluster.sh                   # Script to start cluster
├── stop-cluster.sh                    # Script to stop cluster
├── 01-namespaces.yaml                 # Namespace definitions
├── 02-configmaps-secrets.yaml         # ConfigMaps and Secrets
├── 03-deployments-apps.yaml           # Application deployments
├── 04-statefulsets-databases.yaml     # Database StatefulSets
├── 05-daemonsets.yaml                 # DaemonSets for monitoring
├── 06-ingresses.yaml                  # Ingress resources
├── 07-jobs-cronjobs.yaml              # Jobs and CronJobs
└── 08-misc-resources.yaml             # HPA, NetworkPolicies, etc.
```

## Modifying Resources

To add or modify resources:

1. Edit the appropriate YAML file
2. Apply changes:
   ```bash
   kubectl apply -f <filename>.yaml
   ```
3. Or restart the cluster:
   ```bash
   ./stop-cluster.sh
   ./start-cluster.sh
   ```

## Resource Usage (Validated)

### Actual Resource Consumption

The cluster has been optimized for efficient resource usage:

#### Memory
- **Requests**: 1,792 Mi (~1.75 GB)
- **Limits**: 3,584 Mi (~3.5 GB)
- **Breakdown**:
  - test-apps namespace: 928Mi
  - databases namespace: 576Mi
  - monitoring namespace: 288Mi

#### CPU
- **Requests**: 2,800m (2.8 cores)
- **Limits**: 5,600m (5.6 cores)
- **Breakdown**:
  - test-apps namespace: 1,450m
  - databases namespace: 900m
  - monitoring namespace: 450m

#### Storage
- **Total**: 2.6 Gi (optimized for test data)
- **Breakdown**:
  - PostgreSQL: 3 pods × 500Mi = 1.5Gi
  - Redis: 3 pods × 200Mi = 600Mi
  - Shared PVC: 500Mi

### Multi-Container Pods

The cluster includes realistic multi-container pod patterns:

1. **multi-container-app** (2 replicas, 3 containers/pod)
   - Main application container
   - Log collector sidecar
   - Metrics exporter sidecar

2. **backend-api** (5 replicas, 2 containers/pod)
   - API service container
   - Redis cache sidecar

### Pod Distribution

| Workload | Replicas | Containers/Pod | Memory/Pod | Total Memory |
|----------|----------|----------------|------------|--------------|
| nginx-deployment | 3 | 1 | 64Mi | 192Mi |
| multi-container-app | 2 | 3 | 64Mi | 128Mi |
| backend-api | 5 | 2 | 96Mi | 480Mi |
| worker-deployment | 4 | 1 | 32Mi | 128Mi |
| postgres StatefulSet | 3 | 1 | 128Mi | 384Mi |
| redis StatefulSet | 3 | 1 | 64Mi | 192Mi |
| log-collector DaemonSet | ~3 | 1 | 64Mi | 192Mi |
| node-monitor DaemonSet | ~3 | 1 | 32Mi | 96Mi |
| **Total** | **~26** | - | - | **~1,792Mi** |

## Docker Desktop Requirements

### Minimum Configuration
- **Memory**: 4 GB
- **CPU**: 3 cores
- **Disk**: 15 GB free

### Recommended Configuration
- **Memory**: 6 GB (provides headroom)
- **CPU**: 4 cores (smooth performance)
- **Disk**: 20 GB free

The cluster is optimized to be laptop-friendly while providing comprehensive testing capabilities.

## Validation Summary

### ✅ Multi-Container Pods Verified
The cluster includes realistic multi-container deployments with sidecar patterns:
- **multi-container-app**: 3 containers (app + log-collector + metrics-exporter)
- **backend-api**: 2 containers (api + cache-sidecar)

### ✅ Resource Efficiency Validated
- **Memory**: 1.75 GB requests (excellent for laptops)
- **CPU**: 2.8 cores requests (efficient allocation)
- **Storage**: 2.6 Gi total (60% reduction from initial design)

### ✅ All Resource Types Included
| Resource Type | Count | Location |
|--------------|-------|----------|
| Deployments | 4 | test-apps |
| StatefulSets | 2 | databases |
| DaemonSets | 2 | monitoring |
| Services | 7+ | all namespaces |
| Ingresses | 3 | test-apps |
| ConfigMaps | 4 | test-apps, monitoring |
| Secrets | 2 | test-apps, databases |
| Jobs | 1 | test-apps |
| CronJobs | 2 | test-apps, databases |
| HPA | 2 | test-apps |
| NetworkPolicies | 3 | test-apps, databases |

## Cleaning Up

To completely remove the cluster:

```bash
./stop-cluster.sh
```

This will:
- Delete the kind cluster
- Remove all containers
- Automatically clean up the kubeconfig entry
- Free up all resources

## Tips

1. **Use watch mode** to see real-time updates:
   ```bash
   watch kubectl get pods -n test-apps
   ```

2. **Use stern** for multi-pod log tailing:
   ```bash
   brew install stern
   stern -n test-apps nginx
   ```

3. **Use k9s** for terminal UI:
   ```bash
   brew install k9s
   k9s -n test-apps
   ```

4. **Export cluster config**:
   ```bash
   kind export kubeconfig --name kubectl-ui-test
   ```

## Additional Resources

- [kind Documentation](https://kind.sigs.k8s.io/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)

