import { useEffect } from 'react';
import { StoreProvider, useStore } from './store';
import { ThemeProvider } from './contexts/ThemeContext';
import { ThemeToggle } from './components/ThemeToggle';
import {
    Sidebar, TerminalPanel, ResourceDrawer, ClusterHotbar, AddClusterModal,
    NamespaceSelector, ClusterCatalogModal, PortForwardModal, ShellModal, ConfirmationModal,
    RoutineModal, ErrorBanner, UpdateNotification,
    OverviewPage, NodesPage, PodsPage, DeploymentsPage, ReplicaSetsPage,
    JobsPage, CronJobsPage, ServicesPage, IngressesPage, ConfigMapsPage,
    NamespacesPage, ResourceQuotasPage, PortForwardingPage
} from './components/UI';
import { Loader2, Plus } from 'lucide-react';
import { kubectl } from './services/kubectl';
// import packageJson from '../package.json';

// Get current version from package.json
// const CURRENT_VERSION = packageJson.version;

const MainLayout = () => {
  const { state, dispatch } = useStore();

  // Auto-retry when window regains focus after AWS SSO login
  useEffect(() => {
    if (!state.awsSsoLoginRequired) return;

    const handleFocus = () => {
      // When the window regains focus and AWS SSO login is required,
      // automatically retry the connection
      dispatch({ type: 'SET_AWS_SSO_LOGIN_REQUIRED', payload: false });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      // Small delay to ensure the login has completed
      setTimeout(() => {
        window.location.reload();
      }, 500);
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [state.awsSsoLoginRequired, dispatch]);

  const renderView = () => {
    switch (state.view) {
      case 'overview': return <OverviewPage />;
      case 'nodes': return <NodesPage />;
      case 'pods': return <PodsPage />;
      case 'deployments': return <DeploymentsPage />;
      case 'replicasets': return <ReplicaSetsPage />;
      case 'jobs': return <JobsPage />;
      case 'cronjobs': return <CronJobsPage />;
      case 'services': return <ServicesPage />;
      case 'ingresses': return <IngressesPage />;
      case 'configmaps': return <ConfigMapsPage />;
      case 'namespaces': return <NamespacesPage />;
      case 'resourcequotas': return <ResourceQuotasPage />;
      case 'port-forwarding': return <PortForwardingPage />;
      default: return <OverviewPage />;
    }
  };

  return (
    <div className="flex h-screen w-screen bg-gray-950 text-gray-100 overflow-hidden font-sans selection:bg-blue-500/30 relative">
        <ErrorBanner />
        <ClusterHotbar />
        <Sidebar currentView={state.view} onViewChange={(v) => dispatch({ type: 'SET_VIEW', payload: v })} />

        <div className="flex-1 flex flex-col min-w-0">
            {/* Top Bar */}
            <div className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 shadow-sm flex-shrink-0">
                <div className="flex items-center gap-4">
                   <h2 className="font-bold text-lg tracking-tight">Kubectl<span className="text-blue-500 font-light">-UI</span></h2>
                   <div className="h-6 w-px bg-gray-800 mx-2"></div>
                   <NamespaceSelector />
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
                                       dispatch({ type: 'SET_AWS_SSO_LOGIN_REQUIRED', payload: false });
                                       dispatch({ type: 'SET_ERROR', payload: null });
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
               {renderView()}
            </div>

            {/* Terminal Panel */}
            <TerminalPanel />
        </div>

        {/* Overlays */}
        <UpdateNotification />
        <AddClusterModal />
        <ClusterCatalogModal />
        <ResourceDrawer />
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
    </div>
  );
};

const App = () => {
  return (
    <ThemeProvider>
      <StoreProvider>
        <MainLayout />
      </StoreProvider>
    </ThemeProvider>
  );
};

export default App;
