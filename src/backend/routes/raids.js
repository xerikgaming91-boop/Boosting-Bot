import express from 'express';
import { requireRaidLead } from '../middleware/auth.js';
import { postRaidAnnouncement, deleteRaidChannel } from '../discord/channels.js';

export function makeRaidsRouter({ prisma }) {
  const router = express.Router();

  // GET /api/raids
  router.get('/', async (_req, res) => {
    try {
      const raids = await prisma.raid.findMany({ orderBy: [{ date: 'desc' }], take: 500 });
      res.json({ raids });
    } catch (e) {
      console.error('❌ /api/raids:', e?.message || e);
      res.status(500).json({ error: 'failed_to_list_raids' });
    }
  });

  // POST /api/raids  (nur Raidlead)
  router.post('/', requireRaidLead, async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.difficulty || !b.lootType || !b.date) {
        return res.status(400).json({ error: 'missing_fields' });
      }

      const difficulty = String(b.difficulty);
      const lootType   = String(b.lootType);
      const isMythic   = difficulty.toLowerCase().startsWith('myth');
      const bosses     = isMythic
        ? (Number.isFinite(parseInt(b.bosses,10)) ? Math.min(8, Math.max(1, parseInt(b.bosses,10))) : 1)
        : 8; // NM/HC -> 8

      const data = {
        title: (b.title || '').trim() || `${difficulty} ${lootType}`.trim(),
        difficulty, lootType,
        date: b.date,
        lead: b.lead || req.user.id,
        bosses,
      };

      const saved = await prisma.raid.create({ data });

      // Channel erstellen + channelId speichern (falls Spalte vorhanden)
      try {
        const channelId = await postRaidAnnouncement({
          title: saved.title, difficulty: saved.difficulty, lootType: saved.lootType,
          bosses: saved.bosses, date: saved.date, lead: saved.lead ?? undefined,
        });
        try {
          await prisma.raid.update({ where: { id: saved.id }, data: { channelId } });
        } catch (e) {
          console.warn('⚠️ channelId konnte nicht gespeichert werden (Spalte fehlt evtl.):', e?.message || e);
        }
      } catch (e) {
        console.warn('⚠️ postRaidAnnouncement fehlgeschlagen:', e?.message || e);
      }

      res.status(200).json(saved);
    } catch (e) {
      console.error('❌ POST /api/raids:', e?.message || e);
      res.status(500).json({ error: 'failed_to_create_raid' });
    }
  });

  // DELETE /api/raids/:id (nur Raidlead)
  router.delete('/:id', requireRaidLead, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });

      const raid = await prisma.raid.findUnique({ where: { id } });
      if (!raid) return res.status(404).json({ error: 'not_found' });

      try { await deleteRaidChannel(raid); } catch (e) {
        console.warn('⚠️ Channel-Löschung fehlgeschlagen:', e?.message || e);
      }

      const deleted = await prisma.raid.delete({ where: { id } });
      res.json({ ok: true, deleted });
    } catch (e) {
      console.error('❌ DELETE /api/raids:', e?.message || e);
      res.status(500).json({ error: 'failed_to_delete_raid' });
    }
  });

  return router;
}
