// Both endpoints below are Steam's public store/news APIs — no API key
// required, safe to call directly from the backend.

async function searchSteamGames(query) {
  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&cc=us&l=en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Steam search failed');
  const data = await res.json();
  return (data.items || []).slice(0, 10).map((item) => ({
    appId: item.id,
    name: item.name,
    iconUrl: item.tiny_image,
  }));
}

async function getGameNews(appId, count = 6) {
  const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appId}&count=${count}&maxlength=1000&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Steam news fetch failed');
  const data = await res.json();
  return data.appnews?.newsitems || [];
}

// Steam news bodies are a mix of BBCode ([b], [list], [url=...], [img]...)
// and stray HTML — strips both down to plain text for a chat message. Steam's
// own API also flattens [*] bullet points down to bare backslashes before it
// ever reaches us, so those get turned back into readable bullets here.
function stripFormatting(text) {
  return (text || '')
    .replace(/\[img\][\s\S]*?\[\/img\]/gi, '')
    .replace(/\[url=[^\]]*\]/gi, '')
    .replace(/\[\/?[a-z*][^\]]*\]/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\r/g, '')
    .replace(/\\/g, '\n• ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { searchSteamGames, getGameNews, stripFormatting };
