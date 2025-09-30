import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import morgan from 'morgan';

import { env } from './config/env.js';
import { startDiscord } from './services/discord.js';
import authRouter from './routes/auth.js';
import raidsRouter from './routes/raids.js';
import leadsRouter from './routes/leads.js';
import { attachUserFromSession } from './middleware/auth.js';

const app = express();

app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true
  })
);

// attach req.user from cookie
app.use(attachUserFromSession);

// routes
app.use('/api/auth', authRouter);
app.use('/api/raids', raidsRouter);
app.use('/api/leads', leadsRouter);

// health
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, env: env.NODE_ENV })
);

// static redirect root -> frontend
app.get('/', (_req, res) => res.redirect(env.FRONTEND_URL));

// error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: String(err.message || err) });
});

app.listen(env.PORT, async () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
  await startDiscord().catch((e) => {
    console.error('[Discord] login failed:', e);
  });
});
