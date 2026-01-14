import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../store';
import { Terminal } from 'lucide-react';

export const TerminalPanel: React.FC = () => {
    const { state } = useStore();
    const bottomRef = React.useRef<HTMLDivElement>(null);
    
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
            zIndex: 51,
            right: state.drawerOpen ? `${localStorage.getItem('drawerWidth') || '600'}px` : '0'
          }}
        />
        
        <div className="flex items-center justify-between px-4 py-1.5 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center text-gray-400 text-xs font-bold uppercase tracking-wider">
             <Terminal size={12} className="mr-2" /> Terminal
          </div>
          <div className="flex space-x-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-3 text-gray-300 font-mono text-xs leading-relaxed">
          {state.terminalOutput.map((line, i) => (
            <div key={i} className="mb-1 whitespace-pre-wrap break-all">{line.startsWith('>') ? <span className="text-blue-400 font-bold mr-2">$</span> : ''}{line.startsWith('>') ? <span className="text-yellow-100">{line.substring(2)}</span> : line}</div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    );
};
