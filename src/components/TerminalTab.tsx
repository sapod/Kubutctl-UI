import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { TerminalTabState } from '../types';

type Props = {
  tab: TerminalTabState;
  backendWsBaseUrl: string;
};

export default function TerminalTab({ tab, backendWsBaseUrl }: Props) {
  const termRef = useRef<HTMLDivElement | null>(null);
  const term = useRef<Terminal>();
  const fitAddon = useRef<FitAddon>();
  const socket = useRef<WebSocket>();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Create terminal only once when component mounts
  useEffect(() => {
    // Create terminal
    term.current = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      theme: {
        background: '#0a0e14',
        foreground: '#d1d5db',
      }
    });
    fitAddon.current = new FitAddon();
    term.current.loadAddon(fitAddon.current);
    term.current.open(termRef.current!);
    fitAddon.current?.fit();

    // Focus the terminal so user can start typing immediately
    setTimeout(() => {
      term.current?.focus();
    }, 100);

    // Build WebSocket URL
    const wsUrl = `${backendWsBaseUrl}/exec?ns=${tab.namespace}&pod=${tab.podName}&container=${tab.container}&shell=${tab.shell}`;
    socket.current = new WebSocket(wsUrl);

    socket.current.onmessage = (evt) => {
      const data = evt.data;
      term.current?.write(typeof data === 'string' ? data : new TextDecoder().decode(data));
    };

    socket.current.onopen = () => {
      term.current?.write(`\r\nConnected to ${tab.podName} (${tab.container})\r\n`);
      // Send a newline to trigger the shell prompt
      setTimeout(() => socket.current?.send('\n'), 100);
    };

    // User input from terminal -> send to backend
    const disposable = term.current.onData((data) => {
      socket.current?.send(data);
    });

    setTimeout(() => {
      if (socket && socket.current) {
        socket.current.onerror = (err) => {
          console.error('WebSocket error:', err);
          term.current?.write(`\r\n[WebSocket Error]\r\n`);
        };

        socket.current.onclose = (evt) => {
          console.log('WebSocket closed:', evt.code, evt.reason);
          term.current?.write(`\r\nDisconnected (${evt.code}${evt.reason ? ': ' + evt.reason : ''}).\r\n`);
        };
      }
    }, 100);

    // Handle window resize
    const handleResize = () => {
      fitAddon.current?.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposable?.dispose();
      socket.current?.close();
      term.current?.dispose();
      window.removeEventListener('resize', handleResize);
    };
  }, [tab.id, tab.namespace, tab.podName, tab.container, tab.shell, backendWsBaseUrl]);

  // Refit terminal when container becomes visible
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new MutationObserver(() => {
      // Check if this terminal is visible
      const isVisible = containerRef.current?.style.display !== 'none';
      if (isVisible && fitAddon.current) {
        // Small delay to ensure layout is complete
        setTimeout(() => {
          fitAddon.current?.fit();
          term.current?.focus();
        }, 10);
      }
    });

    // Observe style changes on the container
    observer.observe(containerRef.current, {
      attributes: true,
      attributeFilter: ['style']
    });

    // Also refit immediately if visible
    if (containerRef.current.style.display !== 'none') {
      setTimeout(() => {
        fitAddon.current?.fit();
      }, 10);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
      {/* Header with workload/pod/container info */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex flex-wrap items-center gap-4 text-xs flex-shrink-0">
        {tab.workloadName && (
          <>
            <span className="text-gray-400 font-medium">Workload:</span>
            <span className="text-gray-200">{tab.workloadName}</span>
          </>
        )}
        <span className="text-gray-400 font-medium">Pod:</span>
        <span className="text-gray-200">{tab.namespace}/{tab.podName}</span>
        <span className="text-gray-400 font-medium">Container:</span>
        <span className="text-gray-200">{tab.container}</span>
      </div>
      {/* Terminal */}
      <div ref={termRef} className="flex-1 w-full overflow-hidden" />
    </div>
  );
}

