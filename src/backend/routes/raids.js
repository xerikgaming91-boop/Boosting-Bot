import express from 'express';
import { prisma } from '../prismaClient.js';
import { requireRaidlead } from '../middleware/auth.js';
import { createRaidTextChannel } from '../services/discord.js';

const router = express.Router();

router.get('/', async (_req, res) => {
  const rows = await prisma.raid.findMany({
    orderBy: { date: 'asc' }
  });
  res.json({ items: rows });
});

router.post('/', requireRaidlead, async (req, res, next) => {
  try {
    const { title, difficulty, lootType, bosses, date, lead } = req.body;

    const raid = await prisma.raid.create({
      data: {
        title,
        difficulty,
        lootType,
        bosses: bosses != null ? Number(bosses) : null,
        date: new Date(date),
        lead
      }
    });

    // Discord text channel
    await createRaidTextChannel({
      date: new Date(date),
      difficulty,
      lootType,
      leadUserId: lead
    }).catch(() => null);

    res.status(201).json({ raid });
  } catch (e) {
    next(e);
  }
});

export default router;
