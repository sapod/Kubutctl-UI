import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../store';
import { Terminal, FileText, ExternalLink, Plus, X } from 'lucide-react';
import { LogsPanel } from './LogsPanel';

export const TerminalPanel: React.FC = () => {
    const { state, dispatch } = useStore();
    const bottomRef = React.useRef<HTMLDivElement>(null);

    // Tab state - persist across refreshes but reset on fresh app start
    const [activeTab, setActiveTab] = useState<'terminal' | 'logs'>('terminal');

    // Track if we've completed initial restoration (to prevent saving during init)
    const hasRestoredRef = useRef(false);
    // Track previous logsTarget to detect NEW clicks vs existing state
    const prevLogsTargetRef = useRef<typeof state.logsTarget>(null);

    // Logs window state
    const [isLogsMode, setIsLogsMode] = useState<'docked' | 'window'>('docked');

    // Terminal resizing
    const [terminalHeight, setTerminalHeight] = useState(() => {
        const saved = localStorage.getItem('terminalHeight');
        return saved ? parseInt(saved) : 192; // Default 192px (h-48)
    });
    const [isResizing, setIsResizing] = useState(false);
    const resizingRef = useRef(false);
    const startYRef = useRef(0);
    const startHeightRef = useRef(0);

    // Restore activeTab from localStorage after store is initialized
    useEffect(() => {
        if (!state.isStoreInitialized) {
            return;
        }

        const saved = localStorage.getItem('terminalActiveTab');
        if (saved === 'logs' || saved === 'terminal') {
            setActiveTab(saved);
        }
        hasRestoredRef.current = true;
    }, [state.isStoreInitialized]);

    // Save activeTab to localStorage whenever it changes (but only after restoration)
    useEffect(() => {
        if (hasRestoredRef.current) {
            localStorage.setItem('terminalActiveTab', activeTab);
        }
    }, [activeTab]);

    useEffect(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [state.terminalOutput]);

    // Handle logs target from state (when LOGS button is clicked in drawer)
    // Only react to NEW logsTarget clicks, not existing state on refresh
    const isFirstMountRef = useRef(true);

    useEffect(() => {
        // Skip on first mount - we only want to react to user clicks after page load
        if (isFirstMountRef.current) {
            isFirstMountRef.current = false;
            prevLogsTargetRef.current = state.logsTarget;
            return;
        }

        // Check if this is a NEW logsTarget (different from previous)
        const isNewTarget = state.logsTarget !== null &&
                           state.logsTarget !== prevLogsTargetRef.current;

        if (isNewTarget) {
            setActiveTab('logs');
            setIsLogsMode('docked');

            if (state.drawerOpen) {
                dispatch({ type: 'CLOSE_DRAWER' });
            }
        }

        prevLogsTargetRef.current = state.logsTarget;
    }, [state.logsTarget]);

    // Handle opening logs window
    const handleUndockLogs = async () => {
        const electron = (window as any).electron;
        if (electron?.openLogsWindow) {
            try {
                await electron.openLogsWindow(1000, 600);
                setIsLogsMode('window');
                setActiveTab('terminal'); // Switch to terminal tab when undocking
            } catch (error) {
                console.error('Failed to open logs window:', error);
            }
        }
    };


    // Listen for logs window closed event
    useEffect(() => {
        const electron = (window as any).electron;
        if (electron?.onLogsWindowClosed) {
            electron.onLogsWindowClosed(() => {
                setIsLogsMode('docked');
                setActiveTab('logs'); // Switch back to logs tab when window is closed
            });
        }
    }, []);

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
            zIndex: 200,
            right: state.drawerOpen ? `${localStorage.getItem('drawerWidth') || '600'}px` : '0'
          }}
        />

        {/* Header with tabs */}
        <div className="flex items-center justify-between px-4 py-1.5 bg-gray-900 border-b border-gray-800 z-[100]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('terminal')}
              className={`flex items-center text-xs font-bold uppercase tracking-wider transition-colors ${
                activeTab === 'terminal' || isLogsMode === 'window' ? 'text-blue-400' : 'text-gray-400 hover:text-gray-300'
              }`}
              title="Terminal output"
            >
              <Terminal size={12} className="mr-2" /> Terminal
            </button>

            {/* Logs tabs - only show when docked (not when logs are in separate window) */}
            {isLogsMode === 'docked' && (
              <div className="flex items-stretch gap-1 ml-2 bg-gray-700 rounded-md px-1 py-0.5">
                {state.logsTabs.map((tab, index) => (
                  <div key={tab.id} className="flex items-stretch">
                    <button
                      onClick={() => {
                        setActiveTab('logs');
                        dispatch({ type: 'SET_ACTIVE_LOGS_TAB', payload: tab.id });
                      }}
                      className={`flex items-center text-xs font-bold uppercase tracking-wider transition-colors px-2 ${
                        state.logsTabs.length > 1 ? 'rounded-l' : 'rounded'
                      } ${
                        activeTab === 'logs' && state.activeLogsTabId === tab.id 
                          ? 'text-blue-400 bg-gray-900' 
                          : 'text-gray-400 hover:text-gray-300 hover:bg-gray-600'
                      }`}
                      title={tab.selectedDeployment || `Logs ${index === 0 ? '' : index + 1}`.trim()}
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
                          if (state.activeLogsTabId === tab.id) {
                            setActiveTab('logs');
                          }
                        }}
                        className={`flex items-center px-1 text-gray-500 hover:text-red-400 hover:bg-gray-600 rounded-r transition-colors ${
                          activeTab === 'logs' && state.activeLogsTabId === tab.id ? 'bg-gray-900' : ''
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
                    onClick={() => {
                      dispatch({ type: 'ADD_LOGS_TAB' });
                      setActiveTab('logs');
                    }}
                    className="flex items-center px-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                    title="Add new logs tab (max 3)"
                  >
                    <Plus size={12} />
                  </button>
                )}

                {/* Undock button when logs tab is active */}
                {activeTab === 'logs' && (
                  <button
                    onClick={handleUndockLogs}
                    className="flex items-center px-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors ml-1 border-l border-gray-600 pl-2"
                    title="Open logs in separate window"
                  >
                    <ExternalLink size={12} />
                  </button>
                )}
              </div>
            )}
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

        {/* Logs content - render active tab's LogsPanel */}
        {activeTab === 'logs' && isLogsMode === 'docked' && (
          <LogsPanel tabId={state.activeLogsTabId} />
        )}
      </div>
    );
};

