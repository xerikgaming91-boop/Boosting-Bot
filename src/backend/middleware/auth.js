import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function attachUserFromSession(req, _res, next) {
  const raw = req.cookies?.[env.COOKIE_NAME];
  if (!raw) return next();
  try {
    req.user = jwt.verify(raw, env.JWT_SECRET);
  } catch {
    // ignore
  }
  next();
}

export function requireRaidlead(req, res, next) {
  if (!req.user?.isRaidlead) {
    return res.status(403).json({ error: 'raidlead only' });
  }
  next();
}
