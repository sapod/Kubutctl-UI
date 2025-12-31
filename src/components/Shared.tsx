import React, { useEffect } from 'react';
import { Activity, CheckCircle, AlertTriangle, ShieldAlert, X } from 'lucide-react';
import { ResourceStatus, AppState } from '../types';
import { useStore } from '../store';

// --- Utils ---
export const parseCpu = (value: string): number => {
  if (!value) return 0;
  if (value.endsWith('m')) return parseInt(value.slice(0, -1), 10);
  return parseFloat(value) * 1000;
};

export const parseMemory = (value: string): number => {
  if (!value) return 0;
  const units = {
    Ki: 1024,
    Mi: 1024 * 1024,
    Gi: 1024 * 1024 * 1024,
    Ti: 1024 * 1024 * 1024 * 1024,
    K: 1000,
    M: 1000 * 1000,
    G: 1000 * 1000 * 1000,
  };
  // Regex to split number and unit
  const match = value.match(/^([0-9.]+)([A-Za-z]+)?$/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2];
  if (!unit) return num; // bytes
  return num * (units[unit as keyof typeof units] || 1);
};

export const getAge = (timestamp: string) => {
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
};

// Helper to match selectors
export const isMatch = (labels: Record<string, string> | undefined, selector: Record<string, string> | undefined) => {
    if (!selector || Object.keys(selector).length === 0) return false;
    if (!labels) return false;
    return Object.entries(selector).every(([k, v]) => labels[k] === v);
};

// Helper to resolve backend port name from Service -> Deployment -> Container
export const resolvePortName = (serviceName: string, servicePort: number | string, state: AppState): string => {
    const svc = state.services.find(s => s.name === serviceName);
    if (!svc) return '';

    // If it's already a named port string, return it
    if (typeof servicePort === 'string') {
        return servicePort;
    }

    // 1. Check if the service object has a named port matching the number
    // This is most common for Ingress -> Service -> Port Name references
    const svcPort = svc.ports.find(p => p.port === servicePort);
    if (svcPort && svcPort.name) return svcPort.name;

    // 2. If no name found on service port, try to resolve targetPort to container port name
    let targetPort = servicePort;
    if (svcPort && svcPort.targetPort) {
        if (typeof svcPort.targetPort === 'number') targetPort = svcPort.targetPort;
        if (typeof svcPort.targetPort === 'string') return svcPort.targetPort; // targetPort is often the container port name
    }

    // Not implemented fully deep container lookup here to save performance,
    // usually Service Port Name or Target Port Name is what is needed.

    // Check Pods matching the service.
    const pod = state.pods.find(p => isMatch(p.labels, svc.selector));
    if (pod) {
        for (const c of pod.containers) {
            const cp = c.ports.find(p => p.containerPort === targetPort);
            if (cp && cp.name) return cp.name;
        }
    }

    return '';
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    let colorClass = 'bg-gray-700 text-gray-300';
    let Icon = Activity;

    switch (status) {
      case ResourceStatus.Running:
      case 'Ready':
      case 'Succeeded':
      case 'Active':
      case 'Bound':
      case 'True': // For conditions
      case 'Normal':
        colorClass = 'bg-green-900/40 text-green-400 border border-green-800';
        Icon = CheckCircle;
        break;
      case ResourceStatus.Pending:
      case 'ContainerCreating':
      case 'Connecting':
        colorClass = 'bg-yellow-900/40 text-yellow-400 border border-yellow-800';
        Icon = AlertTriangle;
        break;
      case ResourceStatus.Failed:
      case ResourceStatus.CrashLoopBackOff:
      case 'NotReady':
      case 'Disconnected':
      case 'Terminating':
      case 'Warning':
        colorClass = 'bg-red-900/40 text-red-400 border border-red-800';
        Icon = ShieldAlert;
        break;
      case 'Completed':
      case 'Stopped':
        colorClass = 'bg-gray-600/40 text-gray-300 border border-gray-500';
        Icon = CheckCircle;
        break;
    }

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
        <Icon size={10} className="mr-1.5" />
        {status}
      </span>
    );
};

export const ErrorBanner: React.FC = () => {
    const { state, dispatch } = useStore();

    useEffect(() => {
        if (state.error) {
            const timer = setTimeout(() => {
                dispatch({ type: 'SET_ERROR', payload: null });
            }, 5000); // 5 seconds display
            return () => clearTimeout(timer);
        }
    }, [state.error, dispatch]);

    if (!state.error) return null;

    return (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 bg-red-950 border border-red-500 text-red-100 px-6 py-4 rounded-lg shadow-2xl backdrop-blur-md z-[100] flex items-center gap-4 max-w-2xl animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="p-2 bg-red-900/50 rounded-full">
                <ShieldAlert className="text-red-400" size={24} />
            </div>
            <div className="flex-1">
                <h4 className="font-bold text-red-200 text-sm uppercase tracking-wider mb-1">Error Executing Request</h4>
                <p className="text-sm text-gray-300">{state.error}</p>
            </div>
            <button
                onClick={() => dispatch({ type: 'SET_ERROR', payload: null })}
                className="p-1 hover:bg-red-900/50 rounded text-red-300 hover:text-white transition-colors"
            >
                <X size={20} />
            </button>
        </div>
    );
};
