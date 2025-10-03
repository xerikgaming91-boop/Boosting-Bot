// src/backend/routes/auth.js
import express from "express";
import crypto from "node:crypto";

const ENV = process.env;

const DISCORD_CLIENT_ID     = ENV.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = ENV.DISCORD_CLIENT_SECRET;
const OAUTH_REDIRECT_URI    = ENV.OAUTH_REDIRECT_URI;
const FRONTEND_URL          = ENV.FRONTEND_URL || "http://localhost:4000";

const GUILD_ID   = ENV.DISCORD_GUILD_ID || ENV.GUILD_ID || "";
const BOT_TOKEN  = ENV.DISCORD_TOKEN    || ENV.BOT_TOKEN || "";

const ADMIN_ROLE_ID      = ENV.DISCORD_ROLE_ADMIN_ID      || ENV.ADMIN_ROLE_ID || "";
const RAIDLEAD_ROLE_ID   = ENV.RAIDLEAD_ROLE_ID           || ENV.DISCORD_ROLE_RAIDLEAD_ID || ENV.DISCORD_ROLE_RAIDLEAD || "";
const BOOSTER_ROLE_ID    = ENV.DISCORD_ROLE_BOOSTER_ID    || "";
const LOOTBUDDYS_ROLE_ID = ENV.DISCORD_ROLE_LOOTBUDDYS_ID || "";

const COOKIE_NAME   = ENV.JWT_COOKIE_NAME || ENV.COOKIE_NAME || "bb_auth";
const COOKIE_SECRET = ENV.JWT_Secret || ENV.COOKIE_SECRET;
const MODE          = ENV.MODE || (ENV.NODE_ENV || "development");
const IS_PROD       = MODE === "production";

// Wenn 1 -> /me aktualisiert Rollen/Owner/Nick jedes Mal live über den Bot
const REFRESH_ON_ME = String(ENV.AUTH_REFRESH_ON_ME || "") === "1";

const SECRET =
  COOKIE_SECRET ||
  crypto.createHash("sha256").update("dev-secret-fallback").digest("hex");

const router = express.Router();

const ts = () =>
  new Date().toLocaleTimeString("de-DE", { hour12: false }) +
  "." +
  String(new Date().getMilliseconds()).padStart(3, "0");

function dbg(...args) {
  if (ENV.DEBUG_AUTH === "true" || !IS_PROD) {
    console.log("[AUTH-DBG " + ts() + "]", ...args);
  }
}

/* --------------------------- helpers: token --------------------------- */

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signPayload(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj));
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest();
  return "v1." + b64url(payload) + "." + b64url(sig);
}

function verifyToken(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const [v, payloadB64, sigB64] = token.split(".");
    if (v !== "v1" || !payloadB64 || !sigB64) return null;

    const payloadBuf = Buffer.from(payloadB64, "base64");
    const expected = crypto.createHmac("sha256", SECRET).update(payloadBuf).digest();
    const given = Buffer.from(sigB64, "base64");
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;

    return JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    return null;
  }
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    path: "/",
  });
}

function userFromReq(req) {
  const raw = req.cookies?.[COOKIE_NAME];
  return verifyToken(raw);
}

function avatarUrlFor(user) {
  if (user?.avatar) {
    const fmt = String(user.avatar).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${fmt}?size=128`;
  }
  const disc = Number(user?.discriminator || 0) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${disc}.png`;
}

/* ---------------- Guild owner lookup (cached) ---------------- */

let OWNER_ID = null;

async function fetchGuildOwnerIdViaBot() {
  if (!GUILD_ID || !BOT_TOKEN) return null;
  try {
    const r = await fetch(`https://discord.com/api/guilds/${GUILD_ID}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (!r.ok) {
      dbg("owner fetch failed:", r.status, await r.text().catch(() => ""));
      return null;
    }
    const g = await r.json();
    OWNER_ID = g?.owner_id || null;
    return OWNER_ID;
  } catch (e) {
    dbg("owner fetch error:", String(e?.message || e));
    return null;
  }
}

/* ---------------- flags & normalization ---------------- */

function computeFlags(roles = [], isOwner = false) {
  const arr = Array.isArray(roles) ? roles : [];
  const adminByRole = !!(ADMIN_ROLE_ID && arr.includes(ADMIN_ROLE_ID));
  const isAdmin     = !!(isOwner || adminByRole);
  const isRaidlead  = isAdmin || !!(RAIDLEAD_ROLE_ID && arr.includes(RAIDLEAD_ROLE_ID));
  const isBooster   = !!(BOOSTER_ROLE_ID && arr.includes(BOOSTER_ROLE_ID));
  const isLootbuddy = !!(LOOTBUDDYS_ROLE_ID && arr.includes(LOOTBUDDYS_ROLE_ID));
  return { isOwner: !!isOwner, isAdmin, isRaidlead, isBooster, isLootbuddy };
}

function highestRoleFromFlags(f) {
  if (f.isOwner)    return { key: "Owner",    label: "Owner" };
  if (f.isAdmin)    return { key: "Admin",    label: "Admin" };
  if (f.isRaidlead) return { key: "Raidlead", label: "Raidlead" };
  if (f.isBooster)  return { key: "Booster",  label: "Booster" };
  if (f.isLootbuddy)return { key: "LootBuddy",label: "LootBuddy" };
  return { key: "Member", label: "Member" };
}

function normalizeUser(u, isOwner = false) {
  const flags = computeFlags(u?.roles, isOwner);
  const top   = highestRoleFromFlags(flags);
  return {
    ...u,
    ...flags,
    raidlead: flags.isRaidlead,           // Alias für Frontend
    highestRole: top.key,                 // "Owner" | "Admin" | ...
    highestRoleLabel: top.label,
    roleIds: {
      admin: ADMIN_ROLE_ID || null,
      raidlead: RAIDLEAD_ROLE_ID || null,
      booster: BOOSTER_ROLE_ID || null,
      lootbuddys: LOOTBUDDYS_ROLE_ID || null,
    },
  };
}

/* ---------------- Discord HTTP helpers ---------------- */

async function getGuildMemberViaBot(userId) {
  if (!GUILD_ID || !BOT_TOKEN) return { source: "bot", member: null, status: 0 };
  const url = `https://discord.com/api/guilds/${GUILD_ID}/members/${userId}`;
  const r = await fetch(url, { headers: { Authorization: `Bot ${BOT_TOKEN}` } });
  if (r.status === 404) return { source: "bot", member: null, status: 404 };
  if (!r.ok) throw new Error(`guild_member_failed(bot): ${r.status} ${await r.text().catch(() => "")}`);
  return { source: "bot", member: await r.json(), status: r.status };
}

async function getGuildMemberViaOAuth(accessToken) {
  if (!GUILD_ID) return { source: "oauth", member: null, status: 0 };
  const url = `https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (r.status === 404) return { source: "oauth", member: null, status: 404 };
  if (!r.ok) throw new Error(`guild_member_failed(oauth): ${r.status} ${await r.text().catch(() => "")}`);
  return { source: "oauth", member: await r.json(), status: r.status };
}

function mergeMemberResults(botRes, oauthRes) {
  const botRoles = Array.isArray(botRes?.member?.roles) ? botRes.member.roles : [];
  const oaRoles  = Array.isArray(oauthRes?.member?.roles) ? oauthRes.member.roles : [];
  const chosen   = botRoles.length ? botRes.member : oaRoles.length ? oauthRes.member : (botRes.member || oauthRes.member || null);
  const roles    = Array.isArray(chosen?.roles) ? chosen.roles : [];
  const inGuild  = !!chosen;
  const serverDisplay = chosen?.nick || null;
  return { roles, inGuild, serverDisplay, source: botRoles.length ? "bot" : oaRoles.length ? "oauth" : chosen ? (botRes.member ? "bot" : "oauth") : "none" };
}

/* --------------------------- Routes --------------------------- */

// Start OAuth
router.get("/discord", (req, res) => {
  const redirect = typeof req.query.redirect === "string" && req.query.redirect ? req.query.redirect : "/raids";
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds.members.read",
    prompt: "none",
    state: b64url(Buffer.from(JSON.stringify({ redirect }))),
  });
  const url = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  dbg("→ redirect to", url);
  res.redirect(url);
});

// OAuth Callback
router.get("/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send("missing code");
  try {
    // token exchange
    const token = await (async (codeStr) => {
      const body = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: codeStr,
        redirect_uri: OAUTH_REDIRECT_URI,
      });
      const r = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!r.ok) throw new Error("token_exchange_failed: " + r.status + " " + (await r.text().catch(() => "")));
      return r.json();
    })(String(code));

    dbg("token ok, scopes:", token.scope);

    // /users/@me
    const me = await (async (accessToken) => {
      const r = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) throw new Error("me_failed: " + r.status + " " + (await r.text().catch(() => "")));
      return r.json();
    })(token.access_token);

    const baseUser = { id: me.id, username: me.username, global_name: me.global_name, avatar: me.avatar, discriminator: me.discriminator };

    // guild lookups
    let botRes = { source: "bot", member: null, status: 0 };
    try { botRes = await getGuildMemberViaBot(me.id); } catch (e) { dbg("member lookup error (bot):", String(e?.message || e)); }

    let oaRes = { source: "oauth", member: null, status: 0 };
    try { oaRes = await getGuildMemberViaOAuth(token.access_token); } catch (e) { dbg("member lookup error (oauth):", String(e?.message || e)); }

    const ownerId = (await fetchGuildOwnerIdViaBot()) || null;
    const isOwner = !!(ownerId && String(ownerId) === String(me.id));

    const merged = mergeMemberResults(botRes, oaRes);
    const sessionUser = normalizeUser(
      {
        id: me.id,
        display: baseUser.global_name || baseUser.username,
        serverDisplay: merged.serverDisplay || null,
        avatarUrl: avatarUrlFor(baseUser),
        inGuild: merged.inGuild,
        roles: merged.roles,
      },
      isOwner
    );

    setAuthCookie(res, signPayload(sessionUser));

    dbg("LOGIN OK:", {
      id: sessionUser.id,
      display: sessionUser.display,
      serverDisplay: sessionUser.serverDisplay || null,
      highestRole: sessionUser.highestRole,
      isOwner: sessionUser.isOwner,
      isAdmin: sessionUser.isAdmin,
      raidlead: sessionUser.raidlead,
      inGuild: sessionUser.inGuild,
    });

    let redirect = "/raids";
    if (state) {
      try {
        const parsed = JSON.parse(Buffer.from(String(state).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
        if (typeof parsed?.redirect === "string") redirect = parsed.redirect;
      } catch {}
    }
    res.redirect(redirect);
  } catch (e) {
    dbg("callback error:", String(e?.message || e));
    res.status(500).send("OAuth callback failed");
  }
});

// Session info
router.get("/me", async (req, res) => {
  const verbose = String(req.query.verbose) === "1";
  const base = userFromReq(req);

  if (!base) {
    return res.json({
      ok: false,
      user: null,
      debug: verbose ? { cookieHeader: req.headers.cookie || null, parsedCookies: req.cookies || {} } : undefined,
    });
  }

  // Live-Refresh (optional)
  if (REFRESH_ON_ME || verbose) {
    const ownerId = (await fetchGuildOwnerIdViaBot()) || null;
    const isOwner = !!(ownerId && String(ownerId) === String(base.id));

    let roles = Array.isArray(base.roles) ? base.roles : [];
    let inGuild = !!base.inGuild;
    let serverDisplay = base.serverDisplay || null;

    try {
      const botRes = await getGuildMemberViaBot(base.id);
      if (botRes.member) {
        inGuild = true;
        roles = Array.isArray(botRes.member.roles) ? botRes.member.roles : roles;
        serverDisplay = botRes.member?.nick || serverDisplay;
      } else if (botRes.status === 404) {
        inGuild = false; roles = []; serverDisplay = null;
      }
    } catch (e) {
      dbg("member lookup error on /me (bot):", String(e?.message || e));
    }

    const user = normalizeUser({ ...base, inGuild, roles, serverDisplay }, isOwner);
    try { setAuthCookie(res, signPayload(user)); } catch {}
    return res.json({ ok: true, user, debug: verbose ? { base, refreshedVia: "bot", ownerId: ownerId || null } : undefined });
  }

  // -------- FIX: Owner-Flag NICHT verlieren --------
  // Wenn wir NICHT refreshen, übernehmen wir base.isOwner und überschreiben es NICHT mit false.
  const user = normalizeUser(base, !!base.isOwner);
  return res.json({ ok: true, user, debug: verbose ? { base, ownerId: null, refreshedVia: "none" } : undefined });
});

// Logout
router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true, message: "logged out" });
});

export default router;
