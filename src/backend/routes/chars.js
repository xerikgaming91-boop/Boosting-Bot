import express from 'express';
import { requireAuth } from '../middleware/auth.js';

/* Helpers */
function slugRealm(realm) {
  return String(realm || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, '-').replace(/'/g, '');
}
function capFirst(s) { s = String(s || '').toLowerCase(); return s ? s[0].toUpperCase() + s.slice(1) : s; }
function normalizeRegion(region) {
  const r = String(region || 'EU').trim().toUpperCase();
  return ['US','EU','KR','TW','CN'].includes(r) ? r : 'EU';
}

/* Raider.IO */
async function fetchRaiderIO({ name, realm, region }) {
  const url = new URL('https://raider.io/api/v1/characters/profile');
  url.searchParams.set('region', region.toLowerCase());
  url.searchParams.set('realm', realm);
  url.searchParams.set('name', name);
  url.searchParams.set('fields', [
    'gear',
    'raid_progression',
    'mythic_plus_scores_by_season:current',
    'mythic_plus_recent_runs',
    'mythic_plus_best_runs',
  ].join(','));

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Raider.IO error ${resp.status}: ${text}`);
  }
  const json = await resp.json();
  const className = json?.class || null;
  const specName = json?.active_spec_name || null;
  const score = json?.mythic_plus_scores_by_season?.[0]?.scores?.all ?? null;

  return {
    raw: json,
    summary: {
      name: json?.name || name,
      realm: json?.realm || realm,
      region: (json?.region || region).toUpperCase(),
      class: className,
      spec: specName,
      rioScore: score,
      raidProgression: json?.raid_progression || {},
      gear: json?.gear || {},
    },
  };
}

export function makeCharsRouter({ prisma }) {
  const router = express.Router();

  // POST /api/chars/import
  router.post('/import', requireAuth, async (req, res) => {
    try {
      const { name, realm, region } = req.body || {};
      if (!name || !realm) return res.status(400).json({ error: 'missing_name_or_realm' });

      const normRegion = normalizeRegion(region);
      const realmSlug = slugRealm(realm);
      const charName = capFirst(name);

      const rio = await fetchRaiderIO({ name: charName, realm: realmSlug, region: normRegion });

      // Model-Name: Chars
      const saved = await prisma.chars.upsert({
        where: {
          ownerId_name_realm_region: {
            ownerId: req.user.id,
            name: charName,
            realm: realmSlug,
            region: normRegion,
          },
        },
        update: {
          class: rio.summary.class,
          spec: rio.summary.spec,
          rioScore: rio.summary.rioScore,
          rioJson: rio.raw,
          updatedAt: new Date(),
        },
        create: {
          ownerId: req.user.id,
          name: charName,
          realm: realmSlug,
          region: normRegion,
          class: rio.summary.class,
          spec: rio.summary.spec,
          rioScore: rio.summary.rioScore,
          rioJson: rio.raw,
        },
      });

      res.json({ ok: true, char: saved, rio: rio.summary });
    } catch (e) {
      console.error('❌ /api/chars/import:', e?.message || e);
      res.status(500).json({ error: 'import_failed', detail: e?.message || String(e) });
    }
  });

  // GET /api/chars/mine
  router.get('/mine', requireAuth, async (req, res) => {
    try {
      const rows = await prisma.chars.findMany({
        where: { ownerId: req.user.id },
        orderBy: [{ updatedAt: 'desc' }],
        take: 100,
      });
      res.json({ chars: rows });
    } catch (e) {
      console.error('❌ /api/chars/mine:', e?.message || e);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  // DELETE /api/chars/:id (nur Owner)
  router.delete('/:id', requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });

      const row = await prisma.chars.findUnique({ where: { id } });
      if (!row) return res.status(404).json({ error: 'not_found' });
      if (row.ownerId !== req.user.id) return res.status(403).json({ error: 'forbidden' });

      const del = await prisma.chars.delete({ where: { id } });
      res.json({ ok: true, deleted: del });
    } catch (e) {
      console.error('❌ DELETE /api/chars/:id:', e?.message || e);
      res.status(500).json({ error: 'delete_failed' });
    }
  });

  return router;
}
