// Unlike steamNews.js's public store/news endpoints, GetPlayerSummaries and
// ResolveVanityURL require an API key (https://steamcommunity.com/dev/apikey).

const PROFILE_URL_RE = /steamcommunity\.com\/profiles\/(\d{17})/i;
const VANITY_URL_RE = /steamcommunity\.com\/id\/([^/\s]+)/i;
const STEAMID64_RE = /^\d{17}$/;

// Accepts a raw SteamID64, a full profile/vanity URL, or a bare vanity name,
// and resolves it down to a SteamID64.
async function resolveSteamId(input) {
  const trimmed = input.trim();

  const profileMatch = trimmed.match(PROFILE_URL_RE);
  if (profileMatch) return profileMatch[1];
  if (STEAMID64_RE.test(trimmed)) return trimmed;

  const vanityMatch = trimmed.match(VANITY_URL_RE);
  const vanity = vanityMatch ? vanityMatch[1] : trimmed;

  const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${process.env.STEAM_API_KEY}&vanityurl=${encodeURIComponent(vanity)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Steam lookup failed');
  const data = await res.json();
  if (data.response?.success !== 1) throw new Error('Could not find that Steam profile');
  return data.response.steamid;
}

// Steam allows up to 100 steamids per call.
async function getPlayerSummaries(steamIds) {
  if (steamIds.length === 0) return [];
  const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${process.env.STEAM_API_KEY}&steamids=${steamIds.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Steam player lookup failed');
  const data = await res.json();
  return data.response?.players || [];
}

module.exports = { resolveSteamId, getPlayerSummaries };
