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
        selectedWorkload,
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
        lastUpdated,
    } = currentTab || {
        selectedWorkload: '',
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
        lastUpdated: undefined,
    };

    // Helper to update logs state in store for this specific tab
    const updateLogsState = (updates: Partial<typeof currentTab>) => {
        dispatch({ type: 'UPDATE_LOGS_TAB', payload: { tabId: currentTabId, updates } });
    };


    // Logs state - use a Map to store logs per tab, so each tab has its own logs
    // Initialize from localStorage if in undocked mode
    const [logsPerTab, setLogsPerTab] = useState<Map<string, string[]>>(() => {
        const logsMode = localStorage.getItem('logsMode');
        if (logsMode === 'window') {
            // Load logs from localStorage when undocked
            try {
                const storedLogs = localStorage.getItem('kube_logs_data');
                if (storedLogs) {
                    const parsed = JSON.parse(storedLogs) as Record<string, string[]>;
                    return new Map<string, string[]>(Object.entries(parsed));
                }
            } catch (err) {
                console.error('Failed to load logs from localStorage:', err);
            }
        }
        return new Map<string, string[]>();
    });

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
    const [availableWorkloads, setAvailableWorkloads] = useState<Array<{ name: string; namespace: string }>>([]);

    // Track fetch context to avoid appending logs from stale requests
    const fetchContextRef = useRef<{
        tabId: string;
        deployment: string;
        pod: string;
        container: string;
        version: number; // Add version to invalidate old fetches
    } | null>(null);

    // Counter to track context changes
    const contextVersionRef = useRef(0);

    /**
     * Validates if a pod exists in the current state.
     * If the pod doesn't exist, it handles the error by:
     * - Logging a warning to console
     * - Showing a user-visible message in the logs panel
     * - Auto-switching to all-pods mode (if autoSwitch is true)
     *
     * @param podId - The pod identifier in format "namespace/podName"
     * @param options - Configuration options
     * @returns true if pod exists, false otherwise
     */
    const validatePodExists = (
        podId: string,
        options: {
            autoSwitch?: boolean;
            userMessage?: string;
            action?: string;
        } = {}
    ): boolean => {
        const { autoSwitch = true, userMessage } = options;

        const [podNamespace, podName] = podId.split('/');

        // Validate podId format - must have both namespace and name
        if (!podNamespace || !podName) {
            console.warn(`[LogsPanel] Malformed podId: "${podId}" - expected format: "namespace/podName"`);
            return false;
        }

        const podExists = state.pods.some(p => p.name === podName && p.namespace === podNamespace);

        if (!podExists) {
            // Create warning message for use throughout validation
            const warningMsg = `Pod "${podName}" not found in namespace "${podNamespace}"`;

            // Check if this pod is explicitly selected in a logs tab
            // If so, be very lenient about resetting - it might be loading or was cached
            const isExplicitlySelected = currentTab?.selectedPod === podId;

            // Don't auto-switch if we haven't completed initial pods fetch yet
            // This prevents validation running on cached/stale data from localStorage
            if (!hasInitialPodsFetchedRef.current) {
                return false; // Return false but don't auto-switch - give it time to load
            }

            if (isExplicitlySelected && initialFetchCompletedAtRef.current > 0) {
                const timeSinceInit = Date.now() - initialFetchCompletedAtRef.current;
                // Only wait if not much time has passed (< 5s)
                if (timeSinceInit < 5000) {
                    return false;
                }
            }

            if (autoSwitch) {
                // Before switching to all-pods, check if we can find another pod from the same workload
                // This provides a better UX when a specific pod was deleted/recreated
                const currentWorkload = selectedWorkload;
                if (currentWorkload) {
                    const [namespace, workloadName] = currentWorkload.split('/');

                    // Find the workload
                    const deployment = state.deployments.find(d => d.name === workloadName && d.namespace === namespace);
                    const daemonSet = state.daemonSets.find(ds => ds.name === workloadName && ds.namespace === namespace);
                    const statefulSet = state.statefulSets.find(ss => ss.name === workloadName && ss.namespace === namespace);
                    const workload = deployment || daemonSet || statefulSet;

                    if (workload) {
                        // Find pods for this workload
                        const workloadPods = state.pods.filter(p => {
                            if (p.namespace !== namespace) return false;
                            if (!p.labels || !workload.selector) return false;
                            return Object.entries(workload.selector).every(([key, value]) => p.labels![key] === value);
                        });

                        // If there are pods available, switch to the first one instead of all-pods
                        if (workloadPods.length > 0) {
                            const firstPod = workloadPods[0];

                            updateLogsState({
                                selectedPod: `${firstPod.namespace}/${firstPod.name}`,
                                selectedContainer: firstPod.containers[0]?.name || '',
                            });

                            setLogLines([`⚠️ Pod "${podName}" not found. Switched to "${firstPod.name}".`]);
                            return false;
                        }
                    }
                }

                // No pods available from the workload, fall back to all-pods
                const displayMessage = userMessage ||
                    `⚠️ ${warningMsg}. Switching to all-pods mode...`;
                setLogLines([displayMessage]);

                updateLogsState({
                    selectedPod: 'all-pods',
                    selectedContainer: '',
                });

                return false;
            }

            return false;
        }

        return true;
    };

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

    // Update available deployments when state changes (includes Deployments, DaemonSets, and StatefulSets)
    useEffect(() => {
        const workloads = [
            ...state.deployments.map(dep => ({ name: dep.name, namespace: dep.namespace })),
            ...state.daemonSets.map(ds => ({ name: ds.name, namespace: ds.namespace })),
            ...state.statefulSets.map(ss => ({ name: ss.name, namespace: ss.namespace }))
        ];
        setAvailableWorkloads(workloads);
    }, [state.pods, state.deployments, state.daemonSets, state.statefulSets, state.replicaSets]);

    // Track previous deployment to detect changes for pod auto-selection
    const prevSelectedWorkloadRef = useRef(selectedWorkload);

    // Track if we're currently restoring scroll position (to prevent auto-scroll interference)
    const isRestoringScrollRef = useRef(false);

    // Track previous tab ID to handle tab switching
    const prevTabIdRef = useRef(currentTabId);

    // Track if initial pods fetch has completed (to prevent validation on cached data)
    const hasInitialPodsFetchedRef = useRef(false);
    const initialFetchCompletedAtRef = useRef<number>(0);

    // Detect tab switch and update refs
    useEffect(() => {
        if (prevTabIdRef.current !== currentTabId) {
            prevTabIdRef.current = currentTabId;
            prevSelectedWorkloadRef.current = selectedWorkload;
            hasInitialPodsFetchedRef.current = false; // Reset on tab switch
        }
    }, [currentTabId, selectedWorkload]);

    // Track when pods have been fetched (wait a bit to ensure fresh data, not just cache)
    useEffect(() => {
        if (state.pods.length > 0 && !hasInitialPodsFetchedRef.current) {
            // Wait 3 seconds after first pods appear to consider them "fetched"
            // This gives time for the actual fetch to complete, especially for pods in different namespaces
            const timer = setTimeout(() => {
                hasInitialPodsFetchedRef.current = true;
                initialFetchCompletedAtRef.current = Date.now();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [state.pods.length]);

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

    // Ensure logsPerTab has entries for all tabs in state
    useEffect(() => {
        setLogsPerTab(prev => {
            const newMap = new Map(prev);
            let hasChanges = false;

            // Add empty entries for any tabs that don't exist in the Map
            for (const tab of state.logsTabs) {
                if (!newMap.has(tab.id)) {
                    newMap.set(tab.id, []);
                    hasChanges = true;
                }
            }

            // Remove entries for tabs that no longer exist in state
            for (const key of newMap.keys()) {
                if (!state.logsTabs.some(tab => tab.id === key)) {
                    newMap.delete(key);
                    hasChanges = true;
                }
            }

            return hasChanges ? newMap : prev;
        });
    }, [state.logsTabs]);

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

    // Handle save/load logs to/from localStorage on undock/dock
    useEffect(() => {
        const handleSaveToStorage = () => {
            try {
                const logsObject = Object.fromEntries(logsPerTab);
                localStorage.setItem('kube_logs_data', JSON.stringify(logsObject));
            } catch (err) {
                console.error('Failed to save logs to localStorage:', err);
            }
        };

        const handleLoadFromStorage = () => {
            try {
                const storedLogs = localStorage.getItem('kube_logs_data');
                if (storedLogs) {
                    const parsed = JSON.parse(storedLogs) as Record<string, string[]>;
                    const newMap = new Map<string, string[]>(Object.entries(parsed));
                    setLogsPerTab(newMap);

                    // Clear localStorage after loading
                    localStorage.removeItem('kube_logs_data');
                }
            } catch (err) {
                console.error('Failed to load logs from localStorage:', err);
            }
        };

        window.addEventListener('save-logs-to-storage', handleSaveToStorage);
        window.addEventListener('load-logs-from-storage', handleLoadFromStorage);

        return () => {
            window.removeEventListener('save-logs-to-storage', handleSaveToStorage);
            window.removeEventListener('load-logs-from-storage', handleLoadFromStorage);
        };
    }, [logsPerTab]);

    // Save logs to localStorage before undocked window closes
    useEffect(() => {
        if (!standalone) return; // Only in standalone (undocked) mode

        const handleBeforeUnload = () => {
            try {
                const logsObject = Object.fromEntries(logsPerTab);
                localStorage.setItem('kube_logs_data', JSON.stringify(logsObject));
            } catch (err) {
                console.error('Failed to save logs before unload:', err);
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [logsPerTab, standalone]);


    // Handle logs target from state (when LOGS button is clicked in drawer)
    // Track which logsTarget we've already processed to prevent loops
    const processedLogsTargetRef = useRef<string>('');
    const hasProcessedOnceRef = useRef(false);
    const isProcessingLogsTargetRef = useRef(false); // Track when we're actively processing a logsTarget

    useEffect(() => {
        if (state.logsTarget && currentTabId === state.activeLogsTabId) {
            // Check if we've already processed this exact logsTarget
            const currentTargetStr = JSON.stringify(state.logsTarget);

            // Only skip if we've processed at least once AND it's the same logsTarget
            // This allows the first logsTarget to be processed in undocked window
            if (hasProcessedOnceRef.current && currentTargetStr === processedLogsTargetRef.current) {
                // Already processed, skip silently
                return;
            }

            // Mark that we're processing a logsTarget
            isProcessingLogsTargetRef.current = true;

            // Mark this logsTarget as processed immediately
            processedLogsTargetRef.current = currentTargetStr;
            hasProcessedOnceRef.current = true;

            // Check if there's a specific target tab ID set (when creating new tab)
            const targetTabId = (window as any).__logsTargetTabId;
            if (targetTabId && targetTabId !== currentTabId) {
                return;
            }

            // Small delay to ensure tab has fully switched before processing
            const timer = setTimeout(() => {
                // Double-check we're still the active tab after delay
                if (currentTabId !== state.activeLogsTabId) {
                    return;
                }

                const logsTarget = state.logsTarget;
                if (!logsTarget) return;

                dispatch({
                    type: 'OPEN_LOGS_FOR_RESOURCE',
                    payload: {
                        type: logsTarget.type,
                        podName: logsTarget.podName,
                        deploymentName: logsTarget.deploymentName,
                        namespace: logsTarget.namespace,
                        container: logsTarget.container,
                        targetTabId: currentTabId, // Use current tab
                    }
                });

                // Clear the logs target after handling it
                setTimeout(() => {
                    dispatch({ type: 'SET_LOGS_TARGET', payload: null });
                    // Clear the processed tracker when we clear the target
                    processedLogsTargetRef.current = '';
                    hasProcessedOnceRef.current = false;
                    isProcessingLogsTargetRef.current = false; // Clear the processing flag
                }, 500);
            }, 100); // Small delay to ensure tab switching completes

            return () => clearTimeout(timer);
        } else if (!state.logsTarget) {
            // Clear the tracker when logsTarget becomes null
            processedLogsTargetRef.current = '';
            hasProcessedOnceRef.current = false;
            isProcessingLogsTargetRef.current = false;
        }
    }, [state.logsTarget, state.pods, state.deployments, state.daemonSets, state.statefulSets, state.replicaSets, availableWorkloads, currentTabId, state.activeLogsTabId]);

    // Refs to track the latest selection values (to avoid stale closures in auto-refresh)
    const latestSelectionRef = useRef({
        deployment: selectedWorkload,
        pod: selectedPod,
        container: selectedContainer,
        tabId: currentTabId,
    });

    // Keep the ref updated with latest values
    useEffect(() => {
        latestSelectionRef.current = {
            deployment: selectedWorkload,
            pod: selectedPod,
            container: selectedContainer,
            tabId: currentTabId,
        };
    }, [selectedWorkload, selectedPod, selectedContainer, currentTabId]);

    // Fetch logs function
    const fetchLogs = async () => {
        // Use the latest values from ref to avoid stale closures
        const latest = latestSelectionRef.current;

        if (!latest.deployment) return;

        // IMPORTANT: Validate pod exists BEFORE starting fetch
        // This prevents errors when tab state has stale pod names
        // EXCEPT for explicitly selected pods from logs tabs - always try fetching those
        if (latest.pod && latest.pod !== 'all-pods') {
            // Check if this pod is explicitly selected in current tab (from logs tab state)
            const isFromLogsTab = currentTab?.selectedPod === latest.pod;

            // Skip validation entirely for pods from logs tabs - they were explicitly selected
            // Even if not in state.pods, the kubectl API might work (pod exists but not in our limited list)
            if (!isFromLogsTab) {
                if (!validatePodExists(latest.pod, {
                    autoSwitch: true,
                    action: 'fetch logs'
                })) {
                    // Pod doesn't exist, validatePodExists already handled it
                    return;
                }
            }
            // If from logs tab, skip validation and try fetching anyway
        }

        // Capture the current fetch context at the start
        const currentFetchContext = {
            tabId: latest.tabId,
            deployment: latest.deployment,
            pod: latest.pod,
            container: latest.container,
            version: contextVersionRef.current, // Capture current version
        };
        fetchContextRef.current = currentFetchContext;

        // Helper to check if context is still valid (hasn't changed during fetch)
        const isContextStillValid = () => {
            return fetchContextRef.current?.tabId === currentFetchContext.tabId &&
                   fetchContextRef.current?.deployment === currentFetchContext.deployment &&
                   fetchContextRef.current?.pod === currentFetchContext.pod &&
                   fetchContextRef.current?.container === currentFetchContext.container &&
                   fetchContextRef.current?.version === currentFetchContext.version && // Check version!
                   contextVersionRef.current === currentFetchContext.version; // Double-check against current version
        };

        // Track if this fetch should control loading state
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

        const [namespace, depName] = latest.deployment.split('/');

        // Helper function to process fetched logs (common logic for both cases)
        const processLogs = (lines: string[]) => {
            // Check if context is still valid before updating state
            if (!isContextStillValid()) {
                shouldClearLoading = false;
                return false;
            }

            // If we have existing logs and new logs, append only truly new ones
            if (hasInitializedLogs() && !isContextLoading && getLastSeenLogLine()) {
                const lastSeenIndex = lines.findIndex(line => line === getLastSeenLogLine());

                let newLines: string[] = [];
                if (lastSeenIndex >= 0) {
                    newLines = lines.slice(lastSeenIndex + 1);
                } else {
                    newLines = lines;
                }

                if (newLines.length > 0) {
                    const savedScrollInfo = scrollPositionBeforeFetchRef.current;

                    setLogLines(prev => {
                        const combined = [...prev, ...newLines];
                        if (combined.length > MAX_LOG_LINES) {
                            return combined.slice(combined.length - MAX_LOG_LINES);
                        }
                        return combined;
                    });

                    setLastSeenLogLine(newLines[newLines.length - 1]);

                    // Maintain scroll position if user was scrolled up
                    if (savedScrollInfo && logsContainerRef.current) {
                        const container = logsContainerRef.current;
                        const oldBehavior = container.style.scrollBehavior;
                        container.style.scrollBehavior = 'auto';

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
                if (lines.length > 0) {
                    setLastSeenLogLine(lines[lines.length - 1]);
                }
            }

            // Only scroll to bottom if user is already at the bottom
            if (isScrolledToBottomRef.current && !isRestoringScrollRef.current) {
                setTimeout(() => {
                    if (logsContainerRef.current) {
                        logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
                    }
                }, 100);
            }

            return true;
        };

        try {
            let lines: string[];

            if (latest.pod === 'all-pods') {
                // Fetch all pods logs for deployment
                lines = await kubectl.getDeploymentLogs(depName, namespace, searchQuery, appliedDateFrom, appliedDateTo);
            } else {
                // Regular pod logs
                if (!latest.pod || !latest.container) return;
                const [podNamespace, podName] = latest.pod.split('/');

                // Validate that the pod still exists
                // BUT skip validation if this pod is explicitly selected in logs tab
                const isFromLogsTab = currentTab?.selectedPod === latest.pod;

                if (!isFromLogsTab && !validatePodExists(latest.pod, {
                    autoSwitch: true,
                    action: 'fetch logs'
                })) {
                    // Pod doesn't exist, validatePodExists already handled it
                    return;
                }

                lines = await kubectl.getLogs(podName, podNamespace, latest.container, showPrevious, searchQuery, appliedDateFrom, appliedDateTo);
            }

            processLogs(lines);
        } catch (e) {
            if (isContextStillValid()) {
                const errorMessage = (e as Error).message;

                // Check if error is about pod not found
                if (errorMessage.includes('not found') && latest.pod !== 'all-pods') {
                    console.warn('Pod not found error, switching to all-pods mode');
                    updateLogsState({
                        selectedPod: 'all-pods',
                        selectedContainer: '',
                    });
                    setLogLines(['Pod no longer exists. Switched to all-pods mode. Please wait...']);
                } else {
                    const errorPrefix = latest.pod === 'all-pods' ? 'Failed to fetch deployment logs: ' : 'Failed to fetch logs: ';
                    setLogLines([errorPrefix + errorMessage]);
                }
            } else {
                shouldClearLoading = false;
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
        if (!selectedWorkload) return;

        setDownloadingLogs(true);
        try {
            const [namespace, depName] = selectedWorkload.split('/');
            let lines: string[];

            // Fetch all logs with unlimited flag
            if (selectedPod === 'all-pods') {
                lines = await kubectl.getDeploymentLogs(depName, namespace, searchQuery, appliedDateFrom, appliedDateTo, true);
            } else if (selectedPod && selectedContainer) {
                const [podNamespace, podName] = selectedPod.split('/');

                // Validate that the pod still exists
                if (!validatePodExists(selectedPod, {
                    autoSwitch: false,
                    userMessage: '⚠️ Cannot download logs: Pod no longer exists. Please select a different pod or use all-pods mode.',
                    action: 'download logs'
                })) {
                    // Pod doesn't exist, validatePodExists already handled it
                    setDownloadingLogs(false);
                    return;
                }

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
    const prevDeploymentRef = useRef(selectedWorkload);
    const prevPodRef = useRef(selectedPod);
    const prevContainerRef = useRef(selectedContainer);
    const prevShowPreviousRef = useRef(showPrevious);
    const prevAppliedDateFromRef = useRef(appliedDateFrom);
    const prevAppliedDateToRef = useRef(appliedDateTo);
    const prevSearchQueryRef = useRef(searchQuery);
    const prevTabIdForFetchRef = useRef(currentTabId);
    const prevLastUpdatedRef = useRef(lastUpdated);

    // Track lastUpdated per tab to detect when it changes for a specific tab
    const lastUpdatedPerTabRef = useRef<Map<string, number | undefined>>(new Map());

    // Fetch logs when selection changes
    useEffect(() => {
        // Check if this is just a tab switch (not a filter change within the same tab)
        const isTabSwitch = prevTabIdForFetchRef.current !== currentTabId;

        // Check if lastUpdated changed FOR THIS SPECIFIC TAB
        const previousLastUpdatedForThisTab = lastUpdatedPerTabRef.current.get(currentTabId);
        const lastUpdatedChangedForThisTab = lastUpdated !== previousLastUpdatedForThisTab;

        // Forced update: lastUpdated changed for the current tab (not just switching to a different tab)
        const isForcedUpdate = lastUpdatedChangedForThisTab && lastUpdated !== undefined;

        // Handle forced update FIRST (from tab replacement)
        // This takes priority over normal tab switch logic
        if (isForcedUpdate) {
            // Update the per-tab tracking
            lastUpdatedPerTabRef.current.set(currentTabId, lastUpdated);

            // Update ALL refs to new values
            prevLastUpdatedRef.current = lastUpdated;
            prevDeploymentRef.current = selectedWorkload;
            prevPodRef.current = selectedPod;
            prevContainerRef.current = selectedContainer;
            prevShowPreviousRef.current = showPrevious;
            prevAppliedDateFromRef.current = appliedDateFrom;
            prevAppliedDateToRef.current = appliedDateTo;
            prevSearchQueryRef.current = searchQuery;
            prevTabIdForFetchRef.current = currentTabId;

            // Clear logs and increment version to invalidate pending fetches
            contextVersionRef.current += 1;
            setLogLines([]);
            setIsContextLoading(true);
            setLoadingLogs(true);
            isScrolledToBottomRef.current = true;
            setLastSeenLogLine('');
            setHasInitializedLogs(false);
            fetchContextRef.current = null;

            // Trigger fetch with setTimeout to defer execution until after state updates complete
            // Return cleanup function to cancel pending fetch if effect runs again (prevents race conditions)
            const timeoutId = setTimeout(() => {
                fetchLogs();
            }, 0);

            return () => clearTimeout(timeoutId);
        }

        if (isTabSwitch) {
            // Update the per-tab tracking for the new tab
            lastUpdatedPerTabRef.current.set(currentTabId, lastUpdated);
            // Tab switched - update all refs to new tab's values without triggering reload
            prevDeploymentRef.current = selectedWorkload;
            prevPodRef.current = selectedPod;
            prevContainerRef.current = selectedContainer;
            prevShowPreviousRef.current = showPrevious;
            prevAppliedDateFromRef.current = appliedDateFrom;
            prevAppliedDateToRef.current = appliedDateTo;
            prevSearchQueryRef.current = searchQuery;
            prevTabIdForFetchRef.current = currentTabId;
            prevLastUpdatedRef.current = lastUpdated;

            // If this tab already has logs in memory, don't reload - just continue with auto-refresh
            // If no logs yet and has a deployment selected, start fresh fetch
            if (logLines.length === 0 && selectedWorkload && (selectedPod === 'all-pods' || (selectedPod && selectedContainer))) {
                setIsContextLoading(true);
                setLoadingLogs(true);
                fetchLogs();
            }
            return;
        }

        if (selectedWorkload) {
            if (selectedPod === 'all-pods' || (selectedPod && selectedContainer)) {
                // Check if this is a context change (deployment/pod/container changed) vs just a search query change
                const isContextChange =
                    prevDeploymentRef.current !== selectedWorkload ||
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
                prevDeploymentRef.current = selectedWorkload;
                prevPodRef.current = selectedPod;
                prevContainerRef.current = selectedContainer;
                prevShowPreviousRef.current = showPrevious;
                prevAppliedDateFromRef.current = appliedDateFrom;
                prevAppliedDateToRef.current = appliedDateTo;
                prevSearchQueryRef.current = searchQuery;

                // Clear logs and show "Loading logs..." text only on context change
                // Show spinning icon for all changes
                if (isContextChange) {
                    // Increment version to invalidate ALL pending fetches
                    contextVersionRef.current += 1;
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
    }, [selectedWorkload, selectedPod, selectedContainer, showPrevious, searchQuery, appliedDateFrom, appliedDateTo, currentTabId, lastUpdated]);

    // Auto-refresh logs when enabled
    useEffect(() => {
        if (autoRefreshEnabled && selectedWorkload && (selectedPod === 'all-pods' || (selectedPod && selectedContainer))) {
            const intervalId = setInterval(() => {
                fetchLogs();
            }, autoRefreshInterval);

            return () => clearInterval(intervalId);
        }
    }, [autoRefreshEnabled, autoRefreshInterval, selectedWorkload, selectedPod, selectedContainer, searchQuery, appliedDateFrom, appliedDateTo, showPrevious]);

    // Update pod selection when deployment changes (but not when logsTarget is being set or on initial mount)
    useEffect(() => {
        // Check if pod is already set to a specific value (not empty, not all-pods)
        // If so, this is likely from localStorage restore or explicit user selection - don't override it
        const hasSpecificPodSelected = selectedPod && selectedPod !== '' && selectedPod !== 'all-pods';

        // Check if workload data has actually loaded - if not, don't make changes yet
        // This prevents resetting pod selection on page reload before workloads are fetched
        const hasWorkloadData = state.deployments.length > 0 || state.daemonSets.length > 0 || state.statefulSets.length > 0;

        // Also check if pods have loaded - if a specific pod is selected but pods haven't loaded yet,
        // don't reset (this is the page reload scenario where localStorage state is restored but data isn't loaded yet)
        const hasPodsData = state.pods.length > 0;

        // Only auto-set to all-pods if:
        // 1. Deployment changed from previous value
        // 2. Not from logsTarget (drawer LOGS button) - check both state and ref
        // 3. Not initial mount (prevDeployment was not empty)
        // 4. Pod is NOT already set to a specific pod (preserves localStorage restore)
        // 5. Workload data has actually loaded (prevents premature reset)
        // 6. Pods data has loaded (prevents reset when pod list is empty on page reload)
        const shouldAutoSetAllPods = selectedWorkload &&
            !state.logsTarget &&
            !isProcessingLogsTargetRef.current &&
            prevSelectedWorkloadRef.current !== selectedWorkload &&
            prevSelectedWorkloadRef.current !== '' &&
            !hasSpecificPodSelected &&
            hasWorkloadData &&
            hasPodsData;

        // IMPORTANT: Update prevSelectedWorkloadRef immediately to track the deployment
        prevSelectedWorkloadRef.current = selectedWorkload;

        if (shouldAutoSetAllPods) {
            updateLogsState({
                selectedPod: 'all-pods',
                selectedContainer: '',
            });
        }
    }, [selectedWorkload, selectedPod, state.logsTarget, state.deployments.length, state.daemonSets.length, state.statefulSets.length, state.pods.length]);

    // Validate and correct workload when pod is selected
    // This is important for cache restoration - ensures the workload matches the pod
    useEffect(() => {
        if (selectedPod && selectedPod !== 'all-pods' && selectedPod !== '' && selectedWorkload) {
            const [namespace, podName] = selectedPod.split('/');
            const pod = state.pods.find(p => p.namespace === namespace && p.name === podName);

            if (pod && pod.labels) {
                // Check if current workload actually owns this pod
                const [workloadNamespace, workloadName] = selectedWorkload.split('/');
                
                // Find the workload to verify it matches
                const currentWorkload = 
                    state.deployments.find(d => d.name === workloadName && d.namespace === workloadNamespace) ||
                    state.daemonSets.find(ds => ds.name === workloadName && ds.namespace === workloadNamespace) ||
                    state.statefulSets.find(ss => ss.name === workloadName && ss.namespace === workloadNamespace);

                // Check if current workload's selector matches the pod's labels
                const workloadMatchesPod = currentWorkload?.selector && 
                    Object.entries(currentWorkload.selector).every(([key, value]) => pod.labels![key] === value);

                // If workload doesn't match pod, dispatch to store to find correct workload
                if (!workloadMatchesPod) {
                    dispatch({
                        type: 'OPEN_LOGS_FOR_RESOURCE',
                        payload: {
                            type: 'pod',
                            podName: podName,
                            namespace: namespace,
                            container: selectedContainer,
                            targetTabId: currentTabId,
                            forceRefresh: false, // Don't clear logs, just fix workload
                        }
                    });
                }
            }
        }
    }, [selectedPod, selectedWorkload, state.pods, state.deployments, state.daemonSets, state.statefulSets, currentTabId, selectedContainer]);

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
                        <label className="text-xs text-gray-400 font-medium">Workload:</label>
                        <select
                            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 max-w-xs"
                            value={selectedWorkload}
                            onChange={(e) => {
                                updateLogsState({
                                    selectedWorkload: e.target.value,
                                    selectedPod: e.target.value ? 'all-pods' : '',
                                });
                            }}
                        >
                            {!selectedWorkload && <option value="" disabled>Select workload</option>}
                            {availableWorkloads.map(dep => (
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
                            disabled={!selectedWorkload}
                        >
                            {!selectedWorkload ? (
                                <option value="" disabled>Select workload first</option>
                            ) : (
                                <>
                                    <option value="all-pods">All Pods (Aggregated)</option>
                                    {(() => {
                                        const [namespace, workloadName] = selectedWorkload.split('/');

                                        // Find the workload in any of the three types
                                        const deployment = state.deployments.find(d => d.name === workloadName && d.namespace === namespace);
                                        const daemonSet = state.daemonSets.find(ds => ds.name === workloadName && ds.namespace === namespace);
                                        const statefulSet = state.statefulSets.find(ss => ss.name === workloadName && ss.namespace === namespace);

                                        const workload = deployment || daemonSet || statefulSet;

                                        if (!workload) return null;

                                        // Helper function to check if pod labels match workload selector
                                        const matchesSelector = (podLabels: Record<string, string> | undefined, selector: Record<string, string> | undefined) => {
                                            if (!podLabels || !selector) return false;
                                            return Object.entries(selector).every(([key, value]) => podLabels[key] === value);
                                        };

                                        const filteredPods = state.pods.filter(statePod => {
                                            if (statePod.namespace !== namespace) return false;
                                            return matchesSelector(statePod.labels, workload.selector);
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

                        {selectedWorkload && selectedPod && selectedPod !== 'all-pods' && (
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
                                    disabled={loadingLogs || !selectedWorkload || (selectedPod !== 'all-pods' && !selectedContainer)}
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
                                disabled={downloadingLogs || !selectedWorkload || (selectedPod !== 'all-pods' && !selectedContainer)}
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
                    ) : !selectedWorkload ? (
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

