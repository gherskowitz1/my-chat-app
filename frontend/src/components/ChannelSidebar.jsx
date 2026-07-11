import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import VoiceParticipants from './VoiceParticipants';
const VoiceChannel = lazy(() => import('./VoiceChannel'));
import styles from './ChannelSidebar.module.css';

export default function ChannelSidebar({ serverId, serverName, activeChannel, onChannelSelect }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [channels, setChannels] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('text');
  const [activeVoiceChannel, setActiveVoiceChannel] = useState(null);

  const fetchChannels = useCallback(async () => {
    try {
      const data = await api.get(`/servers/${serverId}/channels`);
      setChannels(data);
    } catch {}
  }, [serverId]);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  useEffect(() => {
    if (!socket) return;
    const onCreated = (ch) => setChannels((prev) => [...prev, ch]);
    const onDeleted = (id) => {
      setChannels((prev) => prev.filter((c) => c.id !== id));
      if (activeChannel?.id === id) onChannelSelect(null);
    };
    const onRenamed = (ch) => setChannels((prev) => prev.map((c) => c.id === ch.id ? { ...c, name: ch.name } : c));
    socket.on('channel:created', onCreated);
    socket.on('channel:deleted', onDeleted);
    socket.on('channel:renamed', onRenamed);
    return () => {
      socket.off('channel:created', onCreated);
      socket.off('channel:deleted', onDeleted);
      socket.off('channel:renamed', onRenamed);
    };
  }, [socket, activeChannel, onChannelSelect]);

  const createChannel = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const ch = await api.post(`/servers/${serverId}/channels`, { name: newName, type: newType });
      setChannels((prev) => [...prev, ch]);
      socket?.emit('channel:created', ch);
      setNewName('');
      setShowCreate(false);
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteChannel = async (e, channelId) => {
    e.stopPropagation();
    if (!confirm('Delete this channel?')) return;
    try {
      await api.delete(`/channels/${channelId}`);
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
      socket?.emit('channel:deleted', channelId);
      if (activeChannel?.id === channelId) onChannelSelect(null);
    } catch {}
  };

  const textChannels = channels.filter((c) => c.type === 'text');
  const voiceChannels = channels.filter((c) => c.type === 'voice');

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h2>{serverName || 'General Server'}</h2>
      </div>

      <div className={styles.channels}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span>TEXT CHANNELS</span>
            {user?.role === 'admin' && (
              <button className={styles.addBtn} onClick={() => { setShowCreate(true); setNewType('text'); }} title="Add channel">+</button>
            )}
          </div>
          {textChannels.map((ch) => (
            <div
              key={ch.id}
              className={`${styles.channel} ${activeChannel?.id === ch.id ? styles.active : ''}`}
              onClick={() => onChannelSelect(ch)}
            >
              <span className={styles.hash}>#</span>
              <span className={styles.name}>{ch.name}</span>
              {user?.role === 'admin' && (
                <button className={styles.deleteBtn} onClick={(e) => deleteChannel(e, ch.id)} title="Delete">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12z"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span>VOICE CHANNELS</span>
            {user?.role === 'admin' && (
              <button className={styles.addBtn} onClick={() => { setShowCreate(true); setNewType('voice'); }} title="Add voice channel">+</button>
            )}
          </div>
          {voiceChannels.map((ch) => (
            <div key={ch.id} className={styles.voiceChannelWrapper}>
              <div
                className={`${styles.channel} ${activeVoiceChannel?.id === ch.id ? styles.activeVoice : ''}`}
                onClick={() => setActiveVoiceChannel(activeVoiceChannel?.id === ch.id ? null : ch)}
              >
                <svg className={styles.voiceIcon} width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
                  <path d="M19 10a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V21H9v2h6v-2h-2v-2.06A9 9 0 0 0 21 10h-2z"/>
                </svg>
                <span className={styles.name}>{ch.name}</span>
                {user?.role === 'admin' && (
                  <button className={styles.deleteBtn} onClick={(e) => deleteChannel(e, ch.id)} title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12z"/>
                    </svg>
                  </button>
                )}
              </div>
              {/* Always show who's in the voice channel */}
              {activeVoiceChannel?.id !== ch.id && (
                <VoiceParticipants channelId={ch.id} />
              )}
              {activeVoiceChannel?.id === ch.id && (
                <Suspense fallback={<div style={{padding:'8px 16px',fontSize:12,color:'var(--text-muted)'}}>Loading…</div>}>
                  <VoiceChannel channel={ch} onLeave={() => setActiveVoiceChannel(null)} />
                </Suspense>
              )}
            </div>
          ))}
        </div>
      </div>

      {showCreate && user?.role === 'admin' && (
        <div className={styles.createOverlay} onClick={() => setShowCreate(false)}>
          <form className={styles.createForm} onSubmit={createChannel} onClick={(e) => e.stopPropagation()}>
            <h3>Create {newType === 'text' ? 'Text' : 'Voice'} Channel</h3>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={newType === 'text' ? 'new-channel' : 'Voice Chat'}
              className={styles.input}
            />
            <div className={styles.createActions}>
              <button type="button" onClick={() => setShowCreate(false)} className={styles.cancelBtn}>Cancel</button>
              <button type="submit" className={styles.createBtn}>Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
