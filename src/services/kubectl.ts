import {
  Node, Pod, Deployment, ReplicaSet, Job, CronJob, Service, Ingress,
  ConfigMap, Namespace, K8sEvent, ResourceQuota, ResourceStatus, PortForward, ResourceStats
} from '../types';
import { BACKEND_BASE_URL, BACKEND_PORT } from '../consts';

let logToTerminal: ((cmd: string) => void) | null = null;
let globalErrorHandler: ((err: string) => void) | null = null;
let storeDispatch: ((action: any) => void) | null = null;

export const setLogger = (fn: (cmd: string) => void) => { logToTerminal = fn; };
export const setGlobalErrorHandler = (fn: (err: string) => void) => { globalErrorHandler = fn; };
export const setDispatcher = (fn: (action: any) => void) => { storeDispatch = fn; };

interface CommandDefinition {
    command: (...args: any[]) => string;
    shouldVerify: boolean;
    verification?: (...args: any[]) => { title: string; message: string };
}

export const KUBECTL_COMMANDS: Record<string, CommandDefinition> = {
  getAll: { command: (ns: string) => `kubectl get all ${ns === 'All Namespaces' ? '--all-namespaces' : `-n ${ns}`} -o json`, shouldVerify: false },
  getNodes: { command: () => `kubectl get nodes -o json`, shouldVerify: false },
  getPods: { command: (ns: string) => `kubectl get pods ${ns === 'All Namespaces' ? '--all-namespaces' : `-n ${ns}`} -o json`, shouldVerify: false },
  getDeployments: { command: (ns: string) => `kubectl get deployments ${ns === 'All Namespaces' ? '--all-namespaces' : `-n ${ns}`} -o json`, shouldVerify: false },
  getReplicaSets: { command: (ns: string) => `kubectl get replicasets ${ns === 'All Namespaces' ? '--all-namespaces' : `-n ${ns}`} -o json`, shouldVerify: false },
  getJobs: { command: (ns: string) => `kubectl get jobs ${ns === 'All Namespaces' ? '--all-namespaces' : `-n ${ns}`} -o json`, shouldVerify: false },
  getCronJobs: { command: (ns: string) => `kubectl get cronjobs ${ns === 'All Namespaces' ? '--all-namespaces' : `-n ${ns}`} -o json`, shouldVerify: false },
  getServices: { command: (ns: string) => `kubectl get services ${ns === 'All Namespaces' ? '--all-namespaces' : `-n ${ns}`} -o json`, shouldVerify: false },
  getIngresses: { command: (ns: string) => `kubectl get ingresses ${ns === 'All Namespaces' ? '--all-namespaces' : `-n ${ns}`} -o json`, shouldVerify: false },
  getConfigMaps: { command: (ns: string) => `kubectl get configmaps ${ns === 'All Namespaces' ? '--all-namespaces' : `-n ${ns}`} -o json`, shouldVerify: false },
  getEvents: { command: (ns: string) => `kubectl get events ${ns === 'All Namespaces' ? '--all-namespaces' : `-n ${ns}`} -o json`, shouldVerify: false },
  getResourceQuotas: { command: (ns: string) => `kubectl get resourcequotas ${ns === 'All Namespaces' ? '--all-namespaces' : `-n ${ns}`} -o json`, shouldVerify: false },
  deleteResource: {
    command: (type: string, name: string, ns: string) => `kubectl delete ${type} ${name} -n ${ns} --now`,
    shouldVerify: true,
    verification: (type: string, name: string) => ({ title: `Delete ${type}`, message: `Are you sure you want to delete ${type} "${name}"?` })
  },
  bulkDelete: {
      command: () => '',
      shouldVerify: true,
      verification: (count: number, type: string) => ({ title: 'Bulk Delete', message: `Are you sure you want to delete ${count} ${type}(s)?` })
  },
  scaleDeployment: {
    command: (name: string, ns: string, replicas: number) => `kubectl scale deployment ${name} --replicas=${replicas} -n ${ns}`,
    shouldVerify: true,
    verification: (name: string, _ns: string, replicas: number) => ({ title: 'Scale Deployment', message: `Scale "${name}" to ${replicas} replicas?` })
  },
  rolloutRestart: {
    command: (type: string, name: string, ns: string) => `kubectl rollout restart ${type}/${name} -n ${ns}`,
    shouldVerify: true,
    verification: (type: string, name: string) => ({ title: 'Rollout Restart', message: `Restart ${type} "${name}"?` })
  },
  triggerCronJob: {
    command: (name: string, ns: string) => `kubectl create job --from=cronjob/${name} ${name}-manual-${Math.floor(Date.now() / 1000)} -n ${ns}`,
    shouldVerify: true,
    verification: (name: string) => ({ title: 'Trigger CronJob', message: `Are you sure you want to trigger a manual run for "${name}"?` })
  },
  portForward: { command: (type: string, name: string, ns: string, local: number, remote: number) => `kubectl port-forward ${type}/${name} ${local}:${remote} -n ${ns}`, shouldVerify: false },
  logs: { command: (name: string, ns: string, container?: string, previous?: boolean, grep?: string, dateFrom?: string, dateTo?: string) => {
    let cmd = `kubectl logs ${name} -n ${ns} ${container ? `-c ${container}` : ''} ${previous ? '--previous' : ''} --tail=100 --timestamps`;

    // Add date filter if provided (since-time uses RFC3339 format)
    if (dateFrom) {
      const dateFromISO = new Date(dateFrom).toISOString();
      cmd += ` --since-time="${dateFromISO}"`;
    }

    if (grep) {
      // Use grep -E for extended regex, -i for case-insensitive
      cmd += ` | (grep -E -i '${grep.replace(/'/g, "'\\''")}' || true)`;
    }

    // Filter by dateTo - extract timestamp from kubectl --timestamps output and compare
    if (dateTo) {
      const dateToISO = new Date(dateTo).toISOString();
      // kubectl --timestamps format: "2026-01-19T10:30:45.123456789Z log message"
      // Extract first field (timestamp) and compare
      cmd += ` | awk '{if ($1 < "${dateToISO}") print}'`;
    }

    return cmd;
  }, shouldVerify: false },
  logsWithSelector: { command: (selector: string, ns: string, grep?: string, dateFrom?: string, dateTo?: string) => {
    let cmd = `kubectl logs -l ${selector} -n ${ns} --all-containers=true --prefix=true --tail=100 --timestamps`;

    // Add date filter if provided
    if (dateFrom) {
      const dateFromISO = new Date(dateFrom).toISOString();
      cmd += ` --since-time="${dateFromISO}"`;
    }

    if (grep) {
      // Use grep -E for extended regex, -i for case-insensitive
      cmd += ` | (grep -E -i '${grep.replace(/'/g, "'\\''")}' || true)`;
    }

    // Filter by dateTo - extract timestamp from kubectl --timestamps output and compare (before sort)
    if (dateTo) {
      const dateToISO = new Date(dateTo).toISOString();
      // kubectl --timestamps with --prefix format: "[pod/name/container] 2026-01-19T10:30:45.123456789Z log message"
      // Extract second field (timestamp after pod prefix) and compare
      cmd += ` | awk '{if ($2 < "${dateToISO}") print}'`;
    }

    // Sort logs by timestamp (field 2 when using --prefix) to get chronological order across all containers
    // This ensures logs are ordered by time, not grouped by container
    cmd += ` | sort -k2,2`;

    // Always limit to 200 total lines across all pods (applied after sorting)
    cmd += ` | tail -200`;
    return cmd;
  }, shouldVerify: false },
  exec: { command: (name: string, ns: string, container: string, cmd: string) => `kubectl exec ${name} -n ${ns} -c ${container} -- ${cmd}`, shouldVerify: false },
  configView: { command: () => `kubectl config view -o json`, shouldVerify: false },
  useContext: { command: (context: string) => `kubectl config use-context ${context}`, shouldVerify: false },
  topPods: { command: (ns: string) => `kubectl top pods ${ns === 'All Namespaces' ? '--all-namespaces' : `-n ${ns}`} --no-headers`, shouldVerify: false },
  getPod: { command: (name: string, ns: string) => `kubectl get pod ${name} -n ${ns} -o json`, shouldVerify: false },
  getDeployment: { command: (name: string, ns: string) => `kubectl get deployment ${name} -n ${ns} -o json`, shouldVerify: false },
  getReplicaSet: { command: (name: string, ns: string) => `kubectl get replicaset ${name} -n ${ns} -o json`, shouldVerify: false },
  getJob: { command: (name: string, ns: string) => `kubectl get job ${name} -n ${ns} -o json`, shouldVerify: false },
  getCronJob: { command: (name: string, ns: string) => `kubectl get cronjob ${name} -n ${ns} -o json`, shouldVerify: false },
  getNode: { command: (name: string) => `kubectl get node ${name} -o json`, shouldVerify: false },
  getService: { command: (name: string, ns: string) => `kubectl get service ${name} -n ${ns} -o json`, shouldVerify: false },
  getIngress: { command: (name: string, ns: string) => `kubectl get ingress ${name} -n ${ns} -o json`, shouldVerify: false },
  getConfigMap: { command: (name: string, ns: string) => `kubectl get configmap ${name} -n ${ns} -o json`, shouldVerify: false },
  getNamespace: { command: (name: string) => `kubectl get namespace ${name} -o json`, shouldVerify: false },
  getResourceQuota: { command: (name: string, ns: string) => `kubectl get resourcequota ${name} -n ${ns} -o json`, shouldVerify: false },
};

const parseCpuStr = (v: string): number => {
    if (!v) return 0;
    if (v.endsWith('m')) return parseInt(v.slice(0, -1), 10);
    return parseFloat(v) * 1000;
};

const parseMemoryStr = (v: string): number => {
    if (!v) return 0;
    const units: Record<string, number> = { Ki: 1024, Mi: 1024 * 1024, Gi: 1024 * 1024 * 1024, K: 1000, M: 1000 * 1000, G: 1000 * 1000 * 1000 };
    const match = v.match(/^([0-9.]+)([A-Za-z]+)?$/);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    const unit = match[2];
    return num * (units[unit] || 1);
};

const formatCpu = (m: number): string => m === 0 ? '0' : (m < 1000 ? `${m}m` : `${m / 1000}`);
const formatMemory = (b: number): string => {
    if (b === 0) return '0';
    const ki = b / 1024; const mi = ki / 1024; const gi = mi / 1024;
    if (gi >= 1) return `${gi.toFixed(1)}Gi`;
    if (mi >= 1) return `${mi.toFixed(1)}Mi`;
    return `${ki.toFixed(0)}Ki`;
};

const aggregateResources = (containers: any[] = []): ResourceStats => {
    let reqCpu = 0, reqMem = 0, limCpu = 0, limMem = 0;
    containers.forEach(c => {
        const req = c.resources?.requests; const lim = c.resources?.limits;
        if (req) { if (req.cpu) reqCpu += parseCpuStr(req.cpu); if (req.memory) reqMem += parseMemoryStr(req.memory); }
        if (lim) { if (lim.cpu) limCpu += parseCpuStr(lim.cpu); if (lim.memory) limMem += parseMemoryStr(lim.memory); }
    });
    return { requests: { cpu: formatCpu(reqCpu), memory: formatMemory(reqMem) }, limits: { cpu: formatCpu(limCpu), memory: formatMemory(limMem) } };
};

const transformNode = (raw: any): Node => ({
  id: raw.metadata.uid, name: raw.metadata.name, namespace: '', creationTimestamp: raw.metadata.creationTimestamp, labels: raw.metadata.labels || {},
  status: raw.status.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'NotReady',
  roles: Object.keys(raw.metadata.labels || {}).filter(k => k.startsWith('node-role.kubernetes.io/')).map(k => k.split('/')[1]),
  version: raw.status.nodeInfo.kubeletVersion, cpuCapacity: raw.status.capacity.cpu, memoryCapacity: raw.status.capacity.memory, cpuAllocatable: raw.status.allocatable.cpu, memoryAllocatable: raw.status.allocatable.memory,
  raw
});

const transformNamespace = (raw: any): Namespace => ({
  id: raw.metadata.uid, name: raw.metadata.name, namespace: '', creationTimestamp: raw.metadata.creationTimestamp, labels: raw.metadata.labels || {}, status: raw.status.phase as any,
  raw
});

const transformPod = (raw: any): Pod => {
    let status = raw.status.phase;
    if (raw.metadata.deletionTimestamp) status = 'Terminating';
    const isReady = raw.status.conditions?.some((c: any) => c.type === 'Ready' && c.status === 'True') ?? false;
    return {
      id: raw.metadata.uid, name: raw.metadata.name, namespace: raw.metadata.namespace, creationTimestamp: raw.metadata.creationTimestamp, labels: raw.metadata.labels || {},
      ownerReferences: raw.metadata.ownerReferences, status: status as ResourceStatus, isReady,
      restarts: raw.status.containerStatuses?.reduce((acc: number, c: any) => acc + c.restartCount, 0) || 0,
      node: raw.spec.nodeName, cpuUsage: '0m', memoryUsage: '0Mi', logs: [],
      containers: raw.spec.containers.map((c: any) => ({
        name: c.name,
        image: c.image,
        ports: c.ports || [],
        env: c.env || [],
        resources: c.resources,
        volumeMounts: c.volumeMounts || []
      })),
      volumes: raw.spec.volumes || [], resourceStats: aggregateResources(raw.spec.containers), relatedConfigMaps: [],
      raw
    };
};

const transformDeployment = (raw: any): Deployment => ({
    id: raw.metadata.uid, name: raw.metadata.name, namespace: raw.metadata.namespace, creationTimestamp: raw.metadata.creationTimestamp, labels: raw.metadata.labels || {},
    replicas: raw.spec.replicas, availableReplicas: raw.status.availableReplicas || 0, selector: raw.spec.selector?.matchLabels || {},
    resourceStats: aggregateResources(raw.spec.template?.spec?.containers), conditions: raw.status.conditions || [],
    raw
});

const transformReplicaSet = (raw: any): ReplicaSet => ({
    id: raw.metadata.uid, name: raw.metadata.name, namespace: raw.metadata.namespace, creationTimestamp: raw.metadata.creationTimestamp, labels: raw.metadata.labels || {},
    replicas: raw.spec.replicas, availableReplicas: raw.status.availableReplicas || 0, selector: raw.spec.selector?.matchLabels || {},
    resourceStats: aggregateResources(raw.spec.template?.spec?.containers),
    raw
});

const transformJob = (raw: any): Job => ({
    id: raw.metadata.uid, name: raw.metadata.name, namespace: raw.metadata.namespace, creationTimestamp: raw.metadata.creationTimestamp, labels: raw.metadata.labels || {},
    completions: raw.spec.completions || 1, parallelism: raw.spec.parallelism || 1, succeeded: raw.status.succeeded || 0, active: raw.status.active || 0, failed: raw.status.failed || 0,
    conditions: raw.status.conditions, resourceStats: aggregateResources(raw.spec.template?.spec?.containers),
    raw
});

const transformCronJob = (raw: any): CronJob => ({
    id: raw.metadata.uid, name: raw.metadata.name, namespace: raw.metadata.namespace, creationTimestamp: raw.metadata.creationTimestamp, labels: raw.metadata.labels || {},
    schedule: raw.spec.schedule, lastScheduleTime: raw.status.lastScheduleTime, suspend: raw.spec.suspend || false, active: raw.status.active?.length || 0,
    resourceStats: aggregateResources(raw.spec.jobTemplate?.spec?.template?.spec?.containers),
    raw
});

const transformService = (raw: any): Service => ({
    id: raw.metadata.uid, name: raw.metadata.name, namespace: raw.metadata.namespace, creationTimestamp: raw.metadata.creationTimestamp, labels: raw.metadata.labels || {},
    type: raw.spec.type, clusterIP: raw.spec.clusterIP, ports: raw.spec.ports || [], selector: raw.spec.selector || {},
    raw
});

const transformIngress = (raw: any): Ingress => ({
    id: raw.metadata.uid, name: raw.metadata.name, namespace: raw.metadata.namespace, creationTimestamp: raw.metadata.creationTimestamp, labels: raw.metadata.labels || {},
    loadBalancer: (raw.status?.loadBalancer?.ingress?.[0]?.ip || raw.status?.loadBalancer?.ingress?.[0]?.hostname) || '',
    rules: raw.spec.rules?.map((r: any) => ({
        host: r.host,
        paths: r.http?.paths?.map((p: any) => ({
            path: p.path,
            service: p.backend?.service?.name || p.backend?.serviceName,
            port: p.backend?.service?.port?.number || p.backend?.service?.port?.name || p.backend?.servicePort
        })) || []
    })) || [],
    raw
});

const transformConfigMap = (raw: any): ConfigMap => ({
    id: raw.metadata.uid, name: raw.metadata.name, namespace: raw.metadata.namespace, creationTimestamp: raw.metadata.creationTimestamp, labels: raw.metadata.labels || {}, data: raw.data || {},
    raw
});

const transformEvent = (raw: any): K8sEvent => ({
    id: raw.metadata.uid, name: raw.metadata.name, namespace: raw.metadata.namespace, creationTimestamp: raw.metadata.creationTimestamp, labels: raw.metadata.labels || {},
    message: raw.message, reason: raw.reason, source: raw.source, type: raw.type, lastTimestamp: raw.lastTimestamp, involvedObject: raw.involvedObject,
    raw
});

const transformResourceQuota = (raw: any): ResourceQuota => ({
    id: raw.metadata.uid, name: raw.metadata.name, namespace: raw.metadata.namespace, creationTimestamp: raw.metadata.creationTimestamp, labels: raw.metadata.labels || {}, spec: raw.spec, status: raw.status,
    raw
});

const execute = async (command: string, notifyOnError: boolean = true): Promise<any> => {
    const isSpam = (command.includes('get ') || command.includes('top ')) && !command.includes(' --watch') && !command.includes('logs');
    if (logToTerminal && !isSpam) logToTerminal(`> ${command}`);
    try {
        const response = await fetch(`${BACKEND_BASE_URL}/api/kubectl`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }),
            signal: AbortSignal.timeout(30000)
        });
        if (!response.ok) {
             const err = await response.json().catch(() => ({ error: "Backend execution failed" }));
             // Include stderr if available as it often contains AWS SSO error details
             const errorMsg = err.stderr ? `${err.error}\n${err.stderr}` : err.error;
             throw new Error(errorMsg || "Backend execution failed");
        }
        const result = await response.json();
        if (command.includes('-o json') || command.includes('config view')) {
             if (!result.data || result.data.trim() === '') return { items: [] };
             try {
                return JSON.parse(result.data);
             } catch (parseErr) {
                 console.warn("Malformed JSON response for:", command);
                 return { items: [] };
             }
        }
        return result.data;
    } catch (e: any) {
        if (notifyOnError && globalErrorHandler) {
            const isConnectionError = e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError') || e.message?.includes('refused');
            const msg = e.name === 'TimeoutError' ? 'Kubectl operation timed out' : (isConnectionError ? `Cannot reach local backend (port ${BACKEND_PORT})` : e.message);
            globalErrorHandler(msg || String(e));
        }
        throw e;
    }
}

const executeWithVerification = async <T = any>(cmdDef: CommandDefinition, args: any[] = [], notifyOnError = true): Promise<T> => {
    const run = async() => execute(cmdDef.command(...args), notifyOnError);
    if (!cmdDef.shouldVerify) return await run();
    if (!storeDispatch) throw new Error("Dispatcher missing");
    const { title, message } = cmdDef.verification ? cmdDef.verification(...args) : { title: 'Confirm', message: 'Execute command?' };
    return new Promise((resolve, reject) => {
        storeDispatch!({
            type: 'OPEN_CONFIRMATION_MODAL', payload: { title, message,
                onConfirm: async () => { try { resolve(await run()); } catch(e) { reject(e); } },
                onCancel: () => reject(new Error("Cancelled"))
            }
        });
    });
}

const parseMetrics = (output: string): Record<string, { cpu: string, memory: string }> => {
    const metrics: Record<string, { cpu: string, memory: string }> = {};
    const lines = output.trim().split('\n');
    lines.forEach(line => {
        if (!line || line.startsWith('NAME')) return;
        const parts = line.trim().split(/\s+/);
        if (parts.length === 3) metrics[parts[0]] = { cpu: parts[1], memory: parts[2] };
        else if (parts.length === 4) metrics[parts[1]] = { cpu: parts[2], memory: parts[3] };
    });
    return metrics;
}

export const kubectl = {
  setLogger, setGlobalErrorHandler, setDispatcher,
  getConnectableContexts: async (notify = true): Promise<{name: string}[]> => {
     try { const data = await executeWithVerification(KUBECTL_COMMANDS.configView, [], notify); return data.contexts || []; } catch (e) { return []; }
  },
  setContext: async (contextName: string): Promise<void> => {
      try { await executeWithVerification(KUBECTL_COMMANDS.useContext, [contextName], true); } catch (e) {}
  },
  deleteResource: async (type: string, name: string, namespace: string, resourceId?: string): Promise<void> => {
      try {
          await executeWithVerification(KUBECTL_COMMANDS.deleteResource, [type, name, namespace]);
          if (storeDispatch) {
               if (resourceId) { storeDispatch({ type: 'DELETE_RESOURCE', payload: { id: resourceId, type } }); storeDispatch({ type: 'CLOSE_DRAWER' }); }
               else { storeDispatch({ type: 'ADD_LOG', payload: `${type} ${name} deleted` }); }
          }
      } catch (e) {}
  },
  deleteResources: async (ids: string[], type: string, items: { name: string, namespace: string }[]): Promise<void> => {
      if (!storeDispatch) return;
      const { title, message } = KUBECTL_COMMANDS.bulkDelete.verification!(ids.length, type);
      try {
        await new Promise((resolve, reject) => {
            storeDispatch!({ type: 'OPEN_CONFIRMATION_MODAL', payload: { title, message,
                onConfirm: async () => { try { for (const item of items) { await executeWithVerification({ ...KUBECTL_COMMANDS.deleteResource, shouldVerify: false }, [type, item.name, item.namespace]); } if (storeDispatch) storeDispatch({ type: 'BULK_DELETE_RESOURCE', payload: { ids, type } }); resolve(true); } catch (e) { reject(e); } },
                onCancel: () => reject(new Error("Cancelled"))
            }});
        });
      } catch (e) {}
  },
  rolloutRestart: async (type: string, name: string, namespace: string, resourceId?: string): Promise<void> => {
      try {
          await executeWithVerification(KUBECTL_COMMANDS.rolloutRestart, [type, name, namespace]);
          if (storeDispatch) { storeDispatch({ type: 'ROLLOUT_RESTART', payload: { id: resourceId || '', type } }); storeDispatch({ type: 'ADD_LOG', payload: `${type} ${name} restarted` }); }
      } catch (e) {}
  },
  triggerCronJob: async (name: string, namespace: string): Promise<void> => {
      try {
          await executeWithVerification(KUBECTL_COMMANDS.triggerCronJob, [name, namespace]);
          if (storeDispatch) { storeDispatch({ type: 'ADD_LOG', payload: `CronJob ${name} triggered manually` }); }
      } catch (e) {}
  },
  applyYaml: async (yaml: string, namespace: string): Promise<void> => {
      if (logToTerminal) logToTerminal(`> kubectl apply -f -`);
      try {
          const response = await fetch(`${BACKEND_BASE_URL}/api/kubectl/apply`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ yaml, namespace })
          });
          if (!response.ok) {
              const err = await response.json();
              throw new Error(err.error || "Failed to apply YAML");
          }
          const result = await response.json();
          if (storeDispatch) storeDispatch({ type: 'ADD_LOG', payload: `Apply success: ${result.data.trim()}` });
      } catch (e: any) {
          if (globalErrorHandler) globalErrorHandler(e.message);
          throw e;
      }
  },
  scaleDeployment: async(id: string, name: string, namespace: string, replicas: number): Promise<void> => {
      try { await executeWithVerification(KUBECTL_COMMANDS.scaleDeployment, [name, namespace, replicas]); if (storeDispatch) storeDispatch({ type: 'SCALE_DEPLOYMENT', payload: { id, replicas } }); } catch(e) {}
  },
  exec: async (podName: string, namespace: string, container: string, cmd: string): Promise<string> => {
      try { return await executeWithVerification(KUBECTL_COMMANDS.exec, [podName, namespace, container, cmd], true); } catch(e) { return ""; }
  },
  getLogs: async (name: string, ns: string, container?: string, previous?: boolean, grep?: string, dateFrom?: string, dateTo?: string): Promise<string[]> => {
      try {
        const data = await executeWithVerification(KUBECTL_COMMANDS.logs, [name, ns, container, previous, grep, dateFrom, dateTo], false);
        return typeof data === 'string' ? data.split('\n').filter(line => line.trim() !== '') : [];
      } catch (e) {
        return [(e as any).message || "Failed to fetch logs"];
      }
  },
  getDeploymentLogs: async (deploymentName: string, ns: string, grep?: string, dateFrom?: string, dateTo?: string): Promise<string[]> => {
      try {
        const data = await executeWithVerification(KUBECTL_COMMANDS.logsWithSelector, [`release=${deploymentName}`, ns, grep, dateFrom, dateTo], false);
        return typeof data === 'string' ? data.split('\n').filter(line => line.trim() !== '') : [];
      } catch (e) {
        return [(e as any).message || "Failed to fetch deployment logs"];
      }
  },
  openShell: async (podName: string, namespace: string, container: string): Promise<void> => {
      try { await fetch(`${BACKEND_BASE_URL}/api/kubectl/shell`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pod: podName, namespace, container }) }); } catch (e) {}
  },
  startPortForward: async (id: string, type: string, name: string, namespace: string, localPort: number, remotePort: number): Promise<{ pid: number; localPort?: number }> => {
      const response = await fetch(`${BACKEND_BASE_URL}/api/port-forward/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commandArgs: ['port-forward', '-n', namespace, `${type}/${name}`, `${localPort}:${remotePort}`], metadata: { id, resourceName: name, resourceType: type, namespace, localPort, remotePort } }) });
      if (!response.ok) throw new Error("PF start failed");
      const data = await response.json();
      return { pid: data.pid, localPort: data.localPort };
  },
  stopPortForward: async (pid: number): Promise<void> => {
      await fetch(`${BACKEND_BASE_URL}/api/port-forward/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pid }) });
  },
  getNodes: async (notify = true) => (await executeWithVerification(KUBECTL_COMMANDS.getNodes, [], notify)).items?.map(transformNode) || [],
  getNamespaces: async (notify = true) => (await executeWithVerification({ command: () => 'kubectl get namespaces -o json', shouldVerify: false }, [], notify)).items?.map(transformNamespace) || [],
  getDeployments: async (ns = 'All Namespaces', notify = true) => (await executeWithVerification(KUBECTL_COMMANDS.getDeployments, [ns], notify)).items?.map(transformDeployment) || [],
  getReplicaSets: async (ns = 'All Namespaces', notify = true) => (await executeWithVerification(KUBECTL_COMMANDS.getReplicaSets, [ns], notify)).items?.map(transformReplicaSet) || [],
  getPods: async (ns = 'All Namespaces', notify = true) => (await executeWithVerification(KUBECTL_COMMANDS.getPods, [ns], notify)).items?.map(transformPod) || [],
  getPodMetrics: async (ns = 'All Namespaces', notify = true) => parseMetrics(await executeWithVerification(KUBECTL_COMMANDS.topPods, [ns], notify)),
  getJobs: async (ns = 'All Namespaces', notify = true) => (await executeWithVerification(KUBECTL_COMMANDS.getJobs, [ns], notify)).items?.map(transformJob) || [],
  getCronJobs: async (ns = 'All Namespaces', notify = true) => (await executeWithVerification(KUBECTL_COMMANDS.getCronJobs, [ns], notify)).items?.map(transformCronJob) || [],
  getServices: async (ns = 'All Namespaces', notify = true) => (await executeWithVerification(KUBECTL_COMMANDS.getServices, [ns], notify)).items?.map(transformService) || [],
  getIngresses: async (ns = 'All Namespaces', notify = true) => (await executeWithVerification(KUBECTL_COMMANDS.getIngresses, [ns], notify)).items?.map(transformIngress) || [],
  getConfigMaps: async (ns = 'All Namespaces', notify = true) => (await executeWithVerification(KUBECTL_COMMANDS.getConfigMaps, [ns], notify)).items?.map(transformConfigMap) || [],
  getEvents: async (ns = 'All Namespaces', notify = true) => (await executeWithVerification(KUBECTL_COMMANDS.getEvents, [ns], notify)).items?.map(transformEvent) || [],
  getResourceQuotas: async (ns = 'All Namespaces', notify = true) => (await executeWithVerification(KUBECTL_COMMANDS.getResourceQuotas, [ns], notify)).items?.map(transformResourceQuota) || [],
  getPortForwards: async(_notify = true): Promise<PortForward[]> => {
      try { const res = await fetch(`${BACKEND_BASE_URL}/api/port-forward/list`); const data = await res.json(); return data.items || []; } catch (e) { return []; }
  },
  getResource: async (type: string, name: string, ns: string, notify = true): Promise<any> => {
      try {
          const mapping: any = { pod: [KUBECTL_COMMANDS.getPod, transformPod], deployment: [KUBECTL_COMMANDS.getDeployment, transformDeployment], replicaset: [KUBECTL_COMMANDS.getReplicaSet, transformReplicaSet], job: [KUBECTL_COMMANDS.getJob, transformJob], cronjob: [KUBECTL_COMMANDS.getCronJob, transformCronJob], node: [KUBECTL_COMMANDS.getNode, transformNode], service: [KUBECTL_COMMANDS.getService, transformService], ingress: [KUBECTL_COMMANDS.getIngress, transformIngress], configmap: [KUBECTL_COMMANDS.getConfigMap, transformConfigMap], namespace: [KUBECTL_COMMANDS.getNamespace, transformNamespace], resourcequota: [KUBECTL_COMMANDS.getResourceQuota, transformResourceQuota] };
          const [cmdDef, transform] = mapping[type]; const args = type === 'node' || type === 'namespace' ? [name] : [name, ns];
          const data = await executeWithVerification(cmdDef, args, notify); return transform(data);
      } catch (e) { return null; }
  }
};
