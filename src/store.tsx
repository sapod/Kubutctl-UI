
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

const storedClusters = getStoredClusters();
const initialClusterId = getStoredCurrentClusterId(storedClusters);
const initialClusterState = loadClusterState(initialClusterId);

const initialState: AppState = {
  view: initialClusterState.view, isLoading: false, isContextSwitching: false, error: null, currentClusterId: initialClusterId, selectedNamespace: getStoredNamespace(initialClusterId), clusters: storedClusters, nodes: [], pods: [], deployments: [], replicaSets: [], jobs: [], cronJobs: [], services: [], ingresses: [], configMaps: [], namespaces: [], events: [], resourceQuotas: [], portForwards: [], routines: getStoredRoutines(), terminalOutput: ['Welcome to Kubectl-UI', 'Initializing application...'], selectedResourceId: initialClusterState.selectedResourceId, selectedResourceType: initialClusterState.selectedResourceType, resourceHistory: initialClusterState.resourceHistory || [], drawerOpen: initialClusterState.drawerOpen, isAddClusterModalOpen: false, isCatalogOpen: false, isPortForwardModalOpen: false, portForwardModalData: null, isRoutineModalOpen: false, routineModalData: null, isShellModalOpen: false, shellModalData: null, isConfirmationModalOpen: false, confirmationModalData: null, logsTarget: null,
};

// Simplified reducer signature using updated Action type
function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_DATA': return { ...state, ...action.payload };
    case 'SET_VIEW': { const newState = { ...state, view: action.payload, drawerOpen: false, selectedResourceId: null, selectedResourceType: null, resourceHistory: [], error: null }; saveClusterState(state.currentClusterId, { view: newState.view, drawerOpen: false, selectedResourceId: null, selectedResourceType: null, resourceHistory: [] }); return newState; }
    case 'SET_LOADING': return { ...state, isLoading: action.payload };
    case 'SET_CONTEXT_SWITCHING': return { ...state, isContextSwitching: action.payload };
    case 'SET_ERROR': return { ...state, error: action.payload, isLoading: false };
    case 'SELECT_CLUSTER': { try { localStorage.setItem('kube_current_cluster_id', action.payload); } catch {} const nextNs = getStoredNamespace(action.payload); const nextState = loadClusterState(action.payload); return { ...state, currentClusterId: action.payload, selectedNamespace: nextNs, view: nextState.view, drawerOpen: nextState.drawerOpen, selectedResourceId: nextState.selectedResourceId, selectedResourceType: nextState.selectedResourceType, resourceHistory: nextState.resourceHistory || [], terminalOutput: [...state.terminalOutput, `Context switch: ${state.clusters.find(c => c.id === action.payload)?.name}`], error: null }; }
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
    case 'UPDATE_RESOURCE': { const { id, type, data } = action.payload; if (!data) return state; const update = (list: any[]) => list.map(item => (item.id === id || item.name === data.name) ? (type === 'pod' ? { ...data, cpuUsage: item.cpuUsage, memoryUsage: item.memoryUsage } : data) : item); let k: keyof AppState | undefined; if (type === 'pod') k = 'pods'; else if (type === 'deployment') k = 'deployments'; else if (type === 'replicaset') k = 'replicaSets'; else if (type === 'job') k = 'jobs'; else if (type === 'cronjob') k = 'cronJobs'; else if (type === 'node') k = 'nodes'; else if (type === 'service') k = 'services'; else if (type === 'ingress') k = 'ingresses'; else if (type === 'configmap') k = 'configMaps'; else if (type === 'namespace') k = 'namespaces'; else if (type === 'resourcequota') k = 'resourceQuotas'; if (k) return { ...state, [k]: update((state as any)[k]) }; return state; }
    default: return state;
  }
}

const StoreContext = createContext<{ state: AppState; dispatch: React.Dispatch<any> } | null>(null);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const isFetchingRef = useRef(false);
  const isOfflineRef = useRef(false);
  const previousClusterRef = useRef<string | null>(initialClusterId);
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    kubectl.setLogger((cmd: string) => dispatch({ type: 'ADD_LOG', payload: cmd }));
    kubectl.setGlobalErrorHandler((err: string) => {
        // Suppress repeated connection errors
        if (err.includes('Cannot reach local backend') || err.includes('Failed to fetch')) {
            if (!isOfflineRef.current) {
                dispatch({ type: 'SET_ERROR', payload: err });
                isOfflineRef.current = true;
            }
        }
        if (err.includes('SSO session associated with this profile has expired')) {
            dispatch({ type: 'SET_ERROR', payload: 'SSO session expired. Please run <aws sso login> on your machine' })
        }
        else {
            dispatch({ type: 'SET_ERROR', payload: err });
        }
    });
    kubectl.setDispatcher(dispatch);
  }, []);

  useEffect(() => {
    const update = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('mousedown', update); window.addEventListener('keydown', update); window.addEventListener('focus', update);
    return () => { window.removeEventListener('mousedown', update); window.removeEventListener('keydown', update); window.removeEventListener('focus', update); };
  }, []);

  useEffect(() => {
      let interval: any;
      if (state.drawerOpen && state.selectedResourceId && state.selectedResourceType) {
          interval = setInterval(async () => {
              if (Date.now() - lastActivityRef.current > INACTIVITY_TIMEOUT) return;
              const type = state.selectedResourceType!; const id = state.selectedResourceId!;
              let res: any = null;
              if (type === 'pod') res = state.pods.find(r => r.id === id); else if (type === 'deployment') res = state.deployments.find(r => r.id === id); else if (type === 'replicaset') res = state.replicaSets.find(r => r.id === id); else if (type === 'job') res = state.jobs.find(r => r.id === id); else if (type === 'cronjob') res = state.cronJobs.find(r => r.id === id); else if (type === 'node') res = state.nodes.find(r => r.id === id); else if (type === 'service') res = state.services.find(r => r.id === id); else if (type === 'ingress') res = state.ingresses.find(r => r.id === id); else if (type === 'configmap') res = state.configMaps.find(r => r.id === id); else if (type === 'namespace') res = state.namespaces.find(r => r.id === id); else if (type === 'resourcequota') res = state.resourceQuotas.find(r => r.id === id);
              if (res) { try { const updated = await kubectl.getResource(type, res.name, res.namespace, false); if (updated) { dispatch({ type: 'UPDATE_RESOURCE', payload: { id, type, data: updated } }); isOfflineRef.current = false; } } catch (e) {} }
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [state.drawerOpen, state.selectedResourceId, state.selectedResourceType, state.pods, state.deployments, state.replicaSets, state.jobs, state.cronJobs, state.nodes, state.services, state.ingresses, state.configMaps, state.namespaces, state.resourceQuotas]);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async (isBackground = false) => {
        if (isBackground && Date.now() - lastActivityRef.current > INACTIVITY_TIMEOUT) return;
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        const isClusterSwitch = previousClusterRef.current !== state.currentClusterId;
        const wasContextSwitching = state.isContextSwitching; // Track if we were already switching
        previousClusterRef.current = state.currentClusterId;
        if (!isBackground) dispatch({ type: 'SET_LOADING', payload: true });
        if (isClusterSwitch && !isBackground) { 
            dispatch({ type: 'SET_CONTEXT_SWITCHING', payload: true });
            const cur = state.clusters.find(c => c.id === state.currentClusterId); 
            if (cur) { try { await kubectl.setContext(cur.name); } catch (e) {} } 
        }
        try {
            let data: Partial<AppState> = {}; const ns = state.selectedNamespace; const notify = !isBackground;
            const merge = (pods: Pod[], metrics: any) => pods.map(p => metrics[p.name] ? { ...p, cpuUsage: metrics[p.name].cpu, memoryUsage: metrics[p.name].memory } : p);
            if (isClusterSwitch) {
                data.namespaces = await kubectl.getNamespaces(notify);
                dispatch({ type: 'SET_DATA', payload: data });
                const [nodes, pods, deployments, services, events] =
                    await Promise.all([kubectl.getNodes(notify), kubectl.getPods(ns, notify), kubectl.getDeployments(ns, notify), kubectl.getServices(ns, notify), kubectl.getEvents(ns, notify)]);
                data = { nodes, pods, deployments, services, events };
            } else {
                data.namespaces = await kubectl.getNamespaces(notify);
                dispatch({ type: 'SET_DATA', payload: data });
                data.events = await kubectl.getEvents(ns, notify);
                dispatch({ type: 'SET_DATA', payload: data });

                // Always fetch deployments, replicaSets, and pods in background for logs functionality
                // Fetch these first so they're available, then view-specific data can override if needed
                try {
                    const [bgDeps, bgRs, bgPods] = await Promise.all([
                        kubectl.getDeployments(ns, false),
                        kubectl.getReplicaSets(ns, false),
                        kubectl.getPods(ns, false)
                    ]);
                    data.deployments = bgDeps;
                    data.replicaSets = bgRs;
                    data.pods = bgPods;
                } catch (e) {
                    // Silently fail - this is background data for logs
                }

                switch (state.view) {
                    case 'overview': { const [nodes, pods, deps] = await Promise.all([kubectl.getNodes(notify), kubectl.getPods(ns, notify), kubectl.getDeployments(ns, notify)]); data = { ...data, nodes, pods, deployments: deps }; break; }
                    case 'nodes': data.nodes = await kubectl.getNodes(notify); break;
                    case 'pods': { const [pods, metrics, nodes] = await Promise.all([kubectl.getPods(ns, notify), kubectl.getPodMetrics(ns, notify), kubectl.getNodes(notify)]); data.pods = merge(pods, metrics); data.nodes = nodes; break; }
                    case 'deployments': { const [deps, rs, pods, metrics] = await Promise.all([kubectl.getDeployments(ns, notify), kubectl.getReplicaSets(ns, notify), kubectl.getPods(ns, notify), kubectl.getPodMetrics(ns, notify)]); data = { ...data, deployments: deps, replicaSets: rs, pods: merge(pods, metrics) }; break; }
                    case 'replicasets': { const [rs, pods, metrics] = await Promise.all([kubectl.getReplicaSets(ns, notify), kubectl.getPods(ns, notify), kubectl.getPodMetrics(ns, notify)]); data = { ...data, replicaSets: rs, pods: merge(pods, metrics) }; break; }
                    case 'jobs': { const [jobs, pods] = await Promise.all([kubectl.getJobs(ns, notify), kubectl.getPods(ns, notify)]); data.jobs = jobs; data.pods = pods; break; }
                    case 'cronjobs': { const [cjs, jobs] = await Promise.all([kubectl.getCronJobs(ns, notify), kubectl.getJobs(ns, notify)]); data.cronJobs = cjs; data.jobs = jobs; break; }
                    case 'services': { const [svcs, deps, pods] = await Promise.all([kubectl.getServices(ns, notify), kubectl.getDeployments(ns, notify), kubectl.getPods(ns, notify)]); data.services = svcs; data.deployments = deps; data.pods = pods; break; }
                    case 'ingresses': { const [ing, svcs] = await Promise.all([kubectl.getIngresses(ns, notify), kubectl.getServices(ns, notify)]); data.ingresses = ing; data.services = svcs; break; }
                    case 'configmaps': data.configMaps = await kubectl.getConfigMaps(ns, notify); break;
                    case 'resourcequotas': data.resourceQuotas = await kubectl.getResourceQuotas(ns, notify); break;
                    case 'port-forwarding': data.portForwards = await kubectl.getPortForwards(notify); break;
                }
            }
            if (isMounted) {
                dispatch({ type: 'SET_DATA', payload: data });
                // Clear context switching if it was set (either by this fetch or previous)
                if (wasContextSwitching || isClusterSwitch) {
                    dispatch({ type: 'SET_CONTEXT_SWITCHING', payload: false });
                }
                isOfflineRef.current = false;
            }
        } catch (error: any) {
            // Silent error logging to prevent UI spam if offline
            if (!isOfflineRef.current) {
                console.error("Fetch error:", error);
            }
            if (isMounted && (wasContextSwitching || isClusterSwitch)) {
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
