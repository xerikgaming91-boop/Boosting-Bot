// src/backend/routes/chars.js
import express from "express";
import { prisma } from "../prismaClient.js";
import crypto from "node:crypto";

const ENV = process.env;
const router = express.Router();

const IS_PROD = (ENV.MODE || ENV.NODE_ENV) === "production";
const COOKIE_NAME   = ENV.JWT_COOKIE_NAME || ENV.COOKIE_NAME || "bb_auth";
const COOKIE_SECRET = ENV.JWT_Secret || ENV.COOKIE_SECRET || "dev-secret-fallback";

function dbg(...a) {
  if (ENV.DEBUG_AUTH === "true" || !IS_PROD) {
    const t = new Date();
    const ts =
      t.toLocaleTimeString("de-DE", { hour12: false }) +
      "." +
      String(t.getMilliseconds()).padStart(3, "0");
    console.log("[CHARS-DBG " + ts + "]", ...a);
  }
}

/* ------------ Auth (wie in raids.js) ------------ */
function verifyToken(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const [v, payloadB64, sigB64] = token.split(".");
    if (v !== "v1" || !payloadB64 || !sigB64) return null;
    const payloadBuf = Buffer.from(payloadB64, "base64");
    const expected = crypto
      .createHmac("sha256", COOKIE_SECRET)
      .update(payloadBuf)
      .digest();
    const given = Buffer.from(sigB64, "base64");
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given))
      return null;
    return JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    return null;
  }
}
function getUser(req) {
  const raw = req.cookies?.[COOKIE_NAME];
  return verifyToken(raw);
}

/* ------------ Helpers ------------ */
function cleanStr(v) { if (v == null) return null; const s = String(v).trim(); return s.length ? s : null; }
function toFloatOrNull(v){ if (v==null||v==="") return null; const n=Number(v); return Number.isFinite(n)?n:null; }
function toIntOrNull(v){ if (v==null||v==="") return null; const n=parseInt(v,10); return Number.isFinite(n)?n:null; }
function cleanUrl(v){ const s=cleanStr(v); if(!s) return null; try{ const u=new URL(s.startsWith("http")?s:`https://${s}`); return u.toString(); }catch{return null;} }

function normalizeChar(c) {
  return {
    id: c.id, userId: c.userId, name: c.name, realm: c.realm,
    class: c.class ?? null, spec: c.spec ?? null, rioScore: c.rioScore ?? null,
    progress: c.progress ?? null, itemLevel: c.itemLevel ?? null, wclUrl: c.wclUrl ?? null,
    updatedAt: c.updatedAt ?? null,
  };
}

/** Sicherstellen, dass es einen User mit discordId gibt (FK für BoosterChar.userId). */
async function ensureUserExists(discordId) {
  if (!discordId) return null;
  try {
    return await prisma.user.upsert({ where: { discordId }, update: {}, create: { discordId } });
  } catch (e) { dbg("ensureUserExists failed:", e?.message || e); return null; }
}

/** Char für (userId, name, realm) finden. */
async function findChar(userId, name, realm) {
  return prisma.boosterChar.findFirst({ where: { userId, name, realm } });
}

/* ------------ Externe Abfragen (Raider.IO + WCL-Link) ------------ */
function makeWclUrl({ region = "eu", realm, name }) {
  const slugRealm = String(realm).toLowerCase().replace(/\s+/g, "-");
  const slugName  = String(name).toLowerCase();
  return `https://www.warcraftlogs.com/character/${region}/${slugRealm}/${slugName}`;
}

/* ---------- Raid-Key Auflösung: erzwinge Manaforge Omega ---------- */
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

/** eingebaute Aliases → echte RaiderIO Keys */
function builtinAliases() {
  return {
    "manaforge-omega": "manaforge-omega",      // TWW Season 3
    "manaforge": "manaforge-omega",
    "omega": "manaforge-omega",
    "nerubar": "nerubar-palace",               // TWW S1
    "nerub-ar-palace": "nerubar-palace",
    "amirdrassil": "amirdrassil-the-dreams-hope",
    "aberrus": "aberrus-the-shadowed-crucible",
    "vault": "vault-of-the-incarnates",
  };
}

/** parse ENV alias CSV: foo:bar,baz:qux */
function envAliases() {
  const out = {};
  const raw = cleanStr(ENV.RAIDERIO_RAID_ALIASES);
  if (!raw) return out;
  for (const pair of raw.split(",")) {
    const [a, b] = pair.split(":").map(slugify);
    if (a && b) out[a] = b;
  }
  return out;
}

/** Kandidaten-Liste in Priorität: 1) Manaforge Omega, 2) ENV, 3) bekannte Defaults */
function resolveDesiredKeys(raidProg) {
  const keys = Object.keys(raidProg || {});
  const keySlugs = keys.map(slugify);
  const aliasMap = { ...builtinAliases(), ...envAliases() };

  function mapOne(input) {
    if (!input) return null;
    let s = slugify(input);
    if (aliasMap[s]) s = aliasMap[s];
    // exakter Treffer
    let idx = keySlugs.indexOf(s);
    if (idx >= 0) return keys[idx];
    // fuzzy: enthält/beinhaltet
    idx = keySlugs.findIndex(k => k.includes(s) || s.includes(k));
    if (idx >= 0) return keys[idx];
    return null;
  }

  // (1) ERZWINGE Manaforge Omega als Top-Priorität
  const forced = mapOne("manaforge-omega");

  // (2) ENV
  const envList = cleanStr(ENV.RAIDERIO_CURRENT_RAIDS)
    ? ENV.RAIDERIO_CURRENT_RAIDS.split(",").map(t => t.trim()).filter(Boolean)
    : [];

  // (3) Defaults (falls ältere Chars o. Keys)
  const defaults = [
    "manaforge-omega",
    "nerubar-palace",
    "amirdrassil-the-dreams-hope",
    "aberrus-the-shadowed-crucible",
    "vault-of-the-incarnates",
  ];

  const result = [];
  if (forced && !result.includes(forced)) result.push(forced);
  for (const x of envList) {
    const m = mapOne(x);
    if (m && !result.includes(m)) result.push(m);
  }
  for (const x of defaults) {
    const m = mapOne(x);
    if (m && !result.includes(m)) result.push(m);
  }
  return result;
}

/** Wählt bevorzugt aktuelle Keys; Fallback: bester Raid. */
function pickCurrentRaidSummary(raidProg) {
  if (!raidProg || typeof raidProg !== "object") return null;

  // 1) bevorzugte Keys (Manaforge Omega zuerst)
  const desired = resolveDesiredKeys(raidProg);

  const format = (o) => {
    if (!o) return null;
    if (o.summary) return o.summary; // z.B. "6/8 M"
    const total = o.total_bosses ?? 0;
    const m = o.mythic_bosses_killed ?? 0;
    const h = o.heroic_bosses_killed ?? 0;
    const n = o.normal_bosses_killed ?? 0;
    if (m) return `${m}/${total} M`;
    if (h) return `${h}/${total} H`;
    if (n) return `${n}/${total} N`;
    return `${0}/${total}`;
  };

  for (const key of desired) {
    const o = raidProg[key];
    const s = format(o);
    if (s) return s;
  }

  // 2) Fallback: „bester“ Raid
  let best = null;
  for (const obj of Object.values(raidProg)) {
    if (!obj || typeof obj !== "object") continue;
    const total = obj.total_bosses ?? 0;
    const m = obj.mythic_bosses_killed ?? 0;
    const h = obj.heroic_bosses_killed ?? 0;
    const n = obj.normal_bosses_killed ?? 0;
    const score = m * 10000 + h * 100 + n; // prio M > H > N
    if (!best || score > best.score || total > best.total) {
      best = { ...obj, score, total, m, h, n };
    }
  }
  return format(best);
}

/** Holt fehlende Felder progress/itemLevel/class/spec/rioScore (Raider.IO) + wclUrl. */
async function fetchExternalMeta({ region = "eu", realm, name }) {
  try {
    const u = new URL("https://raider.io/api/v1/characters/profile");
    u.searchParams.set("region", region);
    u.searchParams.set("realm", realm);
    u.searchParams.set("name", name);
    u.searchParams.set("fields", "gear,raid_progression,mythic_plus_scores_by_season:current");

    const r = await fetch(u, { headers: { "User-Agent": "boosting-bot/1.0" } });
    if (!r.ok) throw new Error(`raiderio ${r.status}`);
    const j = await r.json();

    const itemLevel =
      toIntOrNull(j?.gear?.item_level_equipped) ??
      toIntOrNull(j?.gear?.item_level_total);

    // **erzwinge Manaforge Omega / aktuelle Keys**
    const progress = pickCurrentRaidSummary(j?.raid_progression);

    const className = cleanStr(j?.class) || cleanStr(j?.class_name) || null;
    const specName  = cleanStr(j?.active_spec_name) || cleanStr(j?.spec_name) || null;

    let rioScore =
      toFloatOrNull(
        j?.mythic_plus_scores_by_season?.[0]?.scores?.all ??
        j?.mythic_plus_scores_by_season?.[0]?.segments?.all?.score
      ) ??
      toFloatOrNull(j?.mythic_plus_scores?.all) ??
      toFloatOrNull(j?.mythic_plus_score) ??
      null;

    const wclUrl = makeWclUrl({ region, realm, name });

    return {
      itemLevel: itemLevel ?? null,
      progress:  progress ?? null,
      className: className ?? null,
      specName:  specName ?? null,
      rioScore:  rioScore ?? null,
      wclUrl,
    };
  } catch (e) {
    dbg("fetchExternalMeta failed:", e?.message || e);
    return {
      itemLevel: null, progress: null, className: null, specName: null, rioScore: null,
      wclUrl: makeWclUrl({ region, realm, name }),
    };
  }
}

/* ------------ Create/Update inkl. Auto-Fill ------------ */
async function upsertChar(userId, payload) {
  const name = cleanStr(payload.name);
  const realm = cleanStr(payload.realm);
  if (!name || !realm) { const err=new Error("name_and_realm_required"); err.status=400; throw err; }

  const region   = cleanStr(payload.region) || "eu";
  let progress   = cleanStr(payload.progress);
  let itemLevel  =
    toIntOrNull(payload.itemLevel) ?? toIntOrNull(payload.itemlevel) ?? toIntOrNull(payload.ilvl);
  let wclUrl     =
    cleanUrl(payload.wclUrl) ?? cleanUrl(payload.warcraftlogs) ??
    cleanUrl(payload.warcraftlogsUrl) ?? cleanUrl(payload.logsUrl);
  let className  = cleanStr(payload.class ?? payload.cls);
  let specName   = cleanStr(payload.spec);
  let rioScore   = toFloatOrNull(payload.rioScore);

  if (!progress || !itemLevel || !wclUrl || !className || !specName || rioScore == null) {
    const ext = await fetchExternalMeta({ region, realm, name });
    progress  = progress  || ext.progress;
    itemLevel = itemLevel || ext.itemLevel;
    wclUrl    = wclUrl    || ext.wclUrl;
    className = className || ext.className;
    specName  = specName  || ext.specName;
    rioScore  = rioScore  ?? ext.rioScore;
  }

  const data = {
    userId, name, realm,
    class: className ?? undefined,
    spec: specName ?? undefined,
    rioScore: rioScore ?? undefined,
    progress: progress ?? undefined,
    itemLevel: itemLevel ?? undefined,
    wclUrl: wclUrl ?? undefined,
  };

  const existing = await findChar(userId, name, realm);
  if (existing) {
    const row = await prisma.boosterChar.update({ where: { id: existing.id }, data });
    return { row, created: false };
  } else {
    const row = await prisma.boosterChar.create({ data });
    return { row, created: true };
  }
}

/* =========================================================
 *                      ROUTES
 * =======================================================*/

router.get("/", async (_req, res) => {
  try {
    const rows = await prisma.boosterChar.findMany({ orderBy: [{ updatedAt: "desc" }] });
    return res.json({ ok: true, chars: rows.map(normalizeChar) });
  } catch (e) {
    dbg("list_error:", e?.message || e);
    res.status(500).json({ ok:false, error:"LIST_FAILED", message:e?.message || "unknown" });
  }
});

router.get("/mine", async (req, res) => {
  try {
    const u = getUser(req);
    if (!u?.id) return res.status(401).json({ ok:false, error:"UNAUTHORIZED", message:"login_required" });

    let rows = await prisma.boosterChar.findMany({
      where: { userId: String(u.id) },
      orderBy: [{ updatedAt: "desc" }],
    });

    // 👉 Progress immer gegen „Manaforge Omega“ prüfen/aktualisieren,
    //    auch wenn schon ein alter Wert gespeichert ist.
    for (const c of rows) {
      const ext = await fetchExternalMeta({ region: "eu", realm: c.realm, name: c.name });

      const patch = {};
      // Progress immer aktualisieren, wenn er sich unterscheidet und ext.progress vorhanden
      if (ext.progress && ext.progress !== c.progress) patch.progress = ext.progress;

      // Die restlichen Felder nur nachziehen, wenn sie fehlen
      if (c.itemLevel == null && ext.itemLevel != null) patch.itemLevel = ext.itemLevel;
      if (c.wclUrl   == null && ext.wclUrl)            patch.wclUrl    = ext.wclUrl;
      if (c.class    == null && ext.className)         patch.class     = ext.className;
      if (c.spec     == null && ext.specName)          patch.spec      = ext.specName;
      if (c.rioScore == null && ext.rioScore != null)  patch.rioScore  = ext.rioScore;

      if (Object.keys(patch).length) {
        try {
          const updated = await prisma.boosterChar.update({ where: { id: c.id }, data: patch });
          Object.assign(c, updated);
        } catch (e) { dbg("autofill_update_failed:", e?.message || e); }
      }
    }

    return res.json({ ok: true, chars: rows.map(normalizeChar) });
  } catch (e) {
    dbg("mine_error:", e?.message || e);
    res.status(500).json({ ok:false, error:"MINE_FAILED", message:e?.message || "unknown" });
  }
});

router.post("/import", async (req, res) => {
  try {
    const u = getUser(req);
    if (!u?.id) return res.status(401).json({ ok:false, error:"UNAUTHORIZED", message:"login_required" });
    const userId = String(u.id);
    await ensureUserExists(userId);

    const payload = req.body;
    const items = Array.isArray(payload) ? payload
      : payload?.chars && Array.isArray(payload.chars) ? payload.chars
      : payload ? [payload] : [];

    if (items.length === 0) return res.json({ ok:true, imported:0, updated:0, chars:[] });

    let imported=0, updated=0; const out=[];
    for (const it of items) {
      try { const { row, created } = await upsertChar(userId, it); if (created) imported++; else updated++; out.push(normalizeChar(row)); }
      catch (e) { dbg("import_item_failed:", e?.message || e, it); }
    }
    return res.json({ ok:true, imported, updated, chars: out });
  } catch (e) {
    dbg("import_error:", e?.message || e);
    res.status(500).json({ ok:false, error:"IMPORT_FAILED", message:e?.message || "unknown" });
  }
});

router.post("/:id/refresh", async (req, res) => {
  try {
    const u = getUser(req);
    if (!u?.id) return res.status(401).json({ ok:false, error:"UNAUTHORIZED" });

    const id = Number(req.params.id);
    const c = await prisma.boosterChar.findUnique({ where: { id } });
    if (!c || String(c.userId) !== String(u.id)) return res.status(404).json({ ok:false, error:"NOT_FOUND" });

    const ext = await fetchExternalMeta({ region: "eu", realm: c.realm, name: c.name });
    const row = await prisma.boosterChar.update({
      where: { id },
      data: {
        // Progress IMMER überschreiben, damit es garantiert aktuell ist
        progress:  ext.progress   ?? undefined,
        itemLevel: ext.itemLevel  ?? undefined,
        wclUrl:    ext.wclUrl     ?? undefined,
        class:     ext.className  ?? undefined,
        spec:      ext.specName   ?? undefined,
        rioScore:  ext.rioScore   ?? undefined,
      },
    });
    return res.json({ ok:true, char: normalizeChar(row) });
  } catch (e) {
    dbg("refresh_error:", e?.message || e);
    res.status(500).json({ ok:false, error:"REFRESH_FAILED", message:e?.message || "unknown" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const u = getUser(req);
    if (!u?.id) return res.status(401).json({ ok:false, error:"UNAUTHORIZED" });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok:false, error:"BAD_ID" });

    const c = await prisma.boosterChar.findUnique({ where: { id } });
    if (!c || String(c.userId) !== String(u.id)) return res.status(404).json({ ok:false, error:"NOT_FOUND" });

    await prisma.boosterChar.delete({ where: { id } });
    return res.json({ ok:true, deletedId:id });
  } catch (e) {
    dbg("delete_error:", e?.message || e);
    res.status(500).json({ ok:false, error:"DELETE_FAILED", message:e?.message || "unknown" });
  }
});

export default router;
