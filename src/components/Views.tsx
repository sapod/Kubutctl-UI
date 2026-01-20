import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { Server, Box, Layers, Info, Trash2, ArrowUp, ArrowDown, Search, MoreVertical, StopCircle, AlertTriangle, Play,
    Plus, Edit2 } from 'lucide-react';
import { ResourceStatus, Deployment } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { kubectl } from '../services/kubectl';
import { StatusBadge, getAge, parseCpu, parseMemory } from './Shared';

export const OverviewPage: React.FC = () => {
  const { state, dispatch } = useStore();
  const stats = [
    { label: 'Nodes', value: state.nodes.length, icon: Server, color: 'text-blue-400', view: 'nodes' as const },
    { label: 'Pods', value: state.pods.length, icon: Box, color: 'text-green-400', view: 'pods' as const },
    { label: 'Deployments', value: state.deployments.length, icon: Layers, color: 'text-purple-400', view: 'deployments' as const },
  ];
  const podStatusData = [
    { name: 'Running', value: state.pods.filter(p => p.status === ResourceStatus.Running).length, color: '#4ade80' },
    { name: 'Pending', value: state.pods.filter(p => p.status === ResourceStatus.Pending).length, color: '#facc15' },
    { name: 'Failed', value: state.pods.filter(p => p.status === ResourceStatus.Failed || p.status === ResourceStatus.CrashLoopBackOff).length, color: '#f87171' },
  ];

  const handleNavigate = (view: 'nodes' | 'pods' | 'deployments') => {
    dispatch({ type: 'SET_VIEW', payload: view });
  };

  return (
    <div className="p-6 space-y-6">
       <h1 className="text-2xl font-bold text-gray-100 mb-6">Cluster Overview</h1>
       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stats.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div
                key={idx}
                onClick={() => handleNavigate(stat.view)}
                className="bg-gray-800 p-6 rounded-lg border border-gray-700 shadow-sm flex items-center justify-between cursor-pointer hover:bg-gray-750 hover:border-gray-600 transition-colors"
              >
                <div>
                   <p className="text-gray-400 text-sm font-medium uppercase">{stat.label}</p>
                   <p className="text-3xl font-bold text-gray-100 mt-1">{stat.value}</p>
                </div>
                <div className={`p-3 bg-gray-700/50 rounded-lg ${stat.color}`}>
                   <Icon size={24} />
                </div>
              </div>
            );
          })}
       </div>
       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 h-80">
            <h3 className="text-lg font-semibold text-gray-200 mb-4">Pod Status Distribution</h3>
            <ResponsiveContainer width="100%" height="100%">
               <BarChart data={podStatusData}>
                  <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{fill: '#374151'}} contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {podStatusData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Bar>
               </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 h-80 flex flex-col">
             <h3 className="text-lg font-semibold text-gray-200 mb-4">Recent Activity</h3>
             <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                {[...state.terminalOutput].reverse().slice(0, 10).map((log, i) => (
                  <div key={i} className="flex items-start text-sm p-2 bg-gray-900/50 rounded border border-gray-700/50">
                    <Info size={14} className="mt-1 mr-2 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300 font-mono text-xs break-all">{log}</span>
                  </div>
                ))}
             </div>
          </div>
       </div>
    </div>
  );
};

interface ResourceTableProps { title: string; data: any[]; columns: { header: string; accessor: (item: any) => React.ReactNode; sortValue?: (item: any) => string | number; }[]; onSelect?: (id: string) => void; showActions?: boolean; enableMultiSelect?: boolean; onBulkDelete?: (ids: string[]) => void; bulkActions?: { label: string; icon: React.ReactNode; onClick: (ids: string[]) => void }[]; }
const ResourceTable: React.FC<ResourceTableProps> = ({ title, data, columns, onSelect, showActions = false, enableMultiSelect = false, onBulkDelete }) => {
  const { state } = useStore();
  const [filter, setFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const storageKey = `main_table_${title.replace(/\s/g, '').replace(/\//g, '_').toLowerCase()}`;
  const [sortConfig, setSortConfig] = useState<{ key: number; direction: 'asc' | 'desc' } | null>(() => {
        try { const saved = localStorage.getItem(`kube_sort_${storageKey}`); return saved ? JSON.parse(saved) : null; } catch { return null; }
  });
  const filteredData = useMemo(() => data.filter(item => { if (state.selectedNamespace !== 'All Namespaces' && item.namespace && item.namespace !== state.selectedNamespace) return false; const nameToCheck = item.name || item.resourceName || ''; const namespaceToCheck = item.namespace || ''; return nameToCheck.toLowerCase().includes(filter.toLowerCase()) || namespaceToCheck.toLowerCase().includes(filter.toLowerCase()); }), [data, filter, state.selectedNamespace]);
  const sortedData = useMemo(() => { if (!sortConfig) return filteredData; const col = columns[sortConfig.key]; return [...filteredData].sort((a, b) => { const getVal = (item: any) => { if (col.sortValue) return col.sortValue(item); const key = col.header.toLowerCase(); if (item[key] !== undefined) return item[key]; return ''; }; const valA = getVal(a); const valB = getVal(b); if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1; if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1; return 0; }); }, [filteredData, sortConfig, columns]);
  const handleSort = (idx: number) => { let direction: 'asc' | 'desc' = 'asc'; if (sortConfig && sortConfig.key === idx && sortConfig.direction === 'asc') direction = 'desc'; const nextState = { key: idx, direction }; setSortConfig(nextState); localStorage.setItem(`kube_sort_${storageKey}`, JSON.stringify(nextState)); };
  return (
    <div className="p-6 h-full flex flex-col">
       <div className="flex justify-between items-center mb-6">
         <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-100 flex items-center">{title} <span className="text-gray-500 text-lg ml-3 font-normal">({filteredData.length})</span></h1>
            {selectedIds.length > 0 && (
                <div className="flex items-center gap-2 bg-blue-900/20 px-3 py-1.5 rounded-full border border-blue-900/50">
                    <span className="text-sm font-medium text-blue-300">{selectedIds.length} Selected</span>
                    {onBulkDelete && <button onClick={(e) => { e.stopPropagation(); onBulkDelete(selectedIds); setSelectedIds([]); }} className="ml-2 p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded" title="Delete selected items"><Trash2 size={16} /></button>}
                </div>
            )}
         </div>
         <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
            <input type="text" placeholder="Search..." className="bg-gray-800 border border-gray-700 text-gray-200 pl-9 pr-4 py-2 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none w-64" value={filter} onChange={e => setFilter(e.target.value)} onClick={(e) => e.stopPropagation()} />
         </div>
       </div>
       <div className="flex-1 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-400">
              <thead className="bg-gray-900 text-gray-200 font-medium uppercase text-xs sticky top-0 z-10" onClick={(e) => e.stopPropagation()}>
                <tr>
                  {enableMultiSelect && <th className="px-6 py-3 border-b border-gray-700 w-10">
                        <input type="checkbox" onChange={() => { if (selectedIds.length === filteredData.length) setSelectedIds([]); else setSelectedIds(filteredData.map(d => d.id)); }} checked={selectedIds.length === filteredData.length && filteredData.length > 0} className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-0 cursor-pointer" />
                      </th>}
                  {columns.map((col, idx) => (
                    <th key={idx} className="px-6 py-3 border-b border-gray-700 cursor-pointer hover:text-white select-none group" onClick={() => handleSort(idx)}>
                      <div className="flex items-center gap-1"> {col.header} <span className="text-gray-600 group-hover:text-gray-400"> {sortConfig?.key === idx ? (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUp size={12} className="opacity-0 group-hover:opacity-50" />} </span> </div>
                    </th>
                  ))}
                  {showActions && <th className="px-6 py-3 border-b border-gray-700 w-10"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {sortedData.map((item) => (
                    <tr key={item.id} onClick={() => onSelect && onSelect(item.id)} className={`hover:bg-gray-700/50 transition-colors cursor-pointer ${selectedIds.includes(item.id) ? 'bg-blue-900/10' : ''}`}>
                        {enableMultiSelect && <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={(e) => { e.stopPropagation(); if (selectedIds.includes(item.id)) setSelectedIds(selectedIds.filter(sid => sid !== item.id)); else setSelectedIds([...selectedIds, item.id]); }} className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-0 cursor-pointer" />
                            </td>}
                        {columns.map((col, idx) => <td key={idx} className="px-6 py-4">{col.accessor(item)}</td>)}
                        {showActions && <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}><button className="text-gray-500 hover:text-gray-300"><MoreVertical size={16} /></button></td>}
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
       </div>
    </div>
  );
};

export const NodesPage: React.FC = () => {
    const { state, dispatch } = useStore();
    return <ResourceTable title="Nodes" data={state.nodes} onSelect={(id) => dispatch({ type: 'SELECT_RESOURCE', payload: { id, type: 'node' } })} columns={[ { header: 'Name', accessor: (n) => <span className="font-medium text-gray-200">{n.name}</span>, sortValue: (n) => n.name }, { header: 'Status', accessor: (n) => <StatusBadge status={n.status} />, sortValue: (n) => n.status }, { header: 'Roles', accessor: (n) => n.roles.join(', ') || '<none>' }, { header: 'Version', accessor: (n) => n.version }, { header: 'Age', accessor: (n) => getAge(n.creationTimestamp), sortValue: (n) => n.creationTimestamp }, ]} />;
};

export const PodsPage: React.FC = () => {
    const { state, dispatch } = useStore();
    return <ResourceTable title="Pods" data={state.pods}
                          enableMultiSelect
                          onBulkDelete={(ids) =>
                              kubectl.deleteResources(ids, 'pod',
                                  state.pods.filter(p => ids.includes(p.id))
                                      .map(p => ({ name: p.name, namespace: p.namespace })))}
                          onSelect={(id) => dispatch({ type: 'SELECT_RESOURCE', payload: { id, type: 'pod' } })}
                          columns={[ { header: 'Name', accessor: (p) =>
                                  <div className="flex items-center gap-2">
                                      <span className="font-medium text-gray-200">{p.name}</span>
                                      {(!p.isReady && p.status !== ResourceStatus.Completed && p.status !== ResourceStatus.Succeeded) &&
                                          <div title="Pod is not ready">
                                              <AlertTriangle size={14} className="text-yellow-500" />
                                          </div>} 
                                  </div>,
                              sortValue: (p) => p.name },
                              { header: 'Namespace', accessor: (p) => p.namespace, sortValue: (p) => p.namespace },
                              { header: 'Status', accessor: (p) =>
                                      <StatusBadge status={p.status} />,
                                  sortValue: (p) => p.status },
                              { header: 'Restarts', accessor: (p) => p.restarts },
                              { header: 'CPU', accessor: (p) => p.cpuUsage, sortValue: (p) => parseCpu(p.cpuUsage) },
                              { header: 'Memory', accessor: (p) => p.memoryUsage, sortValue: (p) => parseMemory(p.memoryUsage) },
                              { header: 'Age', accessor: (p) => getAge(p.creationTimestamp), sortValue: (p) => p.creationTimestamp }, ]} />;
};

export const DeploymentsPage: React.FC = () => {
    const { state, dispatch } = useStore();
    return (
        <ResourceTable
            title="Deployments"
            data={state.deployments}
            enableMultiSelect
            onBulkDelete={(ids) => kubectl.deleteResources(ids, 'deployment', state.deployments.filter(d => ids.includes(d.id)).map(d => ({ name: d.name, namespace: d.namespace })))}
            onSelect={(id) => dispatch({ type: 'SELECT_RESOURCE', payload: { id, type: 'deployment' } })}
            columns={[
                { header: 'Name', accessor: (d) => <span className="font-medium text-gray-200">{d.name}</span>, sortValue: (d) => d.name },
                { header: 'Namespace', accessor: (d) => d.namespace, sortValue: (d) => d.namespace },
                { header: 'Desired', accessor: (d) => d.replicas, sortValue: (d) => d.replicas },
                { header: 'Available', accessor: (d) => d.availableReplicas, sortValue: (d) => d.availableReplicas },
                { header: 'Conditions', accessor: (d: Deployment) => (
                    <div className="flex flex-wrap gap-1">
                      {d.conditions?.map((c, i) => (
                        <span
                          key={i}
                          title={`${c.type}: ${c.reason || ''} ${c.message || ''}`}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${
                            c.status === 'True' ? 'bg-green-900/20 text-green-400 border-green-800' : 
                            c.status === 'False' ? 'bg-red-900/20 text-red-400 border-red-800' : 
                            'bg-gray-800 text-gray-400 border-gray-700'
                          }`}
                        >
                          {c.type}
                        </span>
                      ))}
                    </div>
                )},
                { header: 'Age', accessor: (d) => getAge(d.creationTimestamp), sortValue: (d) => d.creationTimestamp },
            ]}
        />
    );
};

export const ReplicaSetsPage: React.FC = () => {
    const { state, dispatch } = useStore();
    return <ResourceTable title="ReplicaSets" data={state.replicaSets} enableMultiSelect onBulkDelete={(ids) => kubectl.deleteResources(ids, 'replicaset', state.replicaSets.filter(d => ids.includes(d.id)).map(i => ({ name: i.name, namespace: i.namespace })))} onSelect={(id) => dispatch({ type: 'SELECT_RESOURCE', payload: { id, type: 'replicaset' } })} columns={[ { header: 'Name', accessor: (r) => <span className="font-medium text-gray-200">{r.name}</span>, sortValue: (r) => r.name }, { header: 'Namespace', accessor: (r) => r.namespace, sortValue: (r) => r.namespace }, { header: 'Desired', accessor: (r) => r.replicas }, { header: 'Available', accessor: (r) => r.availableReplicas }, { header: 'Age', accessor: (r) => getAge(r.creationTimestamp), sortValue: (r) => r.creationTimestamp }, ]} />;
};

export const JobsPage: React.FC = () => {
    const { state, dispatch } = useStore();
    return <ResourceTable title="Jobs" data={state.jobs} enableMultiSelect onBulkDelete={(ids) => kubectl.deleteResources(ids, 'job', state.jobs.filter(d => ids.includes(d.id)).map(i => ({ name: i.name, namespace: i.namespace })))} onSelect={(id) => dispatch({ type: 'SELECT_RESOURCE', payload: { id, type: 'job' } })} columns={[ { header: 'Name', accessor: (j) => <span className="font-medium text-gray-200">{j.name}</span>, sortValue: (j) => j.name }, { header: 'Namespace', accessor: (j) => j.namespace, sortValue: (j) => j.namespace }, { header: 'Completions', accessor: (j) => `${j.succeeded}/${j.completions}` }, { header: 'Status', accessor: (j) => <StatusBadge status={j.failed > 0 ? ResourceStatus.Failed : (j.succeeded >= j.completions ? ResourceStatus.Completed : ResourceStatus.Running)} /> }, { header: 'Age', accessor: (j) => getAge(j.creationTimestamp), sortValue: (j) => j.creationTimestamp }, ]} />;
};

export const CronJobsPage: React.FC = () => {
    const { state, dispatch } = useStore();
    return <ResourceTable title="CronJobs" data={state.cronJobs} enableMultiSelect onBulkDelete={(ids) => kubectl.deleteResources(ids, 'cronjob', state.cronJobs.filter(d => ids.includes(d.id)).map(i => ({ name: i.name, namespace: i.namespace })))} onSelect={(id) => dispatch({ type: 'SELECT_RESOURCE', payload: { id, type: 'cronjob' } })} columns={[ { header: 'Name', accessor: (c) => <span className="font-medium text-gray-200">{c.name}</span>, sortValue: (c) => c.name }, { header: 'Namespace', accessor: (c) => c.namespace, sortValue: (c) => c.namespace }, { header: 'Schedule', accessor: (c) => <span className="font-mono text-xs bg-gray-700 px-1 py-0.5 rounded">{c.schedule}</span> }, { header: 'Suspend', accessor: (c) => c.suspend ? 'True' : 'False' }, { header: 'Active', accessor: (c) => c.active }, { header: 'Last Schedule', accessor: (c) => c.lastScheduleTime ? getAge(c.lastScheduleTime) : '-' }, { header: 'Age', accessor: (c) => getAge(c.creationTimestamp), sortValue: (c) => c.creationTimestamp }, ]} />;
};

export const ServicesPage: React.FC = () => {
    const { state, dispatch } = useStore();
    return <ResourceTable title="Services" data={state.services} enableMultiSelect onBulkDelete={(ids) => kubectl.deleteResources(ids, 'service', state.services.filter(d => ids.includes(d.id)).map(i => ({ name: i.name, namespace: i.namespace })))} onSelect={(id) => dispatch({ type: 'SELECT_RESOURCE', payload: { id, type: 'service' } })} columns={[ { header: 'Name', accessor: (s) => <span className="font-medium text-gray-200">{s.name}</span>, sortValue: (s) => s.name }, { header: 'Namespace', accessor: (s) => s.namespace, sortValue: (s) => s.namespace }, { header: 'Type', accessor: (s) => s.type }, { header: 'Cluster IP', accessor: (s) => s.clusterIP }, { header: 'Ports', accessor: (s) => s.ports.map((p: { port: any; protocol: any; }) => `${p.port}/${p.protocol}`).join(', ') }, { header: 'Age', accessor: (s) => getAge(s.creationTimestamp), sortValue: (s) => s.creationTimestamp }, ]} />;
};

export const IngressesPage: React.FC = () => {
    const { state, dispatch } = useStore();
    return <ResourceTable title="Ingresses" data={state.ingresses} enableMultiSelect onBulkDelete={(ids) => kubectl.deleteResources(ids, 'ingress', state.ingresses.filter(d => ids.includes(d.id)).map(i => ({ name: i.name, namespace: i.namespace })))} onSelect={(id) => dispatch({ type: 'SELECT_RESOURCE', payload: { id, type: 'ingress' } })} columns={[ { header: 'Name', accessor: (i) => <span className="font-medium text-gray-200">{i.name}</span>, sortValue: (i) => i.name }, { header: 'Namespace', accessor: (i) => i.namespace, sortValue: (i) => i.namespace }, { header: 'LoadBalancer', accessor: (i) => i.loadBalancer || '-' }, { header: 'Rules', accessor: (i) => i.rules.map((r: { host: any; }) => r.host).join(', ') }, { header: 'Age', accessor: (i) => getAge(i.creationTimestamp), sortValue: (i) => i.creationTimestamp }, ]} />;
};

export const ConfigMapsPage: React.FC = () => {
    const { state, dispatch } = useStore();
    return <ResourceTable title="ConfigMaps" data={state.configMaps} enableMultiSelect onBulkDelete={(ids) => kubectl.deleteResources(ids, 'configmap', state.configMaps.filter(d => ids.includes(d.id)).map(i => ({ name: i.name, namespace: i.namespace })))} onSelect={(id) => dispatch({ type: 'SELECT_RESOURCE', payload: { id, type: 'configmap' } })} columns={[ { header: 'Name', accessor: (c) => <span className="font-medium text-gray-200">{c.name}</span>, sortValue: (c) => c.name }, { header: 'Namespace', accessor: (c) => c.namespace, sortValue: (c) => c.namespace }, { header: 'Keys', accessor: (c) => Object.keys(c.data).length }, { header: 'Age', accessor: (c) => getAge(c.creationTimestamp), sortValue: (c) => c.creationTimestamp }, ]} />;
};

export const NamespacesPage: React.FC = () => {
    const { state, dispatch } = useStore();
    return <ResourceTable title="Namespaces" data={state.namespaces} enableMultiSelect onBulkDelete={(ids) => kubectl.deleteResources(ids, 'namespace', state.namespaces.filter(d => ids.includes(d.id)).map(i => ({ name: i.name, namespace: i.name })))} onSelect={(id) => dispatch({ type: 'SELECT_RESOURCE', payload: { id, type: 'namespace' } })} columns={[ { header: 'Name', accessor: (n) => <span className="font-medium text-gray-200">{n.name}</span>, sortValue: (n) => n.name }, { header: 'Status', accessor: (n) => <StatusBadge status={n.status} />, sortValue: (n) => n.status }, { header: 'Age', accessor: (n) => getAge(n.creationTimestamp), sortValue: (n) => n.creationTimestamp }, ]} />;
};

export const ResourceQuotasPage: React.FC = () => {
    const { state, dispatch } = useStore();
    return <ResourceTable title="Resource Quotas" data={state.resourceQuotas} enableMultiSelect onBulkDelete={(ids) => kubectl.deleteResources(ids, 'resourcequota', state.resourceQuotas.filter(d => ids.includes(d.id)).map(i => ({ name: i.name, namespace: i.namespace })))} onSelect={(id) => dispatch({ type: 'SELECT_RESOURCE', payload: { id, type: 'resourcequota' } })} columns={[ { header: 'Name', accessor: (r) => <span className="font-medium text-gray-200">{r.name}</span>, sortValue: (r) => r.name }, { header: 'Namespace', accessor: (r) => r.namespace, sortValue: (r) => r.namespace }, { header: 'Age', accessor: (r) => getAge(r.creationTimestamp), sortValue: (r) => r.creationTimestamp }, ]} />;
};

export const PortForwardingPage: React.FC = () => {
    const { state, dispatch } = useStore();
    const handleStop = async (ids: string[]) => { const items = state.portForwards.filter(d => ids.includes(d.id)); for (const i of items) { if (i.pid) await kubectl.stopPortForward(i.pid); } dispatch({ type: 'BULK_REMOVE_PORT_FORWARD', payload: ids }); };
    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-hidden border-b border-gray-800">
                <ResourceTable title="Active Forwarding" data={state.portForwards} enableMultiSelect onBulkDelete={handleStop} onSelect={() => {}} columns={[ { header: 'Resource', accessor: (pf) => <span className="font-medium text-gray-200">{pf.resourceType}/{pf.resourceName}</span> }, { header: 'Namespace', accessor: (pf) => pf.namespace }, { header: 'Local Port', accessor: (pf) => <span className="text-blue-300 font-mono text-sm">{pf.localPort}</span> }, { header: 'Remote Port', accessor: (pf) => <span className="text-gray-400 font-mono text-sm">{pf.remotePort}</span> }, { header: 'Status', accessor: (pf) => <StatusBadge status={pf.status} /> }, { header: 'Actions', accessor: (pf) => <button onClick={(e) => { e.stopPropagation(); handleStop([pf.id]); }} className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-900/30" title="Stop port forwarding"><StopCircle size={16} /></button> }, ]} />
            </div>
            <div className="h-1/3 min-h-[250px] bg-gray-900 p-6 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-4"> <h3 className="text-lg font-bold text-gray-200">Saved Routines</h3> <button onClick={() => dispatch({ type: 'OPEN_ROUTINE_MODAL', payload: null })} className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-sm font-medium" title="Create a new port forwarding routine"><Plus size={16} /> Create Routine</button> </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {state.routines.map(routine => (
                        <div key={routine.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 shadow-sm hover:border-gray-600 transition-colors">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h4 className="font-bold text-gray-200">{routine.name}</h4>
                                    <span className="text-xs text-gray-500">{routine.items.length} items</span>
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={
                                        async () => {
                                            for (const item of routine.items) {
                                                const id = `pf-routine-${Date.now()}-${Math.random()}`;
                                                try {
                                                    const result = await kubectl.startPortForward(id, item.resourceType, item.resourceName, item.namespace, item.localPort, item.remotePort);
                                                    const actualLocalPort = result.localPort || item.localPort;
                                                    dispatch({ type: 'ADD_PORT_FORWARD', payload: { id, pid: result.pid, resourceName: item.resourceName, resourceType: item.resourceType as any, namespace: item.namespace, localPort: actualLocalPort, remotePort: item.remotePort, status: 'Active' }});
                                                } catch (e) {}
                                            }
                                        }
                                    } className="p-1.5 bg-green-900/30 text-green-400 rounded hover:bg-green-900/50 hover:text-white transition-colors" title="Start all port forwards in this routine">
                                        <Play size={16} fill="currentColor" />
                                    </button>
                                    <button onClick={() => dispatch({ type: 'OPEN_ROUTINE_MODAL', payload: routine })}
                                            className="p-1.5 text-gray-400 hover:text-blue-300 hover:bg-gray-700 rounded transition-colors" title="Edit routine"><Edit2 size={16} />
                                    </button>
                                    <button onClick={() => {
                                        if (confirm("Delete routine?"))
                                            dispatch({ type: 'REMOVE_ROUTINE', payload: routine.id }); }
                                    } className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors" title="Delete routine">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
