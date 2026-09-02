import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar';
import { useGameTracking } from '../hooks/useGameTracking';
import { useCustomEmoji } from '../context/CustomEmojiContext';
import { resizeImageToDataUrl } from '../utils/imageResize';
import { fileToDataUrl } from '../utils/fileToDataUrl';
import styles from './AdminDashboard.module.css';

const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

function authFetch(path, opts = {}) {
  const token = localStorage.getItem('token');
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers },
  }).then(r => r.json());
}

const DEFAULT_SERVER = '00000000-0000-0000-0000-000000000001';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('dashboard');

  useEffect(() => {
    if (user && user.role !== 'admin') navigate('/');
  }, [user, navigate]);

  if (!user || user.role !== 'admin') return null;

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src="/crowsnest.png" width="36" height="36" style={{ borderRadius: 6 }} alt="" />
          <div>
            <div className={styles.brandName}>Crows Nest</div>
            <div className={styles.brandSub}>Admin Panel</div>
          </div>
        </div>

        <nav className={styles.nav}>
          {[
            { id: 'dashboard', label: 'Dashboard', icon: '📊' },
            { id: 'users', label: 'Users', icon: '👥' },
            { id: 'channels', label: 'Channels', icon: '💬' },
            { id: 'games', label: 'Games (PatchBot)', icon: '🎮' },
            { id: 'emoji', label: 'Custom Emoji', icon: '😀' },
            { id: 'sounds', label: 'Soundboard', icon: '🔊' },
            { id: 'messages', label: 'Recent Messages', icon: '📝' },
            { id: 'server', label: 'Server Settings', icon: '⚙️' },
          ].map(t => (
            <button
              key={t.id}
              className={`${styles.navBtn} ${tab === t.id ? styles.active : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
          <a className={styles.navBtn} href="/CrowsNest-Admin-Guide.docx" download>
            <span>📖</span> Admin Guide
          </a>
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.adminBadge}>
            <Avatar url={user.avatar_url} color={user.avatar_color} username={user.username} className={styles.dot} />
            <div>
              <div className={styles.adminName}>{user.username}</div>
              <div className={styles.adminRole}>Administrator</div>
            </div>
          </div>
          <button className={styles.logoutBtn} onClick={logout}>Sign out</button>
        </div>
      </aside>

      <main className={styles.main}>
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'channels' && <ChannelsTab />}
        {tab === 'games' && <GamesTab />}
        {tab === 'emoji' && <EmojiTab />}
        {tab === 'sounds' && <SoundboardTab />}
        {tab === 'messages' && <MessagesTab />}
        {tab === 'server' && <ServerTab />}
      </main>
    </div>
  );
}

// ── Dashboard Tab ────────────────────────────────────────────
function DashboardTab() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    authFetch('/admin/stats').then(setStats).catch(() => {});
  }, []);

  return (
    <div className={styles.content}>
      <h1>Dashboard</h1>
      <p className={styles.subtitle}>Overview of The Crows Nest</p>

      <div className={styles.statsGrid}>
        {[
          { label: 'Total Users', value: stats?.totalUsers ?? '…', color: '#5865F2' },
          { label: 'Total Messages', value: stats?.totalMessages ?? '…', color: '#23A55A' },
          { label: 'Channels', value: stats?.totalChannels ?? '…', color: '#F0B232' },
          { label: 'Direct Messages', value: stats?.totalDMs ?? '…', color: '#EB459E' },
        ].map(s => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statValue} style={{ color: s.color }}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      <h2 className={styles.sectionTitle}>Recent Sign-ups</h2>
      <div className={styles.table}>
        <div className={`${styles.tableRow} ${styles.tableHead}`}>
          <span>User</span><span>Email</span><span>Role</span><span>Joined</span>
        </div>
        {stats?.recentUsers?.map(u => (
          <div key={u.id} className={styles.tableRow}>
            <span className={styles.userCell}>
              <Avatar url={u.avatar_url} color={u.avatar_color} username={u.username} className={styles.avatar} />
              {u.username}
            </span>
            <span>{u.email}</span>
            <span><RoleBadge role={u.role} /></span>
            <span>{new Date(u.created_at).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Users Tab ────────────────────────────────────────────────
function UsersTab() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [flash, setFlash] = useState(null);
  const [resetModal, setResetModal] = useState(null); // user to reset
  const [newPassword, setNewPassword] = useState('');

  const showFlash = (msg, type = 'success') => {
    setFlash({ msg, type });
    setTimeout(() => setFlash(null), 3000);
  };

  useEffect(() => {
    authFetch('/admin/users').then(setUsers).catch(() => {});
  }, []);

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const toggleRole = async (u) => {
    const newRole = u.role === 'admin' ? 'member' : 'admin';
    const res = await authFetch(`/admin/users/${u.id}/role`, { method: 'PATCH', body: JSON.stringify({ role: newRole }) });
    if (res.error) return showFlash(res.error, 'error');
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: newRole } : x));
    showFlash(`${u.username} is now ${newRole}`);
  };

  const sendReset = async (u) => {
    const res = await authFetch(`/admin/users/${u.id}/force-reset`, { method: 'POST' });
    if (res.error) return showFlash(res.error, 'error');
    showFlash(`Reset email sent to ${u.email}`);
  };

  const setPassword = async () => {
    if (!newPassword || newPassword.length < 8) return showFlash('Password must be 8+ characters', 'error');
    const res = await authFetch(`/admin/users/${resetModal.id}/password`, { method: 'PATCH', body: JSON.stringify({ password: newPassword }) });
    if (res.error) return showFlash(res.error, 'error');
    showFlash(`Password updated for ${resetModal.username}`);
    setResetModal(null);
    setNewPassword('');
  };

  const deleteUser = async (u) => {
    if (!confirm(`Permanently delete ${u.username}?`)) return;
    const res = await authFetch(`/admin/users/${u.id}`, { method: 'DELETE' });
    if (res.error) return showFlash(res.error, 'error');
    setUsers(prev => prev.filter(x => x.id !== u.id));
    showFlash(`${u.username} deleted`);
  };

  return (
    <div className={styles.content}>
      <h1>Users <span className={styles.count}>{users.length}</span></h1>
      <p className={styles.subtitle}>Manage accounts, roles and passwords.</p>

      {flash && <div className={`${styles.flash} ${styles[flash.type]}`}>{flash.msg}</div>}

      <input
        className={styles.search}
        placeholder="Search by username or email…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className={styles.table}>
        <div className={`${styles.tableRow} ${styles.tableHead}`}>
          <span>User</span><span>Email</span><span>Role</span><span>Joined</span><span>Actions</span>
        </div>
        {filtered.map(u => (
          <div key={u.id} className={styles.tableRow}>
            <span className={styles.userCell}>
              <Avatar url={u.avatar_url} color={u.avatar_color} username={u.username} className={styles.avatar} />
              {u.username}
            </span>
            <span className={styles.email}>{u.email}</span>
            <span><RoleBadge role={u.role} /></span>
            <span>{new Date(u.created_at).toLocaleDateString()}</span>
            <span className={styles.actions}>
              <button className={styles.actionBtn} onClick={() => sendReset(u)} title="Send password reset email">📧</button>
              <button className={styles.actionBtn} onClick={() => { setResetModal(u); setNewPassword(''); }} title="Set password directly">🔑</button>
              <button className={styles.actionBtn} onClick={() => toggleRole(u)} title={u.role === 'admin' ? 'Revoke admin' : 'Make admin'}>
                {u.role === 'admin' ? '⬇️' : '⬆️'}
              </button>
              {u.id !== me.id && (
                <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => deleteUser(u)} title="Delete user">🗑️</button>
              )}
            </span>
          </div>
        ))}
      </div>

      {resetModal && (
        <div className={styles.modalOverlay} onClick={() => setResetModal(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3>Set Password for {resetModal.username}</h3>
            <input
              className={styles.input}
              type="password"
              placeholder="New password (8+ characters)"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              autoFocus
            />
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setResetModal(null)}>Cancel</button>
              <button className={styles.primaryBtn} onClick={setPassword}>Set Password</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Channels Tab ─────────────────────────────────────────────
function ChannelsTab() {
  const [channels, setChannels] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [flash, setFlash] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('text');
  const [newIsPrivate, setNewIsPrivate] = useState(false);
  const [newMemberIds, setNewMemberIds] = useState([]);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [accessModal, setAccessModal] = useState(null); // channel being managed
  const [accessDraft, setAccessDraft] = useState({ isPrivate: false, memberIds: [] });

  const showFlash = (msg, type = 'success') => { setFlash({ msg, type }); setTimeout(() => setFlash(null), 3000); };

  useEffect(() => {
    authFetch(`/servers/${DEFAULT_SERVER}/channels`).then(setChannels).catch(() => {});
    authFetch('/admin/users').then(setAllUsers).catch(() => {});
  }, []);

  const resetCreateForm = () => {
    setCreating(false);
    setNewName('');
    setNewIsPrivate(false);
    setNewMemberIds([]);
  };

  const toggleNewMember = (id) => {
    setNewMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const create = async (e) => {
    e.preventDefault();
    const res = await authFetch(`/servers/${DEFAULT_SERVER}/channels`, {
      method: 'POST',
      body: JSON.stringify({ name: newName, type: newType, isPrivate: newIsPrivate, memberIds: newIsPrivate ? newMemberIds : [] }),
    });
    if (res.error) return showFlash(res.error, 'error');
    setChannels(prev => [...prev, res]);
    resetCreateForm();
    showFlash(`#${res.name} created`);
  };

  const rename = async (id) => {
    const res = await authFetch(`/channels/${id}`, { method: 'PATCH', body: JSON.stringify({ name: editName }) });
    if (res.error) return showFlash(res.error, 'error');
    setChannels(prev => prev.map(c => c.id === id ? { ...c, name: res.name } : c));
    setEditId(null);
    showFlash('Channel renamed');
  };

  const del = async (ch) => {
    if (!confirm(`Delete #${ch.name}? All messages will be lost.`)) return;
    await authFetch(`/channels/${ch.id}`, { method: 'DELETE' });
    setChannels(prev => prev.filter(c => c.id !== ch.id));
    showFlash(`#${ch.name} deleted`);
  };

  const openAccessModal = async (ch) => {
    const memberIds = ch.is_private ? await authFetch(`/channels/${ch.id}/members`) : [];
    setAccessDraft({ isPrivate: !!ch.is_private, memberIds: Array.isArray(memberIds) ? memberIds : [] });
    setAccessModal(ch);
  };

  const toggleAccessMember = (id) => {
    setAccessDraft(prev => ({
      ...prev,
      memberIds: prev.memberIds.includes(id) ? prev.memberIds.filter(x => x !== id) : [...prev.memberIds, id],
    }));
  };

  const saveAccess = async () => {
    const res = await authFetch(`/channels/${accessModal.id}/access`, {
      method: 'PATCH',
      body: JSON.stringify({ isPrivate: accessDraft.isPrivate, memberIds: accessDraft.memberIds }),
    });
    if (res.error) return showFlash(res.error, 'error');
    setChannels(prev => prev.map(c => c.id === accessModal.id ? { ...c, is_private: res.is_private } : c));
    showFlash('Channel access updated');
    setAccessModal(null);
  };

  return (
    <div className={styles.content}>
      <div className={styles.contentHeader}>
        <div>
          <h1>Channels <span className={styles.count}>{channels.length}</span></h1>
          <p className={styles.subtitle}>Create, rename and delete channels.</p>
        </div>
        <button className={styles.primaryBtn} onClick={() => setCreating(true)}>+ New Channel</button>
      </div>

      {flash && <div className={`${styles.flash} ${styles[flash.type]}`}>{flash.msg}</div>}

      {creating && (
        <form onSubmit={create} className={styles.createForm} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input className={styles.input} value={newName} onChange={e => setNewName(e.target.value)} placeholder="channel-name" autoFocus required style={{ maxWidth: 240 }} />
            <select className={styles.select} value={newType} onChange={e => setNewType(e.target.value)}>
              <option value="text">Text</option>
              <option value="voice">Voice</option>
            </select>
          </div>
          <label className={styles.privateToggle}>
            <input type="checkbox" checked={newIsPrivate} onChange={e => setNewIsPrivate(e.target.checked)} />
            <span>Private — hidden from everyone except the members picked below</span>
          </label>
          {newIsPrivate && (
            <div className={styles.memberPicker}>
              {allUsers.length === 0 && <p className={styles.subtitle} style={{ marginBottom: 0 }}>No other users yet.</p>}
              {allUsers.map(u => (
                <label key={u.id} className={styles.memberOption}>
                  <input type="checkbox" checked={newMemberIds.includes(u.id)} onChange={() => toggleNewMember(u.id)} />
                  <span>{u.username}</span>
                </label>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className={styles.primaryBtn}>Create</button>
            <button type="button" className={styles.cancelBtn} onClick={resetCreateForm}>Cancel</button>
          </div>
        </form>
      )}

      <div className={styles.table}>
        <div className={`${styles.tableRow} ${styles.tableHead}`}>
          <span>Name</span><span>Type</span><span>Created</span><span>Actions</span>
        </div>
        {channels.map(ch => (
          <div key={ch.id} className={styles.tableRow}>
            <span>
              {editId === ch.id ? (
                <input className={styles.inlineInput} value={editName} onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') rename(ch.id); if (e.key === 'Escape') setEditId(null); }} autoFocus />
              ) : (
                <span>{ch.type === 'text' ? '#' : '🔊'} {ch.name} {ch.is_private && <span className={styles.privateBadge}>🔒 Private</span>}</span>
              )}
            </span>
            <span><span className={`${styles.typeBadge} ${styles[ch.type]}`}>{ch.type}</span></span>
            <span>{new Date(ch.created_at).toLocaleDateString()}</span>
            <span className={styles.actions}>
              {editId === ch.id ? (
                <>
                  <button className={styles.actionBtn} onClick={() => rename(ch.id)}>✓</button>
                  <button className={styles.actionBtn} onClick={() => setEditId(null)}>✕</button>
                </>
              ) : (
                <>
                  <button className={styles.actionBtn} onClick={() => openAccessModal(ch)} title="Manage access">🔒</button>
                  <button className={styles.actionBtn} onClick={() => { setEditId(ch.id); setEditName(ch.name); }} title="Rename">✏️</button>
                  <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => del(ch)} title="Delete">🗑️</button>
                </>
              )}
            </span>
          </div>
        ))}
      </div>

      {accessModal && (
        <div className={styles.modalOverlay} onClick={() => setAccessModal(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3>Access for #{accessModal.name}</h3>
            <label className={styles.privateToggle}>
              <input
                type="checkbox"
                checked={accessDraft.isPrivate}
                onChange={e => setAccessDraft(prev => ({ ...prev, isPrivate: e.target.checked }))}
              />
              <span>Private — hidden from everyone except the members picked below</span>
            </label>
            {accessDraft.isPrivate && (
              <div className={styles.memberPicker}>
                {allUsers.length === 0 && <p className={styles.subtitle} style={{ marginBottom: 0 }}>No other users yet.</p>}
                {allUsers.map(u => (
                  <label key={u.id} className={styles.memberOption}>
                    <input
                      type="checkbox"
                      checked={accessDraft.memberIds.includes(u.id)}
                      onChange={() => toggleAccessMember(u.id)}
                    />
                    <span>{u.username}</span>
                  </label>
                ))}
              </div>
            )}
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setAccessModal(null)}>Cancel</button>
              <button className={styles.primaryBtn} onClick={saveAccess}>Save Access</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Games Tab (PatchBot) ────────────────────────────────────
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

function GamesTab() {
  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [pollMinutes, setPollMinutes] = useState(180);
  const [savingFreq, setSavingFreq] = useState(false);
  const [flash, setFlash] = useState(null);

  const showFlash = (msg, type = 'success') => { setFlash({ msg, type }); setTimeout(() => setFlash(null), 3000); };

  useEffect(() => {
    authFetch(`/servers/${DEFAULT_SERVER}/channels`).then(chs => {
      const textChannels = (chs || []).filter(c => c.type === 'text');
      setChannels(textChannels);
      if (textChannels[0]) setSelectedChannelId(textChannels[0].id);
    }).catch(() => {});
    authFetch('/admin/patchbot/settings').then(s => {
      if (s?.pollIntervalMinutes) setPollMinutes(s.pollIntervalMinutes);
    }).catch(() => {});
  }, []);

  const saveFrequency = async () => {
    setSavingFreq(true);
    const res = await authFetch('/admin/patchbot/settings', { method: 'PATCH', body: JSON.stringify({ pollIntervalMinutes: pollMinutes }) });
    setSavingFreq(false);
    if (res.error) return showFlash(res.error, 'error');
    showFlash('Check frequency updated');
  };

  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  return (
    <div className={styles.content}>
      <h1>Games <span className={styles.count}>PatchBot</span></h1>
      <p className={styles.subtitle}>Choose which channel gets Steam patch notes for each tracked game, and how often PatchBot checks for updates.</p>

      {flash && <div className={`${styles.flash} ${styles[flash.type]}`}>{flash.msg}</div>}

      <h2 className={styles.sectionTitle}>Check Frequency</h2>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 28 }}>
        <select className={styles.select} value={pollMinutes} onChange={e => setPollMinutes(Number(e.target.value))}>
          {POLL_OPTIONS.map(o => <option key={o.minutes} value={o.minutes}>{o.label}</option>)}
        </select>
        <button className={styles.primaryBtn} onClick={saveFrequency} disabled={savingFreq}>
          {savingFreq ? 'Saving…' : 'Save'}
        </button>
      </div>

      <h2 className={styles.sectionTitle}>Tracked Games</h2>
      <select
        className={styles.select}
        value={selectedChannelId}
        onChange={e => setSelectedChannelId(e.target.value)}
        style={{ marginBottom: 16, width: '100%', maxWidth: 320 }}
      >
        {channels.length === 0 && <option value="">No text channels</option>}
        {channels.map(c => (
          <option key={c.id} value={c.id}>#{c.name}{c.is_private ? ' (private)' : ''}</option>
        ))}
      </select>

      {selectedChannel && <ChannelGameManager channel={selectedChannel} />}
    </div>
  );
}

function ChannelGameManager({ channel }) {
  const { games, loading, query, setQuery, results, searching, error, addGame, removeGame, alreadyTracked } =
    useGameTracking(channel.id, true);

  return (
    <div>
      <input
        className={styles.input}
        style={{ maxWidth: 320, marginBottom: 12 }}
        placeholder="Search for a game on Steam…"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {error && <div className={`${styles.flash} ${styles.error}`}>{error}</div>}

      {query.trim() && (
        <div className={styles.table} style={{ marginBottom: 16 }}>
          {searching && <div className={styles.tableRow} style={{ gridTemplateColumns: '1fr' }}><span>Searching…</span></div>}
          {!searching && results.length === 0 && (
            <div className={styles.tableRow} style={{ gridTemplateColumns: '1fr' }}><span>No matches.</span></div>
          )}
          {!searching && results.map(r => (
            <div key={r.appId} className={styles.tableRow} style={{ gridTemplateColumns: '2fr 1fr' }}>
              <span className={styles.userCell}>
                {r.iconUrl && <img src={r.iconUrl} alt="" className={styles.avatar} style={{ borderRadius: 4 }} />}
                {r.name}
              </span>
              <span className={styles.actions}>
                <button className={styles.primaryBtn} disabled={alreadyTracked(r.appId)} onClick={() => addGame(r)}>
                  {alreadyTracked(r.appId) ? 'Tracked' : 'Add'}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.table}>
        <div className={`${styles.tableRow} ${styles.tableHead}`} style={{ gridTemplateColumns: '2fr 1fr' }}>
          <span>Game</span><span>Actions</span>
        </div>
        {loading && <div className={styles.tableRow} style={{ gridTemplateColumns: '1fr' }}><span>Loading…</span></div>}
        {!loading && games.length === 0 && (
          <div className={styles.tableRow} style={{ gridTemplateColumns: '1fr' }}><span>No games tracked in #{channel.name} yet.</span></div>
        )}
        {games.map(g => (
          <div key={g.id} className={styles.tableRow} style={{ gridTemplateColumns: '2fr 1fr' }}>
            <span className={styles.userCell}>
              {g.icon_url && <img src={g.icon_url} alt="" className={styles.avatar} style={{ borderRadius: 4 }} />}
              {g.name}
            </span>
            <span className={styles.actions}>
              <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => removeGame(g.id)} title="Stop tracking">🗑️</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Custom Emoji Tab ─────────────────────────────────────────
const MAX_EMOJI_SOURCE_BYTES = 10 * 1024 * 1024;
const EMOJI_MAX_DIMENSION = 96;
const EMOJI_NAME_RE = /^[a-zA-Z0-9_]{2,30}$/;

function EmojiTab() {
  const { emoji, refresh } = useCustomEmoji();
  const [name, setName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [flash, setFlash] = useState(null);
  const fileInputRef = useRef(null);

  const showFlash = (msg, type = 'success') => { setFlash({ msg, type }); setTimeout(() => setFlash(null), 3000); };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!EMOJI_NAME_RE.test(name)) return showFlash('Enter a name first (2-30 letters, numbers, or underscores).', 'error');
    if (!file.type.startsWith('image/')) return showFlash('Please choose an image file.', 'error');
    if (file.size > MAX_EMOJI_SOURCE_BYTES) return showFlash('That image is too large (max 10MB).', 'error');

    setUploading(true);
    try {
      const imageData = await resizeImageToDataUrl(file, { maxDimension: EMOJI_MAX_DIMENSION, quality: 0.9, mimeType: 'image/png' });
      const res = await authFetch(`/servers/${DEFAULT_SERVER}/emoji`, { method: 'POST', body: JSON.stringify({ name: name.trim(), imageData }) });
      if (res.error) throw new Error(res.error);
      setName('');
      refresh();
      showFlash(`Added :${name.trim().toLowerCase()}:`);
    } catch (err) {
      showFlash(err.message || 'Failed to upload emoji', 'error');
    } finally {
      setUploading(false);
    }
  };

  const removeEmoji = async (e) => {
    if (!confirm(`Delete :${e.name}:? This removes it from any messages/reactions still using it.`)) return;
    const res = await authFetch(`/servers/${DEFAULT_SERVER}/emoji/${e.id}`, { method: 'DELETE' });
    if (res.error) return showFlash(res.error, 'error');
    refresh();
    showFlash(`Removed :${e.name}:`);
  };

  return (
    <div className={styles.content}>
      <h1>Custom Emoji</h1>
      <p className={styles.subtitle}>Upload images to use as :name: emoji in messages and as reactions.</p>
      {flash && <div className={`${styles.flash} ${styles[flash.type]}`}>{flash.msg}</div>}

      <h2 className={styles.sectionTitle}>Add Emoji</h2>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          className={styles.input}
          style={{ maxWidth: 200 }}
          placeholder="name (no colons)"
          value={name}
          onChange={e => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
          maxLength={30}
        />
        <button type="button" className={styles.primaryBtn} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Choose Image'}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFile} />
      </div>
      <p className={styles.subtitle}>{emoji.length} / 200 emoji used.</p>

      <h2 className={styles.sectionTitle}>Server Emoji</h2>
      {emoji.length === 0 && <p className={styles.subtitle}>No custom emoji yet.</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {emoji.map(e => (
          <div key={e.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 76 }}>
            <img src={e.image_data} alt={`:${e.name}:`} width={36} height={36} style={{ objectFit: 'contain' }} />
            <span style={{ fontSize: 11, wordBreak: 'break-all', textAlign: 'center' }}>:{e.name}:</span>
            <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => removeEmoji(e)} title="Delete emoji">🗑️</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Soundboard Tab ───────────────────────────────────────────
const MAX_SOUND_SOURCE_BYTES = 1.5 * 1024 * 1024;
const SOUND_NAME_RE = /^[a-zA-Z0-9_ -]{2,32}$/;

function SoundboardTab() {
  const [sounds, setSounds] = useState([]);
  const [name, setName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [flash, setFlash] = useState(null);
  const fileInputRef = useRef(null);

  const showFlash = (msg, type = 'success') => { setFlash({ msg, type }); setTimeout(() => setFlash(null), 3000); };

  const load = useCallback(() => {
    authFetch(`/servers/${DEFAULT_SERVER}/sounds`).then(setSounds).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!SOUND_NAME_RE.test(name.trim())) return showFlash('Enter a name first (2-32 characters).', 'error');
    if (!file.type.startsWith('audio/')) return showFlash('Please choose an audio file.', 'error');
    if (file.size > MAX_SOUND_SOURCE_BYTES) return showFlash('That clip is too large (max 1.5MB) — keep clips short.', 'error');

    setUploading(true);
    try {
      const audioData = await fileToDataUrl(file);
      const res = await authFetch(`/servers/${DEFAULT_SERVER}/sounds`, { method: 'POST', body: JSON.stringify({ name: name.trim(), audioData }) });
      if (res.error) throw new Error(res.error);
      setName('');
      load();
      showFlash(`Added "${name.trim()}"`);
    } catch (err) {
      showFlash(err.message || 'Failed to upload sound', 'error');
    } finally {
      setUploading(false);
    }
  };

  const removeSound = async (s) => {
    if (!confirm(`Delete "${s.name}"?`)) return;
    const res = await authFetch(`/servers/${DEFAULT_SERVER}/sounds/${s.id}`, { method: 'DELETE' });
    if (res.error) return showFlash(res.error, 'error');
    load();
    showFlash(`Removed "${s.name}"`);
  };

  return (
    <div className={styles.content}>
      <h1>Soundboard</h1>
      <p className={styles.subtitle}>Upload short audio clips members can play into a voice channel.</p>
      {flash && <div className={`${styles.flash} ${styles[flash.type]}`}>{flash.msg}</div>}

      <h2 className={styles.sectionTitle}>Add Sound</h2>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          className={styles.input}
          style={{ maxWidth: 200 }}
          placeholder="sound name"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={32}
        />
        <button type="button" className={styles.primaryBtn} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Choose Audio File'}
        </button>
        <input ref={fileInputRef} type="file" accept="audio/*" hidden onChange={handleFile} />
      </div>
      <p className={styles.subtitle}>{sounds.length} / 100 sounds used.</p>

      <h2 className={styles.sectionTitle}>Server Sounds</h2>
      {sounds.length === 0 && <p className={styles.subtitle}>No sounds yet.</p>}
      <div className={styles.table}>
        {sounds.map(s => (
          <div key={s.id} className={styles.tableRow} style={{ gridTemplateColumns: '2fr 1fr' }}>
            <span className={styles.userCell}>🔊 {s.name}</span>
            <span className={styles.actions}>
              <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => removeSound(s)} title="Delete sound">🗑️</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Messages Tab ─────────────────────────────────────────────
function MessagesTab() {
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    authFetch('/admin/messages/recent?limit=100').then(setMessages).catch(() => {});
  }, []);

  const filtered = messages.filter(m =>
    m.content.toLowerCase().includes(search.toLowerCase()) ||
    m.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={styles.content}>
      <h1>Recent Messages</h1>
      <p className={styles.subtitle}>Last 100 messages across all channels.</p>

      <input
        className={styles.search}
        placeholder="Search messages or users…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className={styles.table}>
        <div className={`${styles.tableRow} ${styles.tableHead}`}>
          <span>User</span><span>Channel</span><span>Message</span><span>Time</span>
        </div>
        {filtered.map(m => (
          <div key={m.id} className={styles.tableRow}>
            <span className={styles.userCell}>
              <Avatar url={m.avatar_url} color={m.avatar_color} username={m.username} className={styles.avatar} />
              {m.username}
            </span>
            <span className={styles.channelTag}>#{m.channel_name}</span>
            <span className={styles.msgContent}>{m.content}</span>
            <span className={styles.time}>{new Date(m.created_at).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Server Settings Tab ───────────────────────────────────────
function ServerTab() {
  const [server, setServer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    authFetch(`/servers/${DEFAULT_SERVER}`).then(setServer).catch(() => {});
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const res = await authFetch(`/servers/${DEFAULT_SERVER}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: server.name,
        description: server.description,
        textCategoryLabel: server.text_category_label,
        voiceCategoryLabel: server.voice_category_label,
      }),
    });
    setSaving(false);
    if (res.error) { setFlash({ msg: res.error, type: 'error' }); return; }
    setServer(res);
    setFlash({ msg: 'Server updated!', type: 'success' });
    setTimeout(() => setFlash(null), 3000);
  };

  if (!server) return <div className={styles.content}><p>Loading…</p></div>;

  return (
    <div className={styles.content}>
      <h1>Server Settings</h1>
      <p className={styles.subtitle}>Update the server name and description.</p>

      {flash && <div className={`${styles.flash} ${styles[flash.type]}`}>{flash.msg}</div>}

      <form onSubmit={save} className={styles.settingsForm}>
        <label className={styles.field}>
          <span>SERVER NAME</span>
          <input className={styles.input} value={server.name} onChange={e => setServer(s => ({ ...s, name: e.target.value }))} required maxLength={100} />
        </label>
        <label className={styles.field}>
          <span>DESCRIPTION</span>
          <input className={styles.input} value={server.description || ''} onChange={e => setServer(s => ({ ...s, description: e.target.value }))} maxLength={255} placeholder="What's this server about?" />
        </label>
        <label className={styles.field}>
          <span>TEXT CHANNELS SECTION LABEL</span>
          <input className={styles.input} value={server.text_category_label || ''} onChange={e => setServer(s => ({ ...s, text_category_label: e.target.value }))} maxLength={100} placeholder="TEXT CHANNELS" />
        </label>
        <label className={styles.field}>
          <span>VOICE CHANNELS SECTION LABEL</span>
          <input className={styles.input} value={server.voice_category_label || ''} onChange={e => setServer(s => ({ ...s, voice_category_label: e.target.value }))} maxLength={100} placeholder="VOICE CHANNELS" />
        </label>
        <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
      </form>
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────
function RoleBadge({ role }) {
  return <span className={`${styles.roleBadge} ${styles[role]}`}>{role}</span>;
}
