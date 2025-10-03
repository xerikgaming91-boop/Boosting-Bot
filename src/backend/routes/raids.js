// src/backend/routes/raids.js
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../prismaClient.js";
import { announceRaid, refreshRaidMessage } from "../discord/modules/raidAnnounceAdapter.js";
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

/* ====== Cycle / Zeitzone ====== */
const CYCLE_TZ = ENV.CYCLE_TZ || ENV.TZ || "Europe/Berlin"; // IANA TZ

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
function isAdminLevel(u) {
  if (!u) return false;
  if (u.isOwner || u.isAdmin) return true;
  const roles = Array.isArray(u.roles) ? u.roles : [];
  if (ADMIN_ROLE_ID && roles.includes(ADMIN_ROLE_ID)) return true;
  return false;
}
function canManageRaid(u /*, raid*/ ) {
  // Wenn du später raid.leadId speicherst: return u.discordId === raid.leadId || isAdminLevel(u)
  if (!u) return false;
  if (isAdminLevel(u)) return true;
  const roles = Array.isArray(u.roles) ? u.roles : [];
  return RAIDLEAD_ROLE_ID && roles.includes(RAIDLEAD_ROLE_ID);
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
    // Lead Info (DB Feld: lead = Displayname)
    leadId: r.leadId || null,
    leadName: r.leadName || null,
    lead: r.lead ?? null,
    presetId: r.presetId ?? r.preset ?? null,
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
const looksLikeDiscordId = (s) => typeof s === "string" && /^[0-9]{16,20}$/.test(s);

/* ========= CYCLE-UTILS ========= */
const CYCLE_HELP = { dows:["sun","mon","tue","wed","thu","fri","sat"] };
function toZonedUTC(date, timeZone = CYCLE_TZ) {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (t) => Number(parts.find(p => p.type === t)?.value);
  return new Date(Date.UTC(
    get("year"), get("month") - 1, get("day"),
    get("hour"), get("minute"), get("second") || 0
  ));
}
function fallbackGetCycleWindows(nowZonedUTC = toZonedUTC(new Date())) {
  const wd = nowZonedUTC.getUTCDay(); // 0=So … 3=Mi …
  const y = nowZonedUTC.getUTCFullYear();
  const m = nowZonedUTC.getUTCMonth();
  const d = nowZonedUTC.getUTCDate();

  let start = new Date(Date.UTC(y, m, d, 8, 0, 0)); // Mi 08:00
  const deltaToWed = (7 + wd - 3) % 7;              // 3=Mi
  start.setUTCDate(start.getUTCDate() - deltaToWed);
  if (nowZonedUTC < start) start.setUTCDate(start.getUTCDate() - 7);

  const endAnchor = new Date(start.getTime());
  endAnchor.setUTCDate(endAnchor.getUTCDate() + 7); // nächster Mi
  const end = new Date(Date.UTC(endAnchor.getUTCFullYear(), endAnchor.getUTCMonth(), endAnchor.getUTCDate(), 7, 0, 0)); // Mi 07:00

  const nextStart = new Date(Date.UTC(endAnchor.getUTCFullYear(), endAnchor.getUTCMonth(), endAnchor.getUTCDate(), 8, 0, 0)); // Mi 08:00
  const nextEndAnchor = new Date(nextStart.getTime());
  nextEndAnchor.setUTCDate(nextEndAnchor.getUTCDate() + 7);
  const nextEnd = new Date(Date.UTC(nextEndAnchor.getUTCFullYear(), nextEndAnchor.getUTCMonth(), nextEndAnchor.getUTCDate(), 7, 0, 0));

  return { current: { start, end }, next: { start: nextStart, end: nextEnd } };
}
const inRange = (d, a, b) => d >= a && d < b;

async function getCycleWindowsFromModule() {
  try {
    const mod = await import("./cycles.js");
    if (typeof mod.getCycleWindows === "function") return mod.getCycleWindows(CYCLE_TZ);
    if (typeof mod.calculateCycleWindows === "function") return mod.calculateCycleWindows(CYCLE_TZ);
    if (typeof mod.getCycleRanges === "function") return mod.getCycleRanges(CYCLE_TZ);
  } catch {}
  const nowZ = toZonedUTC(new Date(), CYCLE_TZ);
  return fallbackGetCycleWindows(nowZ);
}

/** Discord-Displayname aus DB/Discord auflösen */
async function resolveServerDisplay(userId) {
  if (!userId || !GUILD_ID) return null;
  try {
    const cli = await ensureBotReady();
    if (!cli) return null;
    const m = await cli.guilds.fetch(GUILD_ID).then(g => g.members.fetch(String(userId)));
    return m?.nickname || m?.user?.globalName || m?.user?.username || null;
  } catch { return null; }
}
async function displayForLead(leadId) {
  if (!leadId) return null;
  try {
    const u = await prisma.user.findUnique({
      where: { discordId: String(leadId) },
      select: { displayName: true, username: true },
    });
    if (u) return u.displayName || u.username || null;
  } catch {}
  return await resolveServerDisplay(String(leadId));
}
async function shapeForResponse(row) {
  const n = normalizeRaid(row);
  const leadId = n.leadId || null;
  const leadDisplay = n.lead || n.leadName || (await displayForLead(leadId));
  return {
    ...n,
    leadId: leadId || null,
    leadName: leadDisplay || null,
    lead: leadDisplay || null,
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

// zentrale Create-Logik (inkl. Cycle-Check, Lead-Set)
async function createCore(req, res) {
  const u = getUser(req);
  if (!userCanCreate(u)) {
    return res.status(403).json({ ok:false, error:"FORBIDDEN", message:"insufficient_permissions" });
  }

  const p = req.body || {};
  validateCreatePayload(p);

  // ------ CYCLE-VALIDIERUNG ------
  let raidDate = new Date(p.date);
  if (!(raidDate instanceof Date) || isNaN(raidDate)) {
    return res.status(400).json({ ok:false, error:"BAD_DATE", message:"invalid_date" });
  }
  const nowZ = toZonedUTC(new Date(), CYCLE_TZ);
  const raidZ = toZonedUTC(raidDate, CYCLE_TZ);
  if (raidZ < nowZ) {
    return res.status(400).json({ ok:false, error:"PAST_NOT_ALLOWED", message:"raid_in_past" });
  }
  let windows = null;
  try { windows = await getCycleWindowsFromModule(); } catch {}
  if (!windows || !windows.current || !windows.next) {
    windows = fallbackGetCycleWindows(nowZ);
  }
  const inCurrent = inRange(raidZ, windows.current.start, windows.current.end);
  const inNext    = inRange(raidZ, windows.next.start, windows.next.end);
  if (!inCurrent && !inNext) {
    return res.status(400).json({
      ok:false,
      error:"OUT_OF_CYCLE",
      message:"raid_not_in_current_or_next_cycle",
      cycle: {
        current: { start: windows.current.start.toISOString(), end: windows.current.end.toISOString() },
        next:    { start: windows.next.start.toISOString(),    end: windows.next.end.toISOString() }
      }
    });
  }
  // ------ Ende Cycle-Check ------

  // ---- Lead bestimmen (DB speichert Displayname in `lead`) ----
  const canPickLead = isAdminLevel(u);
  const incomingLeadId =
    (typeof p.leadId === "string" && p.leadId) ||
    (typeof p.lead === "string" && p.lead) ||
    null;

  if (!canPickLead && (p.lead || p.leadId || p.leadName)) {
    dbg("lead_override(non-admin): ignoring provided lead", { provided: { lead: p.lead, leadId: p.leadId, leadName: p.leadName }, user: u?.discordId });
    delete p.lead; delete p.leadId; delete p.leadName;
  }

  let enforcedLeadId = null;
  let enforcedLeadDisplay = null;

  if (canPickLead) {
    enforcedLeadId = (incomingLeadId && looksLikeDiscordId(incomingLeadId)) ? String(incomingLeadId) : null;
    if (enforcedLeadId) {
      enforcedLeadDisplay = (await displayForLead(enforcedLeadId)) || null;
    }
  } else {
    enforcedLeadId = String(u.discordId);
    enforcedLeadDisplay = u?.displayName || u?.username || null;
  }

  const bosses = toBosses(p);

  const dataForDb = {
    title: p.title,
    difficulty: p.difficulty,
    lootType: p.lootType,
    date: p.date,
    lead: enforcedLeadDisplay || null,  // DB: Displayname
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
      let lastErr = e;
      try {
        const { preset, ...noPreset } = withPreset(dataForDb);
        created = await tryCreate(noPreset);
        createdId = created?.id || null;
        lastErr = null;
      } catch (e2) { lastErr = e2; }
      if (lastErr) { dbg("prisma:error create_failed\n" + lastErr); throw lastErr; }
    }
  } else {
    const row = { id: crypto.randomUUID(), ...dataForDb, presetId: p.presetId ?? null };
    const list = await jsonRead(); list.push(row); await jsonWrite(list);
    created = row; createdId = row.id;
  }

  const normalized = normalizeRaid(created);

  // ---- Discord-Announcement ----
  try {
    const { channelId, messageId } = await announceRaid({
      ...normalized,
      presetId: p.presetId ?? normalized.presetId ?? null,
      leadName: enforcedLeadDisplay || normalized.lead || null,
      leadId: enforcedLeadId || null,
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
  } catch (e) { dbg("announce failed (ignored):", String(e?.message || e)); }

  const resp = await shapeForResponse(created);
  return res.json({
    ok: true,
    raid: resp,
    permissions: { canPickLead: isAdminLevel(u) }
  });
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

// GET /api/raids/:id  (Detail – kompakt)
router.get("/:id", async (req, res) => {
  try {
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

/* ====== Full Detail inkl. Signups ====== */
async function fetchRaidFull(id) {
  return await prisma.raid.findUnique({
    where: { id: Number(id) },
    include: {
      signups: {
        include: { user: true, char: true },
        orderBy: [{ id: "asc" }],
      },
    },
  });
}
router.get("/:id/full", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok:false, error:"BAD_ID" });

    const r = await fetchRaidFull(id);
    if (!r) return res.status(404).json({ ok:false, error:"NOT_FOUND" });

    const base = await shapeForResponse(r);

    const roster = [];
    const open   = [];
    for (const s of (r.signups || [])) {
      const row = {
        id: s.id,
        userId: s.userId,
        displayName: s.displayName || s.user?.displayName || s.user?.username || null,
        charId: s.charId,
        // === Angereicherte Char-Infos ===
        charName: s.char?.name || null,
        realm: s.char?.realm || null,
        itemLevel: s.char?.itemLevel ?? null,
        wclUrl: s.char?.wclUrl || null,
        // === Bisherige Felder ===
        class: s.class || s.char?.class || null,
        role: s.type,
        saved: !!s.saved,
        note: s.note || null,
        status: s.status || null,
      };
      if (String(s.status).toUpperCase() === "PICKED") roster.push(row);
      else open.push(row);
    }

    res.json({ ok:true, raid: base, roster, signups: open });
  } catch (e) {
    dbg("full_error:", e?.message || e);
    res.status(500).json({ ok:false, error:"FULL_FAILED", message:e?.message || "unknown" });
  }
});

/* ====== Raid bearbeiten (inkl. Lead & Preset) ====== */
router.put("/:id", async (req, res) => {
  try {
    const u = getUser(req);
    if (!u || !userCanCreate(u)) return res.status(403).json({ ok:false, error:"FORBIDDEN" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok:false, error:"BAD_ID" });

    const p = req.body || {};
    const patch = {};
    if (typeof p.title === "string")      patch.title = p.title;
    if (typeof p.difficulty === "string") patch.difficulty = p.difficulty;
    if (typeof p.lootType === "string")   patch.lootType = p.lootType;
    if (p.date) {
      const dt = new Date(p.date);
      if (!isNaN(dt)) patch.date = p.date;
    }

    // Lead ändern → nur Admin/Owner; in DB wird der Displayname persistiert
    if (isAdminLevel(u) && typeof p.leadId === "string" && looksLikeDiscordId(p.leadId)) {
      const display = (await displayForLead(p.leadId)) || null;
      if (display) patch.lead = display;
    }

    // Basis-Update
    let updated = await prisma.raid.update({ where: { id }, data: patch });

    // Preset connect/disconnect nur wenn p.presetId im Body vorhanden ist
    if (Object.prototype.hasOwnProperty.call(p, "presetId")) {
      try {
        if (!p.presetId) {
          await prisma.raid.update({ where: { id }, data: { preset: { disconnect: true } } });
        } else {
          await prisma.raid.update({ where: { id }, data: { preset: { connect: { id: Number(p.presetId) } } } });
        }
        updated = await prisma.raid.findUnique({ where: { id } });
      } catch (e) {
        console.warn("[RAIDS] preset connect/disconnect failed (ignored):", e?.message || e);
      }
    }

    // Discord-Message (best effort)
    await refreshRaidMessage(id).catch(()=>{});

    res.json({ ok:true, raid: await shapeForResponse(updated) });
  } catch (e) {
    dbg("update_error:", e?.message || e);
    res.status(500).json({ ok:false, error:"UPDATE_FAILED", message:e?.message || "unknown" });
  }
});

/* ====== Pick / Unpick (für Frontend) ====== */
async function setSignupStatus(signupId, status) {
  try {
    return await prisma.signup.update({
      where: { id: Number(signupId) },
      data: { status },
    });
  } catch (e) {
    // Fallback falls altes Schema: picked-Boolean
    const msg = String(e?.message || "");
    if (/Unknown arg `status`/i.test(msg)) {
      try {
        return await prisma.signup.update({
          where: { id: Number(signupId) },
          data: { picked: String(status).toUpperCase() === "PICKED" },
        });
      } catch { /* ignore */ }
    }
    throw e;
  }
}
router.post("/:id/signups/:signupId/pick", async (req, res) => {
  try {
    const u = getUser(req);
    if (!canManageRaid(u)) return res.status(403).json({ ok:false, error:"FORBIDDEN" });

    const raidId = Number(req.params.id);
    const signupId = Number(req.params.signupId);
    if (!Number.isFinite(raidId) || !Number.isFinite(signupId)) {
      return res.status(400).json({ ok:false, error:"BAD_ID" });
    }

    const s = await setSignupStatus(signupId, "PICKED");
    await refreshRaidMessage(raidId).catch(()=>{});

    res.json({ ok:true, signup: s });
  } catch (e) {
    dbg("pick_error:", e?.message || e);
    res.status(500).json({ ok:false, error:"PICK_FAILED", message:e?.message || "unknown" });
  }
});
router.post("/:id/signups/:signupId/unpick", async (req, res) => {
  try {
    const u = getUser(req);
    if (!canManageRaid(u)) return res.status(403).json({ ok:false, error:"FORBIDDEN" });

    const raidId = Number(req.params.id);
    const signupId = Number(req.params.signupId);
    if (!Number.isFinite(raidId) || !Number.isFinite(signupId)) {
      return res.status(400).json({ ok:false, error:"BAD_ID" });
    }

    const s = await setSignupStatus(signupId, "SIGNUPED");
    await refreshRaidMessage(raidId).catch(()=>{});

    res.json({ ok:true, signup: s });
  } catch (e) {
    dbg("unpick_error:", e?.message || e);
    res.status(500).json({ ok:false, error:"UNPICK_FAILED", message:e?.message || "unknown" });
  }
});

/* ====== Löschen inkl. Discord Channel ====== */
async function deleteDiscordChannel(channelId) {
  if (!channelId || !GUILD_ID) return false;
  try {
    const client = await ensureBotReady();
    const guild = await client.guilds.fetch(GUILD_ID);
    const ch = await guild.channels.fetch(String(channelId)).catch(() => null);
    if (ch) { await ch.delete("Raid was deleted"); dbg("discord channel deleted:", String(channelId)); return true; }
  } catch (e) { dbg("deleteDiscordChannel failed (ignored):", String(e?.message || e)); }
  return false;
}
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
      const row = await model.findUnique({ where: { id: idNum } });
      if (!row) return res.status(404).json({ ok:false, error:"NOT_FOUND" });
      if (row.channelId) await deleteDiscordChannel(row.channelId);
      await model.delete({ where: { id: idNum } });
      return res.json({ ok:true, id: idNum, channelDeleted: !!row.channelId });
    }

    const list = await jsonRead();
    const idx = list.findIndex(x => String(x.id) === String(req.params.id));
    if (idx === -1) return res.status(404).json({ ok:false, error:"NOT_FOUND" });

    const [removed] = list.splice(idx, 1);
    if (removed?.channelId) await deleteDiscordChannel(removed.channelId);
    await jsonWrite(list);
    return res.json({ ok:true, id: removed?.id ?? null, channelDeleted: !!removed?.channelId });
  } catch (e) {
    dbg("delete_error:", e?.message || e);
    res.status(500).json({ ok:false, error:"DELETE_FAILED", message:e?.message || "unknown" });
  }
});

export default router;
