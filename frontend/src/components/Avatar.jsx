import React from 'react';

// Renders a user's custom picture if they have one, otherwise the existing
// colored-initial fallback. Reuses whatever className the caller already had
// on its avatar element (for sizing/shape/hover styles) — this component only
// decides what goes *inside* it.
export default function Avatar({ url, color, username, className, onClick, title, style }) {
  const initial = username?.[0]?.toUpperCase() || '?';
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      className={className}
      onClick={onClick}
      title={title}
      style={{ background: url ? undefined : (color || '#5865f2'), overflow: 'hidden', ...style }}
    >
      {url
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : initial}
    </Tag>
  );
}
