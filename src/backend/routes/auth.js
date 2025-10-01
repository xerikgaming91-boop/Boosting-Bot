import express from 'express';
import { signJwt, setAuthCookie, clearAuthCookie, getUserFromReq } from '../utils/jwt.js';
import { userIsRaidLead } from '../middleware/auth.js';

export const authRouter = express.Router();

// /api/auth/discord
authRouter.get('/discord', (req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.DISCORD_CLIENT_ID || '',
    redirect_uri: process.env.OAUTH_REDIRECT_URI || '',
    scope: 'identify',
    prompt: 'consent',
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

// /api/auth/callback
authRouter.get('/callback', async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send('Missing code');
    const body = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID || '',
      client_secret: process.env.DISCORD_CLIENT_SECRET || '',
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: process.env.OAUTH_REDIRECT_URI || '',
    });
    const tokenResp = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!tokenResp.ok) return res.status(500).send('OAuth failed');
    const tokenJson = await tokenResp.json();

    const meResp = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!meResp.ok) return res.status(500).send('OAuth failed (me)');
    const me = await meResp.json();

    const jwt = signJwt({ id: me.id, username: me.username, avatar: me.avatar });
    setAuthCookie(res, jwt);
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:5173');
  } catch (e) {
    console.error('❌ /api/auth/callback:', e?.message || e);
    res.status(500).send('OAuth error');
  }
});

// /api/auth/me
authRouter.get('/me', async (req, res) => {
  const user = getUserFromReq(req);
  if (!user?.id) return res.status(200).json({ ok: false, user: null });
  const isLead = await userIsRaidLead(user.id);
  res.json({ ok: true, user: { ...user, isRaidlead: isLead } });
});

// /api/auth/logout
authRouter.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});
