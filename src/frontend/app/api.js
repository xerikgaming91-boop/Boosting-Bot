const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

async function jfetch(path, options = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${BACKEND}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  const ctype = res.headers.get('content-type') || '';
  return ctype.includes('application/json') ? res.json() : res.text();
}

export const AuthAPI = {
  loginUrl: () => `${BACKEND}/api/auth/login`,
  async me() {
    const { user } = await jfetch('/api/auth/me');
    return user;
  },
  async logout() {
    await jfetch('/api/auth/logout', { method: 'POST' });
    location.href = '/';
  }
};

export const LeadsAPI = {
  async list() {
    const { items } = await jfetch('/api/leads');
    return items;
  }
};

export const RaidsAPI = {
  async list() {
    const { items } = await jfetch('/api/raids');
    return items;
  },
  async create(payload) {
    return jfetch('/api/raids', { method: 'POST', body: JSON.stringify(payload) });
  }
};
