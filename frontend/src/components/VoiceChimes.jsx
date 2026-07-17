import { useEffect } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';

// Short synthesized two-note chimes — no audio assets needed. Ascending for
// a join, descending for a leave, same idea as Discord/TeamSpeak's blips.
function playTone(freqs, noteDuration = 0.12, gain = 0.15) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  freqs.forEach((freq, i) => {
    const start = ctx.currentTime + i * noteDuration;
    const end = start + noteDuration;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gainNode.gain.setValueAtTime(gain, start);
    gainNode.gain.exponentialRampToValueAtTime(0.001, end);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(start);
    osc.stop(end);
  });
  setTimeout(() => ctx.close(), (freqs.length * noteDuration + 0.1) * 1000);
}

const playJoinChime = () => playTone([523.25, 659.25]); // C5 -> E5
const playLeaveChime = () => playTone([659.25, 523.25]); // E5 -> C5

// Sits inside <LiveKitRoom> so it has access to the room's join/leave events.
export default function VoiceChimes() {
  const room = useRoomContext();

  useEffect(() => {
    if (!room) return;
    room.on(RoomEvent.ParticipantConnected, playJoinChime);
    room.on(RoomEvent.ParticipantDisconnected, playLeaveChime);
    return () => {
      room.off(RoomEvent.ParticipantConnected, playJoinChime);
      room.off(RoomEvent.ParticipantDisconnected, playLeaveChime);
    };
  }, [room]);

  return null;
}
