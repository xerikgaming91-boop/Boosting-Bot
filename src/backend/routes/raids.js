// src/backend/routes/raids.js
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createRaidTextChannel } from '../services/discord.js';

const prisma = new PrismaClient();
const router = express.Router();

/**
 * GET /api/raids
 * Listet Raids (einfach, ohne Filter/Paging)
 */
router.get('/', async (_req, res) => {
  try {
    const raids = await prisma.raid.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(raids);
  } catch (e) {
    console.error('[raids] GET / error:', e);
    res.status(500).json({ error: 'failed list' });
  }
});

/**
 * POST /api/raids
 * Erwartet body: { title, difficulty, lootType, bosses?, date, lead? }
 * Legt DB-Eintrag an und erstellt danach den Discord-Textchannel.
 */
router.post('/', async (req, res) => {
  try {
    const { title, difficulty, lootType, bosses, date, lead } = req.body || {};

    // 1) Raid in DB anlegen
    const created = await prisma.raid.create({
      data: {
        title: String(title || ''),
        difficulty: String(difficulty || ''),
        lootType: String(lootType || ''),
        bosses: bosses == null ? null : String(bosses),
        date: date ? new Date(date) : new Date(),
        lead: lead ? String(lead) : null,
      },
    });

    // 2) Discord-Channel erstellen (best effort, Fehler nicht fatal)
    try {
      await createRaidTextChannel({
        date: created.date,
        difficulty: created.difficulty,
        lootType: created.lootType,
        leadUserId: created.lead || undefined,
        leadDisplayName: created.title || undefined, // fallback, wenn du hier den Lead-Namen willst, ersetze das
      });
    } catch (e) {
      console.error('[raids] channel create failed (non-fatal):', e?.message || e);
    }

    res.status(201).json(created);
  } catch (e) {
    console.error('[raids] POST / error:', e);
    res.status(500).json({ error: 'failed create' });
  }
});

export default router;
