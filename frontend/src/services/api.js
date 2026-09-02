const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

async function request(method, path, body) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    // A 401 here means the token itself is dead — invalid, or its
    // token_version no longer matches (password changed on another
    // device). Reloading drops straight back to the login screen instead
    // of leaving the app silently broken.
    if (res.status === 401 && token) {
      localStorage.removeItem('token');
      if (typeof window.electron?.clearToken === 'function') window.electron.clearToken();
      window.location.reload();
    }
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
};
