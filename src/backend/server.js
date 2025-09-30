// src/backend/server.js
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env.js';

import authRouter from './routes/auth.js';
import leadsRouter from './routes/leads.js';
import raidsRouter from './routes/raids.js';

const app = express();

app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser(env.SESSION_SECRET));

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);

// Mini-Debug, um zu sehen, was wirklich ankommt (safe, keine Secrets)
app.get('/api/debug/env', (_req, res) => {
  const mask = (v) => (v ? `${v.slice(0, 4)}…${v.slice(-4)}` : null);
  res.json({
    FRONTEND_URL: env.FRONTEND_URL,
    BACKEND_URL: env.BACKEND_URL,
    OAUTH_REDIRECT_URI: env.OAUTH_REDIRECT_URI,
    GUILD_ID: env.GUILD_ID || null,
    RAIDLEAD_ROLE_ID: env.RAIDLEAD_ROLE_ID || null,
    BOT_TOKEN_SET: !!env.DISCORD_BOT_TOKEN,
  });
});

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

// API
app.use('/api/auth', authRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/raids', raidsRouter);

// Root -> Frontend
app.get('/', (_req, res) => res.redirect(env.FRONTEND_URL));

app.listen(env.PORT, () => {
  const short = (v) => (v ? `${v.slice(0, 4)}…${v.slice(-4)}` : '(empty)');
  console.log(`API listening on http://localhost:${env.PORT}`);
  console.log('[ENV] summary:', {
    FRONTEND_URL: env.FRONTEND_URL,
    BACKEND_URL: env.BACKEND_URL,
    OAUTH_REDIRECT_URI: env.OAUTH_REDIRECT_URI,
    GUILD_ID: env.GUILD_ID || '(empty)',
    RAIDLEAD_ROLE_ID: env.RAIDLEAD_ROLE_ID || '(empty)',
    BOT_TOKEN_SET: !!env.DISCORD_BOT_TOKEN,
  });
});
