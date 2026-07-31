// Detects links to platforms with an official embeddable player (YouTube,
// Twitch, Vimeo, Spotify, SoundCloud) or direct image files, and returns
// enough info for <LinkEmbed> to render a preview under the message.
//
// Every captured id/slug is validated against that platform's actual URL
// shape via regex before it's ever placed into an embed src — none of this
// is built from unsanitized freeform text.
export function extractEmbeds(text) {
  const embeds = [];
  const seen = new Set();
  const add = (platform, key, data) => {
    const dedupeKey = `${platform}:${key}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    embeds.push({ platform, key: dedupeKey, ...data });
  };

  let m;

  // YouTube — youtube.com/watch, youtu.be, /shorts/, /embed/
  const ytRe = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
  while ((m = ytRe.exec(text))) add('youtube', m[1], { videoId: m[1] });

  // Twitch clips — clips.twitch.tv/Slug or twitch.tv/channel/clip/Slug.
  // Matched (and stripped from a working copy) before the plain-channel
  // check below, so a clip URL doesn't also register as a channel link.
  const clipRe = /(?:clips\.twitch\.tv\/|twitch\.tv\/\w+\/clip\/)([A-Za-z0-9_-]+)/g;
  while ((m = clipRe.exec(text))) add('twitch-clip', m[1], { slug: m[1] });
  let remaining = text.replace(clipRe, '');

  // Twitch VODs — twitch.tv/videos/12345
  const vodRe = /twitch\.tv\/videos\/(\d+)/g;
  while ((m = vodRe.exec(text))) add('twitch-vod', m[1], { videoId: m[1] });
  remaining = remaining.replace(vodRe, '');

  // Twitch live channel — whatever twitch.tv/<name> is left after clips/VODs
  const channelRe = /twitch\.tv\/([a-zA-Z0-9_]{3,25})\b/g;
  while ((m = channelRe.exec(remaining))) add('twitch-channel', m[1], { channel: m[1] });

  // Vimeo
  const vimeoRe = /vimeo\.com\/(\d+)/g;
  while ((m = vimeoRe.exec(text))) add('vimeo', m[1], { videoId: m[1] });

  // Spotify — track/album/playlist/episode/show. Uses Spotify's own
  // official embed iframe (open.spotify.com/embed/...), the same sanctioned
  // widget any website can use — not related to extracting/redistributing
  // full track audio, which Spotify's API doesn't allow.
  const spotifyRe = /open\.spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/g;
  while ((m = spotifyRe.exec(text))) add('spotify', `${m[1]}-${m[2]}`, { type: m[1], id: m[2] });

  // SoundCloud — pass the whole URL to their official oEmbed-resolving player
  const scRe = /(https?:\/\/(?:www\.)?soundcloud\.com\/[\w-]+\/[\w-]+)/g;
  while ((m = scRe.exec(text))) add('soundcloud', m[1], { url: m[1] });

  // Direct image links
  const imgRe = /https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?/gi;
  while ((m = imgRe.exec(text))) add('image', m[0], { url: m[0] });

  return embeds;
}
