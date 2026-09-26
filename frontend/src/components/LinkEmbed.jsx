import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import styles from './LinkEmbed.module.css';

const PlayIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
);

// Platforms without a simple, no-auth static thumbnail URL (Twitch, Vimeo)
// get a branded placeholder instead of a real preview image.
const PLACEHOLDER_META = {
  'twitch-clip': { label: 'Twitch Clip', color: '#9146FF' },
  'twitch-vod': { label: 'Twitch VOD', color: '#9146FF' },
  'twitch-channel': { label: 'Twitch', color: '#9146FF' },
  vimeo: { label: 'Vimeo', color: '#1ab7ea' },
};

function buildEmbedUrl(embed) {
  const parent = window.location.hostname;
  switch (embed.platform) {
    case 'youtube':
      // origin must match the embedding page's actual origin — YouTube's
      // IFrame API uses it for a postMessage-based security check, and
      // leaving it out (or mismatching it) is what surfaces as "Error 153".
      return `https://www.youtube.com/embed/${embed.videoId}?autoplay=1&origin=${encodeURIComponent(window.location.origin)}`;
    case 'twitch-clip':
      return `https://clips.twitch.tv/embed?clip=${embed.slug}&parent=${parent}&autoplay=true`;
    case 'twitch-vod':
      return `https://player.twitch.tv/?video=${embed.videoId}&parent=${parent}&autoplay=true`;
    case 'twitch-channel':
      return `https://player.twitch.tv/?channel=${embed.channel}&parent=${parent}&autoplay=true`;
    case 'vimeo':
      return `https://player.vimeo.com/video/${embed.videoId}?autoplay=1`;
    default:
      return null;
  }
}

// Click-to-load preview → iframe, for the video platforms.
function VideoEmbed({ embed }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className={styles.embed}>
        <iframe
          className={styles.frame}
          src={buildEmbedUrl(embed)}
          title={embed.platform}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  if (embed.platform === 'youtube') {
    return (
      <button className={styles.embed} onClick={() => setPlaying(true)} title="Play video">
        <img className={styles.thumb} src={`https://img.youtube.com/vi/${embed.videoId}/hqdefault.jpg`} alt="" />
        <span className={styles.playBtn}><PlayIcon /></span>
      </button>
    );
  }

  const meta = PLACEHOLDER_META[embed.platform];
  return (
    <button className={styles.embed} onClick={() => setPlaying(true)} title="Play video">
      <div className={styles.placeholder} style={{ background: meta.color }}>
        <span className={styles.playBtn}><PlayIcon /></span>
        <span className={styles.placeholderLabel}>{meta.label}</span>
      </div>
    </button>
  );
}

// Fetches server-side (avoids CORS, and keeps the target site from ever
// seeing the requesting user directly) via /link-preview, which itself
// caches by URL — repeatedly scrolling past the same message doesn't
// re-fetch. Renders nothing at all if the fetch fails or the page has no
// useful title, rather than a broken/empty-looking card.
function GenericCard({ embed }) {
  const [preview, setPreview] = useState(undefined); // undefined = loading, null = nothing to show

  useEffect(() => {
    let cancelled = false;
    setPreview(undefined);
    api.get(`/link-preview?url=${encodeURIComponent(embed.url)}`)
      .then((data) => { if (!cancelled) setPreview(data?.title ? data : null); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, [embed.url]);

  if (!preview) return null;

  return (
    <a className={styles.genericCard} href={embed.url} target="_blank" rel="noopener noreferrer">
      {preview.image && <img className={styles.genericCardImage} src={preview.image} alt="" loading="lazy" />}
      <div className={styles.genericCardText}>
        {preview.siteName && <span className={styles.genericCardSite}>{preview.siteName}</span>}
        <span className={styles.genericCardTitle}>{preview.title}</span>
        {preview.description && <span className={styles.genericCardDesc}>{preview.description}</span>}
      </div>
    </a>
  );
}

export default function LinkEmbed({ embed }) {
  if (embed.platform === 'generic') {
    return <GenericCard embed={embed} />;
  }

  if (embed.platform === 'image') {
    return <img className={styles.image} src={embed.url} alt="" loading="lazy" />;
  }

  if (embed.platform === 'spotify') {
    const height = embed.type === 'track' || embed.type === 'episode' ? 152 : 352;
    return (
      <iframe
        className={styles.widget}
        style={{ height }}
        src={`https://open.spotify.com/embed/${embed.type}/${embed.id}`}
        title="Spotify"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      />
    );
  }

  if (embed.platform === 'soundcloud') {
    return (
      <iframe
        className={styles.widget}
        style={{ height: 166 }}
        src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(embed.url)}&auto_play=false&color=%235865f2`}
        title="SoundCloud"
      />
    );
  }

  return <VideoEmbed embed={embed} />;
}
