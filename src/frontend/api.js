// src/frontend/api.js
const BACKEND =
  import.meta.env.VITE_BACKEND_URL ||
  window.__BACKEND_URL__ ||
  "http://localhost:4000";

async function jget(path) {
  const res = await fetch(`${BACKEND}${path}`, {
    credentials: "include"
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function jpost(path, body) {
  const res = await fetch(`${BACKEND}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body ?? {})
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST ${path} -> ${res.status} ${res.statusText} ${txt}`);
  }
  return res.json();
}

export const AuthAPI = {
  me: () => jget("/api/auth/me"),
  loginUrl: () => `${BACKEND}/api/auth/discord`,
  logout: () => jpost("/api/auth/logout")
};

export const LeadsAPI = {
  list: () => jget("/api/leads"),
  debug: () => jget("/api/leads/debug")
};

export const RaidsAPI = {
  list: () => jget("/api/raids"),
  create: (data) => jpost("/api/raids", data)
};
