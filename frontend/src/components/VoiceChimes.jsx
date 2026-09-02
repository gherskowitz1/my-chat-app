import { useEffect } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';

// Real AIM-style blips, played via a fresh Audio() per call so overlapping
// join/leave events don't cut each other off.
const playJoinChime = () => new Audio('/sounds/buddy-in.mp3').play().catch(() => {});
const playLeaveChime = () => new Audio('/sounds/buddy-out.mp3').play().catch(() => {});

// Sits inside <LiveKitRoom> so it has access to the room's join/leave events.
export default function VoiceChimes() {
  const room = useRoomContext();

  useEffect(() => {
    if (!room) return;

    const onJoined = (participant) => {
      playJoinChime();
      window.electron?.notify('Voice Channel', `${participant.name || participant.identity} joined`);
    };
    const onLeft = (participant) => {
      playLeaveChime();
      window.electron?.notify('Voice Channel', `${participant.name || participant.identity} left`);
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
