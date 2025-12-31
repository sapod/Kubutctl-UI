import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

type Props = {
  wsUrl: string;             // e.g., wss://your-backend/exec?ns=default&pod=my-pod&container=app
};

export default function PodTerminal({ wsUrl }: Props) {
  const termRef = useRef<HTMLDivElement | null>(null);
  const term = useRef<Terminal>();
  const fitAddon = useRef<FitAddon>();
  const socket = useRef<WebSocket>();

  useEffect(() => {
    term.current = new Terminal({ cursorBlink: true, fontSize: 14 });
    fitAddon.current = new FitAddon();
    term.current.loadAddon(fitAddon.current);
    term.current.open(termRef.current!);
    fitAddon.current?.fit();

    socket.current = new WebSocket(wsUrl);

    socket.current.onmessage = (evt) => {
      const data = evt.data;
      // backend sends text; if you send binary, handle ArrayBuffer
      term.current?.write(typeof data === 'string' ? data : new TextDecoder().decode(data));
    };

    socket.current.onopen = () => {
      term.current?.write(`\r\nConnected. Opening shell...\r\n`);
      // Send a newline to trigger the shell prompt
      setTimeout(() => socket.current?.send('\n'), 100);
    };

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
    }, 100)

    term.current.onData((data) => {
      // send keystrokes to backend
      socket.current?.send(data);
    });

    const resizeObserver = new ResizeObserver(() => fitAddon.current?.fit());
    resizeObserver.observe(termRef.current!);

    return () => {
      socket.current?.close();
      term.current?.dispose();
      resizeObserver.disconnect();
    };
  }, [wsUrl]);

  return <div style={{ height: '100%', width: '100%' }} ref={termRef} />;
}
