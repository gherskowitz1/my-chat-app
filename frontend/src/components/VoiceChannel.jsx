import React, { useState } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { api } from '../services/api';
import { getAudioPreferences } from './UserSettings';
import styles from './VoiceChannel.module.css';

export default function VoiceChannel({ channel, onLeave }) {
  const [token, setToken] = useState(null);
  const [livekitUrl, setLivekitUrl] = useState(null);
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [audioPrefs, setAudioPrefs] = useState(null);

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

  // Build audio constraints from saved preferences
  const audioConstraints = audioPrefs?.inputDeviceId
    ? { deviceId: { exact: audioPrefs.inputDeviceId } }
    : true;

  return (
    <div className={styles.room}>
      <LiveKitRoom
        token={token}
        serverUrl={livekitUrl}
        connect={true}
        video={false}
        audio={audioConstraints}
        onDisconnected={leave}
        style={{ height: '100%' }}
      >
        <RoomAudioRenderer outputDeviceId={audioPrefs?.outputDeviceId} />
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
