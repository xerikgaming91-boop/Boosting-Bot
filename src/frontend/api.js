// Zentrale API-Helpers (Frontend)
const BASE = "/api";

export const AuthAPI = {
  async me() {
    const r = await fetch(`${BASE}/auth/me`, { credentials: "include" });
    if (!r.ok) return { user: null };
    return r.json();
  },
  loginUrl() {
    return `${BASE}/auth/discord`;
  },
  async logout() {
    const r = await fetch(`${BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    return r.ok;
  },
};

export const LeadsAPI = {
  async list() {
    const r = await fetch(`${BASE}/leads`, { credentials: "include" });
    if (!r.ok) return { leads: [] };
    return r.json();
  },
};

export const RaidsAPI = {
  async list() {
    const r = await fetch(`${BASE}/raids`, { credentials: "include" });
    if (!r.ok) return { raids: [] };
    return r.json();
  },

  async create(payload) {
    const r = await fetch(`${BASE}/raids`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || "failed_create");
    return data;
  },

  async remove(id) {
    const r = await fetch(`${BASE}/raids/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || "failed_delete");
    return data;
  },
};
