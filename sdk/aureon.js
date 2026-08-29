export function createAureonClient(baseUrl) {
  const root = baseUrl.replace(/\/$/, '');
  let accessToken = localStorage.getItem('aureon_access_token') || '';
  let refreshToken = localStorage.getItem('aureon_refresh_token') || '';

  function persistTokens(data) {
    if (data.access_token) { accessToken = data.access_token; localStorage.setItem('aureon_access_token', accessToken); }
    if (data.refresh_token) { refreshToken = data.refresh_token; localStorage.setItem('aureon_refresh_token', refreshToken); }
  }

  function clearTokens() {
    accessToken = ''; refreshToken = '';
    localStorage.removeItem('aureon_access_token');
    localStorage.removeItem('aureon_refresh_token');
  }

  async function raw(path, options = {}, token = accessToken) {
    return fetch(`${root}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
    });
  }

  async function request(path, options = {}, retry = true) {
    let response = await raw(path, options);
    if (response.status === 401 && retry && refreshToken && path !== '/auth/refresh') {
      const refreshed = await raw('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }, '');
      if (refreshed.ok) { const data = await refreshed.json(); persistTokens(data); response = await raw(path, options); }
      else clearTokens();
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `HTTP ${response.status}`);
      error.status = response.status; error.code = data.error; error.details = data;
      throw error;
    }
    return data;
  }

  return {
    auth: {
      async register(email, password, projectSlug = 'tradevision') {
        const data = await request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, project_slug: projectSlug }) }, false);
        persistTokens(data); return data;
      },
      async login(email, password) {
        const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false);
        persistTokens(data); return data;
      },
      async logout() {
        try { if (accessToken) await request('/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }, false); }
        finally { clearTokens(); }
      },
      me: () => request('/me'),
      isAuthenticated: () => Boolean(accessToken || refreshToken),
    },
    projects: {
      list: () => request('/projects'),
      access: (slug = 'tradevision') => request(`/projects/${encodeURIComponent(slug)}/access`),
      plans: (slug = 'tradevision') => request(`/projects/${encodeURIComponent(slug)}/plans`, {}, false),
      operations(slug = 'tradevision') {
        const s = encodeURIComponent(slug);
        return {
          list: (limit = 500) => request(`/projects/${s}/operations?limit=${encodeURIComponent(limit)}`),
          create: operation => request(`/projects/${s}/operations`, { method: 'POST', body: JSON.stringify(operation) }),
          remove: id => request(`/projects/${s}/operations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
        };
      },
      settings(slug = 'tradevision') {
        const s = encodeURIComponent(slug);
        return {
          get: () => request(`/projects/${s}/settings`),
          update: values => request(`/projects/${s}/settings`, { method: 'PUT', body: JSON.stringify(values) }),
        };
      },
      realtime(slug = 'tradevision') {
        const s = encodeURIComponent(slug);
        return {
          publish(topic, eventType, payload = {}) {
            return request(`/api/projects/${s}/realtime/publish`, {
              method: 'POST',
              body: JSON.stringify({ topic, event_type: eventType, payload }),
            });
          },
          events({ after = 0, limit = 100, topic = null } = {}) {
            const params = new URLSearchParams({ after: String(after), limit: String(limit) });
            if (topic !== null && topic !== undefined && String(topic) !== '') params.set('topic', String(topic));
            return request(`/api/projects/${s}/realtime/events?${params.toString()}`);
          },
        };
      },
    },
  };
}
