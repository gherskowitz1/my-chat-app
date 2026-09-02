import React, { useEffect, useState, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import { useGameTracking } from '../hooks/useGameTracking';
import Avatar from './Avatar';
import styles from './AdminPanel.module.css';

const POLL_OPTIONS = [
  { minutes: 1, label: 'Every 1 minute' },
  { minutes: 5, label: 'Every 5 minutes' },
  { minutes: 15, label: 'Every 15 minutes' },
  { minutes: 30, label: 'Every 30 minutes' },
  { minutes: 60, label: 'Every 1 hour' },
  { minutes: 180, label: 'Every 3 hours' },
  { minutes: 360, label: 'Every 6 hours' },
  { minutes: 720, label: 'Every 12 hours' },
  { minutes: 1440, label: 'Every 24 hours' },
];

const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

async function patch(path, body) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function del(path) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function get(path) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const DEFAULT_SERVER = '00000000-0000-0000-0000-000000000001';

export default function AdminPanel({ onClose, onServerRenamed, onChannelRenamed }) {
  const { socket } = useSocket();
  const [tab, setTab] = useState('server');
  const [server, setServer] = useState(null);
  const [channels, setChannels] = useState([]);
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { text, type }

  const flash = (text, type = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };

  const load = useCallback(async () => {
    const [srv, chs, usrs] = await Promise.all([
      get(`/servers/${DEFAULT_SERVER}`),
      get(`/servers/${DEFAULT_SERVER}/channels`),
      get('/admin/users'),
    ]);
    setServer(srv);
    setChannels(chs);
    setUsers(usrs);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Server name ───────────────────────────────────────────
  const saveServer = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await patch(`/servers/${DEFAULT_SERVER}`, {
        name: server.name,
        description: server.description,
        textCategoryLabel: server.text_category_label,
        voiceCategoryLabel: server.voice_category_label,
      });
      onServerRenamed(updated);
      flash('Server updated!');
    } catch (err) {
      flash(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Channel rename ────────────────────────────────────────
  const [editingChannel, setEditingChannel] = useState(null); // { id, name, type }

  const saveChannel = async (channelId, newName, type) => {
    try {
      const res = await patch(`/channels/${channelId}`, { name: newName, type });
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, name: res.name } : c));
      onChannelRenamed(res);
      socket?.emit('channel:renamed', res);
      setEditingChannel(null);
      flash('Channel renamed!');
    } catch (err) {
      flash(err.message, 'error');
    }
  };

  // ── Channel access (private allow-list) ─────────────────────
  const [managingAccess, setManagingAccess] = useState(null); // channelId
  const [accessDraft, setAccessDraft] = useState({ isPrivate: false, memberIds: [] });

  const openAccessManager = async (channel) => {
    try {
      const memberIds = channel.is_private ? await get(`/channels/${channel.id}/members`) : [];
      setAccessDraft({ isPrivate: !!channel.is_private, memberIds });
      setManagingAccess(channel.id);
    } catch (err) {
      flash(err.message, 'error');
    }
  };

  const toggleAccessMember = (userId) => {
    setAccessDraft(prev => ({
      ...prev,
      memberIds: prev.memberIds.includes(userId)
        ? prev.memberIds.filter(id => id !== userId)
        : [...prev.memberIds, userId],
    }));
  };

  const saveAccess = async (channelId) => {
    try {
      const res = await patch(`/channels/${channelId}/access`, {
        isPrivate: accessDraft.isPrivate,
        memberIds: accessDraft.memberIds,
      });
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, is_private: res.is_private } : c));
      socket?.emit('channel:members-updated');
      setManagingAccess(null);
      flash('Channel access updated!');
    } catch (err) {
      flash(err.message, 'error');
    }
  };

  // ── User role ─────────────────────────────────────────────
  const toggleRole = async (user) => {
    const newRole = user.role === 'admin' ? 'member' : 'admin';
    try {
      const res = await patch(`/admin/users/${user.id}/role`, { role: newRole });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
      flash(`${user.username} is now ${newRole}`);
    } catch (err) {
      flash(err.message, 'error');
    }
  };

  const deleteUser = async (user) => {
    if (!confirm(`Remove ${user.username} from the server? This cannot be undone.`)) return;
    try {
      await del(`/admin/users/${user.id}`);
      setUsers(prev => prev.filter(u => u.id !== user.id));
      flash(`${user.username} removed`);
    } catch (err) {
      flash(err.message, 'error');
    }
  };

  const textChannels = channels.filter(c => c.type === 'text');
  const voiceChannels = channels.filter(c => c.type === 'voice');

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.sidebar}>
          <div className={styles.sidebarTitle}>Admin Settings</div>
          {['server', 'channels', 'games', 'users'].map(t => (
            <button key={t} className={`${styles.tabBtn} ${tab === t ? styles.active : ''}`} onClick={() => setTab(t)}>
              {t === 'server' && <ServerIcon />}
              {t === 'channels' && <ChannelIcon />}
              {t === 'games' && <GameIcon />}
              {t === 'users' && <UsersIcon />}
              {t === 'games' ? 'Games' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
          <div className={styles.spacer} />
          <button className={styles.closeBtn} onClick={onClose}>✕ Close</button>
        </div>

        <div className={styles.content}>
          {msg && <div className={`${styles.flash} ${styles[msg.type]}`}>{msg.text}</div>}

          {/* SERVER TAB */}
          {tab === 'server' && server && (
            <div className={styles.section}>
              <h2>Server Settings</h2>
              <p className={styles.subtitle}>Customize your server's name and description.</p>

              <form onSubmit={saveServer} className={styles.form}>
                <label className={styles.field}>
                  <span>SERVER NAME</span>
                  <input
                    value={server.name}
                    onChange={e => setServer(s => ({ ...s, name: e.target.value }))}
                    maxLength={100}
                    required
                  />
                </label>
                <label className={styles.field}>
                  <span>DESCRIPTION (optional)</span>
                  <input
                    value={server.description || ''}
                    onChange={e => setServer(s => ({ ...s, description: e.target.value }))}
                    maxLength={255}
                    placeholder="What's this server about?"
                  />
                </label>
                <label className={styles.field}>
                  <span>TEXT CHANNELS SECTION LABEL</span>
                  <input
                    value={server.text_category_label || ''}
                    onChange={e => setServer(s => ({ ...s, text_category_label: e.target.value }))}
                    maxLength={100}
                    placeholder="TEXT CHANNELS"
                  />
                </label>
                <label className={styles.field}>
                  <span>VOICE CHANNELS SECTION LABEL</span>
                  <input
                    value={server.voice_category_label || ''}
                    onChange={e => setServer(s => ({ ...s, voice_category_label: e.target.value }))}
                    maxLength={100}
                    placeholder="VOICE CHANNELS"
                  />
                </label>
                <button type="submit" className={styles.saveBtn} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </form>
            </div>
          )}

          {/* CHANNELS TAB */}
          {tab === 'channels' && (
            <div className={styles.section}>
              <h2>Manage Channels</h2>
              <p className={styles.subtitle}>Rename channels by clicking the edit icon, or manage who can see a private one via the lock icon.</p>

              <div className={styles.channelGroup}>
                <div className={styles.groupLabel}>TEXT CHANNELS</div>
                {textChannels.map(ch => (
                  <React.Fragment key={ch.id}>
                    <ChannelRow
                      channel={ch}
                      editing={editingChannel?.id === ch.id}
                      onEdit={() => setEditingChannel({ ...ch })}
                      onSave={(name) => saveChannel(ch.id, name, ch.type)}
                      onCancel={() => setEditingChannel(null)}
                      onManageAccess={() => openAccessManager(ch)}
                      prefix="#"
                    />
                    {managingAccess === ch.id && (
                      <AccessPanel
                        users={users}
                        draft={accessDraft}
                        onTogglePrivate={(v) => setAccessDraft(prev => ({ ...prev, isPrivate: v }))}
                        onToggleMember={toggleAccessMember}
                        onSave={() => saveAccess(ch.id)}
                        onCancel={() => setManagingAccess(null)}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>

              <div className={styles.channelGroup}>
                <div className={styles.groupLabel}>VOICE CHANNELS</div>
                {voiceChannels.map(ch => (
                  <React.Fragment key={ch.id}>
                    <ChannelRow
                      channel={ch}
                      editing={editingChannel?.id === ch.id}
                      onEdit={() => setEditingChannel({ ...ch })}
                      onSave={(name) => saveChannel(ch.id, name, ch.type)}
                      onCancel={() => setEditingChannel(null)}
                      onManageAccess={() => openAccessManager(ch)}
                      prefix="🔊"
                    />
                    {managingAccess === ch.id && (
                      <AccessPanel
                        users={users}
                        draft={accessDraft}
                        onTogglePrivate={(v) => setAccessDraft(prev => ({ ...prev, isPrivate: v }))}
                        onToggleMember={toggleAccessMember}
                        onSave={() => saveAccess(ch.id)}
                        onCancel={() => setManagingAccess(null)}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>

              <p className={styles.hint}>To add or delete channels, use the + and trash icons in the main sidebar.</p>
            </div>
          )}

          {/* GAMES TAB (PatchBot) */}
          {tab === 'games' && (
            <div className={styles.section}>
              <h2>Games (PatchBot)</h2>
              <p className={styles.subtitle}>Pick which channel gets Steam patch notes for each tracked game, and how often PatchBot checks for updates.</p>
              <GamesPanel channels={channels.filter(c => c.type === 'text')} flash={flash} />
            </div>
          )}

          {/* USERS TAB */}
          {tab === 'users' && (
            <div className={styles.section}>
              <h2>Manage Users</h2>
              <p className={styles.subtitle}>{users.length} registered {users.length === 1 ? 'user' : 'users'}</p>

              <div className={styles.userList}>
                {users.map(u => (
                  <div key={u.id} className={styles.userRow}>
                    <Avatar url={u.avatar_url} color={u.avatar_color} username={u.username} className={styles.avatar} />
                    <div className={styles.userInfo}>
                      <span className={styles.username}>{u.username}</span>
                      <span className={styles.email}>{u.email}</span>
                    </div>
                    <div className={styles.userActions}>
                      <span className={`${styles.badge} ${u.role === 'admin' ? styles.adminBadge : styles.memberBadge}`}>
                        {u.role}
                      </span>
                      <button
                        className={styles.roleBtn}
                        onClick={() => toggleRole(u)}
                        title={u.role === 'admin' ? 'Revoke admin' : 'Make admin'}
                      >
                        {u.role === 'admin' ? '↓ Member' : '↑ Admin'}
                      </button>
                      <button
                        className={styles.deleteUserBtn}
                        onClick={() => deleteUser(u)}
                        title="Remove user"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChannelRow({ channel, editing, onEdit, onSave, onCancel, onManageAccess, prefix }) {
  const [name, setName] = useState(channel.name);

  useEffect(() => { setName(channel.name); }, [channel.name]);

  if (editing) {
    return (
      <div className={styles.channelEditRow}>
        <span className={styles.prefix}>{prefix}</span>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          className={styles.channelInput}
          onKeyDown={e => { if (e.key === 'Enter') onSave(name); if (e.key === 'Escape') onCancel(); }}
        />
        <button className={styles.saveSmall} onClick={() => onSave(name)}>Save</button>
        <button className={styles.cancelSmall} onClick={onCancel}>Cancel</button>
      </div>
    );
  }

  return (
    <div className={styles.channelRow}>
      <span className={styles.prefix}>{prefix}</span>
      <span className={styles.channelName}>{channel.name}</span>
      {channel.is_private && <span className={styles.privateBadge}>Private</span>}
      <button className={styles.editBtn} onClick={onManageAccess} title="Manage access">
        <LockIcon />
      </button>
      <button className={styles.editBtn} onClick={onEdit} title="Rename">
        <EditIcon />
      </button>
    </div>
  );
}

function AccessPanel({ users, draft, onTogglePrivate, onToggleMember, onSave, onCancel }) {
  return (
    <div className={styles.accessPanel}>
      <label className={styles.accessPrivateToggle}>
        <input type="checkbox" checked={draft.isPrivate} onChange={e => onTogglePrivate(e.target.checked)} />
        <span>Private — hidden from everyone except the members picked below</span>
      </label>
      {draft.isPrivate && (
        <div className={styles.accessMemberList}>
          {users.length === 0 && <p className={styles.hint}>No other users yet.</p>}
          {users.map(u => (
            <label key={u.id} className={styles.accessMemberOption}>
              <input
                type="checkbox"
                checked={draft.memberIds.includes(u.id)}
                onChange={() => onToggleMember(u.id)}
              />
              <span>{u.username}</span>
            </label>
          ))}
        </div>
      )}
      <div className={styles.createActions}>
        <button type="button" className={styles.cancelSmall} onClick={onCancel}>Cancel</button>
        <button type="button" className={styles.saveSmall} onClick={onSave}>Save Access</button>
      </div>
    </div>
  );
}

function GamesPanel({ channels, flash }) {
  const [selectedId, setSelectedId] = useState(channels[0]?.id || '');
  const [pollMinutes, setPollMinutes] = useState(180);
  const [savingFreq, setSavingFreq] = useState(false);

  useEffect(() => {
    if (!selectedId && channels[0]) setSelectedId(channels[0].id);
  }, [channels, selectedId]);

  useEffect(() => {
    get('/admin/patchbot/settings').then(s => {
      if (s?.pollIntervalMinutes) setPollMinutes(s.pollIntervalMinutes);
    }).catch(() => {});
  }, []);

  const saveFrequency = async () => {
    setSavingFreq(true);
    try {
      await patch('/admin/patchbot/settings', { pollIntervalMinutes: pollMinutes });
      flash('Check frequency updated');
    } catch (err) {
      flash(err.message, 'error');
    } finally {
      setSavingFreq(false);
    }
  };

  const selectedChannel = channels.find(c => c.id === selectedId);

  return (
    <div>
      <div className={styles.channelGroup}>
        <div className={styles.groupLabel}>CHECK FREQUENCY</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={pollMinutes}
            onChange={e => setPollMinutes(Number(e.target.value))}
            style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 14 }}
          >
            {POLL_OPTIONS.map(o => <option key={o.minutes} value={o.minutes}>{o.label}</option>)}
          </select>
          <button className={styles.saveSmall} onClick={saveFrequency} disabled={savingFreq}>
            {savingFreq ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className={styles.channelGroup}>
        <div className={styles.groupLabel}>TRACKED GAMES</div>
        {channels.length === 0 && <p className={styles.hint}>No text channels to track games in yet.</p>}
        {channels.length > 0 && (
          <>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 14, marginBottom: 12, width: '100%', maxWidth: 320 }}
            >
              {channels.map(c => <option key={c.id} value={c.id}>#{c.name}{c.is_private ? ' (private)' : ''}</option>)}
            </select>
            {selectedChannel && <ChannelGameList channel={selectedChannel} />}
          </>
        )}
      </div>
    </div>
  );
}

function ChannelGameList({ channel }) {
  const { games, loading, query, setQuery, results, searching, error, addGame, removeGame, alreadyTracked } =
    useGameTracking(channel.id, true);

  return (
    <div>
      <input
        className={styles.channelInput}
        style={{ width: '100%', maxWidth: 320, marginBottom: 10, padding: '8px 10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}
        placeholder="Search for a game on Steam…"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {error && <p className={styles.hint} style={{ color: 'var(--red)' }}>{error}</p>}

      {query.trim() && (
        <div style={{ marginBottom: 12 }}>
          {searching && <p className={styles.hint}>Searching…</p>}
          {!searching && results.length === 0 && <p className={styles.hint}>No matches.</p>}
          {!searching && results.map(r => (
            <div key={r.appId} className={styles.channelRow}>
              <span className={styles.channelName}>{r.name}</span>
              <button className={styles.saveSmall} disabled={alreadyTracked(r.appId)} onClick={() => addGame(r)}>
                {alreadyTracked(r.appId) ? 'Tracked' : 'Add'}
              </button>
            </div>
          ))}
        </div>
      )}

      {loading && <p className={styles.hint}>Loading…</p>}
      {!loading && games.length === 0 && <p className={styles.hint}>No games tracked in #{channel.name} yet.</p>}
      {games.map(g => (
        <div key={g.id} className={styles.channelRow}>
          <span className={styles.channelName}>{g.name}</span>
          <button className={styles.deleteBtn} style={{ opacity: 1 }} onClick={() => removeGame(g.id)} title="Stop tracking">
            <TrashIcon />
          </button>
        </div>
      ))}
    </div>
  );
}

const ServerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
  </svg>
);
const ChannelIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
  </svg>
);
const UsersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
  </svg>
);
const GameIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.5 6h-11C4.57 6 3 7.57 3 9.5v5C3 16.43 4.57 18 6.5 18c1.14 0 2.16-.55 2.8-1.4l1-1.33h3.4l1 1.33c.64.85 1.66 1.4 2.8 1.4 1.93 0 3.5-1.57 3.5-3.5v-5C21 7.57 19.43 6 17.5 6zM11 12H9.5v1.5H8V12H6.5v-1.5H8V9h1.5v1.5H11V12zm4.5 1a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm2-3a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>
  </svg>
);
const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12z"/>
  </svg>
);
const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm0 2a3 3 0 0 1 3 3v3H9V6a3 3 0 0 1 3-3z"/>
  </svg>
);
