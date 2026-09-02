// GIPHY's public search/trending REST API — no SDK needed, just fetch +
// an API key. Mirrors the shape of steamNews.js: a thin fetch wrapper the
// controller calls, keeping the key itself server-side only.
const BASE = 'https://api.giphy.com/v1/gifs';

function mapResult(item) {
  const { fixed_width, original } = item.images;
  return {
    id: item.id,
    title: item.title,
    previewUrl: fixed_width.url,
    previewWidth: Number(fixed_width.width),
    previewHeight: Number(fixed_width.height),
    url: original.url,
  };
}

async function searchGifs(query, limit = 24) {
  const url = `${BASE}/search?api_key=${process.env.GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&rating=pg-13`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('GIPHY search failed');
  const data = await res.json();
  return (data.data || []).map(mapResult);
}

async function getTrendingGifs(limit = 24) {
  const url = `${BASE}/trending?api_key=${process.env.GIPHY_API_KEY}&limit=${limit}&rating=pg-13`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('GIPHY trending failed');
  const data = await res.json();
  return (data.data || []).map(mapResult);
}

module.exports = { searchGifs, getTrendingGifs };
