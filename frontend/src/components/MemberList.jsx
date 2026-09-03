import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { formatLastSeen, formatElapsed } from '../utils/timeAgo';
import Avatar from './Avatar';
import styles from './MemberList.module.css';

export default function MemberList({ serverId, ownerId, onClose }) {
  const { user } = useAuth();
  const { statusMap, awaySinceMap } = useSocket();
  const [members, setMembers] = useState([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    // Invisible accounts (bots, service/test accounts an admin has hidden)
    // are left out of this list entirely — mentions/DMs/etc. still work.
    api.get('/users').then((users) => {
      setMembers([user, ...users.filter((u) => u.id !== user.id && !u.invisible)]);
    }).catch(() => {});
  }, [user]);

  // Re-renders periodically so "Away for X" keeps counting up without
  // needing a fresh server push every time it changes.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const statusOf = (id) => statusMap.get(id) || 'offline';

  const online = members.filter((m) => statusOf(m.id) !== 'offline');
  const offline = members.filter((m) => statusOf(m.id) === 'offline');

  return (
    <div className={styles.list}>
      <button className={styles.closeBtn} onClick={onClose} title="Close member list">✕</button>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Online — {online.length}</div>
        {online.map((m) => (
          <MemberItem key={m.id} member={m} status={statusOf(m.id)} isOwner={m.id === ownerId} awaySince={awaySinceMap.get(m.id)} />
        ))}
      </div>
      {offline.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Offline — {offline.length}</div>
          {offline.map((m) => <MemberItem key={m.id} member={m} status="offline" isOwner={m.id === ownerId} />)}
        </div>
      )}
    </div>
  );
}

function MemberItem({ member, status, isOwner, awaySince }) {
  const dimmed = status === 'offline';
  return (
    <div className={styles.member}>
      <div className={styles.avatarWrap}>
        <Avatar
          url={member.avatar_url}
          color={member.avatar_color}
          username={member.username}
          className={styles.avatar}
          style={{ opacity: dimmed ? 0.5 : 1 }}
        />
        <span className={`${styles.dot} ${styles[status]}`} title={status[0].toUpperCase() + status.slice(1)} />
      </div>
      <div className={styles.info}>
        <div className={styles.nameRow}>
          <span className={styles.name} style={{ opacity: dimmed ? 0.5 : 1 }}>{member.username}</span>
          {isOwner
            ? <span className={styles.badge} style={{ background: '#e6a53c', color: '#000' }}>👑 Owner</span>
            : member.role === 'admin' && <span className={styles.badge}>Admin</span>}
        </div>
        {dimmed && member.last_seen_at && (
          <span className={styles.lastSeen}>{formatLastSeen(member.last_seen_at)}</span>
        )}
        {status === 'away' && awaySince && (
          <span className={styles.lastSeen}>Away for {formatElapsed(awaySince)}</span>
        )}
      </div>
    </div>
  );
}
