const dns = require('dns').promises;
const net = require('net');

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'Mozilla/5.0 (compatible; CrowsNestLinkPreview/1.0; +https://www.thecrowsnesttalk.com)';

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0] === 127 || p[0] === 10 || p[0] === 0
      || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
      || (p[0] === 192 && p[1] === 168)
      || (p[0] === 169 && p[1] === 254); // includes cloud metadata endpoints
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) {
      const v4 = lower.slice(7);
      if (net.isIPv4(v4)) return isPrivateAddress(v4);
    }
    return false;
  }
  return true; // unrecognized shape — block rather than risk it
}

// Resolves the hostname and checks every returned address, not just
// whichever one a fetch might pick — a basic guard against a malicious
// domain that answers with a mix of public and private/internal addresses.
async function isUrlSafe(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;
  try {
    const addresses = net.isIP(hostname) ? [{ address: hostname }] : await dns.lookup(hostname, { all: true });
    return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
}

// Regex-based rather than a full HTML parser — Open Graph tags always live
// in <head>, and this is the same lightweight approach most link-unfurl
// services use rather than pulling in a DOM dependency for a few meta tags.
function extractMeta(html) {
  const head = html.slice(0, 100_000);
  const getMeta = (prop) => {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i');
    const m = head.match(re1) || head.match(re2);
    return m ? decodeEntities(m[1]).trim() : null;
  };
  const titleMatch = head.match(/<title[^>]*>([^<]*)<\/title>/i);
  return {
    title: getMeta('og:title') || (titleMatch ? decodeEntities(titleMatch[1]).trim() : null),
    description: getMeta('og:description') || getMeta('description'),
    image: getMeta('og:image'),
    siteName: getMeta('og:site_name'),
  };
}

// Redirects are followed manually rather than via fetch's redirect:'follow'
// so every hop gets the same private-network check as the original URL —
// otherwise a malicious or compromised site could redirect straight at an
// internal service or a cloud metadata endpoint.
async function fetchHtml(startUrl) {
  let url = startUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!(await isUrlSafe(url))) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, { signal: controller.signal, redirect: 'manual', headers: { 'User-Agent': USER_AGENT } });
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) return null;
      try {
        url = new URL(location, url).toString();
      } catch {
        return null;
      }
      continue;
    }
    if (!res.ok || !res.body) return null;
    if (!(res.headers.get('content-type') || '').includes('text/html')) return null;

    const reader = res.body.getReader();
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      chunks.push(value);
      if (received > MAX_BYTES) {
        reader.cancel().catch(() => {});
        break;
      }
    }
    return { html: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8'), finalUrl: url };
  }
  return null; // too many redirects
}

async function getLinkPreview(url) {
  const fetched = await fetchHtml(url);
  if (!fetched) return null;

  const meta = extractMeta(fetched.html);
  if (!meta.title) return null; // nothing worth showing a card for

  let image = meta.image;
  if (image) {
    try {
      image = new URL(image, fetched.finalUrl).toString();
    } catch {
      image = null;
    }
    if (image && !(await isUrlSafe(image))) image = null;
  }

  return {
    title: meta.title.slice(0, 200),
    description: meta.description ? meta.description.slice(0, 300) : null,
    image,
    siteName: (meta.siteName || new URL(fetched.finalUrl).hostname).slice(0, 100),
  };
}

module.exports = { getLinkPreview };
