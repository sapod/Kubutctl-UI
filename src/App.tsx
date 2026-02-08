import { useEffect, useRef } from 'react';
import { StoreProvider, useStore } from './store';
import { ThemeProvider } from './contexts/ThemeContext';
import { ThemeToggle } from './components/ThemeToggle';
import { LogsPanel } from './components/LogsPanel';
import { ConnectionVerificationOverlay } from './components/ConnectionVerificationOverlay';
import { INACTIVITY_THRESHOLD_MS } from './consts';
import {
    Sidebar, TerminalPanel, ResourceDrawer, ClusterHotbar, AddClusterModal,
    NamespaceSelector, ClusterCatalogModal, PortForwardModal, ShellModal, ConfirmationModal,
    ReplaceLogsTabModal, RoutineModal, ErrorBanner, UpdateNotification, WelcomeScreen,
    OverviewPage, NodesPage, PodsPage, DeploymentsPage, ReplicaSetsPage, DaemonSetsPage, StatefulSetsPage,
    JobsPage, CronJobsPage, ServicesPage, IngressesPage, ConfigMapsPage, SecretsPage,
    NamespacesPage, ResourceQuotasPage, PortForwardingPage, EventsPage
} from './components/UI';
import { Loader2, Plus, FileText, X } from 'lucide-react';
import { kubectl } from './services/kubectl';
// import packageJson from '../package.json';

// Get current version from package.json
// const CURRENT_VERSION = packageJson.version;

// Check if running in logs-only mode (separate window)
const isLogsOnlyMode = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('logsOnly') === 'true';
};

const MainLayout = () => {
  const { state, dispatch } = useStore();
  const verificationInProgressRef = useRef(false);

  // Detect inactivity and verify connection when app becomes active
  useEffect(() => {
    const verifyConnection = async (isRecoveringFromAwsSso = false) => {
      if (verificationInProgressRef.current) return;
      verificationInProgressRef.current = true;

      dispatch({ type: 'SET_VERIFYING_CONNECTION', payload: true });

      try {
        // Attempt to verify connection by making an actual API call to the cluster
        // This will fail if AWS SSO token is expired or invalid
        await kubectl.getNamespaces();

        // Update last active timestamp
        dispatch({ type: 'UPDATE_LAST_ACTIVE_TIMESTAMP', payload: Date.now() });

        // If we were recovering from AWS SSO login, reload the app to refresh data
        if (isRecoveringFromAwsSso) {
          setTimeout(() => {
            window.location.reload();
          }, 300);
        }
      } catch (error: any) {
        // Connection failed - might need AWS SSO login
        if (error.message?.includes('error validating') ||
            error.message?.includes('couldn\'t get current server API group list') ||
            error.message?.includes('token is expired')) {
          dispatch({ type: 'CLOSE_DRAWER_SILENTLY' });
          dispatch({ type: 'SET_AWS_SSO_LOGIN_REQUIRED', payload: true });
          dispatch({ type: 'SET_ERROR', payload: 'AWS SSO authentication required' });
        }
      } finally {
        dispatch({ type: 'SET_VERIFYING_CONNECTION', payload: false });
        verificationInProgressRef.current = false;
      }
    };

    // Shared logic for checking inactivity
    const checkInactivityAndVerify = () => {
      const timeSinceLastActive = Date.now() - state.lastActiveTimestamp;

      if (timeSinceLastActive > INACTIVITY_THRESHOLD_MS) {
        verifyConnection(false);
      } else {
        dispatch({ type: 'UPDATE_LAST_ACTIVE_TIMESTAMP', payload: Date.now() });
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // App became visible - check inactivity
        checkInactivityAndVerify();
      }
    };

    const handleFocus = () => {
      // If AWS SSO login is required, user might have completed login
      // Show verification overlay and verify connection
      if (state.awsSsoLoginRequired) {
        dispatch({ type: 'SET_AWS_SSO_LOGIN_REQUIRED', payload: false });
        dispatch({ type: 'SET_ERROR', payload: null });
        // Verify connection (will show loading overlay)
        verifyConnection(true); // Pass true to reload once verified
        return;
      }

      // Otherwise, check inactivity and verify if needed
      checkInactivityAndVerify();
    };

    // Listen for visibility and focus changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [state.lastActiveTimestamp, state.awsSsoLoginRequired, dispatch]);

  const renderView = () => {
    switch (state.view) {
      case 'overview': return <OverviewPage />;
      case 'nodes': return <NodesPage />;
      case 'pods': return <PodsPage />;
      case 'deployments': return <DeploymentsPage />;
      case 'replicasets': return <ReplicaSetsPage />;
      case 'daemonsets': return <DaemonSetsPage />;
      case 'statefulsets': return <StatefulSetsPage />;
      case 'jobs': return <JobsPage />;
      case 'cronjobs': return <CronJobsPage />;
      case 'services': return <ServicesPage />;
      case 'ingresses': return <IngressesPage />;
      case 'configmaps': return <ConfigMapsPage />;
      case 'secrets': return <SecretsPage />;
      case 'namespaces': return <NamespacesPage />;
      case 'resourcequotas': return <ResourceQuotasPage />;
      case 'port-forwarding': return <PortForwardingPage />;
      case 'events': return <EventsPage />;
      default: return <OverviewPage />;
    }
  };

  // Check if a valid cluster is selected
  const hasValidCluster = state.currentClusterId && state.clusters.some(c => c.id === state.currentClusterId);

  return (
    <div className="flex h-screen w-screen bg-gray-950 text-gray-100 overflow-hidden font-sans selection:bg-blue-500/30 relative">
        <ErrorBanner />
        <ClusterHotbar />

        {/* Show sidebar only when a cluster is selected */}
        {hasValidCluster && <Sidebar currentView={state.view} onViewChange={(v) => dispatch({ type: 'SET_VIEW', payload: v })} />}

        <div className="flex-1 flex flex-col min-w-0">
            {/* Top Bar - Only show namespace selector when cluster is selected */}
            <div className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 shadow-sm flex-shrink-0">
                <div className="flex items-center gap-4">
                   <h2 className="font-bold text-lg tracking-tight">Kubectl<span className="text-blue-500 font-light">-UI</span></h2>
                   {hasValidCluster && (
                     <>
                       <div className="h-6 w-px bg-gray-800 mx-2"></div>
                       <NamespaceSelector />
                     </>
                   )}
                </div>

                <div className="flex items-center gap-4">
                    {state.isLoading && (
                        <div className="flex items-center text-blue-400 text-xs animate-pulse">
                            <Loader2 className="animate-spin mr-2" size={14}/> Updating...
                        </div>
                    )}
                    <ThemeToggle />
                    <button
                        onClick={() => dispatch({ type: 'TOGGLE_ADD_CLUSTER_MODAL', payload: true })}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition-all shadow-lg shadow-blue-900/20 flex items-center"
                        title="Add a new Kubernetes cluster"
                    >
                        <Plus size={14} className="mr-1" /> Add Cluster
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div
                className="flex-1 overflow-y-auto bg-gray-950 relative custom-scrollbar"
                onClick={() => state.drawerOpen && dispatch({ type: 'CLOSE_DRAWER' })}
            >
               {/* AWS SSO Login Required - Blocks entire main content */}
               {state.awsSsoLoginRequired && (
                   <div className="absolute inset-0 bg-gray-950/95 backdrop-blur-md z-50 flex items-center justify-center">
                       <div className="text-center max-w-2xl px-8">
                           <div className="mb-6">
                               <svg className="w-24 h-24 mx-auto text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                               </svg>
                           </div>
                           <h3 className="text-2xl font-bold text-gray-100 mb-4">AWS SSO Authentication Required</h3>
                           <p className="text-base text-gray-300 mb-6">
                               Your AWS SSO session has expired or is not authenticated. This is required to access your Kubernetes cluster.
                           </p>
                           <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6 text-left">
                               <p className="text-sm text-gray-400 mb-3 font-semibold">To resolve this issue:</p>
                               <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
                                   <li>Click the button below to run AWS SSO login, or</li>
                                   <li>Open your terminal and run: <code className="bg-gray-800 px-2 py-1 rounded text-blue-400 font-mono">aws sso login</code></li>
                                   <li>Complete the authentication in your browser</li>
                                   <li>Return here and click "Retry" below</li>
                               </ol>
                           </div>
                           <div className="flex gap-3 justify-center">
                               <button
                                   onClick={async () => {
                                       const electron = (window as any).electron;

                                       if (electron && typeof electron.executeCommand === 'function') {
                                           try {
                                               dispatch({ type: 'ADD_LOG', payload: 'Running: aws sso login...' });
                                               const result = await electron.executeCommand('aws sso login');
                                               dispatch({ type: 'ADD_LOG', payload: 'AWS SSO login completed successfully' });
                                               if (result.stdout) {
                                                   dispatch({ type: 'ADD_LOG', payload: result.stdout });
                                               }
                                           } catch (err: any) {
                                               dispatch({ type: 'ADD_LOG', payload: `AWS SSO login error: ${err.error || err.stderr}` });
                                               dispatch({ type: 'SET_ERROR', payload: `AWS SSO login failed: ${err.error || err.stderr}` });
                                           }
                                       } else {
                                           dispatch({ type: 'SET_ERROR', payload: 'Command execution not available. Please run "aws sso login" in your terminal.' });
                                       }
                                   }}
                                   className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg text-base font-bold transition-all shadow-lg shadow-green-900/20"
                               >
                                   Run AWS SSO Login
                               </button>
                               <button
                                   onClick={() => {
                                       // Just reload - handleFocus will clear the flags when window gains focus
                                       window.location.reload();
                                   }}
                                   className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg text-base font-bold transition-all shadow-lg shadow-blue-900/20"
                               >
                                   Retry
                               </button>
                           </div>
                       </div>
                   </div>
               )}

               {/* External Context Mismatch - Blocks entire main content */}
               {state.externalContextMismatch && (
                   <div className="absolute inset-0 bg-gray-950/95 backdrop-blur-md z-50 flex items-center justify-center">
                       <div className="text-center max-w-2xl px-8">
                           <div className="mb-6">
                               <svg className="w-24 h-24 mx-auto text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                               </svg>
                           </div>
                           <h3 className="text-2xl font-bold text-gray-100 mb-4">Cluster Context Changed Externally</h3>
                           <p className="text-base text-gray-300 mb-6">
                               The kubectl context was changed outside of Kubectl-UI.
                           </p>
                           <div className="text-center">
                               <p className="text-xl text-blue-400 font-medium">
                                   Please select a cluster
                               </p>
                           </div>
                       </div>
                   </div>
               )}

               {/* Context Switching Lock - Only covers main content area */}
               {state.isContextSwitching && (
                   <div className="absolute inset-0 bg-gray-950/95 backdrop-blur-md z-40 flex items-center justify-center">
                       <div className="text-center">
                           <Loader2 className="animate-spin mx-auto mb-4 text-blue-400" size={48} />
                           <h3 className="text-xl font-bold text-gray-100 mb-2">Switching Context...</h3>
                           <p className="text-sm text-gray-400">Loading data from new cluster</p>
                       </div>
                   </div>
               )}

               {/* Show WelcomeScreen if no cluster selected, otherwise show the view */}
               {!hasValidCluster ? <WelcomeScreen /> : renderView()}
            </div>

            {/* Terminal Panel - Only show when cluster is selected */}
            {hasValidCluster && <TerminalPanel />}
        </div>

        {/* Overlays */}
        <UpdateNotification />
        <AddClusterModal />
        <ClusterCatalogModal />
        <ResourceDrawer />
        <ReplaceLogsTabModal />
        <ConfirmationModal
            isOpen={state.isConfirmationModalOpen}
            onClose={() => {
                if (state.confirmationModalData?.onCancel) {
                    state.confirmationModalData.onCancel();
                }
                dispatch({ type: 'CLOSE_CONFIRMATION_MODAL' });
            }}
            title={state.confirmationModalData?.title || ''}
            message={state.confirmationModalData?.message || ''}
            onConfirm={state.confirmationModalData?.onConfirm || (() => {})}
        />
        <PortForwardModal
            isOpen={state.isPortForwardModalOpen}
            onClose={() => dispatch({ type: 'CLOSE_PF_MODAL' })}
            resourceName={state.portForwardModalData?.resourceName || ''}
            resourceType={state.portForwardModalData?.resourceType || ''}
            targetPort={state.portForwardModalData?.port || 0}
            namespace={state.portForwardModalData?.namespace || ''}
            onConfirm={async (localPort, openInBrowser) => {
                const data = state.portForwardModalData;
                if (!data) return;
                // Start PF
                const id = `pf-${Date.now()}`;
                kubectl.startPortForward(id, data.resourceType, data.resourceName, data.namespace, localPort, data.port).then(async (result) => {
                     // Use captured port from backend if available (random port case), otherwise use requested port
                     const actualLocalPort = result.localPort || localPort;

                     dispatch({ type: 'ADD_PORT_FORWARD', payload: {
                         id: id,
                         pid: result.pid,
                         resourceName: data.resourceName,
                         resourceType: data.resourceType as any,
                         namespace: data.namespace,
                         localPort: actualLocalPort,
                         remotePort: data.port,
                         status: 'Active'
                     }});

                     // Open in default browser if requested
                     if (openInBrowser && actualLocalPort !== 0) {
                         const url = `http://localhost:${actualLocalPort}/`;

                         // Use system open command to open in default browser
                         const electron = (window as any).electron;
                         if (electron && typeof electron.executeCommand === 'function') {
                             try {
                                 // Use platform-specific open command
                                 const platform = electron.platform || 'darwin';
                                 let command = '';
                                 if (platform === 'darwin') {
                                     command = `open "${url}"`;
                                 } else if (platform === 'win32') {
                                     command = `start "" "${url}"`;
                                 } else {
                                     command = `xdg-open "${url}"`;
                                 }

                                 await electron.executeCommand(command);
                                 dispatch({ type: 'ADD_LOG', payload: `Opened ${url} in default browser` });
                             } catch (err: any) {
                                 console.error('Failed to open browser:', err);
                                 dispatch({ type: 'ADD_LOG', payload: `Error opening browser: ${err.error || err}` });
                             }
                         } else {
                             // Web browser environment - open in new tab
                             window.open(url, '_blank');
                         }
                     }
                }).catch(err => {
                    dispatch({ type: 'ADD_LOG', payload: `Port Forward Error: ${err.message}` });
                    dispatch({ type: 'SET_ERROR', payload: `Port Forward Error: ${err.message}` });
                });
            }}
        />
        <RoutineModal />
        <ShellModal
            isOpen={state.isShellModalOpen}
            onClose={() => dispatch({ type: 'CLOSE_SHELL_MODAL' })}
            podName={state.shellModalData?.podName || ''}
            namespace={state.shellModalData?.namespace || ''}
            containers={state.shellModalData?.containers || []}
        />

        {/* Connection Verification Overlay */}
        <ConnectionVerificationOverlay
          isVisible={state.isVerifyingConnection}
          message="Verifying cluster connection..."
        />
    </div>
  );
};

// Logs-only mode component with title update and tabs
const LogsOnlyMode = () => {
  const { state, dispatch } = useStore();

  useEffect(() => {
    document.title = 'Kubectl UI - Logs';
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Tabs header */}
      <div className="flex items-center gap-1 px-4 py-1.5 bg-gray-900 border-b border-gray-800">
        {state.logsTabs.map((tab, index) => (
          <div key={tab.id} className="flex items-center">
            <button
              onClick={() => dispatch({ type: 'SET_ACTIVE_LOGS_TAB', payload: tab.id })}
              className={`flex items-center text-xs font-bold uppercase tracking-wider transition-colors px-2 py-1 rounded-l ${
                state.activeLogsTabId === tab.id 
                  ? 'text-blue-400 bg-gray-800' 
                  : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/50'
              }`}
              title={tab.selectedWorkload || `Logs ${index === 0 ? '' : index + 1}`.trim()}
            >
              <FileText size={12} className="mr-1" />
              {index === 0 ? 'Logs' : `Logs ${index + 1}`}
            </button>
            {/* Close button for extra tabs */}
            {state.logsTabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ type: 'REMOVE_LOGS_TAB', payload: tab.id });
                }}
                className={`p-1 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-r transition-colors ${
                  state.activeLogsTabId === tab.id ? 'bg-gray-800' : ''
                }`}
                title="Close this logs tab"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}

        {/* Add new logs tab button (max 3) */}
        {state.logsTabs.length < 3 && (
          <button
            onClick={() => dispatch({ type: 'ADD_LOGS_TAB' })}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors ml-1"
            title="Add new logs tab (max 3)"
          >
            <Plus size={12} />
          </button>
        )}
      </div>

      {/* Logs panel for active tab */}
      <div className="flex-1 overflow-hidden">
        <LogsPanel standalone={true} tabId={state.activeLogsTabId} />
      </div>
    </div>
  );
};

const App = () => {
  // Check if we're in logs-only mode (separate window)
  if (isLogsOnlyMode()) {
    return (
      <ThemeProvider>
        <StoreProvider>
          <LogsOnlyMode />
        </StoreProvider>
      </ThemeProvider>
    );
  }

  // Normal full app mode
  return (
    <ThemeProvider>
      <StoreProvider>
        <MainLayout />
      </StoreProvider>
    </ThemeProvider>
  );
};

export default App;
