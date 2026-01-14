import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../store';
import { Terminal, FileText, RefreshCw, Search, X } from 'lucide-react';
import { kubectl } from '../services/kubectl';

export const TerminalPanel: React.FC = () => {
    const { state, dispatch } = useStore();
    const bottomRef = React.useRef<HTMLDivElement>(null);

    // Tab state
    const [activeTab, setActiveTab] = useState<'terminal' | 'logs'>('terminal');

    // Logs state
    const [logLines, setLogLines] = useState<string[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [selectedDeployment, setSelectedDeployment] = useState<string>(''); // Start empty - user must select
    const [selectedPod, setSelectedPod] = useState<string>(''); // Start empty
    const [selectedContainer, setSelectedContainer] = useState<string>('');
    const [availableDeployments, setAvailableDeployments] = useState<Array<{ name: string; namespace: string }>>([]);

    // Search state for logs
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [showSearch, setShowSearch] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Previous container logs state
    const [showPrevious, setShowPrevious] = useState(false);

    // Logs scroll ref
    const logsBottomRef = useRef<HTMLDivElement>(null);

    // Terminal resizing
    const [terminalHeight, setTerminalHeight] = useState(() => {
        const saved = localStorage.getItem('terminalHeight');
        return saved ? parseInt(saved) : 192; // Default 192px (h-48)
    });
    const [isResizing, setIsResizing] = useState(false);
    const resizingRef = useRef(false);
    const startYRef = useRef(0);
    const startHeightRef = useRef(0);

    useEffect(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [state.terminalOutput]);

    // Update available deployments when state changes
    useEffect(() => {
        const deployments = state.deployments.map(dep => ({
            name: dep.name,
            namespace: dep.namespace
        }));
        setAvailableDeployments(deployments);
    }, [state.pods, state.deployments, state.replicaSets]);

    // Reset selectors when context is switched
    useEffect(() => {
        setSelectedDeployment('');
        setSelectedPod('');
        setSelectedContainer('');
        setLogLines([]);
        setShowPrevious(false);
        setSearchQuery('');
        setShowSearch(false);
    }, [state.currentClusterId]);


    // Handle logs target from state (when LOGS button is clicked in drawer)
    useEffect(() => {
        if (state.logsTarget) {
            setActiveTab('logs');

            // Close the drawer to give more space for viewing logs
            if (state.drawerOpen) {
                dispatch({ type: 'CLOSE_DRAWER' });
            }

            if (state.logsTarget.type === 'pod') {
                // For pod: find which deployment owns it using label matching
                const pod = state.pods.find(p => p.name === state.logsTarget?.podName && p.namespace === state.logsTarget?.namespace);

                let deploymentFound = false;
                if (pod && pod.labels) {
                    // Find deployment that matches this pod's labels
                    const matchingDeployment = state.deployments.find(dep => {
                        if (dep.namespace !== pod.namespace) return false;
                        if (!dep.selector || !pod.labels) return false;

                        // Check if all deployment selector labels match the pod's labels
                        return Object.entries(dep.selector).every(([key, value]) => pod.labels![key] === value);
                    });

                    if (matchingDeployment) {
                        setSelectedDeployment(`${matchingDeployment.namespace}/${matchingDeployment.name}`);
                        deploymentFound = true;
                    }
                }

                // If no deployment found, try old method with owner references as fallback
                if (!deploymentFound && pod?.ownerReferences) {
                    const owner = pod.ownerReferences.find(o => o.kind === 'ReplicaSet');
                    if (owner) {
                        const rs = state.replicaSets.find(r => r.name === owner.name && r.namespace === pod.namespace);
                        if (rs?.ownerReferences) {
                            const depOwner = rs.ownerReferences.find(o => o.kind === 'Deployment');
                            if (depOwner) {
                                setSelectedDeployment(`${pod.namespace}/${depOwner.name}`);
                                deploymentFound = true;
                            }
                        }
                    }
                }

                // If still no deployment found, select first available deployment
                if (!deploymentFound && availableDeployments.length > 0) {
                    setSelectedDeployment(`${availableDeployments[0].namespace}/${availableDeployments[0].name}`);
                }

                setSelectedPod(`${state.logsTarget.namespace}/${state.logsTarget.podName}`);
                if (state.logsTarget.container) {
                    setSelectedContainer(state.logsTarget.container);
                }
            } else if (state.logsTarget.type === 'all-pods' && state.logsTarget.deploymentName) {
                // For deployment all-pods
                setSelectedDeployment(`${state.logsTarget.namespace}/${state.logsTarget.deploymentName}`);
                setSelectedPod('all-pods');
                setSelectedContainer('');
            }

            // Clear the logs target after handling it (longer delay to ensure state updates complete)
            setTimeout(() => {
                dispatch({ type: 'SET_LOGS_TARGET', payload: null });
            }, 500);
        }
    }, [state.logsTarget, state.pods, state.deployments, state.replicaSets, availableDeployments]);

    // Fetch logs function
    const fetchLogs = async () => {
        if (!selectedDeployment) return;

        const [namespace, depName] = selectedDeployment.split('/');

        // Check if we're fetching all pods logs
        if (selectedPod === 'all-pods') {
            setLoadingLogs(true);
            try {
                const lines = await kubectl.getDeploymentLogs(depName, namespace);
                setLogLines(lines);
                // Jump to bottom after logs are loaded
                setTimeout(() => logsBottomRef.current?.scrollIntoView({ behavior: 'auto' }), 100);
            } catch (e) {
                setLogLines(['Failed to fetch deployment logs: ' + (e as Error).message]);
            } finally {
                setLoadingLogs(false);
            }
            return;
        }

        // Regular pod logs
        if (!selectedPod || !selectedContainer) return;

        const [podNamespace, podName] = selectedPod.split('/');
        setLoadingLogs(true);
        try {
            const lines = await kubectl.getLogs(podName, podNamespace, selectedContainer, showPrevious);
            setLogLines(lines);
            // Scroll to bottom after logs are loaded
            setTimeout(() => logsBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        } catch (e) {
            setLogLines(['Failed to fetch logs: ' + (e as Error).message]);
        } finally {
            setLoadingLogs(false);
        }
    };

    // Fetch logs when tab is switched or selection changes
    useEffect(() => {
        if (activeTab === 'logs' && selectedDeployment) {
            if (selectedPod === 'all-pods' || (selectedPod && selectedContainer)) {
                fetchLogs();
            }
        }
    }, [activeTab, selectedDeployment, selectedPod, selectedContainer, showPrevious]);

    // Update pod selection when deployment changes (but not when logsTarget is being set)
    useEffect(() => {
        if (selectedDeployment && !state.logsTarget) {
            // Only reset to all-pods when deployment changes manually (not from drawer)
            setSelectedPod('all-pods');
            setSelectedContainer('');
        }
    }, [selectedDeployment]);

    // Update container when pod changes (but only if current container is not valid)
    useEffect(() => {
        if (selectedPod && selectedPod !== 'all-pods') {
            const [namespace, podName] = selectedPod.split('/');
            const pod = state.pods.find(p => p.namespace === namespace && p.name === podName);
            if (pod && pod.containers.length > 0) {
                // Only auto-select if current container is not in the list
                const containerNames = pod.containers.map(c => c.name);
                if (!containerNames.includes(selectedContainer)) {
                    setSelectedContainer(containerNames[0]);
                }
            }
        }
    }, [selectedPod, state.pods]);

    // Terminal resize handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        resizingRef.current = true;
        startYRef.current = e.clientY;
        startHeightRef.current = terminalHeight;
        setIsResizing(true);
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!resizingRef.current) return;
            const diff = startYRef.current - e.clientY; // Inverted because dragging up increases height
            const newHeight = startHeightRef.current + diff;
            const minHeight = 100; // Minimum terminal height
            const maxHeight = window.innerHeight * 0.6; // Max 60% of window height
            const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
            setTerminalHeight(constrainedHeight);
        };

        const handleMouseUp = () => {
            if (resizingRef.current) {
                resizingRef.current = false;
                setIsResizing(false);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                localStorage.setItem('terminalHeight', terminalHeight.toString());
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
    }, [isResizing, terminalHeight]);

    // Handle window resize to ensure terminal stays within bounds
    useEffect(() => {
        const handleWindowResize = () => {
            const maxHeight = window.innerHeight * 0.6;
            if (terminalHeight > maxHeight) {
                const newHeight = maxHeight;
                setTerminalHeight(newHeight);
                localStorage.setItem('terminalHeight', newHeight.toString());
            }
        };

        window.addEventListener('resize', handleWindowResize);
        return () => window.removeEventListener('resize', handleWindowResize);
    }, [terminalHeight]);

    // Handle Cmd/Ctrl+F for search in logs view
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f' && activeTab === 'logs') {
                e.preventDefault();
                setShowSearch(true);
                setTimeout(() => searchInputRef.current?.focus(), 100);
            }
            if (e.key === 'Escape' && showSearch) {
                setShowSearch(false);
                setSearchQuery('');
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [activeTab, showSearch]);

    // Focus search input when opened
    useEffect(() => {
        if (showSearch && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [showSearch]);

    // Filter logs based on search query
    const filteredLogLines = searchQuery
        ? logLines.filter(line => line.toLowerCase().includes(searchQuery.toLowerCase()))
        : logLines;

    // Highlight search matches in log line
    const highlightMatches = (line: string, query: string) => {
        if (!query) return line;

        const parts = line.split(new RegExp(`(${query})`, 'gi'));
        return (
            <>
                {parts.map((part, i) =>
                    part.toLowerCase() === query.toLowerCase()
                        ? <span key={i} className="bg-yellow-500 text-gray-900">{part}</span>
                        : part
                )}
            </>
        );
    };

    return (
      <div
        className="bg-gray-950 border-t border-gray-800 flex flex-col font-mono text-sm shadow-inner relative"
        style={{ height: `${terminalHeight}px` }}
      >
        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className={`absolute top-0 left-0 h-0.5 cursor-ns-resize hover:bg-blue-500 transition-colors ${isResizing ? 'bg-blue-500' : 'bg-transparent'}`}
          style={{
            zIndex: 51,
            right: state.drawerOpen ? `${localStorage.getItem('drawerWidth') || '600'}px` : '0'
          }}
        />

        {/* Header with tabs */}
        <div className="flex items-center justify-between px-4 py-1.5 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('terminal')}
              className={`flex items-center text-xs font-bold uppercase tracking-wider transition-colors ${
                activeTab === 'terminal' ? 'text-blue-400' : 'text-gray-400 hover:text-gray-300'
              }`}
              title="Terminal output"
            >
              <Terminal size={12} className="mr-2" /> Terminal
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center text-xs font-bold uppercase tracking-wider transition-colors ${
                activeTab === 'logs' ? 'text-blue-400' : 'text-gray-400 hover:text-gray-300'
              }`}
              title="Pod logs viewer"
            >
              <FileText size={12} className="mr-2" /> Logs
            </button>
          </div>
          <div className="flex space-x-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
          </div>
        </div>

        {/* Terminal content */}
        {activeTab === 'terminal' && (
          <div className="flex-1 overflow-auto p-3 text-gray-300 font-mono text-xs leading-relaxed custom-scrollbar">
            {state.terminalOutput.map((line, i) => (
              <div key={i} className="mb-1 whitespace-pre-wrap break-all">
                {line.startsWith('>') ? <span className="text-blue-400 font-bold mr-2">$</span> : ''}
                {line.startsWith('>') ? <span className="text-yellow-100">{line.substring(2)}</span> : line}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Logs content */}
        {activeTab === 'logs' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Logs controls */}
            <div className="flex items-center gap-3 px-4 py-2 bg-gray-900/50 border-b border-gray-800">
              <div className="flex items-center gap-2 flex-1">
                <label className="text-xs text-gray-400 font-medium">Deployment:</label>
                <select
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 max-w-xs"
                  value={selectedDeployment}
                  onChange={(e) => {
                    setSelectedDeployment(e.target.value);
                    if (e.target.value) {
                      setSelectedPod('all-pods'); // Auto-select "All Pods" when deployment is chosen
                    } else {
                      setSelectedPod('');
                    }
                  }}
                >
                  {!selectedDeployment && <option value="" disabled>Select deployment</option>}
                  {availableDeployments.map(dep => (
                    <option key={`${dep.namespace}/${dep.name}`} value={`${dep.namespace}/${dep.name}`}>
                      {dep.namespace}/{dep.name}
                    </option>
                  ))}
                </select>

                <label className="text-xs text-gray-400 font-medium ml-2">Pod:</label>
                <select
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 max-w-xs"
                  value={selectedPod}
                  onChange={(e) => setSelectedPod(e.target.value)}
                  disabled={!selectedDeployment}
                >
                  {!selectedDeployment ? (
                    <option value="" disabled>Select deployment first</option>
                  ) : (
                    <>
                      <option value="all-pods">All Pods (Aggregated)</option>
                      {(() => {
                        const [namespace, depName] = selectedDeployment.split('/');
                        const deployment = state.deployments.find(d => d.name === depName && d.namespace === namespace);

                        if (!deployment) return null;

                        // Helper function to check if pod labels match deployment selector
                        const matchesSelector = (podLabels: Record<string, string> | undefined, selector: Record<string, string> | undefined) => {
                          if (!podLabels || !selector) return false;
                          return Object.entries(selector).every(([key, value]) => podLabels[key] === value);
                        };

                        const filteredPods = state.pods.filter(statePod => {
                            if (statePod.namespace !== namespace) return false;
                            return matchesSelector(statePod.labels, deployment.selector);
                        });

                        return filteredPods.map(pod => (
                            <option key={`${pod.namespace}/${pod.name}`} value={`${pod.namespace}/${pod.name}`}>
                              {pod.name}
                            </option>
                        ));
                      })()}
                    </>
                  )}
                </select>

                {selectedDeployment && selectedPod && selectedPod !== 'all-pods' && (
                  <>
                    <label className="text-xs text-gray-400 font-medium ml-2">Container:</label>
                    <select
                      className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                      value={selectedContainer}
                      onChange={(e) => setSelectedContainer(e.target.value)}
                    >
                      {(() => {
                        const [namespace, podName] = selectedPod.split('/');
                        const pod = state.pods.find(p => p.namespace === namespace && p.name === podName);
                        return pod?.containers.map(container => (
                          <option key={container.name} value={container.name}>{container.name}</option>
                        ));
                      })()}
                    </select>

                    {(() => {
                      // Only show "Previous" checkbox if pod has restarts
                      const [namespace, podName] = selectedPod.split('/');
                      const pod = state.pods.find(p => p.namespace === namespace && p.name === podName);
                      if (pod && pod.restarts && pod.restarts > 0) {
                        return (
                          <label className="flex items-center gap-1.5 ml-3 text-xs text-gray-400 cursor-pointer hover:text-gray-300 transition-colors">
                            <input
                              type="checkbox"
                              checked={showPrevious}
                              onChange={(e) => setShowPrevious(e.target.checked)}
                              className="w-3.5 h-3.5 rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                            />
                            <span>Previous ({pod.restarts} restart{pod.restarts > 1 ? 's' : ''})</span>
                          </label>
                        );
                      }
                      return null;
                    })()}
                  </>
                )}

                <button
                  onClick={fetchLogs}
                  className="p-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-400 hover:text-white transition-colors ml-2"
                  title="Refresh logs"
                  disabled={loadingLogs || !selectedDeployment || (selectedPod !== 'all-pods' && !selectedContainer)}
                >
                  <RefreshCw size={14} className={loadingLogs ? "animate-spin" : ""} />
                </button>

                <button
                  onClick={() => {
                    const newShowSearch = !showSearch;
                    setShowSearch(newShowSearch);
                    if (!newShowSearch) {
                      setSearchQuery(''); // Clear query when closing search
                    }
                  }}
                  className={`p-1.5 border border-gray-700 rounded transition-colors ${showSearch ? 'bg-blue-900/50 text-blue-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}`}
                  title="Search logs (Cmd/Ctrl+F)"
                >
                  <Search size={14} />
                </button>
              </div>
            </div>

            {/* Search bar */}
            {showSearch && (
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 border-b border-gray-700">
                <Search size={14} className="text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search in logs..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <span className="text-xs text-gray-400">
                    {filteredLogLines.length} / {logLines.length} lines
                  </span>
                )}
                <button
                  onClick={() => {
                    setShowSearch(false);
                    setSearchQuery('');
                  }}
                  className="p-1 text-gray-400 hover:text-white transition-colors"
                  title="Close search (Esc)"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Logs output */}
            <div className="flex-1 overflow-auto p-3 text-gray-300 font-mono text-xs leading-relaxed bg-gray-950 custom-scrollbar">
              {loadingLogs ? (
                <div className="text-gray-500 italic">Loading logs...</div>
              ) : !selectedDeployment ? (
                <div className="text-gray-500 italic">Select a deployment to view logs.</div>
              ) : filteredLogLines.length > 0 ? (
                <>
                  {filteredLogLines.map((line, i) => (
                    <div key={i} className="mb-0.5 whitespace-pre">
                      {searchQuery ? highlightMatches(line, searchQuery) : line}
                    </div>
                  ))}
                  <div ref={logsBottomRef} />
                </>
              ) : searchQuery && logLines.length > 0 ? (
                <div className="text-gray-500 italic">No logs match your search "{searchQuery}".</div>
              ) : (
                <div className="text-gray-500 italic">No logs available or container not running.</div>
              )}
            </div>
          </div>
        )}
      </div>
    );
};
