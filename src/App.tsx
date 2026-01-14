import { StoreProvider, useStore } from './store';
import { ThemeProvider } from './contexts/ThemeContext';
import { ThemeToggle } from './components/ThemeToggle';
import {
    Sidebar, TerminalPanel, ResourceDrawer, ClusterHotbar, AddClusterModal,
    NamespaceSelector, ClusterCatalogModal, PortForwardModal, ShellModal, ConfirmationModal,
    RoutineModal, ErrorBanner, //VersionCheckPopup,
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
        {/*<VersionCheckPopup currentVersion={CURRENT_VERSION} />*/}
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
            onConfirm={(localPort) => {
                const data = state.portForwardModalData;
                if (!data) return;
                // Start PF
                const id = `pf-${Date.now()}`;
                kubectl.startPortForward(id, data.resourceType, data.resourceName, data.namespace, localPort, data.port).then(pid => {
                     dispatch({ type: 'ADD_PORT_FORWARD', payload: {
                         id: id, // Use the generated ID to match metadata
                         pid,
                         resourceName: data.resourceName,
                         resourceType: data.resourceType as any,
                         namespace: data.namespace,
                         localPort,
                         remotePort: data.port,
                         status: 'Active'
                     }});
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
