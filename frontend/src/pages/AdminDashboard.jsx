import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar';
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
    const res = await authFetch(`/servers/${DEFAULT_SERVER}`, { method: 'PATCH', body: JSON.stringify({ name: server.name, description: server.description }) });
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
        <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
      </form>
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────
function RoleBadge({ role }) {
  return <span className={`${styles.roleBadge} ${styles[role]}`}>{role}</span>;
}
