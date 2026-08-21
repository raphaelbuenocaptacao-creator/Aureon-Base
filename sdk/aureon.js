export function createAureonClient(baseUrl) {
  let token = localStorage.getItem('aureon_access_token') || '';

  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  return {
    auth: {
      async register(email, password) {
        const data = await request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
        token = data.access_token;
        localStorage.setItem('aureon_access_token', token);
        return data;
      },
      async login(email, password) {
        const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        token = data.access_token;
        localStorage.setItem('aureon_access_token', token);
        return data;
      },
      logout() {
        token = '';
        localStorage.removeItem('aureon_access_token');
      },
      me() { return request('/me'); },
    },
    projects: {
      list() { return request('/projects'); },
      operations(slug = 'tradevision') {
        return {
          list: () => request(`/projects/${slug}/operations`),
          create: operation => request(`/projects/${slug}/operations`, { method: 'POST', body: JSON.stringify(operation) }),
          remove: id => request(`/projects/${slug}/operations/${id}`, { method: 'DELETE' }),
        };
      },
    },
  };
}
