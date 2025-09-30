import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..'); // project root

// Load .env from root once
const DOTENV = path.join(ROOT, '.env');
if (fs.existsSync(DOTENV)) {
  dotenv.config({ path: DOTENV });
}

function req(name, hint = '') {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    const extra =
      hint ||
      `Fehlt die Variable "${name}" in deiner .env im Projektroot (${DOTENV})?`;
    throw new Error(`[ENV] Missing required variable: ${name}\n${extra}`);
  }
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 4000),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Discord OAuth + Bot
  DISCORD_CLIENT_ID: req('DISCORD_CLIENT_ID'),
  DISCORD_CLIENT_SECRET: req('DISCORD_CLIENT_SECRET'),
  DISCORD_BOT_TOKEN: req('DISCORD_BOT_TOKEN'),
  OAUTH_REDIRECT_URI:
    process.env.OAUTH_REDIRECT_URI || 'http://localhost:4000/api/auth/callback',

  // Guild + Roles + Category
  DISCORD_GUILD_ID: req('DISCORD_GUILD_ID'),
  RAIDLEAD_ROLE_ID: process.env.RAIDLEAD_ROLE_ID || '', // optional
  DISCORD_RAID_CATEGORY_ID: process.env.DISCORD_RAID_CATEGORY_ID || '',

  // DB
  DATABASE_URL: req('DATABASE_URL'),

  // Cookie / JWT
  COOKIE_NAME: process.env.COOKIE_NAME || 'sid',
  JWT_SECRET: req('JWT_SECRET')
};
