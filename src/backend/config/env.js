// src/backend/config/env.js
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

function clean(val) {
  if (val == null) return val;
  let v = String(val).replace(/\uFEFF/g, '').trim(); // BOM entfernen + trim
  // umschließende Anführungszeichen entfernen
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function loadDotenvOnce() {
  if (process.env.__DOTENV_LOADED) return;

  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'src', 'backend', '.env'),
  ];

  let loadedFrom = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      // override:true -> .env gewinnt gegen ggf. gesetzte (auch leere) System-Env-Vars
      dotenv.config({ path: p, override: true });
      loadedFrom = p;
      break;
    }
  }

  console.log('[ENV] candidates:\n  - ' + candidates.join('\n  - '));
  console.log('[ENV] loaded from:', loadedFrom || 'process env only');

  // Alles sanitisieren (BOM/Quotes)
  for (const k of Object.keys(process.env)) {
    process.env[k] = clean(process.env[k]);
  }

  process.env.__DOTENV_LOADED = loadedFrom || 'process env only';
}

loadDotenvOnce();

function required(name, hint = '') {
  const v = clean(process.env[name]);
  if (!v) throw new Error(`[ENV] Missing required variable: ${name}${hint ? `\n${hint}` : ''}`);
  return v;
}

function optional(name, def = undefined) {
  const v = clean(process.env[name]);
  return v ?? def;
}

// Tolerant: mehrere mögliche Namen akzeptieren
const GUILD = optional('GUILD_ID',
              optional('DISCORD_GUILD_ID',
              optional('VITE_GUILD_ID', '')));

export const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),

  FRONTEND_URL: required('FRONTEND_URL'),
  BACKEND_URL: required('BACKEND_URL'),
  OAUTH_REDIRECT_URI: required('OAUTH_REDIRECT_URI'),

  DISCORD_CLIENT_ID: required('DISCORD_CLIENT_ID', 'Im Discord Dev-Portal anlegen.'),
  DISCORD_CLIENT_SECRET: required('DISCORD_CLIENT_SECRET', 'Im Discord Dev-Portal anlegen.'),
  SESSION_SECRET: required('SESSION_SECRET', 'Sicherer Zufallswert für Cookies.'),

  // NICHT mehr start-kritisch: werden erst beim Discord-Zugriff gebraucht
  DISCORD_BOT_TOKEN: optional('DISCORD_BOT_TOKEN', ''),
  GUILD_ID: GUILD,
  RAIDLEAD_ROLE_ID: optional('RAIDLEAD_ROLE_ID', ''),

  DATABASE_URL: optional('DATABASE_URL', 'file:./src/backend/prisma/dev.db'),
  PORT: parseInt(optional('PORT', '4000'), 10),
};

export const req = required;
export const opt = optional;
