import React, { useEffect, useLayoutEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useStore } from '../store';
import { RefreshCw, Search, X, AlertTriangle, Calendar, Download, Play, Pause } from 'lucide-react';
import { kubectl } from '../services/kubectl';

// Maximum number of log lines to keep in memory
const MAX_LOG_LINES = 5000;

interface LogsPanelProps {
    /** If true, shows as standalone mode (for window). If false, docked in terminal panel */
    standalone?: boolean;
    /** The tab ID to use for this logs panel. If not provided, uses activeLogsTabId from state */
    tabId?: string;
}

export const LogsPanel: React.FC<LogsPanelProps> = ({ standalone = false, tabId }) => {
    const { state, dispatch } = useStore();

    // Get the current tab ID (either from prop or from active tab in state)
    const currentTabId = tabId || state.activeLogsTabId;

    // Get logs state from the specific tab in global store
    const currentTab = state.logsTabs.find(tab => tab.id === currentTabId) || state.logsTabs[0];

    const {
        selectedDeployment,
        selectedPod,
        selectedContainer,
        showPrevious,
        searchQuery,
        showSearch,
        dateFrom,
        dateTo,
        appliedDateFrom,
        appliedDateTo,
        autoRefreshEnabled,
        autoRefreshInterval,
    } = currentTab || {
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

    // Helper to update logs state in store for this specific tab
    const updateLogsState = (updates: Partial<typeof currentTab>) => {
        dispatch({ type: 'UPDATE_LOGS_TAB', payload: { tabId: currentTabId, updates } });
    };

    // Logs state - use a Map to store logs per tab, so each tab has its own logs
    const [logsPerTab, setLogsPerTab] = useState<Map<string, string[]>>(new Map());
    const logLines = logsPerTab.get(currentTabId) || [];

    // Helper to set log lines for the current tab
    const setLogLines = (lines: string[] | ((prev: string[]) => string[])) => {
        setLogsPerTab(prev => {
            const newMap = new Map(prev);
            if (typeof lines === 'function') {
                const currentLines = prev.get(currentTabId) || [];
                newMap.set(currentTabId, lines(currentLines));
            } else {
                newMap.set(currentTabId, lines);
            }
            return newMap;
        });
    };

    const [loadingLogs, setLoadingLogs] = useState(false);
    const [isContextLoading, setIsContextLoading] = useState(false);
    const [downloadingLogs, setDownloadingLogs] = useState(false);

    // Use Maps for refs that need to be per-tab
    const lastSeenLogLinePerTab = useRef<Map<string, string>>(new Map());
    const hasInitializedLogsPerTab = useRef<Map<string, boolean>>(new Map());

    // Helpers to get/set per-tab ref values
    const getLastSeenLogLine = () => lastSeenLogLinePerTab.current.get(currentTabId) || '';
    const setLastSeenLogLine = (value: string) => lastSeenLogLinePerTab.current.set(currentTabId, value);
    const hasInitializedLogs = () => hasInitializedLogsPerTab.current.get(currentTabId) || false;
    const setHasInitializedLogs = (value: boolean) => hasInitializedLogsPerTab.current.set(currentTabId, value);

    const [showAutoRefreshPanel, setShowAutoRefreshPanel] = useState(false);
    const refreshButtonRef = useRef<HTMLButtonElement>(null);
    const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });
    const autoRefreshHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isMouseInButtonRef = useRef(false);
    const isMouseInPanelRef = useRef(false);
    const [availableDeployments, setAvailableDeployments] = useState<Array<{ name: string; namespace: string }>>([]);

    // Track fetch context to avoid appending logs from stale requests
    const fetchContextRef = useRef<{
        tabId: string;
        deployment: string;
        pod: string;
        container: string;
    } | null>(null);

    // Search state for logs
    const [regexError, setRegexError] = useState<string>('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Date range filter state
    const [showDateFilter, setShowDateFilter] = useState(false);

    // Logs scroll ref
    const logsBottomRef = useRef<HTMLDivElement>(null);
    const logsContainerRef = useRef<HTMLDivElement>(null);
    const isScrolledToBottomRef = useRef(true);
    const scrollPositionBeforeFetchRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);

    // Track scroll position per tab
    const scrollPositionPerTab = useRef<Map<string, { scrollTop: number; scrollLeft: number }>>(new Map());

    // Update available deployments when state changes
    useEffect(() => {
        const deployments = state.deployments.map(dep => ({
            name: dep.name,
            namespace: dep.namespace
        }));
        setAvailableDeployments(deployments);
    }, [state.pods, state.deployments, state.replicaSets]);

    // Track previous deployment to detect changes for pod auto-selection
    const prevSelectedDeploymentRef = useRef(selectedDeployment);

    // Track if we're currently restoring scroll position (to prevent auto-scroll interference)
    const isRestoringScrollRef = useRef(false);

    // Track previous tab ID to handle tab switching
    const prevTabIdRef = useRef(currentTabId);

    // Detect tab switch and update refs
    useEffect(() => {
        if (prevTabIdRef.current !== currentTabId) {
            prevTabIdRef.current = currentTabId;
            prevSelectedDeploymentRef.current = selectedDeployment;
        }
    }, [currentTabId, selectedDeployment]);

    // Restore scroll position after content renders for the new tab
    useLayoutEffect(() => {
        const savedPosition = scrollPositionPerTab.current.get(currentTabId);
        if (savedPosition && logsContainerRef.current) {
            isRestoringScrollRef.current = true;
            // Use requestAnimationFrame to ensure DOM is fully updated
            requestAnimationFrame(() => {
                if (logsContainerRef.current) {
                    logsContainerRef.current.scrollTop = savedPosition.scrollTop;
                    logsContainerRef.current.scrollLeft = savedPosition.scrollLeft;
                }
                setTimeout(() => {
                    isRestoringScrollRef.current = false;
                }, 50);
            });
        }
    }, [currentTabId]);

    // Track previous cluster ID to detect actual cluster switches (not just component mount/unmount)
    const prevClusterIdRef = useRef(state.currentClusterId);

    // Reset selectors ONLY when cluster actually changes (not on mount/unmount)
    useEffect(() => {
        if (prevClusterIdRef.current !== state.currentClusterId && prevClusterIdRef.current !== '') {
            // Cluster actually switched, reset all tabs
            dispatch({ type: 'RESET_LOGS_TABS' });
            setLogLines([]);
        }
        prevClusterIdRef.current = state.currentClusterId;
    }, [state.currentClusterId]);

    // Handle logs target from state (when LOGS button is clicked in drawer)
    useEffect(() => {
        if (state.logsTarget) {
            if (state.logsTarget.type === 'pod') {
                // For pod: find which deployment owns it using label matching
                const pod = state.pods.find(p => p.name === state.logsTarget?.podName && p.namespace === state.logsTarget?.namespace);

                let deploymentFound = false;
                let foundDeployment = '';

                if (pod && pod.labels) {
                    // Find deployment that matches this pod's labels
                    const matchingDeployment = state.deployments.find(dep => {
                        if (dep.namespace !== pod.namespace) return false;
                        if (!dep.selector || !pod.labels) return false;

                        // Check if all deployment selector labels match the pod's labels
                        return Object.entries(dep.selector).every(([key, value]) => pod.labels![key] === value);
                    });

                    if (matchingDeployment) {
                        foundDeployment = `${matchingDeployment.namespace}/${matchingDeployment.name}`;
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
                                foundDeployment = `${pod.namespace}/${depOwner.name}`;
                                deploymentFound = true;
                            }
                        }
                    }
                }

                // If still no deployment found, select first available deployment
                if (!deploymentFound && availableDeployments.length > 0) {
                    foundDeployment = `${availableDeployments[0].namespace}/${availableDeployments[0].name}`;
                }

                updateLogsState({
                    selectedDeployment: foundDeployment,
                    selectedPod: `${state.logsTarget.namespace}/${state.logsTarget.podName}`,
                    selectedContainer: state.logsTarget.container || '',
                });
            } else if (state.logsTarget.type === 'all-pods' && state.logsTarget.deploymentName) {
                // For deployment all-pods
                updateLogsState({
                    selectedDeployment: `${state.logsTarget.namespace}/${state.logsTarget.deploymentName}`,
                    selectedPod: 'all-pods',
                    selectedContainer: '',
                });
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

        // Capture the current fetch context at the start
        const currentFetchContext = {
            tabId: currentTabId,
            deployment: selectedDeployment,
            pod: selectedPod,
            container: selectedContainer,
        };
        fetchContextRef.current = currentFetchContext;

        // Helper to check if context is still valid (hasn't changed during fetch)
        const isContextStillValid = () => {
            return fetchContextRef.current?.tabId === currentFetchContext.tabId &&
                   fetchContextRef.current?.deployment === currentFetchContext.deployment &&
                   fetchContextRef.current?.pod === currentFetchContext.pod &&
                   fetchContextRef.current?.container === currentFetchContext.container;
        };

        // Track if this fetch should control loading state
        // Only clear loading if context is still valid when fetch completes
        let shouldClearLoading = true;

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

                // Check if context is still valid before updating state
                if (!isContextStillValid()) {
                    // Context changed, discard these logs but don't change loading state
                    // The new fetch will handle setting loading to false
                    shouldClearLoading = false;
                    return;
                }

                // If we have existing logs and new logs, append only truly new ones
                if (hasInitializedLogs() && !isContextLoading && getLastSeenLogLine()) {
                    // Find the index where we should start taking new logs
                    // Since logs are sorted oldest to newest, find the last log we've seen and take everything after it
                    const lastSeenIndex = lines.findIndex(line => line === getLastSeenLogLine());

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
                        setLogLines(prev => {
                            const combined = [...prev, ...newLines];
                            // Trim old logs if we exceed the limit
                            if (combined.length > MAX_LOG_LINES) {
                                const trimmed = combined.slice(combined.length - MAX_LOG_LINES);
                                return trimmed;
                            }
                            return combined;
                        });

                        // Update the last seen log line
                        setLastSeenLogLine(newLines[newLines.length - 1]);

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
                    setHasInitializedLogs(true);
                    // Store the last log line
                    if (lines.length > 0) {
                        setLastSeenLogLine(lines[lines.length - 1]);
                    }
                }

                // Only scroll to bottom if user is already at the bottom and we're not restoring scroll position
                if (isScrolledToBottomRef.current && !isRestoringScrollRef.current) {
                    setTimeout(() => {
                        if (logsContainerRef.current) {
                            logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
                        }
                    }, 100);
                }
            } catch (e) {
                if (isContextStillValid()) {
                    setLogLines(['Failed to fetch deployment logs: ' + (e as Error).message]);
                }
            } finally {
                if (shouldClearLoading) {
                    setLoadingLogs(false);
                    setIsContextLoading(false);
                }
            }
            return;
        }

        // Regular pod logs
        if (!selectedPod || !selectedContainer) return;

        const [podNamespace, podName] = selectedPod.split('/');

        try {
            const lines = await kubectl.getLogs(podName, podNamespace, selectedContainer, showPrevious, searchQuery, appliedDateFrom, appliedDateTo);

            // Check if context is still valid before updating state
            if (!isContextStillValid()) {
                // Context changed, discard these logs but don't change loading state
                // The new fetch will handle setting loading to false
                shouldClearLoading = false;
                return;
            }

            // If we have existing logs and new logs, append only truly new ones
            if (hasInitializedLogs() && !isContextLoading && getLastSeenLogLine()) {
                // Find the index where we should start taking new logs
                // Since logs are sorted oldest to newest, find the last log we've seen and take everything after it
                const lastSeenIndex = lines.findIndex(line => line === getLastSeenLogLine());

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
                    setLogLines(prev => {
                        const combined = [...prev, ...newLines];
                        // Trim old logs if we exceed the limit
                        if (combined.length > MAX_LOG_LINES) {
                            const trimmed = combined.slice(combined.length - MAX_LOG_LINES);
                            return trimmed;
                        }
                        return combined;
                    });

                    // Update the last seen log line
                    setLastSeenLogLine(newLines[newLines.length - 1]);

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
                setHasInitializedLogs(true);
                // Store the last log line
                if (lines.length > 0) {
                    setLastSeenLogLine(lines[lines.length - 1]);
                }
            }

            // Only scroll to bottom if user is already at the bottom and we're not restoring scroll position
            if (isScrolledToBottomRef.current && !isRestoringScrollRef.current) {
                setTimeout(() => {
                    if (logsContainerRef.current) {
                        logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
                    }
                }, 100);
            }
        } catch (e) {
            if (isContextStillValid()) {
                setLogLines(['Failed to fetch logs: ' + (e as Error).message]);
            }
        } finally {
            if (shouldClearLoading) {
                setLoadingLogs(false);
                setIsContextLoading(false);
            }
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
    const prevTabIdForFetchRef = useRef(currentTabId);

    // Fetch logs when selection changes
    useEffect(() => {
        // Check if this is just a tab switch (not a filter change within the same tab)
        const isTabSwitch = prevTabIdForFetchRef.current !== currentTabId;

        if (isTabSwitch) {
            // Tab switched - update all refs to new tab's values without triggering reload
            prevDeploymentRef.current = selectedDeployment;
            prevPodRef.current = selectedPod;
            prevContainerRef.current = selectedContainer;
            prevShowPreviousRef.current = showPrevious;
            prevAppliedDateFromRef.current = appliedDateFrom;
            prevAppliedDateToRef.current = appliedDateTo;
            prevSearchQueryRef.current = searchQuery;
            prevTabIdForFetchRef.current = currentTabId;

            // If this tab already has logs, don't reload - just continue with auto-refresh
            // If no logs yet and has a deployment selected, start fresh fetch
            if (logLines.length === 0 && selectedDeployment && (selectedPod === 'all-pods' || (selectedPod && selectedContainer))) {
                setIsContextLoading(true);
                setLoadingLogs(true);
                fetchLogs();
            }
            return;
        }

        if (selectedDeployment) {
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
                    setLastSeenLogLine(''); // Reset last seen log on context change
                    setHasInitializedLogs(false); // Reset initialization flag
                    // Invalidate any in-flight fetch by clearing the context
                    fetchContextRef.current = null;
                } else if (isDateFilterChange || isSearchQueryChange) {
                    // For filter changes, clear logs and fetch fresh
                    setLogLines([]);
                    setIsContextLoading(false);
                    setLoadingLogs(true);
                    isScrolledToBottomRef.current = true; // Reset to auto-scroll on filter change
                    setLastSeenLogLine(''); // Reset last seen log on filter change
                    setHasInitializedLogs(false); // Reset initialization flag
                    // Invalidate any in-flight fetch by clearing the context
                    fetchContextRef.current = null;
                }

                // Debounce search query changes to avoid too many requests
                const timeoutId = setTimeout(() => {
                    fetchLogs();
                }, searchQuery ? 500 : 0); // 500ms delay for search, immediate for other changes

                return () => clearTimeout(timeoutId);
            }
        }
    }, [selectedDeployment, selectedPod, selectedContainer, showPrevious, searchQuery, appliedDateFrom, appliedDateTo, currentTabId]);

    // Auto-refresh logs when enabled
    useEffect(() => {
        if (autoRefreshEnabled && selectedDeployment && (selectedPod === 'all-pods' || (selectedPod && selectedContainer))) {
            const intervalId = setInterval(() => {
                fetchLogs();
            }, autoRefreshInterval);

            return () => clearInterval(intervalId);
        }
    }, [autoRefreshEnabled, autoRefreshInterval, selectedDeployment, selectedPod, selectedContainer, searchQuery, appliedDateFrom, appliedDateTo, showPrevious]);

    // Update pod selection when deployment changes (but not when logsTarget is being set or on initial mount)
    useEffect(() => {
        if (selectedDeployment &&
            !state.logsTarget &&
            prevSelectedDeploymentRef.current !== selectedDeployment &&
            prevSelectedDeploymentRef.current !== '') {
            // Deployment changed manually (not from mount or drawer)
            updateLogsState({
                selectedPod: 'all-pods',
                selectedContainer: '',
            });
        }
        prevSelectedDeploymentRef.current = selectedDeployment;
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
                    updateLogsState({ selectedContainer: containerNames[0] });
                }
            }
        }
    }, [selectedPod, state.pods]);

    // Handle Cmd/Ctrl+F for search in logs view
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                updateLogsState({ showSearch: true });
                setTimeout(() => searchInputRef.current?.focus(), 100);
            }
            if (e.key === 'Escape' && showSearch) {
                updateLogsState({ showSearch: false, searchQuery: '' });
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [showSearch]);

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

        // Save scroll position for tab tracking
        if (!isRestoringScrollRef.current) {
            scrollPositionPerTab.current.set(currentTabId, {
                scrollTop: target.scrollTop,
                scrollLeft: target.scrollLeft,
            });
        }
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

    // Helper functions for forgiving hover behavior on auto-refresh panel
    const handleRefreshButtonMouseEnter = () => {
        // Clear any pending hide timeout
        if (autoRefreshHideTimeoutRef.current) {
            clearTimeout(autoRefreshHideTimeoutRef.current);
            autoRefreshHideTimeoutRef.current = null;
        }

        isMouseInButtonRef.current = true;

        // Show panel and set its position
        if (refreshButtonRef.current) {
            const rect = refreshButtonRef.current.getBoundingClientRect();
            setPanelPosition({
                top: rect.top - 14, // 14px above button
                left: rect.left
            });
        }
        setShowAutoRefreshPanel(true);
    };

    const handleRefreshButtonMouseLeave = () => {
        isMouseInButtonRef.current = false;

        // Set a timeout to hide the panel
        // If user moves to panel before timeout, it will be cleared
        autoRefreshHideTimeoutRef.current = setTimeout(() => {
            if (!isMouseInButtonRef.current && !isMouseInPanelRef.current) {
                setShowAutoRefreshPanel(false);
            }
        }, 300); // 300ms grace period
    };

    const handlePanelMouseEnter = () => {
        // Clear any pending hide timeout
        if (autoRefreshHideTimeoutRef.current) {
            clearTimeout(autoRefreshHideTimeoutRef.current);
            autoRefreshHideTimeoutRef.current = null;
        }

        isMouseInPanelRef.current = true;
    };

    const handlePanelMouseLeave = () => {
        isMouseInPanelRef.current = false;

        // Set a timeout to hide the panel
        autoRefreshHideTimeoutRef.current = setTimeout(() => {
            if (!isMouseInButtonRef.current && !isMouseInPanelRef.current) {
                setShowAutoRefreshPanel(false);
            }
        }, 200); // 200ms grace period
    };

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (autoRefreshHideTimeoutRef.current) {
                clearTimeout(autoRefreshHideTimeoutRef.current);
            }
        };
    }, []);

    return (
        <>
            <div className={`flex flex-col overflow-hidden ${standalone ? 'h-full' : 'flex-1'} z-[110]`}>
                {/* Logs controls */}
                <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-gray-900/50 border-b border-gray-800">
                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0 z-[110]">
                        <label className="text-xs text-gray-400 font-medium">Deployment:</label>
                        <select
                            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 max-w-xs"
                            value={selectedDeployment}
                            onChange={(e) => {
                                updateLogsState({
                                    selectedDeployment: e.target.value,
                                    selectedPod: e.target.value ? 'all-pods' : '',
                                });
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
                            onChange={(e) => updateLogsState({ selectedPod: e.target.value })}
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
                                    onChange={(e) => updateLogsState({ selectedContainer: e.target.value })}
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
                                                    onChange={(e) => updateLogsState({ showPrevious: e.target.checked })}
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

                        {/* Action buttons group */}
                        <div className="flex flex-wrap items-center gap-2">
                            <div
                                className="relative"
                                onMouseEnter={handleRefreshButtonMouseEnter}
                                onMouseLeave={handleRefreshButtonMouseLeave}
                            >
                                <button
                                    ref={refreshButtonRef}
                                    onClick={() => {
                                        setLoadingLogs(true);
                                        fetchLogs();
                                    }}
                                    className="p-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                                    title="Refresh logs"
                                    disabled={loadingLogs || !selectedDeployment || (selectedPod !== 'all-pods' && !selectedContainer)}
                                >
                                    <RefreshCw size={14} className={loadingLogs ? "animate-spin" : ""} />
                                </button>
                            </div>

                <button
                  onClick={() => {
                    const newShowSearch = !showSearch;
                    updateLogsState({
                      showSearch: newShowSearch,
                      searchQuery: newShowSearch ? searchQuery : '',
                    });
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
                                <span className="text-xs text-gray-400 whitespace-nowrap">
                                    Showing {logLines.length} line{logLines.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
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
                    onChange={(e) => updateLogsState({ searchQuery: e.target.value })}
                  />
                  <button
                    onClick={() => {
                      updateLogsState({ showSearch: false, searchQuery: '' });
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
                    updateLogsState({ appliedDateFrom: dateFrom, appliedDateTo: dateTo });
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
                      onChange={(e) => updateLogsState({ dateFrom: e.target.value })}
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
                      onChange={(e) => updateLogsState({ dateTo: e.target.value })}
                      min={dateFrom || undefined}
                      title="Select date and time, then press Enter or click Apply"
                    />
                  </div>

                  {/* Apply button */}
                  <button
                    onClick={() => {
                      updateLogsState({ appliedDateFrom: dateFrom, appliedDateTo: dateTo });
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
                        updateLogsState({
                          dateFrom: '',
                          dateTo: '',
                          appliedDateFrom: '',
                          appliedDateTo: '',
                        });
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

            {/* Auto-refresh control panel - rendered as portal to escape stacking context */}
            {showAutoRefreshPanel && ReactDOM.createPortal(
                <div
                    className="fixed bg-gray-800 border border-gray-700 rounded shadow-lg p-2 w-48"
                    style={{
                        top: standalone ? `${panelPosition.top + 44}px` : `${panelPosition.top - 60}px`,
                        left: `${panelPosition.left}px`,
                        zIndex: 9999
                    }}
                    onMouseEnter={handlePanelMouseEnter}
                    onMouseLeave={handlePanelMouseLeave}
                >
                    <div className="text-xs font-medium text-gray-300 mb-2">Auto-Refresh</div>

                    <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            updateLogsState({ autoRefreshEnabled: !autoRefreshEnabled });
                        }}
                        className={`p-1.5 rounded transition-colors ${
                            autoRefreshEnabled 
                                ? 'bg-blue-900/50 text-blue-300 border border-blue-700 hover:bg-blue-800' 
                                : 'bg-gray-700 text-gray-300 border border-gray-600 hover:bg-gray-600'
                        }`}
                        title={autoRefreshEnabled ? 'Pause auto-refresh' : 'Resume auto-refresh'}
                    >
                        {autoRefreshEnabled ? <Pause size={14} /> : <Play size={14} />}
                    </button>

                    <select
                        value={autoRefreshInterval}
                        onChange={(e) => {
                            e.stopPropagation();
                            updateLogsState({ autoRefreshInterval: Number(e.target.value) });
                        }}
                        className="flex-1 bg-gray-700 border border-gray-600 text-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                    >
                        <option value={1000}>Every 1s</option>
                        <option value={5000}>Every 5s</option>
                        <option value={10000}>Every 10s</option>
                        <option value={30000}>Every 30s</option>
                        <option value={60000}>Every 1m</option>
                    </select>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

