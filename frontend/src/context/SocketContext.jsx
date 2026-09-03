import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { getPending, removePending } from '../utils/outbox';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [statusMap, setStatusMap] = useState(new Map()); // userId -> 'online' | 'away' | 'offline'
  const [awaySinceMap, setAwaySinceMap] = useState(new Map()); // userId -> ms timestamp status became 'away'
  const [statusTextMap, setStatusTextMap] = useState(new Map()); // userId -> custom status text, only for live updates after initial load

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

    // Retries every still-pending outbox entry on every successful connect —
    // including the very first one after a fresh page load, which is exactly
    // what makes a message "typed during a blip" survive a reload: it was
    // written to localStorage before the emit attempt, and gets replayed
    // here once there's a connection again, wherever that connection comes
    // from. Each entry carries its own clientId, so a message the server
    // already received (the resend was actually unnecessary) is deduped
    // there rather than appearing twice.
    const flushOutbox = () => {
      getPending().forEach((entry) => {
        const event = entry.type === 'channel' ? 'message:send' : 'dm:send';
        const payload = entry.type === 'channel'
          ? { channelId: entry.targetId, content: entry.content, replyToId: entry.replyToId, clientId: entry.clientId }
          : { conversationId: entry.targetId, content: entry.content, replyToId: entry.replyToId, clientId: entry.clientId };
        socket.emit(event, payload, (res) => {
          if (!res) return; // no ack (still offline) — leave it queued for the next connect
          if (res.success) {
            removePending(entry.clientId);
            window.dispatchEvent(new CustomEvent('outbox:resolved', {
              detail: { clientId: entry.clientId, message: res.message, type: entry.type, targetId: entry.targetId },
            }));
          } else {
            // Rejected outright (e.g. access revoked) rather than just
            // undelivered — stop retrying it forever.
            removePending(entry.clientId);
            window.dispatchEvent(new CustomEvent('outbox:failed', {
              detail: { clientId: entry.clientId, error: res.error, type: entry.type, targetId: entry.targetId },
            }));
          }
        });
      });
    };

    socket.on('connect', () => { setConnected(true); flushOutbox(); });
    socket.on('disconnect', () => setConnected(false));

    // Attached in this same synchronous block, before the socket has even
    // finished its handshake — the server can emit presence:snapshot the
    // instant it accepts the connection, which can otherwise race a listener
    // that only gets registered after a React re-render (e.g. one that
    // waited for `connected` to flip true, or for a child component's own
    // effect to run). Subscribing here means we're never too late.
    const onSnapshot = (entries) => {
      setStatusMap(new Map(entries.map(({ userId, status }) => [userId, status])));
      setAwaySinceMap(new Map(entries.filter((e) => e.awaySince).map(({ userId, awaySince }) => [userId, awaySince])));
    };
    const onUpdate = ({ userId, status, awaySince }) => {
      setStatusMap((prev) => {
        const next = new Map(prev);
        if (status === 'offline') next.delete(userId);
        else next.set(userId, status);
        return next;
      });
      setAwaySinceMap((prev) => {
        if (status === 'away' && awaySince) {
          const next = new Map(prev);
          next.set(userId, awaySince);
          return next;
        }
        if (!prev.has(userId)) return prev;
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    };
    const onStatusText = ({ userId, statusText }) => {
      setStatusTextMap((prev) => {
        const next = new Map(prev);
        next.set(userId, statusText);
        return next;
      });
    };
    socket.on('presence:snapshot', onSnapshot);
    socket.on('presence:update', onUpdate);
    socket.on('presence:statusText', onStatusText);

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
    <SocketContext.Provider value={{ socket: socketRef.current, connected, statusMap, awaySinceMap, statusTextMap, setStatus }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
