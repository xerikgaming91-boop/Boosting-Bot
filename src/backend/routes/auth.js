// src/backend/routes/auth.js
import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import { prisma } from "../prismaClient.js";
import {
  getLiveRoleFlags,
  canCreateRaid,
  canSetRaidLead,
  isAdminLevel,
  upsertUser,
} from "../utils/roles.js";

const router = express.Router();
const ENV = process.env;

const COOKIE_NAME = ENV.JWT_COOKIE_NAME || ENV.COOKIE_NAME || "auth";
const COOKIE_SECRET = ENV.JWT_Secret || ENV.COOKIE_SECRET || "dev-secret-fallback";
const IS_PROD = (ENV.MODE || ENV.NODE_ENV) === "production";

// Discord OAuth
const DISCORD_CLIENT_ID = ENV.DISCORD_CLIENT_ID || "";
const DISCORD_CLIENT_SECRET = ENV.DISCORD_CLIENT_SECRET || "";
const OAUTH_REDIRECT_URI =
  ENV.OAUTH_REDIRECT_URI || `${ENV.BACKEND_URL || "http://localhost:4000"}/api/auth/callback`;
const GUILD_ID = ENV.DISCORD_GUILD_ID || ENV.GUILD_ID || "";

// --- Debug helper ---
function dbg(...a) {
  if (ENV.DEBUG_AUTH === "true") {
    console.log("[AUTH-DBG]", ...a);
  }
}

// --- Cookie Sign/Verify (kompatibel zu raids.js) ---
function signCookie(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj), "utf8");
  const sig = crypto.createHmac("sha256", COOKIE_SECRET).update(payload).digest();
  return `v1.${payload.toString("base64")}.${sig.toString("base64")}`;
}
function verifyCookie(raw) {
  try {
    const [v, pB64, sB64] = String(raw || "").split(".");
    if (v !== "v1" || !pB64 || !sB64) return null;
    const payload = Buffer.from(pB64, "base64");
    const expected = crypto.createHmac("sha256", COOKIE_SECRET).update(payload).digest();
    const given = Buffer.from(sB64, "base64");
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    return JSON.parse(payload.toString("utf8"));
  } catch {
    return null;
  }
}

function setAuthCookie(res, obj) {
  const value = signCookie(obj);
  res.cookie(COOKIE_NAME, value, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7 * 1000, // 7 Tage
  });
}

function parseState(stateStr) {
  try {
    if (!stateStr) return {};
    const json = Buffer.from(stateStr, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}
function makeState(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

function oauthUrl(redirect = "/") {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds.members.read",
    prompt: "none",
    state: makeState({ redirect }),
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: OAUTH_REDIRECT_URI,
  });
  const r = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    const tx = await r.text().catch(() => "");
    throw new Error(`token_exchange_failed: ${r.status} ${tx}`);
  }
  return r.json();
}

async function fetchMe(accessToken) {
  const r = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) {
    const tx = await r.text().catch(() => "");
    throw new Error(`me_failed: ${r.status} ${tx}`);
  }
  return r.json();
}

async function fetchGuildMember(accessToken) {
  if (!GUILD_ID) return null;
  const r = await fetch(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) return null; // 403/404/… => not in guild
  return r.json();
}

// ---------------- Routes ----------------

/** Einstieg: Redirect zu Discord */
router.get("/discord", (req, res) => {
  const redirect = req.query.redirect ? String(req.query.redirect) : "/";
  const url = oauthUrl(redirect);
  dbg("→ redirect to", url);
  return res.redirect(url);
});

/** Callback von Discord */
router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).send("Missing code");
    const { redirect = "/" } = parseState(state);

    const tokenJson = await exchangeCodeForToken(String(code));
    const accessToken = tokenJson.access_token;

    // user info
    const me = await fetchMe(accessToken);
    dbg("token ok, scopes:", tokenJson.scope, "user:", me?.id, me?.global_name || me?.username);

    const member = await fetchGuildMember(accessToken);

    // ⚠️ WICHTIG: Live-Flags jetzt zuverlässig über Bot/Guild (Owner/Admin/Rollen)
    // statt Access-Token, damit Owner/Role-IDs sicher stimmen.
    const flagsResult = await getLiveRoleFlags(String(me.id), { guildId: GUILD_ID });
    const flags = flagsResult?.flags || flagsResult || {};

    // server display name (Nickname > global_name > username)
    const serverDisplay =
      member?.nick || me?.global_name || me?.username || null;

    // DB persistieren / updaten
    await upsertUser({
      discordId: String(me.id),
      username: me.username || null,
      displayName: serverDisplay,
      avatarUrl: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png` : null,
      rolesCsv: (flags.roles || []).join(","),
      isRaidlead: !!flags.raidlead,
    });

    // Cookie-Payload
    const cookiePayload = {
      id: String(me.id),
      display: serverDisplay || me.username,
      highestRole: flags.highestRole,
      isOwner: !!flags.isOwner,
      isAdmin: !!flags.isAdmin,
      raidlead: !!flags.raidlead,
      inGuild: !!flags.inGuild,
      roles: flags.roles || [],
    };
    setAuthCookie(res, cookiePayload);

    return res.redirect(redirect || "/");
  } catch (e) {
    dbg("callback_failed:", e?.message || e);
    // fallback zurück zur Startseite
    return res.redirect("/");
  }
});

/** Wer bin ich? */
router.get("/me", async (req, res) => {
  try {
    const payload = verifyCookie(req.cookies?.[COOKIE_NAME]);
    if (!payload) {
      return res.json({
        ok: true,
        user: null,
        canCreateRaid: false,
        canSetRaidLead: false,
      });
    }
    return res.json({
      ok: true,
      user: payload,
      canCreateRaid: canCreateRaid(payload),
      canSetRaidLead: canSetRaidLead(payload),
      isAdminLevel: isAdminLevel(payload),
    });
  } catch (e) {
    dbg("me_failed:", e?.message || e);
    return res.json({
      ok: true,
      user: null,
      canCreateRaid: false,
      canSetRaidLead: false,
    });
  }
});

/** Logout */
router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true, message: "logged_out" });
});

export default router;
