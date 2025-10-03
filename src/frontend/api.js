// src/frontend/api.js

const JSON_HEADERS = { "Content-Type": "application/json" };
const OPTS = { credentials: "include" };

async function jget(url) {
  const r = await fetch(url, OPTS);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;
  return await r.json();
}

async function jpost(url, body) {
  const r = await fetch(url, { ...OPTS, method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body || {}) });
  if (!r.ok) {
    let msg = await r.text().catch(() => "");
    try { const j = JSON.parse(msg); msg = j.message || j.error || msg; } catch {}
    throw new Error(msg || `${r.status} ${r.statusText}`);
  }
  const ct = r.headers.get("content-type") || "";
  return ct.includes("application/json") ? await r.json() : null;
}

async function jdel(url) {
  const r = await fetch(url, { ...OPTS, method: "DELETE" });
  if (!r.ok) {
    let msg = await r.text().catch(() => "");
    try { const j = JSON.parse(msg); msg = j.message || j.error || msg; } catch {}
    throw new Error(msg || `${r.status} ${r.statusText}`);
  }
  const ct = r.headers.get("content-type") || "";
  return ct.includes("application/json") ? await r.json() : null;
}

/* ---------------- Auth ---------------- */
export const AuthAPI = {
  async me() {
    // Erwartet { user: {...} }
    const j = await jget("/api/auth/me");
    return j || { user: null };
  },
  async logout() {
    return await jpost("/api/auth/logout");
  },
};

/* ---------------- Leads (Raidleads/Admins) ---------------- */
export const LeadsAPI = {
  async list() {
    // Backend kann {leads:[...]} ODER direkt ein Array liefern
    const j = await jget("/api/leads");
    if (Array.isArray(j)) return { leads: j };
    if (j && Array.isArray(j.leads)) return j;
    return { leads: [] };
  },
};

/* ---------------- Presets ---------------- */
export const PresetsAPI = {
  async list() {
    // Erwartet ein Array
    const j = await jget("/api/presets");
    return Array.isArray(j) ? j : (Array.isArray(j?.presets) ? j.presets : []);
  },
};

/* ---------------- Raids ---------------- */
export const RaidsAPI = {
  async list() {
    // Erwartet ein Array (Server formt lead bereits als Displayname)
    const j = await jget("/api/raids");
    return Array.isArray(j) ? j : (Array.isArray(j?.raids) ? j.raids : []);
  },

  async detail(id) {
    if (id == null) throw new Error("id_required");
    const j = await jget(`/api/raids/${id}`);
    // Backend liefert { ok:true, raid:{...} }
    return j?.raid ?? j;
  },

  async create(payload) {
    const j = await jpost("/api/raids", payload);
    return j?.raid ?? j;
  },

  async remove(id) {
    if (id == null) throw new Error("id_required");
    return await jdel(`/api/raids/${id}`);
  },
};

/* ---------------- Chars (optional – falls du sie hier brauchst) ---------------- */
export const CharsAPI = {
  async mine() {
    // Erwartet { chars: [...] } ODER Array
    const j = await jget("/api/chars/mine");
    if (Array.isArray(j)) return j;
    if (j?.chars && Array.isArray(j.chars)) return j.chars;
    return [];
  },
  async importOne(payload) {
    // z.B. { name, realm, class, spec, rioScore, progress, itemLevel, wclUrl }
    const j = await jpost("/api/chars/import", payload);
    return j;
  },
  async remove(id) {
    if (id == null) throw new Error("id_required");
    return await jdel(`/api/chars/${id}`);
  },
};
