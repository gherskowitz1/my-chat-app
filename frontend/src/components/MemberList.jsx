import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import styles from './MemberList.module.css';

export default function MemberList({ serverId }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [members, setMembers] = useState([]);
  const [statusMap, setStatusMap] = useState(new Map()); // userId -> 'online' | 'away'

  useEffect(() => {
    api.get('/users').then((users) => {
      setMembers([user, ...users.filter((u) => u.id !== user.id)]);
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!socket) return;

    // Snapshot of who's already online/away — without this, a client would
    // only ever learn about users who connect *after* it does.
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
    return () => {
      socket.off('presence:snapshot', onSnapshot);
      socket.off('presence:update', onUpdate);
    };
  }, [socket]);

  const statusOf = (id) => statusMap.get(id) || 'offline';

  const online = members.filter((m) => statusOf(m.id) !== 'offline');
  const offline = members.filter((m) => statusOf(m.id) === 'offline');

  return (
    <div className={styles.list}>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Online — {online.length}</div>
        {online.map((m) => <MemberItem key={m.id} member={m} status={statusOf(m.id)} />)}
      </div>
      {offline.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Offline — {offline.length}</div>
          {offline.map((m) => <MemberItem key={m.id} member={m} status="offline" />)}
        </div>
      )}
    </div>
  );
}

function MemberItem({ member, status }) {
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
        <span className={styles.name} style={{ opacity: dimmed ? 0.5 : 1 }}>{member.username}</span>
        {member.role === 'admin' && <span className={styles.badge}>Admin</span>}
      </div>
    </div>
  );
}
