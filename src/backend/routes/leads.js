import express from 'express';
import { listRaidleads, getDiscordStatus, ensureGuildCache } from '../services/discord.js';
import { prisma } from '../prismaClient.js';

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    await ensureGuildCache();
    const leads = await listRaidleads();

    // DB-Flag für isRaidlead aktualisieren (optional)
    await Promise.all(
      leads.map((l) =>
        prisma.user.upsert({
          where: { discordId: l.id },
          update: { username: l.username, isRaidlead: true },
          create: { discordId: l.id, username: l.username, isRaidlead: true }
        })
      )
    );

    res.json({ items: leads });
  } catch (e) {
    next(e);
  }
});

router.get('/debug', async (_req, res) => {
  res.json({ status: getDiscordStatus() });
});

export default router;
