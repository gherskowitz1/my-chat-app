import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { api } from '../services/api';
import { buildEmojiMap } from '../utils/customEmoji';

const DEFAULT_SERVER = '00000000-0000-0000-0000-000000000001';

const CustomEmojiContext = createContext({ emoji: [], emojiByName: new Map(), refresh: () => {} });

// Single-server app, so this fetches once for the whole app rather than
// being scoped per-server. Used both in the main chat UI (SocketProvider
// present) and the standalone admin dashboard (no SocketProvider) — useSocket
// safely returns null there, so the live-refresh listener is just skipped.
export function CustomEmojiProvider({ children }) {
  const { user } = useAuth();
  const socketCtx = useSocket();
  const socket = socketCtx?.socket;
  const [emoji, setEmoji] = useState([]);

  const refresh = useCallback(() => {
    if (!user) return;
    api.get(`/servers/${DEFAULT_SERVER}/emoji`).then(setEmoji).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) {
      setEmoji([]);
      return;
    }
    refresh();
  }, [user, refresh]);

  useEffect(() => {
    if (!socket) return;
    socket.on('emoji:updated', refresh);
    return () => socket.off('emoji:updated', refresh);
  }, [socket, refresh]);

  return (
    <CustomEmojiContext.Provider value={{ emoji, emojiByName: buildEmojiMap(emoji), refresh }}>
      {children}
    </CustomEmojiContext.Provider>
  );
}

export const useCustomEmoji = () => useContext(CustomEmojiContext);
