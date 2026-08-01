import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';

// Shared fetch/search/add/remove logic for a channel's tracked-games list —
// used by both the in-channel panel and the admin-portal Games tab so they
// don't drift out of sync with each other.
export function useGameTracking(channelId, isAdmin) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

  const loadGames = useCallback(async () => {
    if (!channelId) { setGames([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await api.get(`/channels/${channelId}/games`);
      setGames(data);
    } catch {} finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => { loadGames(); }, [loadGames]);

  useEffect(() => {
    if (!isAdmin) return;
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.get(`/games/search?q=${encodeURIComponent(query.trim())}`);
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query, isAdmin]);

  const addGame = async (result) => {
    setError('');
    try {
      const game = await api.post(`/channels/${channelId}/games`, {
        steamAppId: result.appId,
        name: result.name,
        iconUrl: result.iconUrl,
      });
      setGames((prev) => [...prev, game].sort((a, b) => a.name.localeCompare(b.name)));
      setQuery('');
      setResults([]);
    } catch (err) {
      setError(err.message);
    }
  };

  const removeGame = async (gameId) => {
    try {
      await api.delete(`/games/${gameId}`);
      setGames((prev) => prev.filter((g) => g.id !== gameId));
    } catch {}
  };

  const alreadyTracked = (appId) => games.some((g) => g.steam_app_id === appId);

  return { games, loading, query, setQuery, results, searching, error, addGame, removeGame, alreadyTracked };
}
