import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';

const router = Router();

const ImportReq = z.object({
  name: z.string().min(2),
  realm: z.string().min(2),
  region: z.enum(['US','EU','KR','TW','CN'])
});

function slugRealm(realm) {
  return realm.trim().toLowerCase().replace(/['’]/g, '').replace(/\s+/g, '-');
}

async function fetchRIOCharacter({ name, realm, region }) {
  const base = 'https://raider.io/api/v1/characters/profile';
  const params = new URLSearchParams({
    region: region.toLowerCase(),
    realm: slugRealm(realm),
    name,
    fields: [
      'gear',
      'guild',
      'raid_progression',
      'mythic_plus_scores_by_season:current'
    ].join(',')
  });
  const url = `${base}?${params.toString()}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'BoostingBot/1.0 (+raid import)' } });
  if (res.status === 404) return { ok: false, code: 404, error: 'Character not found on Raider.IO' };
  if (!res.ok) return { ok: false, code: res.status, error: `Raider.IO error ${res.status}` };
  const data = await res.json();
  return { ok: true, data };
}

router.post('/import', async (req, res) => {
  const parsed = ImportReq.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const result = await fetchRIOCharacter(parsed.data);
  if (!result.ok) return res.status(result.code === 404 ? 404 : 502).json({ error: result.error });

  const c = result.data;
  const gear = c.gear || {};
  const season = c.mythic_plus_scores_by_season?.[0] || {};
  const mplus = season.scores || {};

  const character = await prisma.character.upsert({
    where: { name_realm_region: { name: c.name, realm: c.realm, region: (c.region || '').toUpperCase() } },
    update: {
      class: c.class || null,
      spec: c.active_spec_name || null,
      guild: c.guild?.name || null,
      ilvl: gear.item_level_equipped ?? null,
      rio: mplus.all ?? 0
    },
    create: {
      name: c.name,
      realm: c.realm,
      region: (c.region || '').toUpperCase(),
      class: c.class || null,
      spec: c.active_spec_name || null,
      guild: c.guild?.name || null,
      ilvl: gear.item_level_equipped ?? null,
      rio: mplus.all ?? 0,
      wcl: null
    }
  });

  res.json({ ok: true, character });
});

router.get('/', async (_req, res) => {
  const list = await prisma.character.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(list);
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.character.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'Char not found' });
  }
});

export default router;
