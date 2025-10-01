import express from 'express';
import { ensureBotReady } from '../discord/index.js';
import { requireAuth } from '../middleware/auth.js';

export const leadsRouter = express.Router();

// GET /api/leads
leadsRouter.get('/', requireAuth, async (_req, res) => {
  try {
    const cli = await ensureBotReady();
    const guild = await cli.guilds.fetch(process.env.DISCORD_GUILD_ID);
    await guild.members.fetch();
    await guild.roles.fetch();

    let members = [];
    const rid = process.env.RAIDLEAD_ROLE_ID;
    if (rid) {
      const role = guild.roles.cache.get(rid);
      if (role) members = [...role.members.values()];
    }
    if (members.length === 0) {
      const byName = guild.roles.cache.find(r => r.name?.toLowerCase() === 'raidlead');
      if (byName) members = [...byName.members.values()];
    }

    const leads = members.map(m => ({
      id: m.id,
      username: m.user.username,
      displayName: m.displayName,
    }));
    res.json({ leads });
  } catch (e) {
    console.error('❌ /api/leads:', e?.message || e);
    res.status(500).json({ error: 'failed_to_list_leads' });
  }
});
