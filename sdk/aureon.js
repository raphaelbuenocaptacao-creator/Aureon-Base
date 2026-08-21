export function createAureonClient(baseUrl) {
  const root = baseUrl.replace(/\/$/, '');
  let accessToken = localStorage.getItem('aureon_access_token') || '';
  let refreshToken = localStorage.getItem('aureon_refresh_token') || '';

  function persistTokens(data) {
    if (data.access_token) {
      accessToken = data.access_token;
      localStorage.setItem('aureon_access_token', accessToken);
    }
    if (data.refresh_token) {
      refreshToken = data.refresh_token;
      localStorage.setItem('aureon_refresh_token', refreshToken);
    }
  }

  function clearTokens() {
    accessToken = '';
    refreshToken = '';
    localStorage.removeItem('aureon_access_token');
    localStorage.removeItem('aureon_refresh_token');
  }

  async function raw(path, options = {}, token = accessToken) {
    return fetch(`${root}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  }

  async function request(path, options = {}, retry = true) {
    let response = await raw(path, options);
    if (response.status === 401 && retry && refreshToken && path !== '/auth/refresh') {
      const refreshed = await raw('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      }, '');
      if (refreshed.ok) {
        const data = await refreshed.json();
        persistTokens(data);
        response = await raw(path, options);
      } else {
        clearTokens();
      }
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = data.error;
      throw error;
    }
    return data;
  }

  return {
    auth: {
      async register(email, password) {
        const data = await request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }, false);
        persistTokens(data);
        return data;
      },
      async login(email, password) {
        const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false);
        persistTokens(data);
        return data;
      },
      async logout() {
        try {
          if (accessToken) await request('/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }, false);
        } finally {
          clearTokens();
        }
      },
      me() { return request('/me'); },
      isAuthenticated() { return Boolean(accessToken || refreshToken); },
    },
    projects: {
      list() { return request('/projects'); },
      operations(slug = 'tradevision') {
        return {
          list: (limit = 500) => request(`/projects/${slug}/operations?limit=${encodeURIComponent(limit)}`),
          create: operation => request(`/projects/${slug}/operations`, { method: 'POST', body: JSON.stringify(operation) }),
          remove: id => request(`/projects/${slug}/operations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
        };
      },
      settings(slug = 'tradevision') {
        return {
          get: () => request(`/projects/${slug}/settings`),
          update: values => request(`/projects/${slug}/settings`, { method: 'PUT', body: JSON.stringify(values) }),
        };
      },
    },
  };
}
