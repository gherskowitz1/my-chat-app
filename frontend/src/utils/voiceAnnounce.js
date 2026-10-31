// What you hear when someone joins/leaves your voice channel — chosen in
// User Settings > Notifications, played by components/VoiceChimes.jsx. Kept
// separate from VoiceChimes so the settings screen can use it without
// pulling LiveKit into the main bundle.
export const STORAGE_KEY_VOICE_ANNOUNCE = 'crowsnest_voice_announce';

export const VOICE_ANNOUNCE_OPTIONS = [
  { value: 'names', label: 'Say their name ("Sam joined")' },
  { value: 'chime', label: 'Play a chime' },
  { value: 'off', label: 'Silent' },
];

export function getVoiceAnnounceMode() {
  try { return localStorage.getItem(STORAGE_KEY_VOICE_ANNOUNCE) || 'names'; } catch { return 'names'; }
}
