// src/backend/routes/leads.js
import express from 'express';
import { listRaidleads, getDiscordStatus } from '../services/discord.js';

const router = express.Router();

// liefert Lead-Liste
router.get('/', async (req, res) => {
  try {
    const leads = await listRaidleads();
    return res.json({ leads });
  } catch (e) {
    console.error('[leads] GET / error:', e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// Debug
router.get('/debug', async (req, res) => {
  try {
    const status = await getDiscordStatus();
    const leads = await listRaidleads().catch(() => []);
    return res.json({
      status,
      sampleCount: leads.length,
      sample: leads.slice(0, 5),
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

export default router;
