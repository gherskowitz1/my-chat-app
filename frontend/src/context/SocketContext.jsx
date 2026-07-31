import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [statusMap, setStatusMap] = useState(new Map()); // userId -> 'online' | 'away' | 'offline'

  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnected(false);
      }
      return;
    }

    const token = localStorage.getItem('token');
    const socket = io(import.meta.env.VITE_API_URL || '', {
      auth: { token },
      path: '/socket.io',
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    // Attached in this same synchronous block, before the socket has even
    // finished its handshake — the server can emit presence:snapshot the
    // instant it accepts the connection, which can otherwise race a listener
    // that only gets registered after a React re-render (e.g. one that
    // waited for `connected` to flip true, or for a child component's own
    // effect to run). Subscribing here means we're never too late.
    const onSnapshot = (entries) => {
      setStatusMap(new Map(entries.map(({ userId, status }) => [userId, status])));
    };
    const onUpdate = ({ userId, status }) => {
      setStatusMap((prev) => {
        const next = new Map(prev);
        if (status === 'offline') next.delete(userId);
        else next.set(userId, status);
        return next;
      });
    };
    socket.on('presence:snapshot', onSnapshot);
    socket.on('presence:update', onUpdate);

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  // Manually overrides how this user's presence appears to everyone else —
  // sticky until they fully disconnect (close the tab/app), at which point
  // the server clears the override and automatic detection resumes.
  const setStatus = useCallback((status) => {
    socketRef.current?.emit('presence:setStatus', status);
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, statusMap, setStatus }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
