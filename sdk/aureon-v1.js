export function createAureon(baseUrl, options = {}) {
  const root = String(baseUrl || '').replace(/\/$/, '');
  const storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const accessKey = options.accessKey || 'aureon_access_token';
  const refreshKey = options.refreshKey || 'aureon_refresh_token';
  let accessToken = storage?.getItem(accessKey) || '';
  let refreshToken = storage?.getItem(refreshKey) || '';

  function setTokens(data = {}) {
    if (data.access_token) {
      accessToken = data.access_token;
      storage?.setItem(accessKey, accessToken);
    }
    if (data.refresh_token) {
      refreshToken = data.refresh_token;
      storage?.setItem(refreshKey, refreshToken);
    }
  }

  function clearTokens() {
    accessToken = '';
    refreshToken = '';
    storage?.removeItem(accessKey);
    storage?.removeItem(refreshKey);
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
        setTokens(await refreshed.json());
        response = await raw(path, options);
      } else clearTokens();
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = data.error;
      error.details = data;
      throw error;
    }
    return data;
  }

  function project(slug) {
    const projectSlug = encodeURIComponent(slug);
    return {
      access: () => request(`/projects/${projectSlug}/access`),
      plans: () => request(`/projects/${projectSlug}/plans`, {}, false),
      from(collection) {
        const name = encodeURIComponent(collection);
        const base = `/v1/projects/${projectSlug}/data/${name}`;
        return {
          list: ({ limit = 100, offset = 0 } = {}) => request(`${base}?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`),
          get: id => request(`${base}/${encodeURIComponent(id)}`),
          insert: data => request(base, { method: 'POST', body: JSON.stringify({ data }) }),
          update: (id, data) => request(`${base}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ data }) }),
          remove: id => request(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
        };
      },
    };
  }

  return {
    auth: {
      async signUp({ email, password, project: projectSlug }) {
        const data = await request('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, project_slug: projectSlug }),
        }, false);
        setTokens(data);
        return data;
      },
      async signIn({ email, password }) {
        const data = await request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        }, false);
        setTokens(data);
        return data;
      },
      async signOut() {
        try {
          if (accessToken) await request('/auth/logout', {
            method: 'POST',
            body: JSON.stringify({ refresh_token: refreshToken }),
          }, false);
        } finally {
          clearTokens();
        }
      },
      me: () => request('/me'),
      requestPasswordReset: email => request('/auth/request-password-reset', { method: 'POST', body: JSON.stringify({ email }) }, false),
      resetPassword: ({ email, code, newPassword }) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, code, new_password: newPassword }) }, false),
      isAuthenticated: () => Boolean(accessToken || refreshToken),
    },
    projects: {
      list: () => request('/projects'),
      use: project,
    },
    from(collection, projectSlug = options.project) {
      if (!projectSlug) throw new Error('Aureon project slug is required.');
      return project(projectSlug).from(collection);
    },
  };
}
