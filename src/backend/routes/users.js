// src/backend/routes/users.js
import express from 'express';
import crypto from 'node:crypto';
import { prisma } from '../prismaClient.js';
import { getLiveRoleFlags, isAdminLevel, highestRoleFromFlags } from '../utils/roles.js';
import { ensureBotReady } from '../discord/bot.js';

const ENV = process.env;
const router = express.Router();

const COOKIE_NAME   = ENV.JWT_COOKIE_NAME || ENV.COOKIE_NAME || 'auth';
const COOKIE_SECRET = ENV.JWT_Secret || ENV.COOKIE_SECRET || 'dev-secret-fallback';
const GUILD_ID      = ENV.DISCORD_GUILD_ID || ENV.GUILD_ID || '';

function dbg(...a) {
  const t = new Date();
  const ts = t.toLocaleTimeString('de-DE', { hour12: false }) + '.' + String(t.getMilliseconds()).padStart(3, '0');
  console.log(`[USERS-DBG ${ts}]`, ...a);
}

/* -------------------- auth cookie helpers -------------------- */
function verifyToken(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const [v, payloadB64, sigB64] = token.split('.');
    if (v !== 'v1' || !payloadB64 || !sigB64) return null;
    const payloadBuf = Buffer.from(payloadB64, 'base64');
    const expected = crypto.createHmac('sha256', COOKIE_SECRET).update(payloadBuf).digest();
    const given = Buffer.from(sigB64, 'base64');
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    return JSON.parse(payloadBuf.toString('utf8'));
  } catch {
    return null;
  }
}
function getUserFromReq(req) {
  const raw = req.cookies?.[COOKIE_NAME];
  return verifyToken(raw); // { id, discordId, roles, isOwner, isAdmin, raidlead, ... } (von deiner /auth)
}

/* -------------------- guards -------------------- */
async function requireAdmin(req, res, next) {
  const u = getUserFromReq(req);
  if (!u) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

  // Erst Payload-Flags, fallback live
  const payloadFlags = { isOwner: !!u.isOwner, isAdmin: !!u.isAdmin };
  if (isAdminLevel(payloadFlags)) return next();

  // Live check
  try {
    const { ok, flags } = await getLiveRoleFlags(u.discordId || u.id, { guildId: GUILD_ID });
    if (ok && isAdminLevel(flags)) return next();
  } catch {}

  return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
}

/* -------------------- routes -------------------- */

// GET /api/users  (Admin-only)
router.get('/', requireAdmin, async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        discordId: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        rolesCsv: true,
        isRaidlead: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Abgeleitete Felder (highestPermission) aus rolesCsv (optional)
    const mapped = users.map((u) => {
      // grobe Ableitung: wenn rolesCsv Admin-Rolle enthält => Admin; wenn Raidlead => Raidlead; sonst User
      const roles = (u.rolesCsv || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const flags = {
        isOwner: false,
        isAdmin: roles.includes(ENV.DISCORD_ROLE_ADMIN_ID || ENV.ADMIN_ROLE_ID || '___admin___'),
        isRaidlead: roles.includes(ENV.RAIDLEAD_ROLE_ID || ENV.DISCORD_ROLE_RAIDLEAD_ID || '___lead___'),
        isBooster: roles.includes(ENV.DISCORD_ROLE_BOOSTER_ID || '___booster___'),
      };
      return {
        ...u,
        highestPermission: highestRoleFromFlags(flags),
      };
    });

    res.json({ ok: true, users: mapped });
  } catch (e) {
    dbg('list_error:', e?.message || e);
    res.status(500).json({ ok: false, error: 'LIST_FAILED', message: String(e?.message || e) });
  }
});

// POST /api/users/sync-guild  (Admin-only) → Discord → DB upsert
router.post('/sync-guild', requireAdmin, async (_req, res) => {
  if (!GUILD_ID) {
    return res.status(400).json({ ok: false, error: 'MISSING_GUILD_ID' });
  }
  try {
    const client = await ensureBotReady();
    const guild = await client.guilds.fetch(GUILD_ID);

    // Discord.js v14: einfache Variante – holt alle Member (in kleinen Guilds ok)
    const members = await guild.members.fetch();
    let upserts = 0;

    for (const [, m] of members) {
      try {
        const flags = flagsFromMember(m); // lokale Berechnung
        const display =
          m.nickname ||
          m.user.globalName ||
          m.user.username ||
          null;

        const rolesCsv = Array.from(m.roles?.cache?.keys?.() || []).join(',');
        await prisma.user.upsert({
          where: { discordId: String(m.user.id) },
          create: {
            discordId: String(m.user.id),
            username: m.user.username || null,
            displayName: display,
            avatarUrl: m.user.displayAvatarURL?.() || null,
            rolesCsv,
            isRaidlead: !!flags.isRaidlead,
          },
          update: {
            username: m.user.username || null,
            displayName: display,
            avatarUrl: m.user.displayAvatarURL?.() || null,
            rolesCsv,
            isRaidlead: !!flags.isRaidlead,
          },
        });
        upserts++;
      } catch (e2) {
        dbg('upsert_failed:', m.user?.id, e2?.message || e2);
      }
    }

    res.json({ ok: true, count: upserts });
  } catch (e) {
    dbg('sync_error:', e?.message || e);
    res.status(500).json({ ok: false, error: 'SYNC_FAILED', message: String(e?.message || e) });
  }
});

/* Hilfsimport – damit users.js standalone ist */
function flagsFromMember(member) {
  // Mini-Duplikat damit users.js keine zyklische Abhängigkeit bekommt
  const rolesArray = Array.from(member?.roles?.cache?.keys?.() || []);
  const isAdminRole = (ENV.DISCORD_ROLE_ADMIN_ID || ENV.ADMIN_ROLE_ID || '') && rolesArray.includes(ENV.DISCORD_ROLE_ADMIN_ID || ENV.ADMIN_ROLE_ID);
  const isRaidleadRole = (ENV.RAIDLEAD_ROLE_ID || ENV.DISCORD_ROLE_RAIDLEAD_ID || '') && rolesArray.includes(ENV.RAIDLEAD_ROLE_ID || ENV.DISCORD_ROLE_RAIDLEAD_ID);
  const isBoosterRole = (ENV.DISCORD_ROLE_BOOSTER_ID || '') && rolesArray.includes(ENV.DISCORD_ROLE_BOOSTER_ID);

  return {
    isOwner: member?.guild?.ownerId ? member.guild.ownerId === member.user?.id : false,
    isAdmin: isAdminRole,
    isRaidlead: isRaidleadRole,
    isBooster: isBoosterRole,
    roles: rolesArray
  };
}

export default router;
