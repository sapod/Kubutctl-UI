import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Layers, ChevronDown, Activity, Server, Box, Copy, PlayCircle, Clock, Globe, Anchor, Network, FileText, PieChart, LayoutGrid } from 'lucide-react';

// --- Namespace Selector ---
export const NamespaceSelector: React.FC = () => {
  const { state, dispatch } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  // Robustly handle namespaces, default to empty array if undefined
  // Filter out any invalid items (null/undefined names)
  const nsList = (state.namespaces || []).map(ns => ns?.name).filter(Boolean);
  const allNamespaces = ['All Namespaces', ...nsList];
  
  const filteredNamespaces = allNamespaces.filter(ns => 
    ns.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (ns: string) => {
    dispatch({ type: 'SELECT_NAMESPACE', payload: ns });
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="relative w-64" ref={wrapperRef}>
      <div 
        className="flex items-center justify-between w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-sm cursor-pointer hover:border-gray-600"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center truncate">
          <Layers size={14} className="mr-2 text-gray-400" />
          <span className="text-gray-200 truncate">{state.selectedNamespace}</span>
        </div>
        <ChevronDown size={14} className="text-gray-500 ml-2" />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 w-full mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-50 max-h-64 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-gray-700">
            <input 
              type="text" 
              placeholder="Filter namespaces..." 
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {filteredNamespaces.length === 0 ? (
               <div className="px-3 py-2 text-xs text-gray-500">No namespaces found</div>
            ) : (
              filteredNamespaces.map(ns => (
                <div 
                  key={ns} 
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-600/20 hover:text-blue-300 ${state.selectedNamespace === ns ? 'text-blue-400 font-medium' : 'text-gray-300'}`}
                  onClick={() => handleSelect(ns)}
                >
                  {ns}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Main Navigation Sidebar ---
export const Sidebar: React.FC<{ currentView: string; onViewChange: (view: any) => void }> = ({ currentView, onViewChange }) => {
  const { state } = useStore();
  const currentCluster = state.clusters.find(c => c.id === state.currentClusterId);

  const groups = [
    {
      title: 'Cluster',
      items: [
        { view: 'overview', icon: Activity, label: 'Overview' },
        { view: 'nodes', icon: Server, label: 'Nodes' },
        { view: 'namespaces', icon: LayoutGrid, label: 'Namespaces' },
      ]
    },
    {
      title: 'Workloads',
      items: [
        { view: 'pods', icon: Box, label: 'Pods' },
        { view: 'deployments', icon: Layers, label: 'Deployments' },
        { view: 'replicasets', icon: Copy, label: 'ReplicaSets' },
        { view: 'jobs', icon: PlayCircle, label: 'Jobs' },
        { view: 'cronjobs', icon: Clock, label: 'CronJobs' },
      ]
    },
    {
      title: 'Network',
      items: [
        { view: 'services', icon: Globe, label: 'Services' },
        { view: 'ingresses', icon: Anchor, label: 'Ingresses' },
        { view: 'port-forwarding', icon: Network, label: 'Port Forwarding' },
      ]
    },
    {
      title: 'Config',
      items: [
        { view: 'configmaps', icon: FileText, label: 'ConfigMaps' },
        { view: 'resourcequotas', icon: PieChart, label: 'Resource Quotas' },
      ]
    },
    {
      title: 'System',
      items: []
    }
  ];

  return (
    <div className="w-60 bg-gray-900 flex flex-col h-full flex-shrink-0 border-r border-gray-800">
      <div className="h-14 flex items-center px-4 border-b border-gray-800 font-bold text-gray-100 truncate shadow-sm bg-gray-900">
        <span className="truncate">{currentCluster?.name}</span>
      </div>
      
      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        {groups.map((group, idx) => (
          <div key={idx} className="mb-4">
             {group.title && group.items.length > 0 && (
               <div className="px-4 py-1 text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center justify-between group cursor-pointer hover:text-gray-300">
                 {group.title}
                 <ChevronDown size={12} />
               </div>
             )}
             <div className="mt-1">
               {group.items.map(item => (
                 <button
                   key={item.view}
                   onClick={() => onViewChange(item.view)}
                   className={`flex items-center w-full px-4 py-2 text-sm font-medium transition-colors border-l-2 ${
                     currentView === item.view
                       ? 'bg-blue-600/10 text-blue-400 border-blue-500'
                       : 'border-transparent text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                   }`}
                 >
                   <item.icon size={16} className="mr-3" />
                   {item.label}
                 </button>
               ))}
             </div>
          </div>
        ))}
      </div>
    </div>
  );
};