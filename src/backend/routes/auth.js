// src/backend/routes/auth.js
import express from "express";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

const router = express.Router();
const prisma = new PrismaClient();

// --- ENV (supports both long/short names) ---
const CLIENT_ID = env.DISCORD_CLIENT_ID || env.CLIENT_ID;
const CLIENT_SECRET = env.DISCORD_CLIENT_SECRET || env.CLIENT_SECRET;
const REDIRECT_URI = env.OAUTH_REDIRECT_URI || `${env.BACKEND_URL}/api/auth/callback`;
const FRONTEND_URL = env.FRONTEND_URL || "http://localhost:5173";
const JWT_SECRET = env.JWT_SECRET || "change_me";
const JWT_COOKIE_NAME = env.JWT_COOKIE_NAME || "auth";

// --- cookie options for localhost cross-origin redirect ---
const cookieOpts = {
  httpOnly: true,
  sameSite: "lax",          // works with top-level redirects localhost:4000 -> 5173
  secure: false,            // set true behind HTTPS
  path: "/",
  // no domain for localhost
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// Helper: Discord authorize URL
function buildAuthorizeURL(state = "") {
  const base = "https://discord.com/oauth2/authorize";
  const query = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "identify",
    prompt: "none",
    state,
  });
  return `${base}?${query.toString()}`;
}

// Helper: exchange code -> token
async function exchangeCodeForToken(code) {
  const url = "https://discord.com/api/oauth2/token";
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = `[OAuth] token exchange failed ${res.status}: ${JSON.stringify(json)}`;
    throw new Error(msg);
  }
  return json; // { access_token, token_type, expires_in, scope, refresh_token? }
}

// Helper: /users/@me
async function fetchDiscordMe(accessToken) {
  const res = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = `[OAuth] /users/@me failed ${res.status}: ${JSON.stringify(json)}`;
    throw new Error(msg);
  }
  return json; // { id, username, avatar, global_name, ... }
}

// --- Routes ---

// alias kept for your existing button
router.get("/discord", (req, res) => {
  const url = buildAuthorizeURL();
  return res.redirect(url);
});

// explicit login route (same as /discord)
router.get("/login", (req, res) => {
  const url = buildAuthorizeURL();
  return res.redirect(url);
});

router.get("/callback", async (req, res) => {
  const { code, error, error_description } = req.query;

  try {
    if (error) {
      console.error("[OAuth] callback error from Discord:", error, error_description || "");
      return res.redirect(`${FRONTEND_URL}/?oauth=error`);
    }
    if (!code) {
      console.error("[OAuth] callback missing code");
      return res.redirect(`${FRONTEND_URL}/?oauth=missing_code`);
    }

    // 1) Exchange code
    const token = await exchangeCodeForToken(code);

    // 2) Fetch user
    const me = await fetchDiscordMe(token.access_token);

    // 3) (optional) persist/update user in DB if you have the User model
    try {
      await prisma.user.upsert({
        where: { discordId: me.id },
        update: {
          username: me.username ?? null,
          avatar: me.avatar ?? null,
        },
        create: {
          discordId: me.id,
          username: me.username ?? null,
          avatar: me.avatar ?? null,
          isRaidlead: false, // you can fill this later from guild role check job
        },
      });
    } catch (dbErr) {
      // not fatal for login; still set cookie
      console.warn("[OAuth] upsert user warning:", dbErr?.message || dbErr);
    }

    // 4) Sign JWT and set cookie
    const payload = {
      id: me.id,
      username: me.username,
      avatar: me.avatar,
      // expire in 7 days
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    };
    const tokenJwt = jwt.sign(payload, JWT_SECRET);
    res.cookie(JWT_COOKIE_NAME, tokenJwt, cookieOpts);

    // 5) Go back to app
    return res.redirect(`${FRONTEND_URL}/raids`);
  } catch (e) {
    console.error("[OAuth] callback failed:", e?.message || e);
    // surface a readable reason in location for quick debugging
    const reason = encodeURIComponent((e?.message || "unknown").slice(0, 200));
    return res.redirect(`${FRONTEND_URL}/?oauth=callback_error&reason=${reason}`);
  }
});

// who am I (used by frontend)
router.get("/me", (req, res) => {
  try {
    const raw = req.cookies?.[JWT_COOKIE_NAME];
    if (!raw) return res.status(200).json({ user: null });

    const decoded = jwt.verify(raw, JWT_SECRET);
    return res.json({ user: decoded });
  } catch {
    return res.status(200).json({ user: null });
  }
});

// logout
router.post("/logout", (req, res) => {
  res.clearCookie(JWT_COOKIE_NAME, { ...cookieOpts, maxAge: 0 });
  return res.status(204).end();
});

export default router;
