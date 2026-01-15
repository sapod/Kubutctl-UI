import React, { useState, useEffect } from 'react';
import { Terminal, X, AlertTriangle, Plus, Trash2, Save, Edit2 } from 'lucide-react';
import { kubectl } from '../services/kubectl';
import { useStore } from '../store';
import { PortForwardRoutine, PortForwardRoutineItem } from '../types';

export const ConfirmationModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    title: string;
    message: string;
    onConfirm: () => void;
}> = ({ isOpen, onClose, title, message, onConfirm }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
            <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl w-full max-w-sm p-6 transform transition-all scale-100">
                <div className="flex items-start gap-4 mb-4">
                    <div className="p-2 bg-yellow-900/30 rounded-full flex-shrink-0">
                        <AlertTriangle className="text-yellow-500" size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-100 mb-2">{title}</h3>
                        <p className="text-sm text-gray-300 leading-relaxed">{message}</p>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-300 hover:bg-gray-700 rounded text-sm font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => { onConfirm(); onClose(); }}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium shadow-lg shadow-red-900/20 transition-colors"
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
};

export const PortForwardModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    resourceName: string;
    resourceType: string;
    targetPort: number;
    namespace: string;
    onConfirm: (localPort: number, openInBrowser?: boolean) => void;
  }> = ({ isOpen, onClose, resourceName, targetPort, onConfirm }) => {
    const [localPort, setLocalPort] = useState(targetPort);
    const [useRandomPort, setUseRandomPort] = useState(false);
    const [openInBrowser, setOpenInBrowser] = useState(false);

    useEffect(() => {
        // Automatically suggest a high port if target is privileged (< 1024)
        if (targetPort < 1024) {
            setLocalPort(targetPort + 8000);
        } else {
            setLocalPort(targetPort);
        }
        // Reset checkboxes when modal opens
        setUseRandomPort(false);
        setOpenInBrowser(false);
    }, [targetPort, isOpen]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        const portToUse = useRandomPort ? 0 : localPort;
        onConfirm(portToUse, openInBrowser);
        onClose();
    };

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
        <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl w-full max-w-sm p-5">
           <h3 className="text-lg font-bold text-gray-100 mb-4">Port Forwarding</h3>
           <div className="mb-4 text-sm text-gray-400">
              Configure forwarding for <strong>{resourceName}</strong>.
              <br/>
              Remote Port: <span className="text-green-400 font-mono">{targetPort}</span>
           </div>

           {/* Checkboxes in one line above local port */}
           <div className="mb-4 flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                 <input
                    type="checkbox"
                    checked={useRandomPort}
                    onChange={(e) => setUseRandomPort(e.target.checked)}
                    className="w-4 h-4 bg-gray-900 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 text-blue-600 cursor-pointer"
                 />
                 <span className="text-sm text-gray-300">Random port</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                 <input
                    type="checkbox"
                    checked={openInBrowser}
                    onChange={(e) => setOpenInBrowser(e.target.checked)}
                    className="w-4 h-4 bg-gray-900 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 text-blue-600 cursor-pointer"
                 />
                 <span className="text-sm text-gray-300">Open in browser</span>
              </label>
           </div>

           {!useRandomPort && (
           <div className="mb-6">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Local Port</label>
              <input
                 type="number"
                 className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:outline-none focus:border-blue-500"
                 value={localPort}
                 onChange={(e) => setLocalPort(parseInt(e.target.value))}
              />
              {targetPort < 1024 && localPort < 1024 && (
                  <p className="text-xs text-yellow-500 mt-1">Warning: Ports under 1024 often require root privileges.</p>
              )}
           </div>
           )}

           <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-3 py-1.5 text-gray-300 hover:bg-gray-700 rounded text-sm">Cancel</button>
              <button
                onClick={handleConfirm}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium"
              >
                Start Forwarding
              </button>
           </div>
        </div>
      </div>
    );
};

export const RoutineModal: React.FC = () => {
    const { state, dispatch } = useStore();
    const [name, setName] = useState('');
    const [items, setItems] = useState<PortForwardRoutineItem[]>([]);

    useEffect(() => {
        if (state.isRoutineModalOpen) {
            if (state.routineModalData) {
                setName(state.routineModalData.name);
                setItems(state.routineModalData.items);
            } else {
                setName('');
                setItems([]);
            }
        }
    }, [state.isRoutineModalOpen, state.routineModalData]);

    if (!state.isRoutineModalOpen) return null;

    const addItem = () => {
        setItems([...items, {
            id: `r-item-${Date.now()}`,
            namespace: state.selectedNamespace === 'All Namespaces' ? (state.namespaces[0]?.name || 'default') : state.selectedNamespace,
            resourceType: 'deployment',
            resourceName: '',
            localPort: 8080,
            remotePort: 80
        }]);
    };

    const updateItem = (index: number, field: keyof PortForwardRoutineItem, value: any) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        setItems(newItems);
    };

    const removeItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const handleSave = () => {
        if (!name.trim()) return alert("Please enter a routine name.");
        if (items.some(i => !i.resourceName)) return alert("Please specify resource names for all items.");

        const routine: PortForwardRoutine = {
            id: state.routineModalData?.id || `routine-${Date.now()}`,
            name,
            items
        };

        if (state.routineModalData) {
            dispatch({ type: 'UPDATE_ROUTINE', payload: routine });
        } else {
            dispatch({ type: 'ADD_ROUTINE', payload: routine });
        }
        dispatch({ type: 'CLOSE_ROUTINE_MODAL' });
    };

    // Helper to get resources for dropdown
    const getResourceOptions = (namespace: string, type: string) => {
        if (type === 'pod') return state.pods.filter(p => p.namespace === namespace).map(p => p.name);
        if (type === 'deployment') return state.deployments.filter(d => d.namespace === namespace).map(d => d.name);
        if (type === 'service') return state.services.filter(s => s.namespace === namespace).map(s => s.name);
        return [];
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl w-full max-w-4xl flex flex-col max-h-[85vh]">
                <div className="flex justify-between items-center p-6 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-gray-100 flex items-center">
                        {state.routineModalData ? <Edit2 className="mr-2 text-blue-500" size={20}/> : <Plus className="mr-2 text-blue-500" size={20}/>}
                        {state.routineModalData ? 'Edit Routine' : 'Create Routine'}
                    </h2>
                    <button onClick={() => dispatch({ type: 'CLOSE_ROUTINE_MODAL' })} className="text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-300 mb-2">Routine Name</label>
                        <input
                            type="text"
                            className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-gray-100 focus:ring-1 focus:ring-blue-500 outline-none"
                            placeholder="e.g., Dev Environment Backend"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide">Forwarding Items</h3>
                            <button onClick={addItem} className="text-blue-400 hover:text-blue-300 text-sm flex items-center">
                                <Plus size={14} className="mr-1"/> Add Item
                            </button>
                        </div>

                        {items.length === 0 && (
                            <div className="text-gray-500 text-sm italic bg-gray-900/50 p-4 rounded border border-gray-700 border-dashed text-center">
                                No items added. Click "Add Item" to configure port forwarding rules.
                            </div>
                        )}

                        {items.map((item, idx) => {
                             const resourceOptions = getResourceOptions(item.namespace, item.resourceType);
                             return (
                                <div key={idx} className="bg-gray-900/50 p-3 rounded border border-gray-700 grid grid-cols-12 gap-3 items-end">
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Namespace</label>
                                        <select
                                            className="w-full bg-gray-800 border border-gray-600 rounded p-1.5 text-xs text-white"
                                            value={item.namespace}
                                            onChange={e => updateItem(idx, 'namespace', e.target.value)}
                                        >
                                            {state.namespaces.map(ns => <option key={ns.name} value={ns.name}>{ns.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Type</label>
                                        <select
                                            className="w-full bg-gray-800 border border-gray-600 rounded p-1.5 text-xs text-white"
                                            value={item.resourceType}
                                            onChange={e => updateItem(idx, 'resourceType', e.target.value)}
                                        >
                                            <option value="deployment">Deployment</option>
                                            <option value="service">Service</option>
                                            <option value="pod">Pod</option>
                                        </select>
                                    </div>
                                    <div className="col-span-3">
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Name</label>
                                        <input
                                            list={`resources-${idx}`}
                                            className="w-full bg-gray-800 border border-gray-600 rounded p-1.5 text-xs text-white"
                                            value={item.resourceName}
                                            onChange={e => updateItem(idx, 'resourceName', e.target.value)}
                                            placeholder="Select or type..."
                                        />
                                        <datalist id={`resources-${idx}`}>
                                            {resourceOptions.map(r => <option key={r} value={r} />)}
                                        </datalist>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Local Port</label>
                                        <input
                                            type="number"
                                            className="w-full bg-gray-800 border border-gray-600 rounded p-1.5 text-xs text-white"
                                            value={item.localPort}
                                            onChange={e => updateItem(idx, 'localPort', parseInt(e.target.value))}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Remote Port</label>
                                        <input
                                            type="number"
                                            className="w-full bg-gray-800 border border-gray-600 rounded p-1.5 text-xs text-white"
                                            value={item.remotePort}
                                            onChange={e => updateItem(idx, 'remotePort', parseInt(e.target.value))}
                                        />
                                    </div>
                                    <div className="col-span-1 flex justify-center pb-1.5">
                                        <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-400" title="Remove this item from routine">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                             );
                        })}
                    </div>
                </div>

                <div className="p-6 border-t border-gray-700 flex justify-end gap-3">
                    <button onClick={() => dispatch({ type: 'CLOSE_ROUTINE_MODAL' })} className="px-4 py-2 text-gray-300 hover:bg-gray-700 rounded text-sm">Cancel</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded shadow-lg shadow-blue-900/20 flex items-center">
                        <Save size={16} className="mr-2"/> Save Routine
                    </button>
                </div>
            </div>
        </div>
    );
};

export const ShellModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    podName: string;
    namespace: string;
    containers: string[];
  }> = ({ isOpen, onClose, podName, namespace, containers }) => {
    const [selectedContainer, setSelectedContainer] = useState(containers[0] || '');

    useEffect(() => {
        if (isOpen && containers.length > 0) {
            setSelectedContainer(containers[0]);
        }
    }, [isOpen, containers]);

    if (!isOpen) return null;

    const handleConnect = () => {
        kubectl.openShell(podName, namespace, selectedContainer);
        onClose();
    };

    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-6">
          <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-md p-6">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                      <Terminal size={18} className="text-green-500"/>
                      Connect to Shell
                  </h3>
                  <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20} /></button>
              </div>

              <div className="mb-6">
                  <div className="text-sm text-gray-400 mb-2">
                      Pod: <span className="text-gray-200 font-mono">{podName}</span>
                  </div>

                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Container</label>
                  <select
                      className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-white focus:outline-none focus:border-blue-500"
                      value={selectedContainer}
                      onChange={(e) => setSelectedContainer(e.target.value)}
                  >
                      {containers.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <p className="mt-3 text-xs text-gray-500">
                      This will open a new terminal window on your local machine attached to the container.
                  </p>
              </div>

              <div className="flex justify-end gap-3">
                  <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:bg-gray-800 rounded text-sm">Cancel</button>
                  <button
                      onClick={handleConnect}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium shadow-lg shadow-blue-900/20"
                  >
                      Open Terminal
                  </button>
              </div>
          </div>
      </div>
    );
};
