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
function userCanCreate(u) {
  if (!u) return false;
  if (u.isOwner || u.isAdmin || u.isRaidlead || u.raidlead) return true;
  const roles = Array.isArray(u.roles) ? u.roles : [];
  if (ADMIN_ROLE_ID && roles.includes(ADMIN_ROLE_ID)) return true;
  if (RAIDLEAD_ROLE_ID && roles.includes(RAIDLEAD_ROLE_ID)) return true;
  return false;
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
    // Lead Info (DB/Legacy)
    leadId: r.leadId || null,      // legacy, falls vorhanden
    leadName: r.leadName || null,  // legacy, falls vorhanden
    lead: r.lead || null,          // DB-Feld (bei dir: String = Discord-ID oder null)
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
  if (!p.leadId && !p.lead && !p.leadName) errs.push("lead_required");
  if (!p.date) errs.push("date_required");
  if (errs.length) { const e = new Error("invalid_payload: " + errs.join(",")); e.status = 400; throw e; }
}
function toBosses(p) {
  if (typeof p.bosses === "number") return p.bosses;
  const d = String(p.difficulty || "");
  return DEFAULT_BOSSES_BY_DIFF[d] ?? 8;
}

/** Discord-Displayname eines Users auf dem Server (Nickname > global_name > username). */
async function resolveServerDisplay(userId) {
  if (!userId || !GUILD_ID) return null;
  try {
    const cli = await ensureBotReady();
    if (!cli) return null;
    const m = await cli.guilds.fetch(GUILD_ID).then(g => g.members.fetch(userId));
    return m?.nickname || m?.user?.globalName || m?.user?.username || null;
  } catch {
    return null;
  }
}

/** Displayname für eine leadId bestimmen (User-DB → Discord) */
async function displayForLead(leadId) {
  if (!leadId) return null;
  // 1) aus DB
  try {
    const u = await prisma.user.findUnique({
      where: { discordId: String(leadId) },
      select: { displayName: true, username: true },
    });
    if (u) return u.displayName || u.username || null;
  } catch {}
  // 2) live von Discord
  return await resolveServerDisplay(String(leadId));
}

/** Response-Objekt so formen, dass `lead` der Displayname ist */
async function shapeForResponse(row) {
  const n = normalizeRaid(row);
  const leadId = n.lead || n.leadId || null;         // DB speichert in `lead` die ID
  const leadDisplay = (await displayForLead(leadId)) || n.leadName || null;
  return {
    ...n,
    leadId: leadId || null,                           // ID separat bereitstellen
    leadName: leadDisplay || (leadId ?? null),        // Alias
    lead: leadDisplay || (leadId ?? null),            // <-- WICHTIG: für /raids = Displayname
    detailUrl: n.id != null ? `/raids/${n.id}` : null,
  };
}

/* -------------------- routes -------------------- */

// GET /api/raids
router.get("/", async (_req, res) => {
  try {
    const model = getPrismaModel();
    if (model) {
      const rows = await model.findMany({ orderBy: [{ date: "desc" }] });
      const out = [];
      for (const r of rows) out.push(await shapeForResponse(r));
      return res.json(out);
    }
    const list = await jsonRead();
    list.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
    const out = [];
    for (const r of list) out.push(await shapeForResponse(r));
    return res.json(out);
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

  // --- Lead-Displayname bevorzugen ---
  let leadId = p.leadId ?? null;
  let leadDisplay = p.leadName ?? null;
  const looksLikeId = (s) => typeof s === "string" && /^[0-9]{16,20}$/.test(s);
  if (!leadId && looksLikeId(p.lead)) leadId = p.lead;
  if (!leadDisplay && leadId) leadDisplay = await resolveServerDisplay(leadId);
  if (!leadDisplay && p.lead && !looksLikeId(p.lead)) leadDisplay = p.lead;

  const bosses = toBosses(p);

  // **Nur Schema-Felder an Prisma**; `lead` = Discord-ID (oder null)
  const baseDataBoth = {
    title: p.title,
    difficulty: p.difficulty,
    lootType: p.lootType,
    date: p.date,
    lead: leadId || (looksLikeId(p.lead) ? p.lead : null),
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
      created = await tryCreate(withPreset(baseDataBoth));
      createdId = created?.id || null;
    } catch (e) {
      let msg = String(e?.message || "");
      dbg("prisma:error \n" + e);

      if (/Unknown arg `preset`/i.test(msg)) {
        try {
          const { preset, ...noPreset } = withPreset(baseDataBoth);
          created = await tryCreate(noPreset);
          createdId = created?.id || null;
        } catch (e2) {
          msg = String(e2?.message || "");
          dbg("prisma:error noPreset\n" + e2);
          if (/Unknown arg `bosses`/i.test(msg)) {
            const { bosses, ...np } = withPreset(baseDataBoth);
            created = await tryCreate(np);
            createdId = created?.id || null;
          } else if (/Unknown arg `lead`/i.test(msg)) {
            const { lead, ...np } = withPreset(baseDataBoth);
            created = await tryCreate(np);
            createdId = created?.id || null;
          } else {
            throw e2;
          }
        }
      } else if (/Unknown arg `bosses`/i.test(msg)) {
        const { bosses, ...noBosses } = withPreset(baseDataBoth);
        try {
          created = await tryCreate(noBosses);
          createdId = created?.id || null;
        } catch (e3) {
          msg = String(e3?.message || "");
          dbg("prisma:error noBosses\n" + e3);
          if (/Unknown arg `lead`/i.test(msg)) {
            const { lead, ...rest } = noBosses;
            created = await tryCreate(rest);
            createdId = created?.id || null;
          } else {
            throw e3;
          }
        }
      } else if (/Unknown arg `lead`/i.test(msg)) {
        const { lead, ...noLead } = withPreset(baseDataBoth);
        try {
          created = await tryCreate(noLead);
          createdId = created?.id || null;
        } catch (e5) {
          msg = String(e5?.message || "");
          dbg("prisma:error noLead\n" + e5);
          if (/Unknown arg `bosses`/i.test(msg)) {
            const { bosses, ...rest } = noLead;
            created = await tryCreate(rest);
            createdId = created?.id || null;
          } else {
            throw e5;
          }
        }
      } else {
        throw e;
      }
    }
  } else {
    // JSON-Fallback
    const row = {
      id: crypto.randomUUID(),
      ...baseDataBoth,
      presetId: p.presetId ?? null,
    };
    const list = await jsonRead();
    list.push(row);
    await jsonWrite(list);
    created = row;
    createdId = row.id;
  }

  const normalized = normalizeRaid(created);

  // ---- Discord-Announcement ----
  try {
    const { channelId, messageId } = await announceRaid({
      ...normalized,
      presetId: p.presetId ?? normalized.presetId ?? null,
      // Embed-Name hübsch machen
      leadName: leadDisplay || (await displayForLead(normalized.lead)) || normalized.lead || null,
      leadId: normalized.lead || null,
    });

    if ((channelId || messageId) && createdId) {
      const model = getPrismaModel();
      if (model) {
        const tryUpdate = async (data) => {
          try { await model.update({ where: { id: createdId }, data }); return true; } catch { return false; }
        };
        if (channelId) await tryUpdate({ channelId });
        if (messageId) await tryUpdate({ messageId });
      } else {
        const list = await jsonRead();
        const idx = list.findIndex((x) => x.id === createdId);
        if (idx >= 0) {
          list[idx].channelId = channelId || list[idx].channelId || null;
          list[idx].messageId = messageId || list[idx].messageId || null;
          await jsonWrite(list);
        }
      }
    }
  } catch (e) {
    dbg("announce failed (ignored):", String(e?.message || e));
  }

  // Antwort so formen, dass `lead` = Displayname ist
  return res.json({ ok: true, raid: await shapeForResponse(created) });
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
    // id ist in deinem Schema Int → casten
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) return res.status(400).json({ ok:false, error:"BAD_ID" });

    const model = getPrismaModel();
    if (model) {
      const r = await model.findUnique({ where: { id: idNum } });
      if (!r) return res.status(404).json({ ok:false, error:"NOT_FOUND" });
      return res.json({ ok:true, raid: await shapeForResponse(r) });
    }
    const list = await jsonRead();
    const r = list.find(x => String(x.id) === String(req.params.id));
    if (!r) return res.status(404).json({ ok:false, error:"NOT_FOUND" });
    return res.json({ ok:true, raid: await shapeForResponse(r) });
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
