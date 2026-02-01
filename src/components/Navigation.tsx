import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Layers, ChevronDown, Activity, Server, Box, Copy, PlayCircle, Clock, Globe, Anchor, Network, FileText, PieChart, LayoutGrid, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

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

  // Sidebar resizing and collapsing
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? parseInt(saved) : 240; // Default 240px (w-60)
  });
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Sidebar resize handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
    setIsResizing(true);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const diff = e.clientX - startXRef.current;
      const newWidth = startWidthRef.current + diff;
      const minWidth = 180; // Minimum sidebar width
      const maxWidth = Math.min(400, window.innerWidth * 0.3); // Max 30% of window or 400px
      const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setSidebarWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      if (resizingRef.current) {
        resizingRef.current = false;
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem('sidebarWidth', sidebarWidth.toString());
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
  }, [isResizing, sidebarWidth]);

  // Handle window resize to ensure sidebar stays within bounds
  useEffect(() => {
    const handleWindowResize = () => {
      const maxWidth = Math.min(400, window.innerWidth * 0.3);
      if (sidebarWidth > maxWidth) {
        const newWidth = maxWidth;
        setSidebarWidth(newWidth);
        localStorage.setItem('sidebarWidth', newWidth.toString());
      }
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [sidebarWidth]);

  // Toggle collapse state
  const toggleCollapse = () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    localStorage.setItem('sidebarCollapsed', newCollapsed.toString());
  };

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
      items: [
        { view: 'events', icon: Calendar, label: 'Events' },
      ]
    }
  ];

  return (
    <div
      className={`bg-gray-900 flex flex-col h-full flex-shrink-0 border-r border-gray-800 relative ${isResizing ? '' : 'transition-all duration-300'}`}
      style={{ width: isCollapsed ? '48px' : `${sidebarWidth}px` }}
    >
      {/* Resize handle */}
      {!isCollapsed && (
        <div
          onMouseDown={handleMouseDown}
          className={`absolute right-0 top-0 bottom-0 w-0.5 cursor-ew-resize hover:bg-blue-500 transition-colors ${isResizing ? 'bg-blue-500' : 'bg-transparent'}`}
          style={{ zIndex: 51 }}
        />
      )}

      <button
        onClick={toggleCollapse}
        className={`h-14 flex items-center border-b border-gray-800 font-bold text-gray-100 shadow-sm bg-gray-900 w-full hover:bg-gray-800/50 transition-colors ${isCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? (
          <ChevronRight size={20} className="text-gray-400" />
        ) : (
          <>
            <span className="truncate">{currentCluster?.name}</span>
            <ChevronLeft size={16} className="text-gray-400 flex-shrink-0 ml-2" />
          </>
        )}
      </button>

      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        {groups.map((group, idx) => (
          <div key={idx} className="mb-4">
             {!isCollapsed && group.title && group.items.length > 0 && (
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
                   className={`flex items-center w-full ${isCollapsed ? 'justify-center px-2' : 'px-4'} py-2 text-sm font-medium transition-colors border-l-2 ${
                     currentView === item.view
                       ? 'bg-blue-600/10 text-blue-400 border-blue-500'
                       : 'border-transparent text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                   }`}
                   title={isCollapsed ? item.label : undefined}
                 >
                   <item.icon size={16} className={isCollapsed ? '' : 'mr-3'} />
                   {!isCollapsed && item.label}
                 </button>
               ))}
             </div>
          </div>
        ))}
      </div>
    </div>
  );
};
