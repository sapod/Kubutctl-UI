import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../store';
import { Terminal, FileText, RefreshCw, Search, X, AlertTriangle, Calendar, Download } from 'lucide-react';
import { kubectl } from '../services/kubectl';

export const TerminalPanel: React.FC = () => {
    const { state, dispatch } = useStore();
    const bottomRef = React.useRef<HTMLDivElement>(null);

    // Tab state
    const [activeTab, setActiveTab] = useState<'terminal' | 'logs'>('terminal');

    // Logs state
    const [logLines, setLogLines] = useState<string[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [isContextLoading, setIsContextLoading] = useState(false); // Track if loading is from context change
    const [downloadingLogs, setDownloadingLogs] = useState(false); // Track if downloading logs
    const lastSeenLogLineRef = useRef<string>(''); // Track the last log line we've seen to avoid duplicates
    const hasInitializedLogsRef = useRef(false); // Track if we've loaded logs at least once
    const [selectedDeployment, setSelectedDeployment] = useState<string>(''); // Start empty - user must select
    const [selectedPod, setSelectedPod] = useState<string>(''); // Start empty
    const [selectedContainer, setSelectedContainer] = useState<string>('');
    const [availableDeployments, setAvailableDeployments] = useState<Array<{ name: string; namespace: string }>>([]);

    // Search state for logs
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [showSearch, setShowSearch] = useState<boolean>(false);
    const [regexError, setRegexError] = useState<string>('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Previous container logs state
    const [showPrevious, setShowPrevious] = useState(false);

    // Date range filter state
    const [showDateFilter, setShowDateFilter] = useState(false);
    const [dateFrom, setDateFrom] = useState<string>(''); // ISO datetime-local format
    const [dateTo, setDateTo] = useState<string>(''); // ISO datetime-local format
    const [appliedDateFrom, setAppliedDateFrom] = useState<string>(''); // Actually applied dates
    const [appliedDateTo, setAppliedDateTo] = useState<string>(''); // Actually applied dates

    // Logs scroll ref
    const logsBottomRef = useRef<HTMLDivElement>(null);
    const logsContainerRef = useRef<HTMLDivElement>(null);
    const isScrolledToBottomRef = useRef(true); // Use ref instead of state to avoid stale closures
    const scrollPositionBeforeFetchRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);

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

        setLoadingLogs(true);

        // Save scroll position before fetching (if not at bottom)
        if (logsContainerRef.current && !isScrolledToBottomRef.current) {
            scrollPositionBeforeFetchRef.current = {
                scrollTop: logsContainerRef.current.scrollTop,
                scrollHeight: logsContainerRef.current.scrollHeight
            };
        } else {
            scrollPositionBeforeFetchRef.current = null;
        }

        const [namespace, depName] = selectedDeployment.split('/');

        // Check if we're fetching all pods logs
        if (selectedPod === 'all-pods') {
            try {
                const lines = await kubectl.getDeploymentLogs(depName, namespace, searchQuery, appliedDateFrom, appliedDateTo);

                // If we have existing logs and new logs, append only truly new ones
                if (hasInitializedLogsRef.current && !isContextLoading && lastSeenLogLineRef.current) {
                    // Find the index where we should start taking new logs
                    // Since logs are sorted oldest to newest, find the last log we've seen and take everything after it
                    const lastSeenIndex = lines.findIndex(line => line === lastSeenLogLineRef.current);

                    let newLines: string[] = [];
                    if (lastSeenIndex >= 0) {
                        // Take all logs after the last one we've seen
                        newLines = lines.slice(lastSeenIndex + 1);
                    } else {
                        // Couldn't find our last log - this means we might have missed some logs
                        // Take all new logs
                        newLines = lines;
                    }

                    if (newLines.length > 0) {
                        // Store the scroll info before state update
                        const savedScrollInfo = scrollPositionBeforeFetchRef.current;

                        // Append new logs to the END (they're newest, so they go at bottom)
                        setLogLines(prev => [...prev, ...newLines]);

                        // Update the last seen log line
                        lastSeenLogLineRef.current = newLines[newLines.length - 1];

                        // Maintain scroll position if user was scrolled up
                        if (savedScrollInfo && logsContainerRef.current) {
                            // Disable smooth scrolling temporarily
                            const container = logsContainerRef.current;
                            const oldBehavior = container.style.scrollBehavior;
                            container.style.scrollBehavior = 'auto';

                            // Use single requestAnimationFrame
                            requestAnimationFrame(() => {
                                if (logsContainerRef.current && savedScrollInfo) {
                                    logsContainerRef.current.scrollTop = savedScrollInfo.scrollTop;
                                    logsContainerRef.current.style.scrollBehavior = oldBehavior;
                                }
                            });
                        }
                    }
                } else {
                    // First load or context change - replace all logs
                    setLogLines(lines);
                    hasInitializedLogsRef.current = true;
                    // Store the last log line
                    if (lines.length > 0) {
                        lastSeenLogLineRef.current = lines[lines.length - 1];
                    }
                }

                // Only scroll to bottom if user is already at the bottom
                if (isScrolledToBottomRef.current) {
                    setTimeout(() => logsBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                }
            } catch (e) {
                setLogLines(['Failed to fetch deployment logs: ' + (e as Error).message]);
            } finally {
                setLoadingLogs(false);
                setIsContextLoading(false);
            }
            return;
        }

        // Regular pod logs
        if (!selectedPod || !selectedContainer) return;

        const [podNamespace, podName] = selectedPod.split('/');

        try {
            const lines = await kubectl.getLogs(podName, podNamespace, selectedContainer, showPrevious, searchQuery, appliedDateFrom, appliedDateTo);

            // If we have existing logs and new logs, append only truly new ones
            if (hasInitializedLogsRef.current && !isContextLoading && lastSeenLogLineRef.current) {
                // Find the index where we should start taking new logs
                // Since logs are sorted oldest to newest, find the last log we've seen and take everything after it
                const lastSeenIndex = lines.findIndex(line => line === lastSeenLogLineRef.current);

                let newLines: string[] = [];
                if (lastSeenIndex >= 0) {
                    // Take all logs after the last one we've seen
                    newLines = lines.slice(lastSeenIndex + 1);
                } else {
                    // Couldn't find our last log - this means we might have missed some logs
                    // Take all new logs
                    newLines = lines;
                }

                if (newLines.length > 0) {
                    // Store the scroll info before state update
                    const savedScrollInfo = scrollPositionBeforeFetchRef.current;

                    // Append new logs to the END (they're newest, so they go at bottom)
                    setLogLines(prev => [...prev, ...newLines]);

                    // Update the last seen log line
                    lastSeenLogLineRef.current = newLines[newLines.length - 1];

                    // Maintain scroll position if user was scrolled up
                    if (savedScrollInfo && logsContainerRef.current) {
                        // Disable smooth scrolling temporarily
                        const container = logsContainerRef.current;
                        const oldBehavior = container.style.scrollBehavior;
                        container.style.scrollBehavior = 'auto';

                        // Use single requestAnimationFrame
                        requestAnimationFrame(() => {
                            if (logsContainerRef.current && savedScrollInfo) {
                                logsContainerRef.current.scrollTop = savedScrollInfo.scrollTop;
                                logsContainerRef.current.style.scrollBehavior = oldBehavior;
                            }
                        });
                    }
                }
            } else {
                // First load or context change - replace all logs
                setLogLines(lines);
                hasInitializedLogsRef.current = true;
                // Store the last log line
                if (lines.length > 0) {
                    lastSeenLogLineRef.current = lines[lines.length - 1];
                }
            }

            // Only scroll to bottom if user is already at the bottom
            if (isScrolledToBottomRef.current) {
                setTimeout(() => logsBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            }
        } catch (e) {
            setLogLines(['Failed to fetch logs: ' + (e as Error).message]);
        } finally {
            setLoadingLogs(false);
            setIsContextLoading(false);
        }
    };

    // Download logs function - fetches all logs without line limit
    const downloadLogs = async () => {
        if (!selectedDeployment) return;

        setDownloadingLogs(true);
        try {
            const [namespace, depName] = selectedDeployment.split('/');
            let lines: string[];

            // Fetch all logs with unlimited flag
            if (selectedPod === 'all-pods') {
                lines = await kubectl.getDeploymentLogs(depName, namespace, searchQuery, appliedDateFrom, appliedDateTo, true);
            } else if (selectedPod && selectedContainer) {
                const [podNamespace, podName] = selectedPod.split('/');
                lines = await kubectl.getLogs(podName, podNamespace, selectedContainer, showPrevious, searchQuery, appliedDateFrom, appliedDateTo, true);
            } else {
                return;
            }

            // Create filename with timestamp and filter info
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const resourceName = selectedPod === 'all-pods' ? depName : selectedPod.split('/')[1];
            const filterSuffix = searchQuery ? `-filtered` : '';
            const filename = `${resourceName}${filterSuffix}-${timestamp}.log`;

            // Create blob and download
            const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Failed to download logs:', e);
        } finally {
            setDownloadingLogs(false);
        }
    };

    // Track previous values to detect context changes vs search changes
    const prevDeploymentRef = useRef(selectedDeployment);
    const prevPodRef = useRef(selectedPod);
    const prevContainerRef = useRef(selectedContainer);
    const prevShowPreviousRef = useRef(showPrevious);
    const prevAppliedDateFromRef = useRef(appliedDateFrom);
    const prevAppliedDateToRef = useRef(appliedDateTo);
    const prevSearchQueryRef = useRef(searchQuery);

    // Fetch logs when tab is switched or selection changes
    useEffect(() => {
        if (activeTab === 'logs' && selectedDeployment) {
            if (selectedPod === 'all-pods' || (selectedPod && selectedContainer)) {
                // Check if this is a context change (deployment/pod/container changed) vs just a search query change
                const isContextChange =
                    prevDeploymentRef.current !== selectedDeployment ||
                    prevPodRef.current !== selectedPod ||
                    prevContainerRef.current !== selectedContainer ||
                    prevShowPreviousRef.current !== showPrevious;

                // Check if date filters changed
                const isDateFilterChange =
                    prevAppliedDateFromRef.current !== appliedDateFrom ||
                    prevAppliedDateToRef.current !== appliedDateTo;

                // Check if search query changed
                const isSearchQueryChange = prevSearchQueryRef.current !== searchQuery;

                // Update refs
                prevDeploymentRef.current = selectedDeployment;
                prevPodRef.current = selectedPod;
                prevContainerRef.current = selectedContainer;
                prevShowPreviousRef.current = showPrevious;
                prevAppliedDateFromRef.current = appliedDateFrom;
                prevAppliedDateToRef.current = appliedDateTo;
                prevSearchQueryRef.current = searchQuery;

                // Clear logs and show "Loading logs..." text only on context change
                // Show spinning icon for all changes
                if (isContextChange) {
                    setLogLines([]);
                    setIsContextLoading(true);
                    setLoadingLogs(true);
                    isScrolledToBottomRef.current = true; // Reset to auto-scroll on context change
                    lastSeenLogLineRef.current = ''; // Reset last seen log on context change
                    hasInitializedLogsRef.current = false; // Reset initialization flag
                } else if (isDateFilterChange || isSearchQueryChange) {
                    // For filter changes, clear logs and fetch fresh
                    setLogLines([]);
                    setIsContextLoading(false);
                    setLoadingLogs(true);
                    isScrolledToBottomRef.current = true; // Reset to auto-scroll on filter change
                    lastSeenLogLineRef.current = ''; // Reset last seen log on filter change
                    hasInitializedLogsRef.current = false; // Reset initialization flag
                }

                // Debounce search query changes to avoid too many requests
                const timeoutId = setTimeout(() => {
                    fetchLogs();
                }, searchQuery ? 500 : 0); // 500ms delay for search, immediate for other changes

                return () => clearTimeout(timeoutId);
            }
        }
    }, [activeTab, selectedDeployment, selectedPod, selectedContainer, showPrevious, searchQuery, appliedDateFrom, appliedDateTo]);

    // Auto-refresh logs every 3 seconds when logs tab is active and not searching/filtering
    useEffect(() => {
        if (activeTab === 'logs' && selectedDeployment && (selectedPod === 'all-pods' || (selectedPod && selectedContainer)) && !searchQuery && !appliedDateFrom && !appliedDateTo) {
            const intervalId = setInterval(() => {
                fetchLogs();
            }, 3000); // Every 3 seconds

            return () => clearInterval(intervalId);
        }
    }, [activeTab, selectedDeployment, selectedPod, selectedContainer, searchQuery, appliedDateFrom, appliedDateTo, showPrevious]);

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

    // Track scroll position to determine if user is at the bottom
    const handleLogsScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        const threshold = 50; // pixels from bottom to consider "at bottom"
        const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < threshold;
        isScrolledToBottomRef.current = isAtBottom;
    };

    // Highlight search matches in log line (always uses regex with fallback)
    const highlightMatches = (line: string, query: string) => {
        if (!query) return line;

        try {
            const regex = new RegExp(`(${query})`, 'gi');
            const parts = line.split(regex);
            return (
                <>
                    {parts.map((part, i) => {
                        // Test if this part matches the pattern
                        const testRegex = new RegExp(query, 'i');
                        return testRegex.test(part)
                            ? <span key={i} className="bg-yellow-500 text-gray-900">{part}</span>
                            : part;
                    })}
                </>
            );
        } catch (e) {
            // Invalid regex - return line without highlighting
            return line;
        }
    };

    // Validate regex pattern
    useEffect(() => {
        if (searchQuery) {
            try {
                new RegExp(searchQuery);
                setRegexError('');
            } catch (e: any) {
                setRegexError(e.message || 'Invalid regex');
            }
        } else {
            setRegexError('');
        }
    }, [searchQuery]);

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
                  onClick={() => {
                    setLoadingLogs(true);
                    fetchLogs();
                  }}
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

                <button
                  onClick={() => {
                    const newShowDateFilter = !showDateFilter;
                    setShowDateFilter(newShowDateFilter);
                    if (!newShowDateFilter) {
                      // Don't clear dates when closing - let user keep their selection
                    }
                  }}
                  className={`p-1.5 border border-gray-700 rounded transition-colors ${showDateFilter || appliedDateFrom || appliedDateTo ? 'bg-blue-900/50 text-blue-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}`}
                  title="Filter by date range"
                >
                  <Calendar size={14} />
                </button>

                <button
                  onClick={downloadLogs}
                  className="p-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                  title="Download all logs (no line limit)"
                  disabled={downloadingLogs || !selectedDeployment || (selectedPod !== 'all-pods' && !selectedContainer)}
                >
                  <Download size={14} className={downloadingLogs ? "animate-spin" : ""} />
                </button>

                {/* Lines count indicator */}
                {logLines.length > 0 && (
                  <span className="text-xs text-gray-400 ml-3">
                    Showing {logLines.length} line{logLines.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Search bar */}
            {showSearch && (
              <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <Search size={14} className="text-gray-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search in logs (supports regex, e.g., error.*failed)"
                    className={`flex-1 bg-gray-800 border rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none ${
                      regexError ? 'border-red-500 focus:border-red-400' : 'border-gray-700 focus:border-blue-500'
                    }`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button
                    onClick={() => {
                      setShowSearch(false);
                      setSearchQuery('');
                      setRegexError('');
                    }}
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                    title="Close search (Esc)"
                  >
                    <X size={14} />
                  </button>
                </div>
                {regexError && (
                  <div className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    <span>Invalid regex: {regexError}</span>
                  </div>
                )}
              </div>
            )}

            {/* Date range filter */}
            {showDateFilter && (
              <div
                className="px-4 py-2 bg-gray-800/50 border-b border-gray-700"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (dateFrom || dateTo)) {
                    e.preventDefault();
                    setAppliedDateFrom(dateFrom);
                    setAppliedDateTo(dateTo);
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <Calendar size={14} className="text-gray-400" />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 font-medium">From <span className="text-gray-500">(Local)</span>:</label>
                    <input
                      type="datetime-local"
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      max={dateTo || undefined}
                      title="Select date and time, then press Enter or click Apply"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 font-medium">To <span className="text-gray-500">(Local)</span>:</label>
                    <input
                      type="datetime-local"
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      min={dateFrom || undefined}
                      title="Select date and time, then press Enter or click Apply"
                    />
                  </div>

                  {/* Apply button */}
                  <button
                    onClick={() => {
                      setAppliedDateFrom(dateFrom);
                      setAppliedDateTo(dateTo);
                    }}
                    disabled={!dateFrom && !dateTo}
                    className={`px-3 py-1 text-xs rounded border transition-colors ${
                      (!dateFrom && !dateTo) 
                        ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-900/40 border-blue-700 text-blue-300 hover:bg-blue-800 hover:text-white'
                    }`}
                    title="Apply date filter (or press Enter)"
                  >
                    Apply
                  </button>

                  {(dateFrom || dateTo || appliedDateFrom || appliedDateTo) && (
                    <button
                      onClick={() => {
                        setDateFrom('');
                        setDateTo('');
                        setAppliedDateFrom('');
                        setAppliedDateTo('');
                      }}
                      className="text-xs text-gray-400 hover:text-white transition-colors underline"
                      title="Clear date filter"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowDateFilter(false);
                    }}
                    className="ml-auto p-1 text-gray-400 hover:text-white transition-colors"
                    title="Close date filter"
                  >
                    <X size={14} />
                  </button>
                </div>
                {((appliedDateFrom || appliedDateTo) || ((dateFrom || dateTo) && !(appliedDateFrom === dateFrom && appliedDateTo === dateTo))) && (
                  <div className="mt-1.5 text-xs flex items-center gap-1">
                    {(appliedDateFrom || appliedDateTo) && (
                      <>
                        <span className="text-green-400">✓</span>
                        <span className="text-green-400">
                          {appliedDateFrom && appliedDateTo ? (
                            `Filter applied: ${new Date(appliedDateFrom).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })} to ${new Date(appliedDateTo).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}`
                          ) : appliedDateFrom ? (
                            `Filter applied: from ${new Date(appliedDateFrom).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })} onwards`
                          ) : (
                            `Filter applied: up to ${new Date(appliedDateTo).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}`
                          )}
                        </span>
                      </>
                    )}
                    {(dateFrom || dateTo) && !(appliedDateFrom === dateFrom && appliedDateTo === dateTo) && (
                      <>
                        <span className="text-yellow-400 ml-3">
                          <AlertTriangle size={12} className="inline mr-1" />
                          Click "Apply" to update the filter
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Logs output */}
            <div
              ref={logsContainerRef}
              onScroll={handleLogsScroll}
              className="flex-1 overflow-auto p-3 text-gray-300 font-mono text-xs leading-relaxed bg-gray-950 custom-scrollbar"
            >
              {isContextLoading ? (
                <div className="text-gray-500 italic">Loading logs...</div>
              ) : !selectedDeployment ? (
                <div className="text-gray-500 italic">Select a deployment to view logs.</div>
              ) : logLines.length > 0 ? (
                <>
                  {logLines
                    .filter(line => {
                      // Client-side filter: if there's a search query, only show lines that match
                      if (!searchQuery) return true;
                      try {
                        const regex = new RegExp(searchQuery, 'i');
                        return regex.test(line);
                      } catch (e) {
                        return true; // If regex is invalid, show all lines
                      }
                    })
                    .map((line, i) => (
                      <div key={i} className="mb-0.5 whitespace-pre">
                        {searchQuery ? highlightMatches(line, searchQuery) : line}
                      </div>
                    ))}
                  <div ref={logsBottomRef} />
                </>
              ) : searchQuery ? (
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
