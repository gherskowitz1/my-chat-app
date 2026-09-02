import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from '@livekit/components-react';
import { DefaultReconnectPolicy } from 'livekit-client';
import '@livekit/components-styles';
import { api } from '../services/api';
import { getAudioPreferences } from './UserSettings';
import VoiceAdminControls from './VoiceAdminControls';
import VolumeMixer from './VolumeMixer';
import VoiceControls from './VoiceControls';
import VoiceChimes from './VoiceChimes';
import VoiceReliability from './VoiceReliability';
import { useAuth } from '../context/AuthContext';
import styles from './VoiceChannel.module.css';

const INACTIVITY_LIMIT_MS = 4 * 60 * 60 * 1000; // 4 hours
export const normalizeChannelName = (name) => (name || '').toLowerCase().replace(/[\s\-_]+/g, '');

// Delays (ms) between LiveKit's own reconnect attempts after a dropped
// connection, summing to ~15s before it gives up and fires onDisconnected —
// long enough to ride out a brief network blip without kicking the user back
// to the join screen.
const RECONNECT_RETRY_DELAYS = [0, 500, 1000, 1500, 2000, 2500, 3000, 4500];

export default function VoiceChannel({ channel, onLeave, afkChannel, onSwitchChannel }) {
  const { user } = useAuth();
  const [token, setToken] = useState(null);
  const [livekitUrl, setLivekitUrl] = useState(null);
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [audioPrefs, setAudioPrefs] = useState(null);
  const lastActivityRef = useRef(Date.now());

  const roomOptions = useMemo(() => ({
    reconnectPolicy: new DefaultReconnectPolicy(RECONNECT_RETRY_DELAYS),
    ...(audioPrefs?.bitrateCap ? { publishDefaults: { audioPreset: { maxBitrate: audioPrefs.bitrateCap } } } : {}),
  }), [audioPrefs?.bitrateCap]);

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
    } catch (err) {
      setError(err.message === 'LiveKit not configured'
        ? 'Voice chat requires LiveKit configuration. Add LIVEKIT_* env vars to enable.'
        : err.message);
    } finally {
      setJoining(false);
    }
  };

  const leave = () => {
    setJoined(false);
    setToken(null);
    setAudioPrefs(null);
    onLeave();
  };

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
    return (
      <div className={styles.errorBanner}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        {error}
      </div>
    );
  }

  if (!joined) {
    return (
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
      </div>
    );
  }

  const audioConstraints = {
    noiseSuppression: audioPrefs?.noiseSuppression !== false,
    ...(audioPrefs?.inputDeviceId ? { deviceId: { exact: audioPrefs.inputDeviceId } } : {}),
  };

  const isAfkChannel = normalizeChannelName(channel.name) === 'takingashit';

  return (
    <div className={styles.roomWrapper}>
      <LiveKitRoom
        token={token}
        serverUrl={livekitUrl}
        connect={true}
        video={false}
        audio={audioConstraints}
        options={roomOptions}
        onDisconnected={leave}
        style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
      >
        <RoomAudioRenderer outputDeviceId={audioPrefs?.outputDeviceId} />
        <VoiceChimes />
        <VoiceReliability />
        <div className={styles.room}>
          <VideoConference />
        </div>
        <VolumeMixer />
        <VoiceControls onLeave={leave} forceMuted={isAfkChannel} />
      </LiveKitRoom>

      {user?.role === 'admin' && (
        <VoiceAdminControls roomName={channel.id} />
      )}
    </div>
  );
}
