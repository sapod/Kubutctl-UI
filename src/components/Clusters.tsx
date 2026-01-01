import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Cluster } from '../types';
import { kubectl } from '../services/kubectl';
import { Grid, Star, Edit2, Trash2, RefreshCw, CheckCircle, Plus, X } from 'lucide-react';

// --- Cluster Hotbar (Lens Style) ---
export const ClusterHotbar: React.FC = () => {
  const { state, dispatch } = useStore();
  // Filter only favorites for the hotbar and sort by timestamp
  const favorites = state.clusters
    .filter((c: { isFavorite: any; }) => c.isFavorite)
    .sort((a, b) => (a.favoriteTimestamp || 0) - (b.favoriteTimestamp || 0));

  return (
    <div className="w-16 bg-gray-950 flex flex-col items-center py-4 space-y-4 border-r border-gray-900 z-20 flex-shrink-0 shadow-xl">
      <button
        onClick={() => dispatch({ type: 'TOGGLE_CATALOG_MODAL', payload: true })}
        className="w-10 h-10 rounded-full bg-gray-800 text-gray-300 hover:bg-blue-600 hover:text-white flex items-center justify-center transition-colors mb-2 group relative"
        title="Cluster Catalog"
      >
        <Grid size={20} />
      </button>

      <div className="w-8 h-px bg-gray-800 my-1"></div>

      {favorites.map((cluster: { id: React.Key | null | undefined; color: any; textColor: any; name: string | undefined; initials: string | number | boolean | React.ReactElement<any, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | React.ReactPortal | null | undefined; }) => (
        <button
          key={cluster.id}
          onClick={() => dispatch({ type: 'SELECT_CLUSTER', payload: cluster.id })}
          className={`relative group w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-200 overflow-hidden px-0.5 ${
            state.currentClusterId === cluster.id 
              ? `text-white shadow-lg shadow-blue-900/50 scale-110 border-2 border-white` 
              : 'text-gray-400 hover:text-white opacity-80 hover:opacity-100 hover:scale-105 border-2 border-transparent'
          }`}
          style={{ backgroundColor: cluster.color, color: cluster.textColor }}
          title={cluster.name}
        >
          <span className="truncate max-w-full">{cluster.initials}</span>

          {state.currentClusterId === cluster.id && (
            <div className="absolute -left-3 top-1/2 transform -translate-y-1/2 w-1 h-6 bg-white rounded-r-full"></div>
          )}
        </button>
      ))}
    </div>
  );
};

export const ClusterCatalogModal: React.FC = () => {
    const { state, dispatch } = useStore();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [availableContexts, setAvailableContexts] = useState<{name: string}[]>([]);
    const [isLoadingContexts, setIsLoadingContexts] = useState(false);

    // Edit State
    const [editName, setEditName] = useState('');
    const [editInitials, setEditInitials] = useState('');
    const [editColor, setEditColor] = useState('');
    const [editTextColor, setEditTextColor] = useState('');

    useEffect(() => {
      if (state.isCatalogOpen) {
          loadContexts();
      }
    }, [state.isCatalogOpen]);

    const loadContexts = async () => {
        setIsLoadingContexts(true);
        try {
            const contexts = await kubectl.getConnectableContexts();
            setAvailableContexts(contexts);
        } catch (e) { console.error("Failed to load contexts", e); }
        finally { setIsLoadingContexts(false); }
    };

    if (!state.isCatalogOpen) return null;

    const startEditing = (cluster: Cluster) => {
      setEditingId(cluster.id);
      setEditName(cluster.name);
      setEditInitials(cluster.initials);
      setEditColor(cluster.color);
      setEditTextColor(cluster.textColor);
    };

    const saveEdit = (cluster: Cluster) => {
      const updated: Cluster = {
        ...cluster,
        name: editName,
        initials: editInitials,
        color: editColor,
        textColor: editTextColor
      };
      dispatch({ type: 'UPDATE_CLUSTER', payload: updated });
      setEditingId(null);
    };

    const toggleFavorite = (cluster: Cluster) => {
      const isFav = !cluster.isFavorite;
      const updated: Cluster = {
        ...cluster,
        isFavorite: isFav,
        // If adding to favorites, set timestamp to now to put it at the end of the list
        favoriteTimestamp: isFav ? Date.now() : undefined
      };
      dispatch({ type: 'UPDATE_CLUSTER', payload: updated });
    };

    const removeCluster = (clusterId: string) => {
        if (confirm('Are you sure you want to remove this cluster?')) {
            dispatch({ type: 'REMOVE_CLUSTER', payload: clusterId });
        }
    };

    const addFromContext = (ctxName: string) => {
        // Check if already exists
        if (state.clusters.some((c: { name: string; }) => c.name === ctxName)) {
            alert("Cluster already added to catalog.");
            return;
        }
        const newCluster: Cluster = {
          id: `c-${Date.now()}`,
          name: ctxName,
          server: 'https://kubernetes.default.svc',
          status: 'Active',
          initials: ctxName.substring(0, 2).toUpperCase(),
          color: '#10b981', // green for auto-detected
          textColor: '#ffffff',
          isFavorite: true
        };
        dispatch({ type: 'ADD_CLUSTER', payload: newCluster });
    };

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
         <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-5xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center p-6 border-b border-gray-800 flex-shrink-0">
               <h2 className="text-xl font-bold text-gray-100 flex items-center">
                  <Grid className="mr-2 text-blue-500" /> Cluster Catalog
               </h2>
               <button onClick={() => dispatch({ type: 'TOGGLE_CATALOG_MODAL', payload: false })} className="text-gray-400 hover:text-white">
                  <X size={24} />
               </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">

               {/* Section 1: Saved Clusters */}
               <div>
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-4">Saved Clusters</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {state.clusters.map((cluster: Cluster) => (
                      <div key={cluster.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-col shadow-sm">
                          <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                              <div
                                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs"
                                  style={{ backgroundColor: editingId === cluster.id ? editColor : cluster.color, color: editingId === cluster.id ? editTextColor : cluster.textColor }}
                              >
                                  {editingId === cluster.id ? editInitials : cluster.initials}
                              </div>
                              {editingId === cluster.id ? (
                                  <input
                                  className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500 w-40"
                                  value={editName}
                                  onChange={e => setEditName(e.target.value)}
                                  />
                              ) : (
                                  <div className="font-semibold text-gray-200">{cluster.name}</div>
                              )}
                              </div>
                              <div className="flex gap-2">
                              <button
                                  onClick={() => toggleFavorite(cluster)}
                                  className={`p-1.5 rounded transition-colors ${cluster.isFavorite ? 'text-yellow-400 bg-yellow-900/20' : 'text-gray-500 hover:text-gray-300'}`}
                                  title={cluster.isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                              >
                                  <Star size={18} fill={cluster.isFavorite ? "currentColor" : "none"} />
                              </button>
                              <button
                                  onClick={() => editingId === cluster.id ? saveEdit(cluster) : startEditing(cluster)}
                                  className="p-1.5 text-blue-400 hover:text-blue-300 bg-blue-900/20 rounded"
                                  title={editingId === cluster.id ? "Save" : "Edit"}
                              >
                                  {editingId === cluster.id ? <CheckCircle size={18} /> : <Edit2 size={18} />}
                              </button>
                              <button
                                  onClick={() => removeCluster(cluster.id)}
                                  className="p-1.5 text-red-400 hover:text-red-300 bg-red-900/20 rounded"
                                  title="Remove Cluster"
                              >
                                  <Trash2 size={18} />
                              </button>
                              </div>
                          </div>

                          {editingId === cluster.id && (
                          <div className="mt-2 space-y-3 p-3 bg-gray-900/50 rounded border border-gray-700/50 text-xs mb-2">
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="block text-gray-500 mb-1">Initials</label>
                                      <input
                                      className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white"
                                      value={editInitials}
                                      onChange={e => setEditInitials(e.target.value)}
                                      maxLength={3}
                                      />
                                  </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="block text-gray-500 mb-1">Bg Color</label>
                                      <input
                                      type="color"
                                      className="w-full h-8 bg-transparent cursor-pointer rounded"
                                      value={editColor}
                                      onChange={e => setEditColor(e.target.value)}
                                      />
                                  </div>
                                  <div>
                                      <label className="block text-gray-500 mb-1">Text Color</label>
                                      <input
                                      type="color"
                                      className="w-full h-8 bg-transparent cursor-pointer rounded"
                                      value={editTextColor}
                                      onChange={e => setEditTextColor(e.target.value)}
                                      />
                                  </div>
                              </div>
                          </div>
                          )}

                          <div className="mt-auto pt-2 flex justify-between items-center text-xs text-gray-500 border-t border-gray-700/50">
                              <span>{cluster.status}</span>
                              <span className="font-mono truncate ml-2 max-w-[150px]">{cluster.server}</span>
                          </div>
                      </div>
                      ))}
                  </div>
               </div>

               <div className="w-full h-px bg-gray-800"></div>

               {/* Section 2: Discovered Contexts */}
               <div>
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-4 flex items-center justify-between">
                      <span>Discovered Contexts (from local kubeconfig)</span>
                      <button onClick={loadContexts} className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-xs">
                          <RefreshCw size={12} /> Refresh
                      </button>
                  </h3>
                  {isLoadingContexts ? (
                      <div className="text-gray-500 italic text-sm">Scanning for contexts...</div>
                  ) : availableContexts.length === 0 ? (
                      <div className="text-gray-500 text-sm bg-gray-800/50 p-4 rounded border border-gray-700/50">
                          No contexts found. Ensure your local server is running and kubectl is configured.
                      </div>
                  ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {availableContexts.map(ctx => {
                              const isAdded = state.clusters.some((c: { name: string; }) => c.name === ctx.name);
                              return (
                                  <div key={ctx.name} className={`border rounded p-3 flex justify-between items-center transition-colors ${isAdded ? 'bg-gray-800/50 border-gray-700 opacity-60' : 'bg-gray-800 border-gray-700 hover:border-blue-500'}`}>
                                      <span className="font-medium text-gray-200 truncate pr-2 text-sm" title={ctx.name}>{ctx.name}</span>
                                      {isAdded ? (
                                          <span className="text-xs text-green-500 flex items-center gap-1"><CheckCircle size={12}/> Added</span>
                                      ) : (
                                          <button
                                              onClick={() => addFromContext(ctx.name)}
                                              className="px-3 py-1 bg-blue-900/30 text-blue-300 text-xs rounded border border-blue-800 hover:bg-blue-800 hover:text-white"
                                          >
                                              Add
                                          </button>
                                      )}
                                  </div>
                              );
                          })}
                      </div>
                  )}
               </div>

            </div>
         </div>
      </div>
    );
};

export const AddClusterModal: React.FC = () => {
    const { state, dispatch } = useStore();
    const [name, setName] = useState('');
    const [kubeconfig, setKubeconfig] = useState('');

    if (!state.isAddClusterModalOpen) return null;

    const handleAdd = () => {
      if (!name) {
        alert("Please provide a name");
        return;
      }

      const newCluster: Cluster = {
        id: `c-${Date.now()}`,
        name: name,
        server: 'https://127.0.0.1:6443',
        status: 'Active',
        initials: name.substring(0, 2).toUpperCase(),
        color: '#2563eb',
        textColor: '#ffffff',
        isFavorite: true
      };

      dispatch({ type: 'ADD_CLUSTER', payload: newCluster });
      setName('');
      setKubeconfig('');
      dispatch({ type: 'TOGGLE_ADD_CLUSTER_MODAL', payload: false });
    };

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-lg flex flex-col">
          <div className="flex justify-between items-center p-6 border-b border-gray-800">
            <h2 className="text-xl font-bold text-gray-100 flex items-center">
              <Plus className="mr-2 text-blue-500" /> Manual Add
            </h2>
            <button
              onClick={() => dispatch({ type: 'TOGGLE_ADD_CLUSTER_MODAL', payload: false })}
              className="text-gray-400 hover:text-white"
            >
              <X size={24} />
            </button>
          </div>

          <div className="p-6 space-y-4">
              <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Cluster Name</label>
                  <input
                  type="text"
                  className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-gray-100 focus:ring-1 focus:ring-blue-500 outline-none"
                  placeholder="e.g., custom-cluster"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  />
              </div>

              <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Kubeconfig (YAML)</label>
                  <textarea
                  className="w-full bg-gray-950 border border-gray-700 rounded p-3 text-gray-300 font-mono text-xs h-32 focus:ring-1 focus:ring-blue-500 outline-none"
                  placeholder={`apiVersion: v1\nclusters:\n...`}
                  value={kubeconfig}
                  onChange={e => setKubeconfig(e.target.value)}
                  />
              </div>
              <div className="flex justify-end">
                  <button
                      onClick={handleAdd}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded shadow-lg shadow-blue-900/20"
                  >
                      Add
                  </button>
              </div>
          </div>
        </div>
      </div>
    );
};
