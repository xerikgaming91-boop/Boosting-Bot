import express from 'express';
import { requireAuth } from '../middleware/auth.js';

export function makeUsersRouter({ prisma }) {
  const router = express.Router();

  router.get('/me', requireAuth, async (req, res) => {
    const me = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.json({ user: me });
  });

  router.get('/leads', requireAuth, async (_req, res) => {
    const leads = await prisma.user.findMany({
      where: { isRaidlead: true },
      orderBy: { username: 'asc' },
      select: { id: true, username: true, avatar: true, isRaidlead: true },
      take: 500,
    });
    res.json({ leads });
  });

  return router;
}
