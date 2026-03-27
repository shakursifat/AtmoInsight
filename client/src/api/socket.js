import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

let globalSocket = null;

export function useSocket() {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!globalSocket) {
      globalSocket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000');
    }
    setSocket(globalSocket);

    return () => {
      // we keep it alive at app level, typically don't disconnect until unmount all
    };
  }, []);

  return socket || globalSocket;
}
