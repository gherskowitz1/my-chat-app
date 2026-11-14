import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import { DefaultReconnectPolicy } from 'livekit-client';
import '@livekit/components-styles';
import { api } from '../services/api';
import { getAudioPreferences } from './UserSettings';
import VolumeMixer from './VolumeMixer';
import VoiceControls from './VoiceControls';
import VoiceChimes from './VoiceChimes';
import VoiceReliability from './VoiceReliability';
import ScreenShareWindow from './ScreenShareWindow';
import WatchTogether, { WatchStarter } from './WatchTogether';
import VoiceParticipantList from './VoiceParticipantList';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import styles from './VoiceChannel.module.css';

const INACTIVITY_LIMIT_MS = 4 * 60 * 60 * 1000; // 4 hours
export const normalizeChannelName = (name) => (name || '').toLowerCase().replace(/[\s\-_]+/g, '');

// Delays (ms) between LiveKit's own reconnect attempts after a dropped
// connection, summing to ~15s before it gives up and fires onDisconnected —
// long enough to ride out a brief network blip without kicking the user back
// to the join screen.
const RECONNECT_RETRY_DELAYS = [0, 500, 1000, 1500, 2000, 2500, 3000, 4500];

// Mounted by ChatLayout rather than ChannelSidebar, so the call survives
// switching to DMs, clicking text channels, or the sidebar remounting. The
// LiveKit room and its invisible parts (audio, chimes, the floating screen
// share window) live here permanently; the visible controls render into
// `host`, a detached div that gets physically moved into whichever `slot` is
// on screen — under the channel in the sidebar, or the dock below the DM
// list. Moving one DOM node (instead of portaling into a different container)
// keeps VoiceControls and friends mounted, so mute/deafen/timer state isn't
// reset every time you change views.
export default function VoiceChannel({ channel, onLeave, onJoined, afkChannel, onSwitchChannel, slot, autoJoin }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [token, setToken] = useState(null);
  const [livekitUrl, setLivekitUrl] = useState(null);
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [audioPrefs, setAudioPrefs] = useState(null);
  const lastActivityRef = useRef(Date.now());
  const unloadingRef = useRef(false);
  const [host] = useState(() => document.createElement('div'));

  useLayoutEffect(() => {
    if (slot) slot.appendChild(host);
    else host.remove();
  }, [slot, host]);

  useEffect(() => () => host.remove(), [host]);

  // LiveKit disconnects on pagehide/beforeunload, which fires onDisconnected
  // → leave(). These are registered at mount, before LiveKit adds its own on
  // connect, so leave() can tell a reload apart from actually leaving and the
  // saved channel survives for the rejoin.
  useEffect(() => {
    const onUnload = () => { unloadingRef.current = true; };
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

  const roomOptions = useMemo(() => ({
    reconnectPolicy: new DefaultReconnectPolicy(RECONNECT_RETRY_DELAYS),
    // Remote voices play through the browser's own audio elements by
    // default — its most robust path, and it keeps playing smoothly when the
    // computer is busy or the app is in the background. Volume boost
    // (User Settings > Voice) switches to webAudioMix, which routes everyone
    // through one Web Audio graph with a GainNode so the mixer can go past
    // 100% — but that graph is more prone to stutter under load, so it's
    // opt-in. It's suspected of the choppiness reported since Sept 2026,
    // when it was on for everyone.
    webAudioMix: !!audioPrefs?.volumeBoost,
    ...(audioPrefs?.bitrateCap ? { publishDefaults: { audioPreset: { maxBitrate: audioPrefs.bitrateCap } } } : {}),
  }), [audioPrefs?.bitrateCap, audioPrefs?.volumeBoost]);

  const join = async () => {
    setJoining(true);
    setError(null);
    try {
      const data = await api.get(`/livekit/token/${encodeURIComponent(channel.id)}`);
      const prefs = getAudioPreferences();
      setToken(data.token);
      setLivekitUrl(data.url);
      setAudioPrefs(prefs);
      setJoined(true);
      onJoined?.();
      // Being in a call is itself activity — without this, someone deep in
      // a Steam game with a controller in hand (no mouse/keyboard touched
      // inside the app) gets marked "away" after 30 minutes despite
      // actively talking. See socket/index.js's presence:idle handler.
      socket?.emit('voice:joined', { channelId: channel.id });
    } catch (err) {
      setError(err.message === 'LiveKit not configured'
        ? 'Voice chat requires LiveKit configuration. Add LIVEKIT_* env vars to enable.'
        : err.message);
    } finally {
      setJoining(false);
    }
  };

  const leave = () => {
    if (unloadingRef.current) return;
    setJoined(false);
    setToken(null);
    setAudioPrefs(null);
    socket?.emit('voice:left');
    onLeave();
  };

  // Rejoining after a reload — see ChatLayout's ACTIVE_VOICE_KEY.
  useEffect(() => {
    if (autoJoin) join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch together (server: src/socket/watchParty.js) — while connected,
  // follow this voice channel's shared YouTube state. Re-joined on
  // reconnect, since a server restart forgets socket rooms.
  const [watchParty, setWatchParty] = useState(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [watchError, setWatchError] = useState('');
  useEffect(() => {
    if (!joined || !socket) return;
    const join = () => socket.emit('watch:join', { channelId: channel.id });
    const onState = ({ channelId, party, serverNow }) => {
      if (channelId !== channel.id) return;
      setWatchParty(party);
      setServerOffset(serverNow - Date.now());
      setWatchError('');
    };
    const onError = ({ channelId, error: msg }) => { if (channelId === channel.id) setWatchError(msg); };
    join();
    socket.on('connect', join);
    socket.on('watch:state', onState);
    socket.on('watch:error', onError);
    return () => {
      socket.emit('watch:leave', { channelId: channel.id });
      socket.off('connect', join);
      socket.off('watch:state', onState);
      socket.off('watch:error', onError);
      setWatchParty(null);
    };
  }, [joined, socket, channel.id]);

  // The server forgets who's in voice when it restarts (a deploy) — say so
  // again when the socket reconnects, so presence and voice-time tracking
  // pick back up. The voice call itself is LiveKit's and never dropped.
  useEffect(() => {
    if (!joined || !socket) return;
    const reannounce = () => socket.emit('voice:joined', { channelId: channel.id });
    socket.on('connect', reannounce);
    return () => socket.off('connect', reannounce);
  }, [joined, socket, channel.id]);

  // AFK auto-move — after 4h with no mouse/keyboard activity anywhere in the
  // app, move to the AFK channel (which force-mutes on entry, see below).
  useEffect(() => {
    if (!joined || !afkChannel || afkChannel.id === channel.id) return;

    lastActivityRef.current = Date.now();
    const bump = () => { lastActivityRef.current = Date.now(); };
    const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((evt) => window.addEventListener(evt, bump));

    const checkId = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= INACTIVITY_LIMIT_MS) {
        onSwitchChannel?.(afkChannel);
      }
    }, 60 * 1000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, bump));
      clearInterval(checkId);
    };
  }, [joined, afkChannel, channel.id, onSwitchChannel]);

  if (error) {
    return createPortal(
      <div className={styles.errorBanner}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        {error}
      </div>,
      host
    );
  }

  if (!joined) {
    return createPortal(
      <div className={styles.joinPrompt}>
        <button className={styles.joinBtn} onClick={join} disabled={joining}>
          {joining ? 'Connecting…' : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
                <path d="M19 10a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V21H9v2h6v-2h-2v-2.06A9 9 0 0 0 21 10h-2z"/>
              </svg>
              Join Voice
            </>
          )}
        </button>
      </div>,
      host
    );
  }

  const audioConstraints = {
    noiseSuppression: audioPrefs?.noiseSuppression !== false,
    ...(audioPrefs?.inputDeviceId ? { deviceId: { exact: audioPrefs.inputDeviceId } } : {}),
  };

  const isAfkChannel = normalizeChannelName(channel.name) === 'takingashit';

  return (
    <LiveKitRoom
      token={token}
      serverUrl={livekitUrl}
      connect={true}
      video={false}
      audio={audioConstraints}
      options={roomOptions}
      onDisconnected={leave}
    >
      <RoomAudioRenderer outputDeviceId={audioPrefs?.outputDeviceId} />
      <VoiceChimes />
      <ScreenShareWindow />
      {watchParty && <WatchTogether channelId={channel.id} party={watchParty} serverOffset={serverOffset} socket={socket} />}
      {createPortal(
        <div className={styles.roomWrapper}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <VoiceReliability />
            {/* Admins get their admin controls inside the mixer's rows. */}
            <VolumeMixer roomName={channel.id} isAdmin={user?.role === 'admin'} />
            <VoiceParticipantList />
            <VoiceControls onLeave={leave} forceMuted={isAfkChannel} />
            <WatchStarter channelId={channel.id} socket={socket} active={!!watchParty} error={watchError} />
          </div>
        </div>,
        host
      )}
    </LiveKitRoom>
  );
}
