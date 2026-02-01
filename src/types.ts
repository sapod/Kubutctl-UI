
export enum ResourceStatus {
  Running = 'Running',
  Pending = 'Pending',
  Failed = 'Failed',
  Succeeded = 'Succeeded',
  CrashLoopBackOff = 'CrashLoopBackOff',
  ContainerCreating = 'ContainerCreating',
  Completed = 'Completed',
  Suspended = 'Suspended',
  Bound = 'Bound',
  Terminating = 'Terminating',
}

export interface K8sResource {
  id: string;
  name: string;
  namespace: string;
  creationTimestamp: string;
  labels: Record<string, string>;
  ownerReferences?: { kind: string; name: string; uid: string }[];
  raw?: any; // The full original manifest from Kubernetes
}

export interface ContainerPort {
  name?: string;
  containerPort: number;
  protocol: string;
}

export interface ContainerEnvVar {
  name: string;
  value?: string;
  valueFrom?: {
    configMapKeyRef?: { name: string; key: string };
    secretKeyRef?: { name: string; key: string };
    fieldRef?: { fieldPath: string };
    resourceFieldRef?: { resource: string };
  };
}

export interface Container {
  name: string;
  image: string;
  ports: ContainerPort[];
  env?: ContainerEnvVar[];
  resources?: {
      requests?: { cpu: string; memory: string };
      limits?: { cpu: string; memory: string };
  };
  volumeMounts?: {
      name: string;
      readOnly?: boolean;
      mountPath: string;
      subPath?: string;
  }[];
}

export interface Pod extends K8sResource {
  status: ResourceStatus;
  isReady: boolean;
  restarts: number;
  node: string;
  cpuUsage: string;
  memoryUsage: string;
  logs: string[];
  containers: Container[];
  volumes: any[]; // Store volumes as raw objects
  resourceStats: ResourceStats;
  relatedConfigMaps: string[];
}

export interface ResourceStats {
  requests: { cpu: string; memory: string };
  limits: { cpu: string; memory: string };
}

export interface DeploymentCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

export interface Deployment extends K8sResource {
  replicas: number;
  availableReplicas: number;
  selector: Record<string, string>;
  resourceStats: ResourceStats;
  conditions: DeploymentCondition[];
}

export interface ReplicaSet extends K8sResource {
  replicas: number;
  availableReplicas: number;
  selector: Record<string, string>;
  resourceStats: ResourceStats;
}

export interface Job extends K8sResource {
  completions: number;
  parallelism: number;
  succeeded: number;
  active: number;
  failed: number;
  conditions?: { type: string; status: string; reason?: string; message?: string }[];
  resourceStats: ResourceStats;
}

export interface CronJob extends K8sResource {
  schedule: string;
  lastScheduleTime: string;
  suspend: boolean;
  active: number;
  resourceStats: ResourceStats;
}

export interface Node extends K8sResource {
  status: 'Ready' | 'NotReady';
  roles: string[];
  version: string;
  cpuCapacity: string;
  memoryCapacity: string;
  cpuAllocatable: string;
  memoryAllocatable: string;
}

export interface ServicePort {
  name?: string;
  port: number;
  targetPort: string | number;
  protocol: string;
}

export interface Service extends K8sResource {
  type: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  clusterIP: string;
  ports: ServicePort[];
  selector: Record<string, string>;
}

export interface Ingress extends K8sResource {
  loadBalancer: string;
  rules: { host: string; paths: { path: string; service: string; port: number | string }[] }[];
}

export interface ConfigMap extends K8sResource {
  data: Record<string, string>;
}

export interface Namespace extends K8sResource {
  status: 'Active' | 'Terminating';
}

export interface K8sEvent extends K8sResource {
  message: string;
  reason: string;
  source: { component: string; host?: string };
  type: 'Normal' | 'Warning';
  lastTimestamp: string;
  involvedObject: { kind: string; name: string; namespace: string; uid: string };
}

export interface ResourceQuota extends K8sResource {
  spec: {
    hard: Record<string, string>;
  };
  status: {
    hard: Record<string, string>;
    used: Record<string, string>;
  };
}

export interface PortForward {
  id: string;
  pid?: number; // System process ID
  resourceName: string;
  resourceType: 'pod' | 'service' | 'deployment';
  namespace: string;
  localPort: number;
  remotePort: number;
  status: 'Active' | 'Stopped';
}

export interface PortForwardRoutineItem {
    id: string;
    namespace: string;
    resourceType: 'deployment' | 'pod' | 'service';
    resourceName: string;
    localPort: number;
    remotePort: number;
}

export interface PortForwardRoutine {
    id: string;
    name: string;
    items: PortForwardRoutineItem[];
}

export interface Cluster {
  id: string;
  name: string;
  server: string;
  status: 'Active' | 'Disconnected' | 'Connecting';
  initials: string;
  color: string; // Background color (hex or class)
  textColor: string; // Foreground color
  isFavorite: boolean;
  favoriteTimestamp?: number; // For sorting order
}

export type View =
  | 'overview'
  | 'nodes'
  | 'pods'
  | 'deployments'
  | 'replicasets'
  | 'jobs'
  | 'cronjobs'
  | 'services'
  | 'ingresses'
  | 'configmaps'
  | 'namespaces'
  | 'resourcequotas'
  | 'port-forwarding';

export interface AppState {
  isStoreInitialized: boolean;
  view: View;
  isLoading: boolean;
  isContextSwitching: boolean; // Lock UI during context switch
  error: string | null; // Added global error state
  awsSsoLoginRequired: boolean; // Block UI when AWS SSO login is needed
  externalContextMismatch: boolean; // Block UI when kubectl context was changed externally
  isVerifyingConnection: boolean; // Show loading overlay when verifying connection after inactivity
  lastActiveTimestamp: number; // Track when the app was last active
  currentClusterId: string;
  selectedNamespace: string; // 'All Namespaces' or specific name
  clusters: Cluster[];
  nodes: Node[];
  pods: Pod[];
  deployments: Deployment[];
  replicaSets: ReplicaSet[];
  jobs: Job[];
  cronJobs: CronJob[];
  services: Service[];
  ingresses: Ingress[];
  configMaps: ConfigMap[];
  namespaces: Namespace[];
  events: K8sEvent[];
  resourceQuotas: ResourceQuota[];
  portForwards: PortForward[];
  routines: PortForwardRoutine[];
  terminalOutput: string[];
  selectedResourceId: string | null;
  selectedResourceType: 'pod' | 'deployment' | 'replicaset' | 'job' | 'cronjob' | 'node' | 'service' | 'ingress' | 'configmap' | 'namespace' | 'event' | 'resourcequota' | null;
  resourceHistory: { id: string; type: AppState['selectedResourceType'] }[]; // Call stack for navigation
  drawerOpen: boolean;
  isAddClusterModalOpen: boolean;
  isCatalogOpen: boolean;
  // Port Forward Modal State
  isPortForwardModalOpen: boolean;
  portForwardModalData: { resourceName: string; resourceType: string; port: number; namespace: string } | null;
  // Routine Modal State
  isRoutineModalOpen: boolean;
  routineModalData: PortForwardRoutine | null;
  // Shell Modal State
  isShellModalOpen: boolean;
  shellModalData: { podName: string; namespace: string; containers: string[] } | null;
  // Confirmation Modal State
  isConfirmationModalOpen: boolean;
  confirmationModalData: { title: string; message: string; onConfirm: () => void; onCancel?: () => void } | null;
  // Replace Logs Tab Modal State
  isReplaceLogsTabModalOpen: boolean;
  replaceLogsTabModalData: {
    type: 'pod' | 'deployment' | 'all-pods';
    podName?: string;
    deploymentName?: string;
    namespace: string;
    container?: string;
  } | null;
  // Logs Target State (for bottom panel)
  logsTarget: {
    type: 'pod' | 'deployment' | 'all-pods';
    podName?: string;
    deploymentName?: string;
    namespace: string;
    container?: string;
  } | null;
  // Logs Panel State (persisted across docked/undocked modes) - now an array of tabs
  logsTabs: LogsTabState[];
  activeLogsTabId: string;
}

// Single logs tab state
export interface LogsTabState {
  id: string;
  selectedDeployment: string;
  selectedPod: string;
  selectedContainer: string;
  showPrevious: boolean;
  searchQuery: string;
  showSearch: boolean;
  dateFrom: string;
  dateTo: string;
  appliedDateFrom: string;
  appliedDateTo: string;
  autoRefreshEnabled: boolean;
  autoRefreshInterval: number;
  lastUpdated?: number; // Timestamp to track forced updates
}

export type Action =
  | { type: 'SET_VIEW'; payload: View }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_STORE_INITIALIZED'; payload: boolean }
  | { type: 'SET_CONTEXT_SWITCHING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_VERIFYING_CONNECTION'; payload: boolean }
  | { type: 'UPDATE_LAST_ACTIVE_TIMESTAMP'; payload: number }
  | { type: 'SET_DATA'; payload: Partial<AppState> }
  | { type: 'SELECT_CLUSTER'; payload: string }
  | { type: 'DISCONNECT_CLUSTER'; payload: string }
  | { type: 'SELECT_NAMESPACE'; payload: string }
  | { type: 'ADD_CLUSTER'; payload: Cluster }
  | { type: 'REMOVE_CLUSTER'; payload: string }
  | { type: 'UPDATE_CLUSTER'; payload: Cluster }
  | { type: 'TOGGLE_ADD_CLUSTER_MODAL'; payload: boolean }
  | { type: 'TOGGLE_CATALOG_MODAL'; payload: boolean }
  | { type: 'DELETE_RESOURCE'; payload: { id: string, type: string } }
  | { type: 'BULK_DELETE_RESOURCE'; payload: { ids: string[], type: string } }
  | { type: 'SCALE_DEPLOYMENT'; payload: { id: string; replicas: number } }
  | { type: 'ROLLOUT_RESTART'; payload: { id: string; type: string } }
  | { type: 'ADD_LOG'; payload: string }
  | { type: 'SELECT_RESOURCE'; payload: { id: string; type: AppState['selectedResourceType'] } }
  | { type: 'DRILL_DOWN_RESOURCE'; payload: { id: string; type: AppState['selectedResourceType'] } }
  | { type: 'GO_BACK_RESOURCE' }
  | { type: 'CLOSE_DRAWER' }
  | { type: 'CLOSE_DRAWER_SILENTLY' }
  | { type: 'UPDATE_POD_STATUS'; payload: { id: string; status: ResourceStatus } }
  | { type: 'ADD_PORT_FORWARD'; payload: PortForward }
  | { type: 'REMOVE_PORT_FORWARD'; payload: string }
  | { type: 'BULK_REMOVE_PORT_FORWARD'; payload: string[] }
  | { type: 'OPEN_PF_MODAL'; payload: { resourceName: string; resourceType: string; port: number; namespace: string } }
  | { type: 'CLOSE_PF_MODAL' }
  | { type: 'ADD_ROUTINE'; payload: PortForwardRoutine }
  | { type: 'REMOVE_ROUTINE'; payload: string }
  | { type: 'UPDATE_ROUTINE'; payload: PortForwardRoutine }
  | { type: 'OPEN_ROUTINE_MODAL'; payload: PortForwardRoutine | null }
  | { type: 'CLOSE_ROUTINE_MODAL' }
  | { type: 'OPEN_SHELL_MODAL'; payload: { podName: string; namespace: string; containers: string[] } }
  | { type: 'CLOSE_SHELL_MODAL' }
  | { type: 'OPEN_CONFIRMATION_MODAL'; payload: { title: string; message: string; onConfirm: () => void; onCancel?: () => void } }
  | { type: 'CLOSE_CONFIRMATION_MODAL' }
  | { type: 'OPEN_REPLACE_LOGS_TAB_MODAL'; payload: AppState['replaceLogsTabModalData'] }
  | { type: 'CLOSE_REPLACE_LOGS_TAB_MODAL' }
  | { type: 'SET_LOGS_TARGET'; payload: AppState['logsTarget'] }
  | { type: 'OPEN_LOGS_FOR_RESOURCE'; payload: { type: 'pod' | 'all-pods'; podName?: string; deploymentName?: string; namespace: string; container?: string; targetTabId?: string; forceRefresh?: boolean } }
  | { type: 'UPDATE_LOGS_TAB'; payload: { tabId: string; updates: Partial<LogsTabState> } }
  | { type: 'ADD_LOGS_TAB'; payload?: LogsTabState }
  | { type: 'REMOVE_LOGS_TAB'; payload: string }
  | { type: 'SET_ACTIVE_LOGS_TAB'; payload: string }
  | { type: 'RESET_LOGS_TABS' }
  | { type: 'SET_AWS_SSO_LOGIN_REQUIRED'; payload: boolean }
  | { type: 'SET_EXTERNAL_CONTEXT_MISMATCH'; payload: boolean }
  | { type: 'UPDATE_RESOURCE'; payload: { id: string; type: string; data: any } };
