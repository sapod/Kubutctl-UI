import React, { useEffect } from 'react';
import { useStore } from '../store';
import { Terminal } from 'lucide-react';

export const TerminalPanel: React.FC = () => {
    const { state } = useStore();
    const bottomRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [state.terminalOutput]);

    return (
      <div className="h-48 bg-gray-950 border-t border-gray-800 flex flex-col font-mono text-sm shadow-inner">
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
