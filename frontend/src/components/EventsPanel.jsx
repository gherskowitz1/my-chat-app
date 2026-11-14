import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Avatar from './Avatar';
import { describeRecurrence } from '../utils/eventFormat';
import styles from './EventsPanel.module.css';

// Game Night events — schedule one (optionally repeating weekly, every two
// weeks, or monthly), RSVP Going / Maybe / Can't, see who's coming. Each
// date of a repeating event has its own sign-in sheet. Server side:
// eventController.js; jobs/eventReminders.js sends the week-before
// check-in to anyone who hasn't answered and the 15-minute reminder.
export default function EventsPanel({ serverId, onClose }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/events').then(setEvents).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Someone else RSVPs or schedules something — refresh live.
  useEffect(() => {
    if (!socket) return;
    socket.on('events:changed', load);
    return () => socket.off('events:changed', load);
  }, [socket, load]);

  const rsvp = async (eventId, status) => {
    setError('');
    try {
      await api.post(`/events/${eventId}/rsvp`, { status });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  // scope: 'one' (just this date) or 'series' (end a repeating event).
  const cancelEvent = async (ev, scope) => {
    setError('');
    try {
      await api.delete(`/events/${ev.id}?scope=${scope}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>📅 Game Night</h3>
          <div className={styles.headerActions}>
            {!creating && <button className={styles.newBtn} onClick={() => setCreating(true)}>+ Schedule</button>}
            <button className={styles.closeBtn} onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {creating && (
          <CreateEventForm
            serverId={serverId}
            onCancel={() => setCreating(false)}
            onCreated={() => { setCreating(false); load(); }}
          />
        )}

        <div className={styles.list}>
          {loading && <p className={styles.empty}>Loading…</p>}
          {!loading && events.length === 0 && !creating && (
            <p className={styles.empty}>Nothing scheduled yet. Hit <strong>+ Schedule</strong> to plan a game night.</p>
          )}
          {events.map((ev) => (
            <EventCard
              key={ev.id}
              ev={ev}
              me={user}
              onRsvp={(status) => rsvp(ev.id, status)}
              onCancel={(scope) => cancelEvent(ev, scope)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function EventCard({ ev, me, onRsvp, onCancel }) {
  const mine = ev.rsvps.find((r) => r.userId === me.id)?.status;
  const going = ev.rsvps.filter((r) => r.status === 'going');
  const maybe = ev.rsvps.filter((r) => r.status === 'maybe');
  const out = ev.rsvps.filter((r) => r.status === 'no');
  const canCancel = ev.created_by === me.id || me.role === 'admin';
  const startsAt = new Date(ev.starts_at);
  const started = startsAt <= new Date();
  const repeats = describeRecurrence(ev.recurrence, ev.starts_at);
  const [confirming, setConfirming] = useState(false);

  const askCancel = () => {
    if (ev.series_id) { setConfirming(true); return; }
    if (confirm(`Cancel "${ev.title}"? Everyone's RSVPs will be removed.`)) onCancel('one');
  };

  // Clicking your current answer again clears it.
  const pick = (status) => onRsvp(mine === status ? 'none' : status);

  return (
    <div className={`${styles.card} ${started ? styles.live : ''}`}>
      <div className={styles.cardTop}>
        <div className={styles.dateBadge}>
          <span className={styles.month}>{startsAt.toLocaleDateString(undefined, { month: 'short' })}</span>
          <span className={styles.day}>{startsAt.getDate()}</span>
        </div>
        <div className={styles.cardInfo}>
          <div className={styles.title}>{ev.title}</div>
          <div className={styles.when}>
            {startsAt.toLocaleDateString(undefined, { weekday: 'short' })} · {startsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            <span className={styles.relative}>{started ? 'Happening now' : relativeTime(startsAt)}</span>
          </div>
          {repeats && <div className={styles.where}>🔁 {repeats}</div>}
          {ev.voice_channel_name && <div className={styles.where}>🔊 {ev.voice_channel_name}</div>}
        </div>
        {canCancel && (
          <button className={styles.cancelBtn} onClick={askCancel} title="Cancel event">✕</button>
        )}
      </div>

      {confirming && (
        <div className={styles.confirmBox}>
          <span>Cancel which?</span>
          <button className={styles.secondaryBtn} onClick={() => { setConfirming(false); onCancel('one'); }}>Just this date</button>
          <button className={styles.dangerBtn} onClick={() => { setConfirming(false); onCancel('series'); }}>End the whole series</button>
          <button className={styles.secondaryBtn} onClick={() => setConfirming(false)}>Keep it</button>
        </div>
      )}

      {ev.description && <p className={styles.description}>{ev.description}</p>}

      <div className={styles.attendees}>
        {going.length > 0 ? (
          <>
            <div className={styles.avatars}>
              {going.slice(0, 8).map((r) => (
                <span key={r.userId} title={r.username}>
                  <Avatar url={r.avatarUrl} color={r.avatarColor} username={r.username} className={styles.miniAvatar} />
                </span>
              ))}
            </div>
            <span className={styles.count}>
              {going.length} going{maybe.length > 0 ? ` · ${maybe.length} maybe` : ''}
            </span>
          </>
        ) : (
          <span className={styles.count}>{maybe.length > 0 ? `${maybe.length} maybe` : 'No one yet'}</span>
        )}
      </div>

      {ev.rsvps.length > 0 && (
        <div className={styles.sheet}>
          {going.length > 0 && <div><span className={styles.sheetIn}>In</span> {going.map((r) => r.username).join(', ')}</div>}
          {maybe.length > 0 && <div><span className={styles.sheetMaybe}>Maybe</span> {maybe.map((r) => r.username).join(', ')}</div>}
          {out.length > 0 && <div><span className={styles.sheetOut}>Out</span> {out.map((r) => r.username).join(', ')}</div>}
        </div>
      )}

      <div className={styles.rsvpRow}>
        <button className={`${styles.rsvpBtn} ${mine === 'going' ? styles.rsvpGoing : ''}`} onClick={() => pick('going')}>✓ Going</button>
        <button className={`${styles.rsvpBtn} ${mine === 'maybe' ? styles.rsvpMaybe : ''}`} onClick={() => pick('maybe')}>? Maybe</button>
        <button className={`${styles.rsvpBtn} ${mine === 'no' ? styles.rsvpNo : ''}`} onClick={() => pick('no')}>✕ Can’t</button>
      </div>
      <div className={styles.byline}>Scheduled by {ev.created_by_username || 'a former member'}</div>
    </div>
  );
}

function CreateEventForm({ serverId, onCancel, onCreated }) {
  const [title, setTitle] = useState('Game Night');
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [time, setTime] = useState('20:00');
  const [voiceChannelId, setVoiceChannelId] = useState('');
  const [recurrence, setRecurrence] = useState('none');
  const [description, setDescription] = useState('');
  const [voiceChannels, setVoiceChannels] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/servers/${serverId}/channels`)
      .then((chs) => setVoiceChannels(chs.filter((c) => c.type === 'voice')))
      .catch(() => {});
  }, [serverId]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    // date + time inputs are in the viewer's local time zone; the server
    // stores the absolute instant, and everyone sees it in their own zone.
    const startsAt = new Date(`${date}T${time}`);
    if (Number.isNaN(startsAt.getTime())) { setError('Pick a date and time.'); return; }
    setSaving(true);
    try {
      await api.post('/events', {
        title, description, voiceChannelId: voiceChannelId || null, startsAt: startsAt.toISOString(),
        recurrence,
        // Repeats are worked out in this time zone on the server, so a
        // "10pm every Friday" stays 10pm across daylight-saving changes.
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="What are we playing?" autoFocus />
      <div className={styles.formRow}>
        <input className={styles.input} type="date" value={date} min={toDateInput(new Date())} onChange={(e) => setDate(e.target.value)} />
        <input className={styles.input} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <select className={styles.input} value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
        <option value="none">Doesn’t repeat</option>
        <option value="weekly">Repeats every week</option>
        <option value="biweekly">Repeats every 2 weeks</option>
        <option value="monthly">Repeats every month</option>
      </select>
      {recurrence !== 'none' && (
        <p className={styles.hint}>Each date gets its own sign-in sheet, and a week before each one everyone who hasn’t answered gets asked if they’re in.</p>
      )}
      <select className={styles.input} value={voiceChannelId} onChange={(e) => setVoiceChannelId(e.target.value)}>
        <option value="">No voice channel</option>
        {voiceChannels.map((c) => <option key={c.id} value={c.id}>🔊 {c.name}</option>)}
      </select>
      <textarea
        className={styles.input}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="Details (optional) — the game, what to install, etc."
      />
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.formActions}>
        <button type="button" className={styles.secondaryBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.primaryBtn} disabled={saving || !title.trim()}>
          {saving ? 'Scheduling…' : 'Schedule'}
        </button>
      </div>
    </form>
  );
}

// YYYY-MM-DD in local time (toISOString would use UTC and can be a day off).
function toDateInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function relativeTime(date) {
  const mins = Math.round((date - new Date()) / 60000);
  if (mins < 60) return `in ${Math.max(1, mins)} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} hr${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}
