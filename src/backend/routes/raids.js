// src/backend/routes/raids.js
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../prismaClient.js";
import { announceRaid } from "../discord/modules/raidAnnounceAdapter.js";
import { ensureBotReady } from "../discord/bot.js";

const ENV = process.env;
const router = express.Router();

const COOKIE_NAME      = ENV.JWT_COOKIE_NAME || ENV.COOKIE_NAME || "bb_auth";
const COOKIE_SECRET    = ENV.JWT_Secret || ENV.COOKIE_SECRET || "dev-secret-fallback";
const RAIDLEAD_ROLE_ID = ENV.RAIDLEAD_ROLE_ID || ENV.DISCORD_ROLE_RAIDLEAD_ID || ENV.DISCORD_ROLE_RAIDLEAD || "";
const ADMIN_ROLE_ID    = ENV.DISCORD_ROLE_ADMIN_ID || ENV.ADMIN_ROLE_ID || "";
const IS_PROD          = (ENV.MODE || ENV.NODE_ENV) === "production";
const GUILD_ID         = ENV.DISCORD_GUILD_ID || ENV.GUILD_ID || "";

const DATA_FILE        = path.resolve(process.cwd(), "dev-raids.json");
const DEFAULT_BOSSES_BY_DIFF = { Normal: 8, Heroic: 8, Mythic: 8 };

function dbg(...a) {
  if (ENV.DEBUG_AUTH === "true" || !IS_PROD) {
    const t = new Date();
    const ts = t.toLocaleTimeString("de-DE", { hour12: false }) + "." + String(t.getMilliseconds()).padStart(3, "0");
    console.log("[RAIDS-DBG " + ts + "]", ...a);
  }
}

/* -------------------- auth cookie -------------------- */
function verifyToken(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const [v, payloadB64, sigB64] = token.split(".");
    if (v !== "v1" || !payloadB64 || !sigB64) return null;
    const payloadBuf = Buffer.from(payloadB64, "base64");
    const expected = crypto.createHmac("sha256", COOKIE_SECRET).update(payloadBuf).digest();
    const given = Buffer.from(sigB64, "base64");
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    return JSON.parse(payloadBuf.toString("utf8"));
  } catch { return null; }
}
function getUser(req) {
  const raw = req.cookies?.[COOKIE_NAME];
  return verifyToken(raw);
}
function userHasRole(u, roleId) {
  if (!u || !roleId) return false;
  const roles = Array.isArray(u.roles) ? u.roles : [];
  return roles.includes(roleId);
}
function isOwner(u) {
  return !!u?.isOwner;
}
/** Nur echte Admins: Owner ODER ADMIN_ROLE_ID. (u.isAdmin-Flag wird ignoriert) */
function isAdminLevel(u) {
  if (!u) return false;
  if (isOwner(u)) return true;
  return userHasRole(u, ADMIN_ROLE_ID);
}
function isRaidleadLevel(u) {
  if (!u) return false;
  if (isAdminLevel(u)) return true;
  return userHasRole(u, RAIDLEAD_ROLE_ID) || !!u.isRaidlead || !!u.raidlead;
}
function userCanCreate(u) {
  // Raids erstellen darf: Admin/Owner/Raidlead
  return isRaidleadLevel(u);
}

/* -------------------- prisma / fallback -------------------- */
function getPrismaModel() {
  const c = ["raid","Raid","raids","Raids"];
  for (const k of c) if (prisma?.[k]?.findMany) return prisma[k];
  return null;
}
async function jsonRead() {
  try { const s = await fs.readFile(DATA_FILE, "utf8"); const j = JSON.parse(s); return Array.isArray(j)?j:[]; }
  catch { return []; }
}
async function jsonWrite(list) {
  await fs.writeFile(DATA_FILE, JSON.stringify(list, null, 2), "utf8");
}

/* -------------------- helpers -------------------- */
function normalizeRaid(r) {
  return {
    id: r.id || r.raidId || r._id || null,
    title: r.title || r.name || "",
    difficulty: r.difficulty || r.diff || "",
    lootType: r.lootType || r.loot || "",
    date: r.date || r.when || r.datetime || null,
    // lead (im DB-Feld: Displayname!)
    lead: r.lead ?? null,
    // Preset/Relation
    presetId: r.presetId ?? r.preset ?? null,
    // Optionales Schema-Zeug:
    bosses: typeof r.bosses === "number" ? r.bosses : null,
    channelId: r.channelId || null,
    messageId: r.messageId || null,
  };
}
function validateCreatePayload(p) {
  const errs = [];
  if (!p || typeof p !== "object") errs.push("payload_missing");
  if (!p.title) errs.push("title_required");
  if (!p.difficulty) errs.push("difficulty_required");
  if (!p.lootType) errs.push("lootType_required");
  if (!p.date) errs.push("date_required");
  if (errs.length) { const e = new Error("invalid_payload: " + errs.join(",")); e.status = 400; throw e; }
}
function toBosses(p) {
  if (typeof p.bosses === "number") return p.bosses;
  const d = String(p.difficulty || "");
  return DEFAULT_BOSSES_BY_DIFF[d] ?? 8;
}
function looksLikeDiscordId(s) {
  return typeof s === "string" && /^[0-9]{16,20}$/.test(s);
}

/** Discord-Displayname eines Users auf dem Server (Nickname > global_name > username). */
async function resolveServerDisplay(userId) {
  if (!userId || !GUILD_ID) return null;
  try {
    const cli = await ensureBotReady();
    if (!cli) return null;
    const m = await cli.guilds.fetch(GUILD_ID).then(g => g.members.fetch(String(userId)));
    return m?.nickname || m?.user?.globalName || m?.user?.username || null;
  } catch {
    return null;
  }
}

/** Response-Objekt für API formen (lead = Displayname, detailUrl dabei) */
function shapeForResponse(row) {
  const n = normalizeRaid(row);
  return {
    ...n,
    detailUrl: n.id != null ? `/raids/${n.id}` : null,
  };
}

/**
 * Ermittelt finalen Lead (ID + Displayname).
 * Policy:
 * - Admin/Owner: darf p.leadId / p.lead (ID) setzen; fällt sonst auf eigenen User zurück.
 * - Nicht-Admin (inkl. Raidlead): immer eigener User; p.lead/leadId werden ignoriert.
 */
async function resolveLeadForCreate(reqUser, payload) {
  let finalLeadId = null;
  let finalLeadDisplay = null;

  if (isAdminLevel(reqUser)) {
    // Admin darf setzen
    const candidateId =
      (looksLikeDiscordId(payload?.leadId) && String(payload.leadId)) ||
      (looksLikeDiscordId(payload?.lead)   && String(payload.lead))   ||
      (reqUser?.discordId && String(reqUser.discordId)) ||
      (reqUser?.id && String(reqUser.id)) ||
      null;
    finalLeadId = candidateId;
    finalLeadDisplay =
      payload?.leadName ||
      (candidateId && await resolveServerDisplay(candidateId)) ||
      reqUser?.displayName || reqUser?.username || null;
  } else {
    // Nicht-Admin: immer self
    const selfId = (reqUser?.discordId && String(reqUser.discordId)) || (reqUser?.id && String(reqUser.id)) || null;
    if (!selfId) {
      dbg("lead_override(non-admin): missing selfId -> will store only displayName null");
    }
    finalLeadId = selfId;
    finalLeadDisplay =
      (selfId && await resolveServerDisplay(selfId)) ||
      reqUser?.displayName || reqUser?.username || null;
    if (payload?.lead || payload?.leadId || payload?.leadName) {
      dbg("lead_override(non-admin): ignoring provided lead", { provided: { lead: payload?.lead, leadId: payload?.leadId, leadName: payload?.leadName }, user: { id: reqUser?.id, discordId: reqUser?.discordId } });
    }
  }

  return { finalLeadId, finalLeadDisplay };
}

/* -------------------- routes -------------------- */

// GET /api/raids
router.get("/", async (_req, res) => {
  try {
    const model = getPrismaModel();
    if (model) {
      const rows = await model.findMany({ orderBy: [{ date: "desc" }] });
      return res.json(rows.map(shapeForResponse));
    }
    const list = await jsonRead();
    list.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
    return res.json(list.map(shapeForResponse));
  } catch (e) {
    dbg("list_error:", e?.message || e);
    res.status(500).json({ ok:false, error:"LIST_FAILED", message:e?.message || "unknown" });
  }
});

// zentrale Create-Logik
async function createCore(req, res) {
  const u = getUser(req);
  if (!userCanCreate(u)) {
    return res.status(403).json({ ok:false, error:"FORBIDDEN", message:"insufficient_permissions" });
  }

  const p = req.body || {};
  validateCreatePayload(p);

  const { finalLeadId, finalLeadDisplay } = await resolveLeadForCreate(u, p);
  const bosses = toBosses(p);

  // DB-Feld lead = Displayname (wie gewünscht)
  const dataForDb = {
    title: p.title,
    difficulty: p.difficulty,
    lootType: p.lootType,
    date: p.date,
    lead: finalLeadDisplay ?? null, // Displayname speichern
    bosses,
  };

  const model = getPrismaModel();
  let created = null;
  let createdId = null;

  if (model) {
    const withPreset = (data) => {
      const out = { ...data };
      if (p.presetId) out.preset = { connect: { id: p.presetId } };
      return out;
    };
    const tryCreate = async (data) => model.create({ data });

    try {
      created = await tryCreate(withPreset(dataForDb));
      createdId = created?.id || null;
    } catch (e) {
      // tolerante Fallbacks, falls Schema in deiner DB temporär anders ist
      let lastErr = e;
      try {
        const { preset, ...noPreset } = withPreset(dataForDb);
        created = await tryCreate(noPreset);
        createdId = created?.id || null;
        lastErr = null;
      } catch (e2) { lastErr = e2; }
      if (lastErr) {
        dbg("prisma:error create_failed\n" + lastErr);
        throw lastErr;
      }
    }
  } else {
    // JSON-Fallback
    const row = {
      id: crypto.randomUUID(),
      ...dataForDb,
      presetId: p.presetId ?? null,
    };
    const list = await jsonRead();
    list.push(row);
    await jsonWrite(list);
    created = row;
    createdId = row.id;
  }

  const normalized = normalizeRaid(created);

  // ---- Discord-Announcement (nutzt finalLeadId + finalLeadDisplay) ----
  try {
    const { channelId, messageId } = await announceRaid({
      ...normalized,
      presetId: p.presetId ?? normalized.presetId ?? null,
      leadId: finalLeadId || null,                 // <- ID nur fürs Embed/Posting
      leadName: finalLeadDisplay || normalized.lead || null, // hübscher Name fürs Embed
    });

    // Backwrite channel/message IDs
    if ((channelId || messageId) && createdId) {
      const model2 = getPrismaModel();
      if (model2) {
        const updates = {};
        if (channelId) updates.channelId = channelId;
        if (messageId) updates.messageId = messageId;
        if (Object.keys(updates).length) {
          try { await model2.update({ where: { id: createdId }, data: updates }); } catch {}
        }
      } else {
        const list = await jsonRead();
        const idx = list.findIndex((x) => x.id === createdId);
        if (idx >= 0) {
          if (channelId) list[idx].channelId = channelId;
          if (messageId) list[idx].messageId = messageId;
          await jsonWrite(list);
        }
      }
    }
  } catch (e) {
    dbg("announce failed (ignored):", String(e?.message || e));
  }

  return res.json({ ok: true, raid: shapeForResponse(created) });
}

// POST /api/raids
router.post("/", async (req, res) => {
  try { await createCore(req, res); }
  catch (e) {
    const code = e.status || 500;
    dbg("create_error:", e?.message || e);
    res.status(code).json({ ok:false, error:"CREATE_FAILED", message:e?.message || "unknown" });
  }
});

// POST /api/raids/create (Alias)
router.post("/create", async (req, res) => {
  try { await createCore(req, res); }
  catch (e) {
    const code = e.status || 500;
    dbg("create_error:", e?.message || e);
    res.status(code).json({ ok:false, error:"CREATE_FAILED", message:e?.message || "unknown" });
  }
});

// GET /api/raids/:id  (Detail)
router.get("/:id", async (req, res) => {
  try {
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) return res.status(400).json({ ok:false, error:"BAD_ID" });

    const model = getPrismaModel();
    if (model) {
      const r = await model.findUnique({ where: { id: idNum } });
      if (!r) return res.status(404).json({ ok:false, error:"NOT_FOUND" });
      return res.json({ ok:true, raid: shapeForResponse(r) });
    }
    const list = await jsonRead();
    const r = list.find(x => String(x.id) === String(req.params.id));
    if (!r) return res.status(404).json({ ok:false, error:"NOT_FOUND" });
    return res.json({ ok:true, raid: shapeForResponse(r) });
  } catch (e) {
    dbg("detail_error:", e?.message || e);
    res.status(500).json({ ok:false, error:"DETAIL_FAILED", message:e?.message || "unknown" });
  }
});

// DELETE /api/raids/:id  (Löschen)
router.delete("/:id", async (req, res) => {
  try {
    const u = getUser(req);
    if (!userCanCreate(u)) {
      return res.status(403).json({ ok:false, error:"FORBIDDEN", message:"insufficient_permissions" });
    }

    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) return res.status(400).json({ ok:false, error:"BAD_ID" });

    const model = getPrismaModel();
    if (model) {
      await model.delete({ where: { id: idNum } });
      return res.json({ ok:true, id: idNum });
    }
    const list = await jsonRead();
    const idx = list.findIndex(x => String(x.id) === String(req.params.id));
    if (idx === -1) return res.status(404).json({ ok:false, error:"NOT_FOUND" });
    const [removed] = list.splice(idx, 1);
    await jsonWrite(list);
    return res.json({ ok:true, id: removed?.id ?? null });
  } catch (e) {
    dbg("delete_error:", e?.message || e);
    res.status(500).json({ ok:false, error:"DELETE_FAILED", message:e?.message || "unknown" });
  }
});

export default router;
