import express from 'express';
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import { prisma } from '../prismaClient.js';
import { env } from '../config/env.js';

const router = express.Router();

const OAUTH_BASE = 'https://discord.com/api/oauth2';

router.get('/login', (req, res) => {
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: env.OAUTH_REDIRECT_URI,
    scope: 'identify',
    prompt: 'consent',
    state: 'x' // (optional) CSRF mitigation
  });
  res.redirect(`${OAUTH_BASE}/authorize?${params.toString()}`);
});

router.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('missing code');

  // exchange token
  const tokenRes = await fetch(`${OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.OAUTH_REDIRECT_URI
    })
  });
  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    return res.status(500).send(`oauth token error: ${txt}`);
  }
  const tokenJson = await tokenRes.json();

  // fetch identify
  const meRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` }
  });
  const me = await meRes.json();

  // upsert user to DB
  // isRaidlead wird lazy später durch /api/leads aktualisiert, hier erstmal false
  const user = await prisma.user.upsert({
    where: { discordId: me.id },
    update: { username: me.username, avatar: me.avatar },
    create: {
      discordId: me.id,
      username: me.username,
      avatar: me.avatar,
      isRaidlead: false
    }
  });

  // sign session cookie
  const jwtPayload = {
    id: user.id,
    discordId: user.discordId,
    username: user.username,
    isRaidlead: user.isRaidlead
  };
  const token = jwt.sign(jwtPayload, env.JWT_SECRET, { expiresIn: '7d' });

  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false // localhost
  });

  // back to frontend
  res.redirect(`${env.FRONTEND_URL}/raids`);
});

router.post('/logout', (req, res) => {
  res.clearCookie(env.COOKIE_NAME);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const user = req.user || null;
  res.json({ user });
});

export default router;
