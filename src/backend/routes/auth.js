// src/backend/routes/auth.js
import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import { URLSearchParams } from "node:url";
import { prisma } from "../prismaClient.js";
import { ensureBotReady } from "../discord/bot.js";

const router = express.Router();
const ENV = process.env;

/* ========================= ENV / Konstanten ========================= */
// OAuth
const CLIENT_ID     = ENV.DISCORD_CLIENT_ID;
const CLIENT_SECRET = ENV.DISCORD_CLIENT_SECRET;
// akzeptiere beide Variablen-Namen, nimm OAUTH_REDIRECT_URI bevorzugt (entspricht deiner .env)
const REDIRECT_URI  = ENV.OAUTH_REDIRECT_URI
  || ENV.DISCORD_REDIRECT_URI
  || `${ENV.BACKEND_URL || "http://localhost:4000"}/api/auth/callback`;

// Guild / Rollen
const GUILD_ID          = ENV.DISCORD_GUILD_ID || ENV.GUILD_ID;
const ADMIN_ROLE_ID     = ENV.DISCORD_ROLE_ADMIN_ID || ENV.ADMIN_ROLE_ID || "";
const RAIDLEAD_ROLE_ID  = ENV.RAIDLEAD_ROLE_ID || ENV.DISCORD_ROLE_RAIDLEAD_ID || ENV.DISCORD_ROLE_RAIDLEAD || "";

// Cookies / Modus
const COOKIE_NAME   = ENV.JWT_COOKIE_NAME || ENV.COOKIE_NAME || "bb_auth";
const COOKIE_SECRET = ENV.JWT_Secret || ENV.COOKIE_SECRET || "dev-secret-fallback";
const IS_PROD       = (ENV.MODE || ENV.NODE_ENV) === "production";

// Optional: Auto-Refresh in /me
const AUTH_REFRESH_ON_ME = `${ENV.AUTH_REFRESH_ON_ME || ""}`.trim() !== "" && `${ENV.AUTH_REFRESH_ON_ME}` !== "0";

// kurze Cookies für OAuth-Flow
const OAUTH_STATE_COOKIE    = "bb_oauth_state";
const OAUTH_REDIRECT_COOKIE = "bb_oauth_redirect";

/* ========================= Helpers ========================= */
function hmacSign(buf) {
  return crypto.createHmac("sha256", COOKIE_SECRET).update(buf).digest();
}
/** v1.<payloadB64>.<sigB64> */
function signCookie(obj) {
  const payload = Buffer.from(JSON.stringify(obj), "utf8");
  const sig = hmacSign(payload);
  return `v1.${payload.toString("base64")}.${sig.toString("base64")}`;
}
function readCookie(raw) {
  try {
    if (!raw || typeof raw !== "string") return null;
    const [v, pB64, sB64] = raw.split(".");
    if (v !== "v1" || !pB64 || !sB64) return null;
    const payload = Buffer.from(pB64, "base64");
    const expected = hmacSign(payload);
    const given = Buffer.from(sB64, "base64");
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    return JSON.parse(payload.toString("utf8"));
  } catch { return null; }
}
function setAuthCookie(res, obj) {
  const value = signCookie(obj);
  res.cookie(COOKIE_NAME, value, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 Tage
  });
}
function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}
function setShortCookie(res, name, value) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60 * 1000, // 10 Minuten
  });
}
function readShortCookie(req, name) {
  return req.cookies?.[name] || "";
}

/* ---- Guild/Member/Flags per Bot holen ---- */
async function fetchMemberAndFlags(discordUserId) {
  const client = await ensureBotReady();
  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(String(discordUserId));

  // Rolle-IDs
  const roleIds = Array.from(member.roles.cache.keys());
  const highestRole = member.roles.highest?.id || null;

  // Owner dynamisch aus Guild ziehen (keine OWNER_DISCORD_ID in .env nötig)
  let ownerId = guild.ownerId || null;
  if (!ownerId) {
    try {
      const owner = await guild.fetchOwner();
      ownerId = owner?.id || null;
    } catch { /* ignore */ }
  }

  const isOwner = !!(ownerId && ownerId === String(discordUserId));
  const isAdmin = isOwner || (ADMIN_ROLE_ID && roleIds.includes(ADMIN_ROLE_ID));
  const isRaidlead = isAdmin || (RAIDLEAD_ROLE_ID && roleIds.includes(RAIDLEAD_ROLE_ID));

  const displayName = member.nickname || member.user.globalName || member.user.username || null;

  return {
    flags: {
      isOwner,
      isAdmin,
      isRaidlead,
      raidlead: isRaidlead, // alias
      roles: roleIds,
      highestRole,
    },
    serverDisplay: displayName,
    discordUser: {
      id: member.user.id,
      username: member.user.username,
      global_name: member.user.globalName,
      avatar: member.user.avatar,
    },
  };
}

/* ---- DB persist + Cookie erzeugen ---- */
async function persistAndIssueCookie(res, discordUser, flags, serverDisplay) {
  const userData = {
    discordId: String(discordUser.id),
    username: discordUser.username || null,
    displayName: serverDisplay || discordUser.global_name || discordUser.username || null,
    avatarUrl: discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null,
    rolesCsv: Array.isArray(flags.roles) ? flags.roles.join(",") : "",
    isRaidlead: !!(flags.isRaidlead || flags.raidlead),
    isAdmin: !!flags.isAdmin,
    isOwner: !!flags.isOwner,
    highestRole: flags.highestRole || null,
  };

  await prisma.user.upsert({
    where: { discordId: userData.discordId },
    create: userData,
    update: userData,
  });

  const cookiePayload = {
    id: userData.discordId,
    username: userData.username,
    displayName: userData.displayName,
    avatar: discordUser.avatar || null,
    rolesCsv: userData.rolesCsv,
    isRaidlead: userData.isRaidlead,
    isAdmin: userData.isAdmin,
    isOwner: userData.isOwner,
    highestRole: userData.highestRole,
  };

  setAuthCookie(res, cookiePayload);
  return cookiePayload;
}

/* ---- Frontend-Komfort-Flags aus Cookie ---- */
function buildFrontendFlags(cookiePayload) {
  const roles = (cookiePayload.rolesCsv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const adminLevel = !!(cookiePayload.isOwner || cookiePayload.isAdmin || (ADMIN_ROLE_ID && roles.includes(ADMIN_ROLE_ID)));
  const canSetRaidLead = adminLevel; // nur Admin/Owner
  const canCreateRaid =
    adminLevel ||
    !!cookiePayload.isRaidlead ||
    (RAIDLEAD_ROLE_ID && roles.includes(RAIDLEAD_ROLE_ID));

  return { canCreateRaid, canSetRaidLead, isAdminLevel: adminLevel };
}

/* ========================= ROUTES ========================= */

/**
 * GET /api/auth/discord?redirect=/raids
 * Startet den OAuth-Flow (scope=identify; Rollen/Member kommen über den Bot).
 */
router.get("/discord", async (req, res) => {
  try {
    const redirectPath = typeof req.query.redirect === "string" ? req.query.redirect : "/";
    // CSRF-Token
    const state = crypto.randomBytes(16).toString("hex");
    setShortCookie(res, OAUTH_STATE_COOKIE, state);
    setShortCookie(res, OAUTH_REDIRECT_COOKIE, redirectPath);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      scope: "identify",
      redirect_uri: REDIRECT_URI,
      state,
      prompt: "none",
    });
    const authUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    return res.redirect(authUrl);
  } catch (e) {
    return res.status(500).send("OAuth init failed");
  }
});

/* Gemeinsamer Callback-Handler (für /discord/callback und /callback) */
async function oauthCallbackHandler(req, res) {
  try {
    const { code, state } = req.query;
    const expectedState = readShortCookie(req, OAUTH_STATE_COOKIE);
    const redirectPath = readShortCookie(req, OAUTH_REDIRECT_COOKIE) || "/";

    if (!code || !state || !expectedState || state !== expectedState) {
      return res.status(400).send("Invalid OAuth state");
    }

    // 1) Code -> Token
    const tokenParams = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri: REDIRECT_URI,
    });

    const tokenResp = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });
    if (!tokenResp.ok) {
      const t = await tokenResp.text();
      return res.status(500).send("Token exchange failed: " + t);
    }
    const tokenJson = await tokenResp.json();
    const accessToken = tokenJson.access_token;

    // 2) User holen (identify)
    const meResp = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meResp.ok) {
      const t = await meResp.text();
      return res.status(500).send("Failed to fetch user: " + t);
    }
    const discordUser = await meResp.json(); // { id, username, global_name, avatar, ... }

    // 3) Member & Flags per Bot-Client (Rollen etc.)
    const { flags, serverDisplay } = await fetchMemberAndFlags(discordUser.id);

    // 4) Persist + Cookie
    await persistAndIssueCookie(res, discordUser, flags, serverDisplay);

    // 5) Redirect zurück
    return res.redirect(redirectPath || "/");
  } catch (e) {
    return res.status(500).send("OAuth callback failed: " + String(e?.message || e));
  }
}

/**
 * GET /api/auth/discord/callback
 * GET /api/auth/callback   (zweiter Pfad, damit deine .env mit OAUTH_REDIRECT_URI out-of-the-box passt)
 */
router.get("/discord/callback", oauthCallbackHandler);
router.get("/callback", oauthCallbackHandler);

/**
 * GET /api/auth/me
 * Liest User aus Cookie + DB und liefert Frontend-Flags.
 * Optionaler Auto-Refresh (AUTH_REFRESH_ON_ME), um DB/Flags aktuell zu halten.
 */
router.get("/me", async (req, res) => {
  try {
    const payload = readCookie(req.cookies?.[COOKIE_NAME]);
    if (!payload?.id) {
      return res.json({
        ok: true,
        user: null,
        canCreateRaid: false,
        canSetRaidLead: false,
        isAdminLevel: false,
      });
    }

    // optional „online“ aktualisieren
    if (AUTH_REFRESH_ON_ME) {
      try {
        const { flags, serverDisplay, discordUser } = await fetchMemberAndFlags(String(payload.id));
        await persistAndIssueCookie(res, discordUser, flags, serverDisplay);
      } catch { /* still return something */ }
    }

    let dbUser = null;
    try {
      dbUser = await prisma.user.findUnique({
        where: { discordId: String(payload.id) },
        select: {
          id: true, discordId: true, username: true, displayName: true, avatarUrl: true,
          rolesCsv: true, isRaidlead: true, isAdmin: true, isOwner: true, highestRole: true,
          roleLevel: true, createdAt: true, updatedAt: true,
        },
      });
    } catch { /* optional */ }

    const effective = readCookie(req.cookies?.[COOKIE_NAME]) || payload; // evtl. gerade erneuert
    const flags = buildFrontendFlags(effective);

    return res.json({
      ok: true,
      user: dbUser,
      ...flags,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "ME_FAILED", message: String(e?.message || e) });
  }
});

/**
 * POST /api/auth/refresh
 * Aktualisiert Rollen/Flags live über Bot (Owner/Admin/Raidlead/rolesCsv/highestRole),
 * persistiert sie und setzt Cookie neu.
 */
router.post("/refresh", async (req, res) => {
  try {
    const payload = readCookie(req.cookies?.[COOKIE_NAME]);
    if (!payload?.id) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

    const { flags, serverDisplay, discordUser } = await fetchMemberAndFlags(String(payload.id));
    const newCookiePayload = await persistAndIssueCookie(res, discordUser, flags, serverDisplay);

    const dbUser = await prisma.user.findUnique({ where: { discordId: String(payload.id) } });
    return res.json({ ok: true, user: dbUser, ...buildFrontendFlags(newCookiePayload) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "REFRESH_FAILED", message: String(e?.message || e) });
  }
});

/** POST /api/auth/logout */
router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true, message: "logged_out" });
});

export default router;
