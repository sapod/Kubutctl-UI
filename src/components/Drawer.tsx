import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { AppState, Pod, Ingress, Service, ResourceStatus, Deployment, Job } from '../types';
import { kubectl } from '../services/kubectl';
import { Box, X, Globe, ArrowRightCircle, Container as ContainerIcon, Network, FileText, RotateCw, Trash2, ChevronDown, AlertTriangle, Maximize2, Minimize2, HardDrive, ExternalLink, ArrowLeft, StopCircle, Play, History, Edit2, Save, Key } from 'lucide-react';
import { StatusBadge, getAge, isMatch, resolvePortName, parseCpu, parseMemory } from './Shared';
import PodTerminal from './PodTerminal';
import yaml from 'js-yaml';
import { BACKEND_WS_BASE_URL } from '../consts';

// --- Drawer Table Component ---
export const DrawerTable = ({ columns, data, onRowClick, storageKey }: {
    columns: { header: string, accessor: (item: any) => React.ReactNode, className?: string, sortValue?: (item: any) => any }[],
    data: any[],
    onRowClick?: (item: any) => void,
    storageKey?: string
}) => {
    const [sortConfig, setSortConfig] = useState<{ key: number, direction: 'asc' | 'desc' } | null>(() => {
        if (!storageKey) return null;
        try {
            const saved = localStorage.getItem(`kube_sort_${storageKey}`);
            return saved ? JSON.parse(saved) : null;
        } catch { return null; }
    });

    const sortedData = React.useMemo(() => {
        if (!sortConfig) return data;
        if (sortConfig.key < 0 || sortConfig.key >= columns.length) {
            return data;
        }
        const col = columns[sortConfig.key];
        if (!col) return data;
        return [...data].sort((a, b) => {
            const valA = col.sortValue ? col.sortValue(a) : '';
            const valB = col.sortValue ? col.sortValue(b) : '';
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [data, sortConfig, columns]);

    const handleHeaderClick = (idx: number) => {
        setSortConfig(current => {
            let nextState: { key: number, direction: 'asc' | 'desc' } | null = { key: idx, direction: 'asc' };
            if (current?.key === idx && current.direction === 'asc') {
                nextState = { key: idx, direction: 'desc' };
            }
            if (storageKey) {
                localStorage.setItem(`kube_sort_${storageKey}`, JSON.stringify(nextState));
            }
            return nextState;
        });
    };

    return (
        <div className="overflow-auto border border-gray-800 rounded bg-gray-900/50 max-h-[650px] custom-scrollbar">
            <table className="w-full text-left text-xs">
                <thead className="bg-gray-800 text-gray-400 font-semibold uppercase sticky top-0 z-10 shadow-sm">
                    <tr>
                        {columns.map((col, idx) => (
                            <th
                                key={idx}
                                className={`px-3 py-2 cursor-pointer hover:text-gray-200 select-none bg-gray-800 ${col.className || ''}`}
                                onClick={() => handleHeaderClick(idx)}
                            >
                                <div className="flex items-center gap-1">
                                    {col.header}
                                    {sortConfig?.key === idx && (
                                        sortConfig.direction === 'asc' ? <ChevronDown size={10} className="transform rotate-180"/> : <ChevronDown size={10}/>
                                    )}
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                    {sortedData.map((item, i) => (
                        <tr key={item.id || i} onClick={() => onRowClick && onRowClick(item)} className={onRowClick ? "cursor-pointer hover:bg-gray-800/50 transition-colors" : ""}>
                            {columns.map((col, j) => (
                                <td key={j} className="px-3 py-2 text-gray-300 border-gray-800">{col.accessor(item)}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export const DetailItem = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-xs text-gray-500 uppercase tracking-wide font-bold mb-1">{label}</div>
    <div className="text-sm text-gray-200 font-medium break-all">{value}</div>
  </div>
);

const formatCreationTime = (timestamp: string) => {
    if (!timestamp) return '-';
    try {
        const date = new Date(timestamp);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    } catch {
        return timestamp;
    }
};

// --- Drawer (Resource Details) ---
export const ResourceDrawer: React.FC = () => {
  const { state, dispatch } = useStore();
  const [activeTab, setActiveTab] = useState<'details' | 'yaml' | 'events' | 'terminal'>('details');
  const [expandedCmKey, setExpandedCmKey] = useState<string | null>(null);
  const [expandedContainers, setExpandedContainers] = useState<Set<number>>(new Set());

  // Terminal container selection
  const [terminalContainer, setTerminalContainer] = useState<string>('');

  // YAML Edit State
  const [isEditingYaml, setIsEditingYaml] = useState(false);
  const [editedYaml, setEditedYaml] = useState('');

  // Drawer resizing
  const [drawerWidth, setDrawerWidth] = useState(() => {
    const saved = localStorage.getItem('drawerWidth');
    if (saved) {
      const savedWidth = parseInt(saved);
      // Ensure saved width is within bounds
      const minWidth = Math.max(400, window.innerWidth * 0.25);
      const maxWidth = window.innerWidth * 0.8;
      return Math.max(minWidth, Math.min(maxWidth, savedWidth));
    }
    return window.innerWidth * 0.4; // Default to 40% of window width
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizingRef = React.useRef(false);

  // Helper to find selected resource
  let resource: any = null;
  const rt = state.selectedResourceType;
  if (rt === 'pod') resource = state.pods.find(r => r.id === state.selectedResourceId);
  else if (rt === 'deployment') resource = state.deployments.find(r => r.id === state.selectedResourceId);
  else if (rt === 'replicaset') resource = state.replicaSets.find(r => r.id === state.selectedResourceId);
  else if (rt === 'job') resource = state.jobs.find(r => r.id === state.selectedResourceId);
  else if (rt === 'cronjob') resource = state.cronJobs.find(r => r.id === state.selectedResourceId);
  else if (rt === 'node') resource = state.nodes.find(r => r.id === state.selectedResourceId);
  else if (rt === 'service') resource = state.services.find(r => r.id === state.selectedResourceId);
  else if (rt === 'ingress') resource = state.ingresses.find(r => r.id === state.selectedResourceId);
  else if (rt === 'configmap') resource = state.configMaps.find(r => r.id === state.selectedResourceId);
  else if (rt === 'namespace') resource = state.namespaces.find(r => r.id === state.selectedResourceId);
  else if (rt === 'event') resource = state.events.find(r => r.id === state.selectedResourceId);
  else if (rt === 'resourcequota') resource = state.resourceQuotas.find(r => r.id === state.selectedResourceId);

  useEffect(() => {
    setActiveTab('details');
    setExpandedCmKey(null);
    setIsEditingYaml(false);
    setExpandedContainers(new Set()); // Reset expanded containers when resource changes
    setTerminalContainer(''); // Reset terminal container selection
  }, [state.selectedResourceId, state.selectedResourceType]);

  // Helper to get terminal target (for terminal tab)
  const getTerminalTarget = (): { pod: Pod, containers: string[] } | null => {
      if (!resource) return null;
      if (state.selectedResourceType === 'pod') {
          const p = resource as Pod;
          if (!p.containers) return null;
          return { pod: p, containers: p.containers.map(c => c.name) };
      }
      return null;
  };

  const terminalTarget = getTerminalTarget();

  // Auto-select first container for terminal when tab is opened
  useEffect(() => {
      if (activeTab === 'terminal' && terminalTarget && terminalTarget.containers.length > 0) {
          if (!terminalContainer || !terminalTarget.containers.includes(terminalContainer)) {
              setTerminalContainer(terminalTarget.containers[0]);
          }
      }
  }, [activeTab, terminalTarget, terminalContainer]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const dropdowns = document.querySelectorAll('.absolute.top-full');
      dropdowns.forEach(dropdown => {
        const parent = dropdown.parentElement;
        if (parent && !parent.contains(e.target as Node)) {
          dropdown.classList.add('hidden');
        }
      });
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleContainer = (index: number) => {
    setExpandedContainers(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Drawer resizing handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const newWidth = window.innerWidth - e.clientX;
      const minWidth = Math.max(400, window.innerWidth * 0.25); // Min 25% of window or 400px
      const maxWidth = window.innerWidth * 0.8; // Max 80% of window
      const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setDrawerWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      if (resizingRef.current) {
        resizingRef.current = false;
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem('drawerWidth', drawerWidth.toString());
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, drawerWidth]);

  // Handle window resize to ensure drawer stays within bounds
  useEffect(() => {
    const handleWindowResize = () => {
      const minWidth = Math.max(400, window.innerWidth * 0.25);
      const maxWidth = window.innerWidth * 0.8;

      let newWidth = drawerWidth;
      if (drawerWidth > maxWidth) {
        newWidth = maxWidth;
      } else if (drawerWidth < minWidth) {
        newWidth = minWidth;
      }

      if (newWidth !== drawerWidth) {
        setDrawerWidth(newWidth);
        localStorage.setItem('drawerWidth', newWidth.toString());
      }
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [drawerWidth]);

  useEffect(() => {
    if (activeTab === 'yaml' && resource && !isEditingYaml) {
      // Use the raw manifest for full YAML visibility
      const manifest = resource.raw || resource;
      setEditedYaml(yaml.dump(manifest, { indent: 2, noRefs: true }));
    }
  }, [activeTab, resource, isEditingYaml]);

  const handleLinkClick = (id: string, type: AppState['selectedResourceType']) => {
    dispatch({ type: 'DRILL_DOWN_RESOURCE', payload: { id, type } });
  };

  const handlePortClick = (resourceName: string, port: number) => {
    const resourceType = state.selectedResourceType as any;
    const activePf = state.portForwards.find(pf =>
        pf.resourceName === resourceName &&
        pf.resourceType === resourceType &&
        pf.remotePort === port &&
        pf.status === 'Active'
    );

    if (activePf) {
        dispatch({
            type: 'OPEN_CONFIRMATION_MODAL',
            payload: {
                title: 'Stop Port Forwarding',
                message: `Are you sure you want to stop forwarding ${activePf.localPort}:${activePf.remotePort} for ${resourceName}?`,
                onConfirm: async () => {
                    if (activePf.pid) {
                        try {
                            await kubectl.stopPortForward(activePf.pid);
                            dispatch({ type: 'REMOVE_PORT_FORWARD', payload: activePf.id });
                        } catch (e) {
                            console.error("Failed to stop port forward", e);
                        }
                    }
                }
            }
        });
    } else {
        dispatch({
            type: 'OPEN_PF_MODAL',
            payload: {
                resourceName,
                resourceType,
                port,
                namespace: resource.namespace
            }
        });
    }
  };

  const handleConfigMapClick = async (cmName: string, namespace: string) => {
      let cm = state.configMaps.find(c => c.name === cmName && c.namespace === namespace);
      if (!cm) {
          try {
             const fetched = await kubectl.getResource('configmap', cmName, namespace);
             if (fetched) {
                 dispatch({ type: 'SET_DATA', payload: { configMaps: [...state.configMaps, fetched] } });
                 cm = fetched;
             }
          } catch(e) { console.error("Failed to fetch linked configmap", e); }
      }
      if (cm) {
          dispatch({ type: 'DRILL_DOWN_RESOURCE', payload: { id: cm.id, type: 'configmap' } });
      }
  };

  const handleDelete = () => {
        if (!resource || !state.selectedResourceType) return;
        kubectl.deleteResource(state.selectedResourceType, resource.name, resource.namespace, resource.id);
  };

  const handleTriggerCronJob = () => {
      if (!resource || state.selectedResourceType !== 'cronjob') return;
      kubectl.triggerCronJob(resource.name, resource.namespace);
  };

  const handleSaveYaml = () => {
    // Syntax Validation before confirmation
    try {
        yaml.load(editedYaml);
    } catch (e: any) {
        dispatch({ type: 'SET_ERROR', payload: `Invalid YAML syntax: ${e.message}` });
        return;
    }

    dispatch({
        type: 'OPEN_CONFIRMATION_MODAL',
        payload: {
            title: 'Save Changes',
            message: `Are you sure you want to apply these changes to ${resource.name}? This will perform a kubectl apply.`,
            onConfirm: async () => {
                try {
                    await kubectl.applyYaml(editedYaml, resource.namespace);
                    setIsEditingYaml(false);
                    // Force refresh resource
                    const updated = await kubectl.getResource(state.selectedResourceType!, resource.name, resource.namespace);
                    if (updated) {
                        dispatch({ type: 'UPDATE_RESOURCE', payload: { id: resource.id, type: state.selectedResourceType!, data: updated } });
                    }
                } catch (e) {}
            }
        }
    });
  };


  if (!state.drawerOpen || !resource) return null;

  const getResourceStatus = () => {
    if (state.selectedResourceType === 'resourcequota') return 'Active';
    if (state.selectedResourceType === 'event') return (resource as any).type;
    if (resource && 'status' in resource && typeof (resource as any).status === 'string') {
        return (resource as any).status;
    }
    return 'Active';
  };

  const renderRelatedResources = () => {
    const childrenLinks: React.ReactNode[] = [];
    if (state.selectedResourceType === 'deployment') {
      const rs = state.replicaSets.filter(r =>
        r.ownerReferences?.some(o => o.uid === resource.id) ||
        isMatch(r.labels, resource.selector)
      );
      if (rs.length > 0) {
        childrenLinks.push(
          <div key="rs" className="mt-4">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">ReplicaSets</h4>
            <DrawerTable
                storageKey="drawer_deployments_rs"
                data={rs}
                onRowClick={(r) => handleLinkClick(r.id, 'replicaset')}
                columns={[
                    { header: 'Name', accessor: (r) => <span className="text-blue-300 font-medium">{r.name}</span>, sortValue: (r) => r.name },
                    { header: 'Age', accessor: (r) => getAge(r.creationTimestamp), sortValue: (r) => r.creationTimestamp },
                    { header: 'Pods', accessor: (r) => `${r.availableReplicas}/${r.replicas}`, sortValue: (r) => r.replicas },
                ]}
            />
          </div>
        );
      }
      const pods = state.pods.filter(p => isMatch(p.labels, resource.selector));
      if (pods.length > 0) {
        childrenLinks.push(
          <div key="pods" className="mt-4">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Pods</h4>
            <DrawerTable
                storageKey="drawer_deployments_pods"
                data={pods}
                onRowClick={(p) => handleLinkClick(p.id, 'pod')}
                columns={[
                    { header: 'Name', accessor: (p) => (
                      <div className="flex items-center gap-2">
                        <span className="text-green-300 font-medium">{p.name}</span>
                        {(!p.isReady && p.status !== ResourceStatus.Completed && p.status !== ResourceStatus.Succeeded) && (
                          <div title="Pod is not ready">
                             <AlertTriangle size={14} className="text-yellow-500 flex-shrink-0" />
                          </div>
                        )}
                      </div>
                    ), sortValue: (p) => p.name },
                    { header: 'Status', accessor: (p) => <StatusBadge status={p.status} />, sortValue: (p) => p.status },
                    { header: 'CPU', accessor: (p) => p.cpuUsage, sortValue: (p) => parseCpu(p.cpuUsage) },
                    { header: 'Mem', accessor: (p) => p.memoryUsage, sortValue: (p) => parseMemory(p.memoryUsage) },
                ]}
            />
          </div>
        );
      }
    }
    if (state.selectedResourceType === 'job') {
        const pods = state.pods.filter(p => p.ownerReferences?.some(o => o.uid === resource.id));
        if (pods.length > 0) {
            childrenLinks.push(
                <div key="job-pods" className="mt-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Created Pods</h4>
                    <DrawerTable
                        storageKey="drawer_jobs_pods"
                        data={pods}
                        onRowClick={(p) => handleLinkClick(p.id, 'pod')}
                        columns={[
                            { header: 'Name', accessor: (p) => (
                                <div className="flex items-center gap-2">
                                  <span className="text-green-300 font-medium">{p.name}</span>
                                  {(!p.isReady && p.status !== ResourceStatus.Completed && p.status !== ResourceStatus.Succeeded) && (
                                    <div title="Pod is not ready">
                                       <AlertTriangle size={14} className="text-yellow-500 flex-shrink-0" />
                                    </div>
                                  )}
                                </div>
                              ), sortValue: (p) => p.name },
                            { header: 'Status', accessor: (p) => <StatusBadge status={p.status} />, sortValue: (p) => p.status },
                        ]}
                    />
                </div>
            );
        }
    }
    if (state.selectedResourceType === 'ingress') {
        const ingress = resource as Ingress;
        const rulesDisplay = ingress.rules.map((rule, i) => (
             <div key={i} className="mb-3 bg-gray-800 p-3 rounded border border-gray-700">
                <div className="text-xs font-bold text-blue-300 mb-1 flex items-center gap-2">
                    <Globe size={12}/> {rule.host || '*'}
                </div>
                <div className="space-y-1">
                    {rule.paths.map((p, j) => {
                        const targetSvc = state.services.find(s => s.name === p.service);
                        const resolvedPortName = resolvePortName(p.service, p.port, state);
                        return (
                             <div key={j} className="text-xs flex items-center justify-between pl-4 border-l border-gray-600 ml-1">
                                 <span className="text-gray-400 font-mono">{p.path}</span>
                                 <div className="flex items-center gap-1 text-gray-500">
                                     <ArrowRightCircle size={10} />
                                     {targetSvc ? (
                                        <div className="flex items-center gap-2">
                                            <span className="text-green-300 hover:underline cursor-pointer" onClick={() => handleLinkClick(targetSvc.id, 'service')} title="View service details">
                                                {p.service}:{resolvedPortName || p.port || '???'}
                                            </span>
                                        </div>
                                     ) : (
                                        <span className="text-red-400">{p.service}:{p.port || '???'} (Missing)</span>
                                     )}
                                 </div>
                             </div>
                        );
                    })}
                </div>
             </div>
        ));
        childrenLinks.push(
            <div key="ing-rules" className="mt-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Rules & Backends</h4>
                {rulesDisplay}
            </div>
        );
    }
    if (state.selectedResourceType === 'cronjob') {
        const relatedJobs = state.jobs.filter(j =>
            j.namespace === resource.namespace &&
            (j.ownerReferences?.some(o => o.uid === resource.id) || j.name.startsWith(resource.name))
        );

        childrenLinks.push(
            <div key="jobs" className="mt-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <History size={14}/> Job History ({relatedJobs.length})
                </h4>
                {relatedJobs.length === 0 ? (
                    <div className="text-xs text-gray-500 italic p-4 bg-gray-900/50 rounded border border-dashed border-gray-800 text-center">
                        No jobs found for this cronjob yet.
                    </div>
                ) : (
                    <DrawerTable
                        storageKey="drawer_cronjobs_jobs"
                        data={relatedJobs}
                        onRowClick={(j: Job) => handleLinkClick(j.id, 'job')}
                        columns={[
                            { header: 'Job Name', accessor: (j: Job) => <span className="text-blue-300 font-medium hover:underline">{j.name}</span>, sortValue: (j: Job) => j.name },
                            { header: 'Status', accessor: (j: Job) => {
                                const status = j.failed > 0 ? ResourceStatus.Failed : (j.succeeded >= j.completions ? ResourceStatus.Completed : ResourceStatus.Running);
                                return <StatusBadge status={status} />;
                            }, sortValue: (j: Job) => j.failed },
                            { header: 'Completions', accessor: (j: Job) => `${j.succeeded}/${j.completions}`, sortValue: (j: Job) => j.succeeded },
                            { header: 'Age', accessor: (j: Job) => getAge(j.creationTimestamp), sortValue: (j: Job) => j.creationTimestamp },
                        ]}
                    />
                )}
            </div>
        );
    }
    if (state.selectedResourceType === 'configmap') {
        const data = (resource as any).data || {};
        const entries = Object.entries(data);
        if (entries.length > 0) {
            childrenLinks.push(
                 <div key="cm-data" className="mt-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Data</h4>
                    <div className="space-y-3">
                        {entries.map(([key, val]) => {
                            const isExpanded = expandedCmKey === key;
                            return (
                                <div key={key} className={`bg-gray-950 border border-gray-800 rounded p-2 flex flex-col transition-all duration-200 ${isExpanded ? 'fixed inset-10 z-[60] shadow-2xl border-gray-600' : ''}`}>
                                    <div className="flex justify-between items-center mb-1 pb-1 border-b border-gray-800">
                                        <span className="text-xs text-blue-400 font-mono font-bold">{key}</span>
                                        <button onClick={(e) => { e.stopPropagation(); setExpandedCmKey(isExpanded ? null : key); }} className="text-gray-500 hover:text-white p-1 rounded hover:bg-gray-800">
                                            {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                                        </button>
                                    </div>
                                    <div className={`text-xs text-gray-400 font-mono whitespace-pre-wrap overflow-auto custom-scrollbar ${isExpanded ? 'flex-1 p-2' : 'max-h-32'}`}>
                                        {(val as string)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {expandedCmKey && <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[55]" onClick={() => setExpandedCmKey(null)}></div>}
                </div>
            );
        }
    }
    if (state.selectedResourceType === 'replicaset') {
      const pods = state.pods.filter(p => p.ownerReferences?.some(o => o.uid === resource.id));
      if (pods.length > 0) {
        childrenLinks.push(
          <div key="pods" className="mt-4">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Controlled Pods</h4>
            <DrawerTable
                storageKey="drawer_rs_pods"
                data={pods}
                onRowClick={(p) => handleLinkClick(p.id, 'pod')}
                columns={[
                    { header: 'Name', accessor: (p) => (
                        <div className="flex items-center gap-2">
                          <span className="text-green-300 font-medium">{p.name}</span>
                          {(!p.isReady && p.status !== ResourceStatus.Completed && p.status !== ResourceStatus.Succeeded) && (
                            <div title="Pod is not ready">
                              <AlertTriangle size={14} className="text-yellow-500 flex-shrink-0" />
                            </div>
                          )}
                        </div>
                      ), sortValue: (p) => p.name },
                    { header: 'Status', accessor: (p) => <StatusBadge status={p.status} />, sortValue: (p) => p.status },
                ]}
            />
          </div>
        );
      }
    }
    if (state.selectedResourceType === 'pod') {
       const relatedNames = (resource as Pod).relatedConfigMaps || [];
       const relatedCm = state.configMaps.filter(cm => relatedNames.includes(cm.name) && cm.namespace === resource.namespace);
       if (relatedCm.length > 0) {
          childrenLinks.push(
            <div key="cm" className="mt-4">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Related Config</h4>
              {relatedCm.map(cm => (
                <div key={cm.id} onClick={() => handleLinkClick(cm.id, 'configmap')} className="cursor-pointer bg-gray-800 p-2 rounded mb-1 hover:bg-gray-700 flex justify-between items-center group" title="View ConfigMap details">
                  <span className="text-sm text-yellow-200 group-hover:text-yellow-100 transition-colors">{cm.name}</span>
                  <span className="text-xs text-gray-600 group-hover:text-gray-400">ConfigMap</span>
                </div>
              ))}
            </div>
          )
       }
    }
    if (state.selectedResourceType === 'service') {
       const svc = resource as Service;
       const relatedDeps = state.deployments.filter(d => isMatch(d.selector, svc.selector));
       if (relatedDeps.length > 0) {
          childrenLinks.push(
            <div key="deps" className="mt-4">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Target Workloads</h4>
              {relatedDeps.map(d => (
                <div key={d.id} onClick={() => handleLinkClick(d.id, 'deployment')} className="cursor-pointer bg-gray-800 p-2 rounded mb-1 hover:bg-gray-700 flex justify-between" title="View deployment details">
                   <span className="text-sm text-purple-300">{d.name}</span>
                   <span className="text-xs text-gray-500">Deployment</span>
                </div>
              ))}
            </div>
          )
       }
    }
    return childrenLinks;
  };

  const renderServicePorts = () => {
    if (state.selectedResourceType !== 'service') return null;
    const svc = resource as Service;
    return (
        <div className="mt-2">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Ports</h4>
            <div className="space-y-2">
                {svc.ports.map((port, i) => {
                    const activePf = state.portForwards.find(pf =>
                        pf.resourceName === svc.name &&
                        pf.resourceType === 'service' &&
                        pf.remotePort === port.port &&
                        pf.status === 'Active'
                    );
                    return (
                        <div key={i} className="flex justify-between items-center bg-gray-800 p-2 rounded border border-gray-700">
                            <span className="font-mono text-sm text-gray-300">
                                {port.port}:{port.targetPort}/{port.protocol} {port.name ? <span className="text-gray-500">({port.name})</span> : ''}
                            </span>
                            <button
                                onClick={() => handlePortClick(svc.name, port.port)}
                                className={`px-2 py-1 text-xs rounded border flex items-center gap-1 transition-colors ${
                                    activePf 
                                    ? 'bg-green-900/40 text-green-300 border-green-800 hover:bg-red-900/40 hover:text-red-300 hover:border-red-800' 
                                    : 'bg-blue-900/40 text-blue-300 border-blue-800 hover:bg-blue-800 hover:text-white'
                                }`}
                                title={activePf ? 'Stop port forwarding' : 'Start port forwarding'}
                            >
                                {activePf ? <><StopCircle size={12}/> Stop Forward</> : <><Network size={12}/> Forward</>}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
  };

  const renderPodContainers = () => {
    if (state.selectedResourceType !== 'pod') return null;
    const pod = resource as Pod;
    return (
      <div className="mt-2">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Containers</h4>
        <div className="space-y-3">
          {pod.containers.map((c, i) => {
            const isExpanded = expandedContainers.has(i);
            return (
            <div key={i} className="bg-gray-800/50 rounded border border-gray-700/50">
               <div
                 className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-700/30 transition-colors"
                 onClick={() => toggleContainer(i)}
               >
                 <div className="flex items-center gap-2">
                   <ContainerIcon size={14} className="text-blue-400"/>
                   <span className="font-semibold text-sm text-gray-200">{c.name}</span>
                   <span className="text-xs text-gray-500 font-mono">({c.image.split(':')[0].split('/').pop()})</span>
                 </div>
                 <ChevronDown
                   size={16}
                   className={`text-gray-400 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
                 />
               </div>
               {isExpanded && (
               <div className="px-3 pb-3 pt-1">
               <div className="text-xs text-gray-400 font-mono mb-2">Image: <span className="text-blue-300">{c.image}</span></div>
               {c.resources && (c.resources.requests || c.resources.limits) && (
                 <div className="mb-2 p-2 bg-gray-900/50 rounded border border-gray-700/30 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                     {c.resources.requests && (
                         <div className="col-span-1">
                             <span className="text-gray-500 font-bold uppercase text-[10px]">Requests</span>
                             <div className="flex flex-col font-mono text-gray-300">
                                 {c.resources.requests.cpu && <span>CPU: {c.resources.requests.cpu}</span>}
                                 {c.resources.requests.memory && <span>Mem: {c.resources.requests.memory}</span>}
                             </div>
                         </div>
                     )}
                     {c.resources.limits && (
                         <div className="col-span-1">
                             <span className="text-gray-500 font-bold uppercase text-[10px]">Limits</span>
                             <div className="flex flex-col font-mono text-gray-300">
                                 {c.resources.limits.cpu && <span>CPU: {c.resources.limits.cpu}</span>}
                                 {c.resources.limits.memory && <span>Mem: {c.resources.limits.memory}</span>}
                             </div>
                         </div>
                     )}
                 </div>
               )}
               {c.ports.length > 0 && (
                 <div>
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">Ports (Click to Forward):</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                       {c.ports.map((p, idx) => {
                           const activePf = state.portForwards.find(pf =>
                                pf.resourceName === pod.name &&
                                pf.resourceType === 'pod' &&
                                pf.remotePort === p.containerPort &&
                                pf.status === 'Active'
                            );
                           return (
                                <button
                                    key={idx}
                                    onClick={() => handlePortClick(pod.name, p.containerPort)}
                                    className={`px-2 py-1 rounded text-xs border font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                                        activePf 
                                        ? 'bg-green-900/60 text-green-200 border-green-600 hover:bg-red-900/60 hover:text-red-200 hover:border-red-600 shadow-sm' 
                                        : 'bg-blue-900/30 text-blue-300 border-blue-700 hover:bg-blue-800/60 hover:text-white hover:border-blue-500 hover:shadow-md'
                                    }`}
                                    title={activePf ? `Click to Stop Forwarding ${activePf.localPort}:${activePf.remotePort}` : 'Click to Start Port Forwarding'}
                                >
                                    <Network size={12} className={activePf ? 'text-green-300' : 'text-blue-400'} />
                                    <span>{p.containerPort}/{p.protocol} {p.name ? `(${p.name})` : ''}</span>
                                    {activePf && <span className="text-green-100">→ {activePf.localPort}</span>}
                                </button>
                           );
                       })}
                    </div>
                 </div>
               )}
               {c.volumeMounts && c.volumeMounts.length > 0 && (
                   <div className="mt-2">
                       <span className="text-xs text-gray-500 uppercase tracking-wider font-bold block mb-1">Mounts:</span>
                       <div className="space-y-1.5">
                           {c.volumeMounts.map((vm, idx) => {
                               const vol = pod.volumes?.find(v => v.name === vm.name);
                               let cmName: string | undefined = vol?.configMap?.name;
                               let items = vol?.configMap?.items;
                               if (!cmName && vol?.projected?.sources) {
                                   const cmSource = vol.projected.sources.find((s: any) => s.configMap);
                                   if (cmSource) {
                                       cmName = cmSource.configMap.name;
                                       items = cmSource.configMap.items;
                                   }
                               }
                               const isConfigMap = !!cmName;
                               let keyDisplay = '-';
                               if (isConfigMap) {
                                    if (vm.subPath) {
                                        if (items && items.length > 0) {
                                            const item = items.find((it: any) => (it.path || it.key) === vm.subPath);
                                            keyDisplay = item ? item.key : vm.subPath;
                                        } else { keyDisplay = vm.subPath; }
                                    } else {
                                        if (items && items.length > 0) { keyDisplay = items.map((i: any) => i.key).join(', '); }
                                        else { keyDisplay = 'All'; }
                                    }
                               }
                               return (
                                   <div key={idx} className="flex flex-col text-xs bg-gray-900/50 p-2 rounded border border-gray-700/30">
                                       <div className="grid grid-cols-[50px_1fr] gap-1">
                                           <span className="text-gray-500">Path:</span>
                                           <span className="font-mono text-gray-300 break-all">{vm.mountPath}</span>
                                           <span className="text-gray-500">Key:</span>
                                           <span className="text-gray-300 break-all">{keyDisplay}</span>
                                           <span className="text-gray-500">Source:</span>
                                           <div className="min-w-0">
                                               {isConfigMap ? (
                                                   <span className="text-yellow-400 hover:text-yellow-300 hover:underline cursor-pointer flex items-center gap-1.5 font-medium transition-colors truncate" onClick={() => cmName && handleConfigMapClick(cmName, pod.namespace)} title="View ConfigMap details">
                                                       <FileText size={12} className="flex-shrink-0" />
                                                       <span className="truncate">{cmName}</span>
                                                       <ExternalLink size={10} className="flex-shrink-0 opacity-50"/>
                                                   </span>
                                               ) : (
                                                   <span className="text-gray-500 flex items-center gap-1 truncate">
                                                       <HardDrive size={12} className="flex-shrink-0" />
                                                       <span className="truncate">{vm.name}</span>
                                                   </span>
                                               )}
                                           </div>
                                       </div>
                                   </div>
                               );
                           })}
                       </div>
                   </div>
               )}
               {c.env && c.env.length > 0 && (
                   <div className="mt-2">
                       <span className="text-xs text-gray-500 uppercase tracking-wider font-bold block mb-1">Environment:</span>
                       <div className="space-y-1.5">
                           {c.env.map((envVar, idx) => {
                               let valueDisplay: JSX.Element | string = '-';

                               if (envVar.value !== undefined) {
                                   valueDisplay = envVar.value;
                               } else if (envVar.valueFrom) {
                                   if (envVar.valueFrom.configMapKeyRef) {
                                       valueDisplay = (
                                           <span
                                               className="text-yellow-400 hover:text-yellow-300 hover:underline cursor-pointer flex items-center gap-1.5 font-medium transition-colors"
                                               onClick={() => handleConfigMapClick(envVar.valueFrom!.configMapKeyRef!.name, pod.namespace)}>
                                               <FileText size={12} className="flex-shrink-0"/>
                                               <span>{envVar.valueFrom.configMapKeyRef.name}:{envVar.valueFrom.configMapKeyRef.key}</span>
                                               <ExternalLink size={10} className="flex-shrink-0 opacity-50"/>
                                           </span>
                                       );
                                   } else if (envVar.valueFrom.secretKeyRef) {
                                       valueDisplay = (
                                           <span className="text-purple-400 flex items-center gap-1.5">
                                               <Key size={12} className="flex-shrink-0"/>
                                               <span>{envVar.valueFrom.secretKeyRef.name}:{envVar.valueFrom.secretKeyRef.key}</span>
                                           </span>
                                       );
                                   } else if (envVar.valueFrom.fieldRef) {
                                       valueDisplay = (
                                           <span className="text-cyan-400 flex items-center gap-1.5">
                                               <span className="font-mono">{envVar.valueFrom.fieldRef.fieldPath}</span>
                                           </span>
                                       );
                                   } else if (envVar.valueFrom.resourceFieldRef) {
                                       valueDisplay = (
                                           <span className="text-green-400 flex items-center gap-1.5">
                                               <span className="font-mono">{envVar.valueFrom.resourceFieldRef.resource}</span>
                                           </span>
                                       );
                                   }
                               }

                               return (
                                   <div key={idx} className="flex items-start gap-2 text-xs bg-gray-900/50 p-2 rounded border border-gray-700/30">
                                       <span className="font-mono text-gray-400 flex-shrink-0">{envVar.name}:</span>
                                       <div className="min-w-0 break-all flex-1">
                                           {typeof valueDisplay === 'string' ? (
                                               <span className="font-mono text-gray-300">{valueDisplay}</span>
                                           ) : (
                                               valueDisplay
                                           )}
                                       </div>
                                   </div>
                               );
                           })}
                       </div>
                   </div>
               )}
               </div>
               )}
            </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDeploymentConditions = () => {
      if (state.selectedResourceType !== 'deployment') return null;
      const dep = resource as Deployment;
      if (!dep.conditions || dep.conditions.length === 0) return null;
      return (
          <div className="mt-4">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Conditions</h4>
              <DrawerTable
                  storageKey="drawer_deployment_conditions"
                  data={dep.conditions}
                  columns={[
                      { header: 'Type', accessor: (c) => <span className="text-gray-200 font-medium">{c.type}</span> },
                      { header: 'Status', accessor: (c) => <StatusBadge status={c.status} /> },
                      { header: 'Last Update', accessor: (c) => getAge(c.lastTransitionTime || '') },
                      { header: 'Reason', accessor: (c) => <span className="text-xs text-gray-400">{c.reason}</span> },
                      { header: 'Message', accessor: (c) => <span className="text-xs text-gray-500">{c.message}</span> },
                  ]}
              />
          </div>
      );
  };

  const renderResourceQuota = () => {
    if (state.selectedResourceType !== 'resourcequota') return null;
    const rq = resource as any;
    const renderBar = (used: string, limit: string, name: string) => {
        let u = 0, l = 0;
        if (name === 'cpu' || name === 'requests.cpu' || name === 'limits.cpu') { u = parseCpu(used); l = parseCpu(limit); }
        else if (name === 'memory' || name === 'requests.memory' || name === 'limits.memory') { u = parseMemory(used); l = parseMemory(limit); }
        else { u = parseInt(used) || 0; l = parseInt(limit) || 0; }
        const pct = l > 0 ? (u / l) * 100 : 0;
        return (
            <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span className="font-bold">{name}</span>
                    <span>{used} / {limit}</span>
                </div>
                <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${pct > 90 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(pct, 100)}%` }}></div>
                </div>
            </div>
        )
    };
    return (
        <div className="space-y-4 pt-2">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Usage</h4>
            {Object.keys(rq.status.hard).map(k => (renderBar(rq.status.used[k] || '0', rq.status.hard[k], k)))}
        </div>
    );
  };

  const showEventsTab = state.selectedResourceType !== 'event';
  const showTerminalTab = state.selectedResourceType === 'pod';

  const getEventsToDisplay = () => {
    if (!resource) return [];
    return state.events.filter(e => {
        if (e.involvedObject.uid === resource.id) return true;
        const kind = state.selectedResourceType ? (state.selectedResourceType.charAt(0).toUpperCase() + state.selectedResourceType.slice(1)) : '';
        const resourceKind = kind === 'Cronjob' ? 'CronJob' : (kind === 'Configmap' ? 'ConfigMap' : (kind === 'Replicaset' ? 'ReplicaSet' : kind));
        return e.involvedObject.name === resource.name && e.involvedObject.namespace === resource.namespace && (e.involvedObject.kind === resourceKind || (resourceKind === 'Pod' && e.involvedObject.kind === 'Pod'));
    }).sort((a, b) => {
        // Sort by lastTimestamp in descending order (latest to oldest)
        // Handle null/undefined/invalid timestamps properly
        const timestampA = a.lastTimestamp || a.creationTimestamp;
        const timestampB = b.lastTimestamp || b.creationTimestamp;
        
        if (!timestampA && !timestampB) return 0;
        if (!timestampA) return 1; // Push events without timestamps to the end
        if (!timestampB) return -1;
        
        const timeA = new Date(timestampA).getTime();
        const timeB = new Date(timestampB).getTime();
        
        // Handle invalid dates (NaN)
        if (isNaN(timeA) && isNaN(timeB)) return 0;
        if (isNaN(timeA)) return 1; // Push invalid dates to the end
        if (isNaN(timeB)) return -1;
        
        return timeB - timeA; // Descending order (latest first)
    });
  };

  // Guard: Don't render if no resource is selected
  if (!resource) return null;

  return (
    <>
    <div
      className="fixed inset-y-0 right-0 bg-gray-900 border-l border-gray-800 shadow-2xl transform transition-transform duration-300 z-50 flex flex-col"
      style={{ width: `${drawerWidth}px` }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`absolute left-0 top-0 bottom-0 w-0.5 cursor-ew-resize hover:bg-blue-500 transition-colors ${isResizing ? 'bg-blue-500' : 'bg-transparent'}`}
        style={{ zIndex: 51 }}
      />

      <div className="h-14 flex items-center justify-between px-6 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-3 overflow-hidden">
            {state.resourceHistory.length > 0 && (
                <button onClick={() => dispatch({ type: 'GO_BACK_RESOURCE' })} className="mr-1 text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-gray-800">
                    <ArrowLeft size={20} />
                </button>
            )}
            <div className="font-semibold text-lg flex items-center gap-3 text-gray-100 truncate pr-4">
              <span className="bg-gray-800 p-1.5 rounded text-gray-400 flex-shrink-0"><Box size={18} /></span>
              <span className="truncate">{resource.name}</span>
              <StatusBadge status={getResourceStatus()} />
            </div>
        </div>
        <div className="flex items-center gap-3">
             <button onClick={handleDelete} className="text-gray-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-gray-800" title="Delete resource">
                <Trash2 size={20} />
             </button>
             <div className="h-5 w-px bg-gray-800"></div>
             <button onClick={() => dispatch({ type: 'CLOSE_DRAWER' })} className="text-gray-400 hover:text-white transition-colors flex-shrink-0" title="Close details panel">
               <X size={20} />
             </button>
        </div>
      </div>

      <div className="flex border-b border-gray-800 px-6 bg-gray-900">
        <button onClick={() => setActiveTab('details')} className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors uppercase tracking-wide ${activeTab === 'details' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>Details</button>
        <button onClick={() => setActiveTab('yaml')} className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors uppercase tracking-wide ${activeTab === 'yaml' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>YAML</button>
        {showTerminalTab && (<button onClick={() => setActiveTab('terminal')} className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors uppercase tracking-wide ${activeTab === 'terminal' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>Terminal</button>)}
        {showEventsTab && (<button onClick={() => setActiveTab('events')} className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors uppercase tracking-wide ${activeTab === 'events' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>Events</button>)}
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gray-900 custom-scrollbar flex flex-col">
        {activeTab === 'details' && (
          <div className="space-y-6">
            {state.selectedResourceType === 'deployment' && (
              <div className="flex gap-2 mb-4">
                 <button onClick={() => kubectl.rolloutRestart('deployment', resource.name, resource.namespace, resource.id)} className="flex-1 bg-blue-900/30 hover:bg-blue-900/50 border border-blue-800 rounded py-1.5 flex items-center justify-center text-sm transition-colors text-blue-300" title="Restart all pods in this deployment"><RotateCw size={14} className="mr-2" /> Rollout Restart</button>
                 <button
                   onClick={() => {
                     dispatch({
                       type: 'SET_LOGS_TARGET',
                       payload: {
                         type: 'all-pods',
                         deploymentName: resource.name,
                         namespace: resource.namespace
                       }
                     });
                   }}
                   className="flex-1 bg-green-900/30 hover:bg-green-900/50 border border-green-800 rounded py-1.5 flex items-center justify-center text-sm transition-colors text-green-300"
                   title="View aggregated logs from all pods"
                 >
                   <FileText size={14} className="mr-2" /> LOGS
                 </button>
              </div>
            )}
            {state.selectedResourceType === 'cronjob' && (
              <div className="flex gap-2 mb-4">
                 <button onClick={handleTriggerCronJob} className="flex-1 bg-blue-900/30 hover:bg-blue-900/50 border border-blue-800 rounded py-1.5 flex items-center justify-center text-sm transition-colors text-blue-300" title="Manually trigger this cronjob now"><Play size={14} className="mr-2" /> Trigger Now</button>
              </div>
            )}
            {state.selectedResourceType === 'pod' && (
              <div className="flex gap-2 mb-4">
                 {(resource as Pod).containers.length === 1 ? (
                   // Single container: direct button
                   <button
                     onClick={() => {
                       dispatch({
                         type: 'SET_LOGS_TARGET',
                         payload: {
                           type: 'pod',
                           podName: resource.name,
                           namespace: resource.namespace,
                           container: (resource as Pod).containers[0].name
                         }
                       });
                     }}
                     className="flex-1 bg-green-900/30 hover:bg-green-900/50 border border-green-800 rounded py-1.5 flex items-center justify-center text-sm transition-colors text-green-300"
                     title="View container logs"
                   >
                     <FileText size={14} className="mr-2" /> LOGS
                   </button>
                 ) : (
                   // Multiple containers: dropdown
                   <div className="relative flex-1">
                     <button
                       onClick={(e) => {
                         e.stopPropagation();
                         const btn = e.currentTarget;
                         const dropdown = btn.nextElementSibling as HTMLElement;
                         if (dropdown) {
                           dropdown.classList.toggle('hidden');
                         }
                       }}
                       className="w-full bg-green-900/30 hover:bg-green-900/50 border border-green-800 rounded py-1.5 flex items-center justify-center text-sm transition-colors text-green-300"
                       title="View logs"
                     >
                       <FileText size={14} className="mr-2" /> LOGS ▾
                     </button>
                     <div className="hidden absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg z-50 max-h-48 overflow-y-auto">
                       {(resource as Pod).containers.map(container => (
                         <button
                           key={container.name}
                           onClick={() => {
                             dispatch({
                               type: 'SET_LOGS_TARGET',
                               payload: {
                                 type: 'pod',
                                 podName: resource.name,
                                 namespace: resource.namespace,
                                 container: container.name
                               }
                             });
                           }}
                           className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                         >
                           {container.name}
                         </button>
                       ))}
                     </div>
                   </div>
                 )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-y-6 gap-x-4">
               <DetailItem label="Namespace" value={resource.namespace || '-'} />
               <DetailItem label="Created" value={formatCreationTime(resource.creationTimestamp)} />
               <DetailItem label="UID" value={resource.id} />
               {state.selectedResourceType === 'pod' ? (
                   <div>
                       <div className="text-xs text-gray-500 uppercase tracking-wide font-bold mb-1">Node</div>
                       <div className="text-sm font-medium break-all">
                          {(() => {
                              const nodeName = (resource as Pod).node;
                              const nodeObj = state.nodes.find(n => n.name === nodeName);
                              if (nodeObj) {
                                  return (
                                      <button
                                          onClick={(e) => { e.stopPropagation(); handleLinkClick(nodeObj.id, 'node'); }}
                                          className="text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 transition-colors text-left"
                                          title="View node details"
                                      >
                                          {nodeName} <ExternalLink size={12} className="opacity-50 flex-shrink-0" />
                                      </button>
                                  );
                              }
                              return <span className="text-gray-200">{nodeName || '-'}</span>;
                          })()}
                       </div>
                   </div>
               ) : (
                   'node' in resource && <DetailItem label="Node" value={(resource as any).node} />
               )}

               {'replicas' in resource && <DetailItem label="Replicas" value={`${(resource as any).availableReplicas} / ${(resource as any).replicas}`} />}
               {'type' in resource && <DetailItem label="Type" value={(resource as any).type} />}
               {'clusterIP' in resource && <DetailItem label="Cluster IP" value={(resource as any).clusterIP} />}
               {'loadBalancer' in resource && <DetailItem label="Load Balancer" value={(resource as any).loadBalancer} />}
               {'schedule' in resource && <DetailItem label="Schedule" value={(resource as any).schedule} />}
               {'completions' in resource && <DetailItem label="Completions" value={`${(resource as any).succeeded} / ${(resource as any).completions}`} />}
               {'reason' in resource && <DetailItem label="Reason" value={(resource as any).reason} />}
               {'source' in resource && <DetailItem label="Source" value={(resource as any).source.component} />}
               {'involvedObject' in resource && <DetailItem label="Object" value={`${(resource as any).involvedObject.kind}/${(resource as any).involvedObject.name}`} />}
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Labels</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(resource.labels).map(([k, v]) => (
                  <span key={k} className="px-2.5 py-1 bg-gray-800 rounded-md text-xs text-gray-300 border border-gray-700 font-mono">
                    <span className="text-gray-500">{k}:</span> {v as string}
                  </span>
                ))}
                {Object.keys(resource.labels).length === 0 && <span className="text-gray-600 text-sm italic">No labels</span>}
              </div>
            </div>

            {renderPodContainers()}
            {renderServicePorts()}
            {renderResourceQuota()}
            {renderDeploymentConditions()}
            {renderRelatedResources()}

            {'cpuUsage' in resource && (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="bg-gray-800 p-4 rounded border border-gray-700">
                   <div className="text-xs text-gray-500 mb-1 font-semibold uppercase">CPU</div>
                   <div className="text-2xl font-mono text-green-400 tracking-tighter mb-2">{(resource as any).cpuUsage}</div>
                </div>
                <div className="bg-gray-800 p-4 rounded border border-gray-700">
                   <div className="text-xs text-gray-500 mb-1 font-semibold uppercase">Memory</div>
                   <div className="text-2xl font-mono text-blue-400 tracking-tighter mb-2">{(resource as any).memoryUsage}</div>
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === 'yaml' && (
            <div className="flex-1 flex flex-col overflow-hidden -mx-6 -mb-6 h-full">
                <div className="bg-gray-850 px-6 py-2 border-b border-gray-800 flex justify-between items-center flex-shrink-0">
                    <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">Resource Manifest</span>
                    <div className="flex gap-2">
                        {isEditingYaml ? (
                            <>
                                <button onClick={() => setIsEditingYaml(false)} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded border border-gray-700 transition-colors" title="Cancel editing and discard changes">Cancel</button>
                                <button onClick={handleSaveYaml} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded border border-blue-500 font-bold shadow-lg shadow-blue-900/20 transition-colors flex items-center" title="Apply changes to the resource">
                                    <Save size={12} className="mr-1.5" /> Save Changes
                                </button>
                            </>
                        ) : (
                            <button onClick={() => setIsEditingYaml(true)} className="px-3 py-1 bg-blue-900/20 hover:bg-blue-900/40 text-blue-400 text-xs rounded border border-blue-900/50 transition-colors flex items-center font-bold" title="Edit resource YAML configuration">
                                <Edit2 size={12} className="mr-1.5" /> Edit YAML
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex-1 overflow-hidden relative">
                    {isEditingYaml ? (
                        <textarea
                            className="absolute inset-0 w-full h-full p-6 bg-gray-950 text-gray-300 font-mono text-xs focus:outline-none resize-none custom-scrollbar"
                            value={editedYaml}
                            onChange={(e) => setEditedYaml(e.target.value)}
                            spellCheck={false}
                        />
                    ) : (
                        <div className="absolute inset-0 p-6 overflow-auto font-mono text-xs text-gray-300 bg-gray-950 custom-scrollbar">
                            <pre className="whitespace-pre">{editedYaml}</pre>
                        </div>
                    )}
                </div>
            </div>
        )}
        {activeTab === 'events' && (
            <div className="space-y-3">
                {getEventsToDisplay().length === 0 ? (<div className="text-gray-500 italic text-sm">No related events found.</div>) : (getEventsToDisplay().map(e => {
                    // Use same timestamp logic as sorting
                    const displayTimestamp = e.lastTimestamp || e.creationTimestamp;
                    const ageText = displayTimestamp ? `${getAge(displayTimestamp)} ago` : 'Unknown';
                    
                    return (
                    <div key={e.id} className="bg-gray-800/50 border border-gray-700/50 rounded p-3">
                        <div className="flex justify-between items-start mb-1">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${e.type === 'Warning' ? 'bg-red-900/30 text-red-400' : 'bg-gray-700 text-gray-300'}`}>{e.type}</span>
                            <span className="text-xs text-gray-500">{ageText}</span>
                        </div>
                        <div className="text-sm text-gray-200 font-medium mb-1">{e.reason}</div>
                        <div className="text-xs text-gray-400">{e.message}</div>
                        <div className="mt-2 text-xs text-gray-500">Source: {e.source.component}</div>
                    </div>
                    );
                }))}
            </div>
        )}
        {activeTab === 'terminal' && (
            <div className="flex-1 flex flex-col -mx-6 -mb-6 h-full overflow-hidden">
                <div className="bg-gray-850 px-6 py-2 border-b border-gray-800 flex-shrink-0">
                  <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">
                    Interactive Shell - {resource.name}
                  </span>
                    <br/>
                    {terminalTarget && terminalTarget.containers.length > 1 && (
                    <select
                      className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                      value={terminalContainer}
                      onChange={(e) => setTerminalContainer(e.target.value)}
                    >
                      {terminalTarget.containers.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>
                <div className="flex-1 relative overflow-hidden">
                  {terminalTarget && terminalTarget.containers.length > 0 && (
                    <PodTerminal
                      wsUrl={`${BACKEND_WS_BASE_URL}/exec?ns=${resource.namespace}&pod=${resource.name}&container=${terminalContainer}&shell=/bin/sh`}
                    />
                  )}
                </div>
              </div>
        )}
      </div>
    </div>
    </>
  );
};
