
import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { AppState, Action, Cluster,
    Pod,
    View, PortForwardRoutine } from './types';
import { kubectl } from './services/kubectl';

const DEFAULT_CLUSTERS: Cluster[] = [];
const INACTIVITY_TIMEOUT = 5 * 60 * 1000;

const getStoredNamespace = (clusterId: string) => { try { return localStorage.getItem(`kube_selected_namespace_${clusterId}`) || 'All Namespaces'; } catch { return 'All Namespaces'; } };
const getStoredClusters = (): Cluster[] => { try { const stored = localStorage.getItem('kube_clusters'); return stored ? JSON.parse(stored) : DEFAULT_CLUSTERS; } catch { return DEFAULT_CLUSTERS; } };
const getStoredRoutines = (): PortForwardRoutine[] => { try { const stored = localStorage.getItem('kube_routines'); return stored ? JSON.parse(stored) : []; } catch { return []; } };
const getStoredCurrentClusterId = (clusters: Cluster[]): string => { try { const storedId = localStorage.getItem('kube_current_cluster_id'); if (storedId && clusters.some(c => c.id === storedId)) return storedId; return clusters.length > 0 ? clusters[0].id : ''; } catch { return clusters.length > 0 ? clusters[0].id : ''; } };
const saveClusterState = (clusterId: string, data: any) => { try { localStorage.setItem(`kube_state_${clusterId}`, JSON.stringify(data)); } catch (e) {} };
const loadClusterState = (clusterId: string) => { try { const raw = localStorage.getItem(`kube_state_${clusterId}`); if (raw) return JSON.parse(raw); } catch {} return { view: 'overview' as View, drawerOpen: false, selectedResourceId: null, selectedResourceType: null, resourceHistory: [] }; };

// Helper functions for logsState persistence
const saveLogsState = (logsState: any) => { try { localStorage.setItem('kube_logs_state', JSON.stringify(logsState)); } catch (e) {} };
const getStoredLogsState = () => {
  try {
    const stored = localStorage.getItem('kube_logs_state');
    if (stored) return JSON.parse(stored);
  } catch {}
  return {
    selectedDeployment: '',
    selectedPod: '',
    selectedContainer: '',
    showPrevious: false,
    searchQuery: '',
    showSearch: false,
    dateFrom: '',
    dateTo: '',
    appliedDateFrom: '',
    appliedDateTo: '',
    autoRefreshEnabled: true,
    autoRefreshInterval: 5000,
  };
};

const storedClusters = getStoredClusters();
const initialClusterId = getStoredCurrentClusterId(storedClusters);
const initialClusterState = loadClusterState(initialClusterId);

const initialState: AppState = {
  view: initialClusterState.view, isLoading: false, isContextSwitching: false, error: null, awsSsoLoginRequired: false, externalContextMismatch: false, currentClusterId: initialClusterId, selectedNamespace: getStoredNamespace(initialClusterId), clusters: storedClusters, nodes: [], pods: [], deployments: [], replicaSets: [], jobs: [], cronJobs: [], services: [], ingresses: [], configMaps: [], namespaces: [], events: [], resourceQuotas: [], portForwards: [], routines: getStoredRoutines(), terminalOutput: ['Welcome to Kubectl-UI', 'Initializing application...'], selectedResourceId: null, selectedResourceType: null, resourceHistory: [], drawerOpen: false, isAddClusterModalOpen: false, isCatalogOpen: false, isPortForwardModalOpen: false, portForwardModalData: null, isRoutineModalOpen: false, routineModalData: null, isShellModalOpen: false, shellModalData: null, isConfirmationModalOpen: false, confirmationModalData: null, logsTarget: null,
  logsState: getStoredLogsState(),
  isStoreInitialized: false,
};

// Simplified reducer signature using updated Action type
function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_STORE_INITIALIZED': return { ...state, isStoreInitialized: true };
    case 'SET_DATA': return { ...state, ...action.payload };
    case 'SET_VIEW': { const newState = { ...state, view: action.payload, drawerOpen: false, selectedResourceId: null, selectedResourceType: null, resourceHistory: [], error: null }; saveClusterState(state.currentClusterId, { view: newState.view, drawerOpen: false, selectedResourceId: null, selectedResourceType: null, resourceHistory: [] }); return newState; }
    case 'SET_LOADING': return { ...state, isLoading: action.payload };
    case 'SET_CONTEXT_SWITCHING': return { ...state, isContextSwitching: action.payload };
    case 'SET_ERROR': return { ...state, error: action.payload, isLoading: false };
    case 'SELECT_CLUSTER': {
      try {
        localStorage.setItem('kube_current_cluster_id', action.payload);
      } catch {}
      const nextNs = getStoredNamespace(action.payload);
      const nextState = loadClusterState(action.payload);
      const isActualSwitch = state.currentClusterId !== action.payload;

      return {
        ...state,
        currentClusterId: action.payload,
        selectedNamespace: nextNs,
        view: nextState.view,
        // Always start with drawer closed when switching clusters
        drawerOpen: false,
        selectedResourceId: null,
        selectedResourceType: null,
        resourceHistory: [],
        terminalOutput: [...state.terminalOutput, `Context switch: ${state.clusters.find(c => c.id === action.payload)?.name}`],
        error: null,
        // Clear external context mismatch when user selects a cluster
        externalContextMismatch: false,
        // Only set isContextSwitching if actually switching clusters
        isContextSwitching: isActualSwitch
      };
    }
    case 'DISCONNECT_CLUSTER': { const updated = state.clusters.map(c => c.id === action.payload ? { ...c, status: 'Disconnected' } : c); localStorage.setItem('kube_clusters', JSON.stringify(updated)); return { ...state, clusters: updated as Cluster[] }; }
    case 'SELECT_NAMESPACE': { localStorage.setItem(`kube_selected_namespace_${state.currentClusterId}`, action.payload); return { ...state, selectedNamespace: action.payload }; }
    case 'ADD_CLUSTER': { if (state.clusters.some(c => c.name === action.payload.name)) return state; const updated = [...state.clusters, action.payload]; localStorage.setItem('kube_clusters', JSON.stringify(updated)); return { ...state, clusters: updated, isAddClusterModalOpen: false }; }
    case 'REMOVE_CLUSTER': { const updated = state.clusters.filter(c => c.id !== action.payload); localStorage.setItem('kube_clusters', JSON.stringify(updated)); let nextId = state.currentClusterId === action.payload ? (updated.length > 0 ? updated[0].id : '') : state.currentClusterId; localStorage.setItem('kube_current_cluster_id', nextId); const nextState = loadClusterState(nextId); const nextNs = getStoredNamespace(nextId); return { ...state, clusters: updated, currentClusterId: nextId, selectedNamespace: nextNs, view: nextState.view, drawerOpen: nextState.drawerOpen, selectedResourceId: nextState.selectedResourceId, selectedResourceType: nextState.selectedResourceType, resourceHistory: nextState.resourceHistory || [] }; }
    case 'UPDATE_CLUSTER': { const updated = state.clusters.map(c => c.id === action.payload.id ? action.payload : c); localStorage.setItem('kube_clusters', JSON.stringify(updated)); return { ...state, clusters: updated }; }
    case 'TOGGLE_ADD_CLUSTER_MODAL': return { ...state, isAddClusterModalOpen: action.payload };
    case 'TOGGLE_CATALOG_MODAL': return { ...state, isCatalogOpen: action.payload };
    case 'DELETE_RESOURCE': { let next = { ...state }; if (action.payload.type === 'pod') next.pods = state.pods.filter(p => p.id !== action.payload.id); if (action.payload.type === 'deployment') next.deployments = state.deployments.filter(d => d.id !== action.payload.id); if (action.payload.type === 'job') next.jobs = state.jobs.filter(d => d.id !== action.payload.id); if (action.payload.type === 'replicaset') next.replicaSets = state.replicaSets.filter(d => d.id !== action.payload.id); return next; }
    case 'BULK_DELETE_RESOURCE': { let next = { ...state }; if (action.payload.type === 'pod') next.pods = state.pods.filter(p => !action.payload.ids.includes(p.id)); return next; }
    case 'SCALE_DEPLOYMENT': return { ...state, deployments: state.deployments.map(d => d.id === action.payload.id ? { ...d, replicas: action.payload.replicas } : d) };
    case 'ROLLOUT_RESTART': return { ...state, terminalOutput: [...state.terminalOutput, `${action.payload.type} restarted.`] };
    case 'ADD_LOG': return { ...state, terminalOutput: [...state.terminalOutput, action.payload] };
    case 'SELECT_RESOURCE': { const next = { ...state, selectedResourceId: action.payload.id, selectedResourceType: action.payload.type, resourceHistory: [], drawerOpen: true }; saveClusterState(state.currentClusterId, { view: next.view, drawerOpen: true, selectedResourceId: action.payload.id, selectedResourceType: action.payload.type, resourceHistory: [] }); return next; }
    case 'DRILL_DOWN_RESOURCE': { const hist = [...state.resourceHistory]; if (state.selectedResourceId && state.selectedResourceType) hist.push({ id: state.selectedResourceId, type: state.selectedResourceType }); const next = { ...state, selectedResourceId: action.payload.id, selectedResourceType: action.payload.type, resourceHistory: hist, drawerOpen: true }; saveClusterState(state.currentClusterId, { view: next.view, drawerOpen: true, selectedResourceId: next.selectedResourceId, selectedResourceType: next.selectedResourceType, resourceHistory: hist }); return next; }
    case 'GO_BACK_RESOURCE': { const hist = [...state.resourceHistory]; const prev = hist.pop(); if (!prev) return state; const next = { ...state, selectedResourceId: prev.id, selectedResourceType: prev.type, resourceHistory: hist, drawerOpen: true }; saveClusterState(state.currentClusterId, { view: next.view, drawerOpen: true, selectedResourceId: next.selectedResourceId, selectedResourceType: next.selectedResourceType, resourceHistory: hist }); return next; }
    case 'CLOSE_DRAWER': { const next = { ...state, drawerOpen: false, selectedResourceId: null, selectedResourceType: null, resourceHistory: [] }; saveClusterState(state.currentClusterId, { view: next.view, drawerOpen: false, selectedResourceId: null, selectedResourceType: null, resourceHistory: [] }); return next; }
    case 'UPDATE_POD_STATUS': return { ...state, pods: state.pods.map(p => p.id === action.payload.id ? { ...p, status: action.payload.status } : p) };
    case 'ADD_PORT_FORWARD': return { ...state, portForwards: [...state.portForwards, action.payload] };
    case 'REMOVE_PORT_FORWARD': return { ...state, portForwards: state.portForwards.filter(pf => pf.id !== action.payload) };
    case 'BULK_REMOVE_PORT_FORWARD': return { ...state, portForwards: state.portForwards.filter(pf => !action.payload.includes(pf.id)) };
    case 'OPEN_PF_MODAL': return { ...state, isPortForwardModalOpen: true, portForwardModalData: action.payload };
    case 'CLOSE_PF_MODAL': return { ...state, isPortForwardModalOpen: false, portForwardModalData: null };
    case 'ADD_ROUTINE': { const updated = [...state.routines, action.payload]; localStorage.setItem('kube_routines', JSON.stringify(updated)); return { ...state, routines: updated }; }
    case 'REMOVE_ROUTINE': { const updated = state.routines.filter(r => r.id !== action.payload); localStorage.setItem('kube_routines', JSON.stringify(updated)); return { ...state, routines: updated }; }
    case 'UPDATE_ROUTINE': { const updated = state.routines.map(r => r.id === action.payload.id ? action.payload : r); localStorage.setItem('kube_routines', JSON.stringify(updated)); return { ...state, routines: updated }; }
    case 'OPEN_ROUTINE_MODAL': return { ...state, isRoutineModalOpen: true, routineModalData: action.payload };
    case 'CLOSE_ROUTINE_MODAL': return { ...state, isRoutineModalOpen: false, routineModalData: null };
    case 'OPEN_SHELL_MODAL': return { ...state, isShellModalOpen: true, shellModalData: action.payload };
    case 'CLOSE_SHELL_MODAL': return { ...state, isShellModalOpen: false, shellModalData: null };
    case 'OPEN_CONFIRMATION_MODAL': return { ...state, isConfirmationModalOpen: true, confirmationModalData: action.payload };
    case 'CLOSE_DRAWER_SILENTLY': return { ...state, drawerOpen: false };
    case 'CLOSE_CONFIRMATION_MODAL': return { ...state, isConfirmationModalOpen: false, confirmationModalData: null };
    case 'SET_LOGS_TARGET': return { ...state, logsTarget: action.payload };
    case 'UPDATE_LOGS_STATE': {
      const newLogsState = { ...state.logsState, ...action.payload };
      saveLogsState(newLogsState);
      return { ...state, logsState: newLogsState };
    }
    case 'SET_AWS_SSO_LOGIN_REQUIRED': return { ...state, awsSsoLoginRequired: action.payload };
    case 'SET_EXTERNAL_CONTEXT_MISMATCH': {
      // When external context mismatch is detected, unselect cluster and show overlay
      if (action.payload) {
        return { ...state, externalContextMismatch: true, currentClusterId: '' };
      }
      return { ...state, externalContextMismatch: action.payload };
    }
    case 'UPDATE_RESOURCE': { const { id, type, data } = action.payload; if (!data) return state; const update = (list: any[]) => list.map(item => (item.id === id || item.name === data.name) ? (type === 'pod' ? { ...data, cpuUsage: item.cpuUsage, memoryUsage: item.memoryUsage } : data) : item); let k: keyof AppState | undefined; if (type === 'pod') k = 'pods'; else if (type === 'deployment') k = 'deployments'; else if (type === 'replicaset') k = 'replicaSets'; else if (type === 'job') k = 'jobs'; else if (type === 'cronjob') k = 'cronJobs'; else if (type === 'node') k = 'nodes'; else if (type === 'service') k = 'services'; else if (type === 'ingress') k = 'ingresses'; else if (type === 'configmap') k = 'configMaps'; else if (type === 'namespace') k = 'namespaces'; else if (type === 'resourcequota') k = 'resourceQuotas'; if (k) return { ...state, [k]: update((state as any)[k]) }; return state; }
    default: return state;
  }
}

const StoreContext = createContext<{ state: AppState; dispatch: React.Dispatch<any> } | null>(null);

// Helper to load cache from localStorage
const loadClusterCache = (): Map<string, { data: Partial<AppState>; timestamp: number }> => {
  try {
    const stored = localStorage.getItem('kube_cluster_cache');
    if (stored) {
      const parsed = JSON.parse(stored);
      return new Map(Object.entries(parsed));
    }
  } catch (e) {
    console.error('Failed to load cluster cache:', e);
  }
  return new Map();
};

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const isFetchingRef = useRef(false);
  const isOfflineRef = useRef(false);
  const previousClusterRef = useRef<string | null>(initialClusterId);
  const lastActivityRef = useRef(Date.now());
  const currentPodsRef = useRef<Pod[]>(state.pods);

  // Ref to always get the latest isContextSwitching value
  const isContextSwitchingRef = useRef(state.isContextSwitching);

  // Ref to track when externalContextMismatch was just cleared
  const previousExternalMismatchRef = useRef(state.externalContextMismatch);

  // Update ref whenever state changes
  useEffect(() => {
    isContextSwitchingRef.current = state.isContextSwitching;
  }, [state.isContextSwitching]);

  // Track when externalContextMismatch changes from true to false
  useEffect(() => {
    previousExternalMismatchRef.current = state.externalContextMismatch;
  }, [state.externalContextMismatch]);

  // Cluster data cache - stores data for last 3 visited clusters
  // Uses cluster name (kubectl context name) as key for stability
  // Load cache from localStorage on initialization
  const clusterCacheRef = useRef(loadClusterCache());

  // Keep currentPodsRef in sync with state.pods
  useEffect(() => {
    currentPodsRef.current = state.pods;
  }, [state.pods]);

  // Sync logsState across windows via localStorage
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'kube_logs_state' && e.newValue) {
        try {
          const newLogsState = JSON.parse(e.newValue);
          // Only update if the state is actually different to avoid infinite loops
          if (JSON.stringify(state.logsState) !== e.newValue) {
            dispatch({ type: 'SET_DATA', payload: { logsState: newLogsState } });
          }
        } catch (err) {
          console.error('Failed to sync logsState from localStorage:', err);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [state.logsState]);

  // Clear logs state, active tab, and drawer state on fresh app start (not refresh)
  // Use Electron's app session ID which is unique per app launch but same across refreshes
  useEffect(() => {
    const checkSessionAndClearIfNeeded = async () => {
      const electron = (window as any).electron;
      if (electron?.getAppSessionId) {
        try {
          const currentSessionId = await electron.getAppSessionId();
          const storedSessionId = localStorage.getItem('app-session-id');

          if (storedSessionId !== currentSessionId) {
            // New app session - reset logs state in memory
            dispatch({ type: 'UPDATE_LOGS_STATE', payload: {
              selectedDeployment: '',
              selectedPod: '',
              selectedContainer: '',
              showPrevious: false,
              searchQuery: '',
              showSearch: false,
              dateFrom: '',
              dateTo: '',
              appliedDateFrom: '',
              appliedDateTo: '',
              autoRefreshEnabled: true,
              autoRefreshInterval: 5000,
            }});

            // Clear logs state and active tab from localStorage
            localStorage.removeItem('kube_logs_state');
            localStorage.removeItem('terminalActiveTab');
            localStorage.setItem('app-session-id', currentSessionId);

            // Clear drawer state from all cluster states
            const clusters = getStoredClusters();
            clusters.forEach(cluster => {
              const clusterState = loadClusterState(cluster.id);
              saveClusterState(cluster.id, {
                ...clusterState,
                drawerOpen: false,
                selectedResourceId: null,
                selectedResourceType: null,
                resourceHistory: [],
              });
            });
            // Drawer already starts closed in initial state, no dispatch needed
          } else {
            // Same session (refresh) - restore drawer state from cluster state
            const clusterState = loadClusterState(state.currentClusterId);
            if (clusterState.drawerOpen && clusterState.selectedResourceId && clusterState.selectedResourceType) {
              dispatch({ type: 'SELECT_RESOURCE', payload: {
                id: clusterState.selectedResourceId,
                type: clusterState.selectedResourceType
              }});
            }
          }
        } catch (err) {
          console.error('Failed to check app session:', err);
        }
      }
    };

    checkSessionAndClearIfNeeded();
    dispatch({ type: 'SET_STORE_INITIALIZED', payload: true });
  }, []);


  // Clean up cache when clusters are removed
  useEffect(() => {
    const clusterNames = new Set(state.clusters.map(c => c.name));
    const cachedNames = Array.from(clusterCacheRef.current.keys());

    let cacheChanged = false;
    // Remove cached data for clusters that no longer exist
    cachedNames.forEach(cachedName => {
      if (!clusterNames.has(cachedName)) {
        clusterCacheRef.current.delete(cachedName);
        cacheChanged = true;
      }
    });

    // Persist cache cleanup to localStorage
    if (cacheChanged) {
      try {
        const cacheObject = Object.fromEntries(clusterCacheRef.current);
        localStorage.setItem('kube_cluster_cache', JSON.stringify(cacheObject));
      } catch (e) {
        console.error('Failed to persist cache cleanup:', e);
      }
    }
  }, [state.clusters]);

  useEffect(() => {
    kubectl.setLogger((cmd: string) => dispatch({ type: 'ADD_LOG', payload: cmd }));
    kubectl.setGlobalErrorHandler((err: string) => {
        // Check for AWS SSO errors
        const isAwsSsoError =
            err.includes('CERTIFICATE_VERIFY_FAILED') ||
            err.includes('certificate verify failed: self-signed certificate') ||
            err.includes('SSL validation failed') ||
            err.includes('executable aws failed with exit code 255') ||
            err.includes('SSO session associated with this profile has expired') ||
            err.includes('getting credentials: exec: executable aws failed');

        if (isAwsSsoError) {
            dispatch({ type: 'SET_AWS_SSO_LOGIN_REQUIRED', payload: true });
            dispatch({ type: 'SET_ERROR', payload: 'AWS SSO authentication required. Please run "aws sso login" in your terminal and refresh the application.' });
            return;
        }

        // Suppress repeated connection errors
        if (err.includes('Cannot reach local backend') || err.includes('Failed to fetch')) {
            if (!isOfflineRef.current) {
                dispatch({ type: 'SET_ERROR', payload: err });
                isOfflineRef.current = true;
            }
        }
        else {
            dispatch({ type: 'SET_ERROR', payload: err });
        }
    });
    kubectl.setDispatcher(dispatch);
  }, []);

  useEffect(() => {
    const update = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('mousedown', update); window.addEventListener('keydown', update);
    return () => { window.removeEventListener('mousedown', update); window.removeEventListener('keydown', update); };
  }, []);


  // Validate context on app start and when window regains focus
  useEffect(() => {
    // Only validate if we have a cluster selected
    if (!state.currentClusterId) {
      return;
    }

    const checkContext = async () => {
      // Get the CURRENT value of isContextSwitching, not the stale closure value
      const currentIsContextSwitching = isContextSwitchingRef.current;

      // Skip validation if we're in the middle of a cluster switch
      if (currentIsContextSwitching) {
        return;
      }

      const selectedCluster = state.clusters.find(c => c.id === state.currentClusterId);
      if (selectedCluster) {
        try {
          const currentContext = await kubectl.getCurrentContext();

          // If external kubectl context changed, show overlay and unselect cluster
          if (currentContext && currentContext !== selectedCluster.name) {
            dispatch({ type: 'SET_EXTERNAL_CONTEXT_MISMATCH', payload: true });
            previousClusterRef.current = '';
          }
        } catch (e) {
          // Ignore errors
        }
      }
    };

    // Validate on mount with delay to ensure context switch completes
    const mountTimer = setTimeout(() => {
      checkContext();
    }, 500);

    // Validate when window regains focus with delay
    const handleFocus = () => {
      setTimeout(() => {
        checkContext();
        lastActivityRef.current = Date.now();
      }, 500);
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      clearTimeout(mountTimer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [state.currentClusterId, state.clusters]);

  // Load cached data immediately on page load for instant display
  useEffect(() => {
    // Only load cache if there's a valid cluster selected
    if (state.currentClusterId && state.clusters.some(c => c.id === state.currentClusterId)) {
      const cluster = state.clusters.find(c => c.id === state.currentClusterId);
      if (cluster) {
        const cached = clusterCacheRef.current.get(cluster.name);
        if (cached) {
          // Dispatch cached data immediately for instant UI
          dispatch({ type: 'SET_DATA', payload: cached.data });
        }
      }
    }
  }, []); // Run only once on mount

  // Restore drawer state after data is loaded (from cache or fresh fetch)
  useEffect(() => {
    // Only try to restore drawer if we have selectedResourceId but drawer is not open yet
    // This happens on page refresh when localStorage has drawer state
    if (!state.drawerOpen && state.selectedResourceId && state.selectedResourceType) {
      const type = state.selectedResourceType;
      const id = state.selectedResourceId;
      let res: any = null;

      // Check if resource exists in current state (from cache or fresh data)
      if (type === 'pod') res = state.pods.find(r => r.id === id);
      else if (type === 'deployment') res = state.deployments.find(r => r.id === id);
      else if (type === 'replicaset') res = state.replicaSets.find(r => r.id === id);
      else if (type === 'job') res = state.jobs.find(r => r.id === id);
      else if (type === 'cronjob') res = state.cronJobs.find(r => r.id === id);
      else if (type === 'node') res = state.nodes.find(r => r.id === id);
      else if (type === 'service') res = state.services.find(r => r.id === id);
      else if (type === 'ingress') res = state.ingresses.find(r => r.id === id);
      else if (type === 'configmap') res = state.configMaps.find(r => r.id === id);
      else if (type === 'namespace') res = state.namespaces.find(r => r.id === id);
      else if (type === 'resourcequota') res = state.resourceQuotas.find(r => r.id === id);

      if (res) {
        // Resource exists - restore drawer state
        dispatch({ type: 'SELECT_RESOURCE', payload: { id, type } });
      } else if (state.pods.length > 0 || state.deployments.length > 0 || state.nodes.length > 0) {
        // Data has been loaded but resource doesn't exist anymore - clear the saved state
        saveClusterState(state.currentClusterId, {
          view: state.view,
          drawerOpen: false,
          selectedResourceId: null,
          selectedResourceType: null,
          resourceHistory: []
        });
      }
      // If no data loaded yet, wait for cache/data to arrive
    }
  }, [state.pods, state.deployments, state.replicaSets, state.jobs, state.cronJobs, state.nodes, state.services, state.ingresses, state.configMaps, state.namespaces, state.resourceQuotas]);

  useEffect(() => {
      let interval: any;
      if (state.drawerOpen && state.selectedResourceId && state.selectedResourceType) {
          interval = setInterval(async () => {
              if (Date.now() - lastActivityRef.current > INACTIVITY_TIMEOUT) return;
              const type = state.selectedResourceType!; const id = state.selectedResourceId!;
              let res: any = null;
              if (type === 'pod') res = state.pods.find(r => r.id === id); else if (type === 'deployment') res = state.deployments.find(r => r.id === id); else if (type === 'replicaset') res = state.replicaSets.find(r => r.id === id); else if (type === 'job') res = state.jobs.find(r => r.id === id); else if (type === 'cronjob') res = state.cronJobs.find(r => r.id === id); else if (type === 'node') res = state.nodes.find(r => r.id === id); else if (type === 'service') res = state.services.find(r => r.id === id); else if (type === 'ingress') res = state.ingresses.find(r => r.id === id); else if (type === 'configmap') res = state.configMaps.find(r => r.id === id); else if (type === 'namespace') res = state.namespaces.find(r => r.id === id); else if (type === 'resourcequota') res = state.resourceQuotas.find(r => r.id === id);

              if (res) {
                try {
                  const updated = await kubectl.getResource(type, res.name, res.namespace, false);
                  if (updated) {
                    dispatch({ type: 'UPDATE_RESOURCE', payload: { id, type, data: updated } });
                    isOfflineRef.current = false;
                  }
                } catch (e: any) {
                  // Resource no longer exists (terminated pod, deleted resource, etc.)
                  // Silently close the drawer to avoid errors
                  if (e?.message?.includes('404') || e?.message?.includes('not found') || e?.message?.includes('NotFound')) {
                    dispatch({ type: 'CLOSE_DRAWER' });
                  }
                  // Ignore other errors (network issues, etc.)
                }
              } else {
                // Resource not found in state - might have been deleted
                // Close drawer to prevent showing stale data
                dispatch({ type: 'CLOSE_DRAWER' });
              }
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [state.drawerOpen, state.selectedResourceId, state.selectedResourceType, state.pods, state.deployments, state.replicaSets, state.jobs, state.cronJobs, state.nodes, state.services, state.ingresses, state.configMaps, state.namespaces, state.resourceQuotas]);

  useEffect(() => {
    let isMounted = true;

    // Helper to get cached data for a cluster by name (kubectl context name)
    const getCachedClusterData = (clusterId: string): Partial<AppState> | null => {
      // Get cluster name from ID
      const cluster = state.clusters.find(c => c.id === clusterId);
      if (!cluster) return null;

      const cached = clusterCacheRef.current.get(cluster.name);
      if (cached) {
        // Update timestamp to mark as recently accessed
        clusterCacheRef.current.set(cluster.name, {
          ...cached,
          timestamp: Date.now()
        });

        // Persist timestamp update to localStorage
        try {
          const cacheObject = Object.fromEntries(clusterCacheRef.current);
          localStorage.setItem('kube_cluster_cache', JSON.stringify(cacheObject));
        } catch (e) {
          console.error('Failed to update cluster cache timestamp:', e);
        }

        return cached.data;
      }
      return null;
    };

    // Helper to cache cluster data by name (kubectl context name)
    const setCachedClusterData = (clusterId: string, data: Partial<AppState>) => {
      // Get cluster name from ID
      const cluster = state.clusters.find(c => c.id === clusterId);
      if (!cluster) {
        // Don't cache data for non-existent clusters
        return;
      }

      const clusterName = cluster.name;

      // If we already have 3 clusters and this is a new one, remove the oldest
      if (clusterCacheRef.current.size >= 3 && !clusterCacheRef.current.has(clusterName)) {
        // Find the cluster with the oldest timestamp
        let oldestClusterName: string | null = null;
        let oldestTimestamp = Infinity;

        clusterCacheRef.current.forEach((value, key) => {
          if (value.timestamp < oldestTimestamp) {
            oldestTimestamp = value.timestamp;
            oldestClusterName = key;
          }
        });

        if (oldestClusterName) {
          clusterCacheRef.current.delete(oldestClusterName);
        }
      }

      // Store the new data using cluster name as key
      clusterCacheRef.current.set(clusterName, {
        data,
        timestamp: Date.now()
      });

      // Persist cache to localStorage
      try {
        const cacheObject = Object.fromEntries(clusterCacheRef.current);
        localStorage.setItem('kube_cluster_cache', JSON.stringify(cacheObject));
      } catch (e) {
        console.error('Failed to save cluster cache:', e);
      }
    };

    // Helper to preserve existing metrics when fetching new pods
    const preserveMetrics = (newPods: Pod[], existingPods: Pod[]) => {
      return newPods.map(newPod => {
        const existingPod = existingPods.find(p => p.id === newPod.id || p.name === newPod.name);
        if (existingPod && (existingPod.cpuUsage || existingPod.memoryUsage)) {
          return {
            ...newPod,
            cpuUsage: existingPod.cpuUsage,
            memoryUsage: existingPod.memoryUsage
          };
        }
        return newPod;
      });
    };

    // Helper function to fetch data for a specific view
    const fetchViewData = async (
      view: View,
      ns: string,
      notify: boolean,
      currentPods: Pod[]
    ): Promise<Partial<AppState>> => {
      const merge = (pods: Pod[], metrics: any) =>
        pods.map(p => metrics[p.name] ? { ...p, cpuUsage: metrics[p.name].cpu, memoryUsage: metrics[p.name].memory } : p);

      switch (view) {
        case 'overview': {
          const [nodes, pods, deployments] = await Promise.all([
            kubectl.getNodes(notify),
            kubectl.getPods(ns, notify),
            kubectl.getDeployments(ns, notify)
          ]);
          return { nodes, pods: preserveMetrics(pods, currentPods), deployments };
        }

        case 'nodes':
          return { nodes: await kubectl.getNodes(notify) };

        case 'pods': {
          const pods = await kubectl.getPods(ns, notify);
          const podsWithMetrics = preserveMetrics(pods, currentPods);
          // Fetch nodes and metrics in background
          if (isMounted) {
            kubectl.getNodes(false).then(nodes => {
              if (isMounted) dispatch({ type: 'SET_DATA', payload: { nodes } });
            }).catch(() => {});
            kubectl.getPodMetrics(ns, false).then(metrics => {
              if (isMounted && metrics) {
                const mergedPods = merge(pods, metrics);
                dispatch({ type: 'SET_DATA', payload: { pods: mergedPods } });
              }
            }).catch(() => {});
          }
          return { pods: podsWithMetrics };
        }

        case 'deployments': {
          const [deployments, pods, replicaSets] = await Promise.all([
            kubectl.getDeployments(ns, notify),
            kubectl.getPods(ns, notify),
            kubectl.getReplicaSets(ns, notify)
          ]);
          const podsWithMetrics = preserveMetrics(pods, currentPods);
          // Fetch metrics in background
          if (isMounted) {
            kubectl.getPodMetrics(ns, false).then(metrics => {
              if (isMounted && metrics) {
                const mergedPods = merge(pods, metrics);
                dispatch({ type: 'SET_DATA', payload: { pods: mergedPods } });
              }
            }).catch(() => {});
          }
          return { deployments, pods: podsWithMetrics, replicaSets };
        }

        case 'replicasets': {
          const replicaSets = await kubectl.getReplicaSets(ns, notify);
          // Fetch pods and metrics in background
          if (isMounted) {
            kubectl.getPods(ns, false).then(pods => {
              if (isMounted) {
                const podsPreserved = preserveMetrics(pods, currentPods);
                dispatch({ type: 'SET_DATA', payload: { pods: podsPreserved } });
                kubectl.getPodMetrics(ns, false).then(metrics => {
                  if (isMounted && metrics) {
                    const mergedPods = merge(pods, metrics);
                    dispatch({ type: 'SET_DATA', payload: { pods: mergedPods } });
                  }
                }).catch(() => {});
              }
            }).catch(() => {});
          }
          return { replicaSets };
        }

        case 'jobs': {
          const jobs = await kubectl.getJobs(ns, notify);
          // Fetch pods in background
          if (isMounted) {
            kubectl.getPods(ns, false).then(pods => {
              if (isMounted) {
                const podsPreserved = preserveMetrics(pods, currentPods);
                dispatch({ type: 'SET_DATA', payload: { pods: podsPreserved } });
              }
            }).catch(() => {});
          }
          return { jobs };
        }

        case 'cronjobs': {
          const cronJobs = await kubectl.getCronJobs(ns, notify);
          // Fetch jobs in background
          if (isMounted) {
            kubectl.getJobs(ns, false).then(jobs => {
              if (isMounted) dispatch({ type: 'SET_DATA', payload: { jobs } });
            }).catch(() => {});
          }
          return { cronJobs };
        }

        case 'services': {
          const services = await kubectl.getServices(ns, notify);
          // Fetch deployments and pods in background
          if (isMounted) {
            Promise.all([
              kubectl.getDeployments(ns, false),
              kubectl.getPods(ns, false)
            ]).then(([deps, pods]) => {
              if (isMounted) {
                const podsPreserved = preserveMetrics(pods, currentPods);
                dispatch({ type: 'SET_DATA', payload: { deployments: deps, pods: podsPreserved } });
              }
            }).catch(() => {});
          }
          return { services };
        }

        case 'ingresses': {
          const ingresses = await kubectl.getIngresses(ns, notify);
          // Fetch services in background
          if (isMounted) {
            kubectl.getServices(ns, false).then(svcs => {
              if (isMounted) dispatch({ type: 'SET_DATA', payload: { services: svcs } });
            }).catch(() => {});
          }
          return { ingresses };
        }

        case 'configmaps':
          return { configMaps: await kubectl.getConfigMaps(ns, notify) };

        case 'resourcequotas':
          return { resourceQuotas: await kubectl.getResourceQuotas(ns, notify) };

        case 'port-forwarding':
          return { portForwards: await kubectl.getPortForwards(notify) };

        default:
          // Default to overview data
          const [nodes, pods, deployments] = await Promise.all([
            kubectl.getNodes(notify),
            kubectl.getPods(ns, notify),
            kubectl.getDeployments(ns, notify)
          ]);
          return { nodes, pods: preserveMetrics(pods, currentPods), deployments };
      }
    };

    // Helper function to fetch background data for logs/drawer functionality
    const fetchBackgroundData = (view: View, ns: string, clusterId: string) => {
      const backgroundPromises: Promise<any>[] = [];
      const viewsNeedingDeps = ['deployments', 'services', 'overview'];
      const viewsNeedingRs = ['replicasets', 'deployments'];
      const viewsNeedingPods = ['pods', 'deployments', 'replicasets', 'jobs', 'services', 'overview'];

      // Always fetch deployments, replicaSets, pods for logs functionality
      if (!viewsNeedingDeps.includes(view)) {
        backgroundPromises.push(kubectl.getDeployments(ns, false));
      }
      if (!viewsNeedingRs.includes(view)) {
        backgroundPromises.push(kubectl.getReplicaSets(ns, false));
      }
      if (!viewsNeedingPods.includes(view)) {
        backgroundPromises.push(kubectl.getPods(ns, false));
      }
      if (view !== 'nodes') {
        backgroundPromises.push(kubectl.getNodes(false));
      }

      // Always fetch events in background
      backgroundPromises.push(kubectl.getEvents(ns, false));

      // Fetch services if not already loaded
      if (view !== 'services') {
        backgroundPromises.push(kubectl.getServices(ns, false));
      }

      if (backgroundPromises.length === 0) return;

      Promise.allSettled(backgroundPromises).then((results) => {
        if (!isMounted) return;

        const bgData: Partial<AppState> = {};
        let idx = 0;

        if (!viewsNeedingDeps.includes(view) && results[idx]?.status === 'fulfilled') {
          bgData.deployments = (results[idx] as any).value;
        }
        if (!viewsNeedingDeps.includes(view)) idx++;

        if (!viewsNeedingRs.includes(view) && results[idx]?.status === 'fulfilled') {
          bgData.replicaSets = (results[idx] as any).value;
        }
        if (!viewsNeedingRs.includes(view)) idx++;

        if (!viewsNeedingPods.includes(view) && results[idx]?.status === 'fulfilled') {
          bgData.pods = (results[idx] as any).value;
        }
        if (!viewsNeedingPods.includes(view)) idx++;

        if (view !== 'nodes' && results[idx]?.status === 'fulfilled') {
          bgData.nodes = (results[idx] as any).value;
        }
        idx++;

        if (results[idx]?.status === 'fulfilled') {
          bgData.events = (results[idx] as any).value;
        }
        idx++;

        if (view !== 'services' && results[idx]?.status === 'fulfilled') {
          bgData.services = (results[idx] as any).value;
        }

        if (Object.keys(bgData).length > 0) {
          dispatch({ type: 'SET_DATA', payload: bgData });

          // Update cache with background data to keep it fresh and complete
          const cachedData = getCachedClusterData(clusterId);
          if (cachedData) {
            setCachedClusterData(clusterId, { ...cachedData, ...bgData });
          } else {
            // If no cache exists yet, create one with current state + background data
            // This handles the case where background data arrives before cache is set
            const currentCluster = state.clusters.find(c => c.id === clusterId);
            if (currentCluster && state.currentClusterId === clusterId) {
              setCachedClusterData(clusterId, bgData);
            }
          }
        }
      });
    };

    const fetchData = async (isBackground = false) => {
        // Skip fetching if no cluster is selected
        if (!state.currentClusterId || !state.clusters.some(c => c.id === state.currentClusterId)) {
            return;
        }

        if (isBackground && Date.now() - lastActivityRef.current > INACTIVITY_TIMEOUT) return;
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        const isClusterSwitch = previousClusterRef.current !== state.currentClusterId;
        const wasContextSwitching = state.isContextSwitching;
        previousClusterRef.current = state.currentClusterId;

        if (!isBackground) dispatch({ type: 'SET_LOADING', payload: true });

        if (isClusterSwitch && !isBackground) {
            // Close drawer immediately to start with clean state
            if (state.drawerOpen) {
              dispatch({ type: 'CLOSE_DRAWER_SILENTLY' });
            }

            // Check if we have cached data for this cluster
            const cachedData = getCachedClusterData(state.currentClusterId);
            if (cachedData) {
              // Immediately load cached data for instant UI update
              dispatch({ type: 'SET_DATA', payload: cachedData });
              dispatch({ type: 'SET_LOADING', payload: false });
              // Don't clear isContextSwitching yet - wait for fresh data
              isOfflineRef.current = false;

              // Continue to fetch fresh data in background to update the cache
              // Don't set loading state for this refresh
            }

            const cur = state.clusters.find(c => c.id === state.currentClusterId);
            if (cur) {
              try {
                await kubectl.setContext(cur.name);
              } catch (e) {}
            }
        }

        try {
            const ns = state.selectedNamespace;
            const notify = !isBackground;

            // Fetch namespaces first (always critical)
            const namespaces = await kubectl.getNamespaces(notify);

            // Only dispatch namespaces if we don't have cached data (to avoid flicker)
            if (!isClusterSwitch || !getCachedClusterData(state.currentClusterId)) {
              dispatch({ type: 'SET_DATA', payload: { namespaces } });
            }

            // Fetch view-specific critical data
            const viewData = await fetchViewData(state.view, ns, notify, currentPodsRef.current);

            // Dispatch critical data
            if (isMounted) {
                const fullData = { ...viewData, namespaces };
                dispatch({ type: 'SET_DATA', payload: fullData });

                // Always cache the data for this cluster (not just on cluster switch)
                // This ensures refreshed data is cached
                setCachedClusterData(state.currentClusterId, fullData);

                dispatch({ type: 'SET_LOADING', payload: false });
                // Clear isContextSwitching on foreground fetches if:
                // 1. It was set (wasContextSwitching), OR
                // 2. This is a cluster switch (isClusterSwitch)
                if (!isBackground && (wasContextSwitching || isClusterSwitch)) {
                    dispatch({ type: 'SET_CONTEXT_SWITCHING', payload: false });
                }
                isOfflineRef.current = false;
            }

            // Fetch background data for drawer/logs functionality
            if (isMounted) {
              fetchBackgroundData(state.view, ns, state.currentClusterId);
            }

        } catch (error: any) {
            // Silent error logging to prevent UI spam if offline
            if (!isOfflineRef.current) {
                console.error("Fetch error:", error);
            }
            // Only clear isContextSwitching if this was a foreground cluster switch
            if (isMounted && (wasContextSwitching || isClusterSwitch) && !isBackground) {
                dispatch({ type: 'SET_CONTEXT_SWITCHING', payload: false });
            }
        } finally {
            if (isMounted) {
                if (!isBackground) dispatch({ type: 'SET_LOADING', payload: false });
                isFetchingRef.current = false;
            }
        }
    };

    fetchData(false);
    const interval = setInterval(() => fetchData(true), 2000);
    return () => { isMounted = false; clearInterval(interval); isFetchingRef.current = false; };
  }, [state.currentClusterId, state.selectedNamespace, state.view]);

  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used within a StoreProvider");
  return context;
};
