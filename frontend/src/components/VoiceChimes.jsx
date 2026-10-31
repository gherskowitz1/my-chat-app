import { useEffect } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';
import { getVoiceAnnounceMode } from '../utils/voiceAnnounce';

// Real AIM-style blips, played via a fresh Audio() per call so overlapping
// join/leave events don't cut each other off.
const playJoinChime = () => new Audio('/sounds/buddy-in.mp3').play().catch(() => {});
const playLeaveChime = () => new Audio('/sounds/buddy-out.mp3').play().catch(() => {});

// Uses the OS's built-in text-to-speech voice (free, offline, no service
// involved). Queued rather than cancelled, so two people joining at once are
// both announced in turn. Falls back to the chime where speech isn't
// available.
function announce(text, fallback) {
  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
    fallback();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.1;
  window.speechSynthesis.speak(utterance);
}

// Usernames like "sam_2024" read better as "sam 2024" than "sam underscore
// twenty twenty-four".
const speakableName = (name) => name.replace(/[_\-.]+/g, ' ').trim();

// Sits inside <LiveKitRoom> so it has access to the room's join/leave events.
// The announce mode is read on every event, so changing it in settings
// applies immediately without rejoining.
export default function VoiceChimes() {
  const room = useRoomContext();

  useEffect(() => {
    if (!room) return;

    const onJoined = (participant) => {
      const name = participant.name || participant.identity;
      const mode = getVoiceAnnounceMode();
      if (mode === 'names') announce(`${speakableName(name)} joined`, playJoinChime);
      else if (mode === 'chime') playJoinChime();
      window.electron?.notify('Voice Channel', `${name} joined`);
    };
    const onLeft = (participant) => {
      const name = participant.name || participant.identity;
      const mode = getVoiceAnnounceMode();
      if (mode === 'names') announce(`${speakableName(name)} left`, playLeaveChime);
      else if (mode === 'chime') playLeaveChime();
      window.electron?.notify('Voice Channel', `${name} left`);
    };

    room.on(RoomEvent.ParticipantConnected, onJoined);
    room.on(RoomEvent.ParticipantDisconnected, onLeft);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onJoined);
      room.off(RoomEvent.ParticipantDisconnected, onLeft);
    };
  }, [room]);

  return null;
}
