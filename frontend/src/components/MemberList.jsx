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
  const [onlineIds, setOnlineIds] = useState(new Set());

  useEffect(() => {
    api.get('/users').then((users) => {
      setMembers([user, ...users.filter((u) => u.id !== user.id)]);
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!socket) return;
    const onOnline = ({ userId }) => setOnlineIds((s) => new Set([...s, userId]));
    const onOffline = ({ userId }) => setOnlineIds((s) => { const n = new Set(s); n.delete(userId); return n; });
    socket.on('user:online', onOnline);
    socket.on('user:offline', onOffline);
    return () => {
      socket.off('user:online', onOnline);
      socket.off('user:offline', onOffline);
    };
  }, [socket]);

  const online = members.filter((m) => onlineIds.has(m.id) || m.id === user?.id);
  const offline = members.filter((m) => !onlineIds.has(m.id) && m.id !== user?.id);

  return (
    <div className={styles.list}>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Online — {online.length}</div>
        {online.map((m) => <MemberItem key={m.id} member={m} online />)}
      </div>
      {offline.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Offline — {offline.length}</div>
          {offline.map((m) => <MemberItem key={m.id} member={m} online={false} />)}
        </div>
      )}
    </div>
  );
}

function MemberItem({ member, online }) {
  return (
    <div className={styles.member}>
      <div className={styles.avatarWrap}>
        <Avatar
          url={member.avatar_url}
          color={member.avatar_color}
          username={member.username}
          className={styles.avatar}
          style={{ opacity: online ? 1 : 0.5 }}
        />
        <span className={`${styles.dot} ${online ? styles.online : styles.offline}`} />
      </div>
      <div className={styles.info}>
        <span className={styles.name} style={{ opacity: online ? 1 : 0.5 }}>{member.username}</span>
        {member.role === 'admin' && <span className={styles.badge}>Admin</span>}
      </div>
    </div>
  );
}
