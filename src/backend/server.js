// ESM
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { ensureBotReady, discordStatus } from './discord/index.js';
import { authRouter } from './routes/auth.js';
import { leadsRouter } from './routes/leads.js';
import { makeRaidsRouter } from './routes/raids.js';
import { makeCharsRouter } from './routes/chars.js';

const CWD = process.cwd();
const envPath = path.join(CWD, '.env');
console.log('[BACKEND] [ENV] candidates:');
if (fs.existsSync(envPath)) console.log(`[BACKEND]   - ${envPath}`);
dotenv.config({ path: envPath });
console.log(`[BACKEND] [ENV] loaded from: ${fs.existsSync(envPath) ? envPath : '(process env only)'}`);

const ENV = {
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:4000',
};

const prisma = new PrismaClient();
const app = express();

app.use(cors({ origin: ENV.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Bot hochfahren (Logs kommen in der Konsole)
ensureBotReady().catch(err => {
  console.error('❌ Discord-Bot konnte nicht starten:', err?.message || err);
});

// Health + Discord Status
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/api/discord/status', (_req, res) => res.json(discordStatus()));

// Routen
app.use('/api/auth', authRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/raids', makeRaidsRouter({ prisma }));
app.use('/api/chars', makeCharsRouter({ prisma }));

// Start
const url = new URL(process.env.BACKEND_URL || 'http://localhost:4000');
const PORT = Number(url.port) || 4000;
app.listen(PORT, () => {
  console.log(`[BACKEND] API listening on http://localhost:${PORT}`);
});
