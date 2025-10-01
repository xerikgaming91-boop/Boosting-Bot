import { ensureBotReady } from '../discord/index.js';
import { getUserFromReq } from '../utils/jwt.js';

export async function userIsRaidLead(discordUserId) {
  try {
    const cli = await ensureBotReady();
    const guild = await cli.guilds.fetch(process.env.DISCORD_GUILD_ID);
    const member = await guild.members.fetch(discordUserId);
    if (!member) return false;

    // 1) exakte Role-ID
    if (process.env.RAIDLEAD_ROLE_ID && member.roles.cache.has(process.env.RAIDLEAD_ROLE_ID)) {
      return true;
    }
    // 2) Fallback: Rollenname "raidlead"
    for (const [, role] of member.roles.cache) {
      if (String(role.name || '').toLowerCase() === 'raidlead') return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function requireAuth(req, res, next) {
  const user = getUserFromReq(req);
  if (!user?.id) return res.status(401).json({ error: 'unauthenticated' });
  req.user = user;
  next();
}

export async function requireRaidLead(req, res, next) {
  const user = getUserFromReq(req);
  if (!user?.id) return res.status(401).json({ error: 'unauthenticated' });
  const ok = await userIsRaidLead(user.id);
  if (!ok) return res.status(403).json({ error: 'forbidden_not_raidlead' });
  req.user = user;
  next();
}
