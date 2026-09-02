// Bump CURRENT_VERSION and add a new entry at the top whenever a batch of
// user-facing features ships. WhatsNewModal shows the top entry once to
// returning users whose last-seen version doesn't match — never to a
// brand-new sign-up, who has nothing to "catch up" on.
export const CHANGELOG = [
  {
    version: '1.5.0',
    date: 'August 2026',
    highlights: [
      'Light theme — switch it in User Settings > Appearance',
      'Renameable channel-section headers (admins: Server Settings)',
      'Voice: noise suppression toggle and a bitrate cap in User Settings > Audio',
      'Voice: your screen no longer dims or locks during a call',
      'Voice: a visible "Reconnecting…" banner and automatic mic recovery after a brief network blip',
    ],
  },
  {
    version: '1.4.0',
    date: 'July 2026',
    highlights: [
      'Private, invite-only channels',
      'PatchBot — automatic Steam game update tracking per channel',
      '@everyone mentions, clickable profile cards, and mention autocomplete',
      'Link previews for YouTube, Twitch, Vimeo, Spotify, SoundCloud, and images',
      'Manual online/away/offline status override',
      'Unread badges and in-app toast notifications',
    ],
  },
];

export const CURRENT_VERSION = CHANGELOG[0].version;
