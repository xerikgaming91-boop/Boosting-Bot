// /src/backend/utils/jwt.js
import crypto from 'node:crypto';

const COOKIE = process.env.JWT_COOKIE_NAME || 'auth';
const SECRET = process.env.JWT_Secret || 'dev_secret';

function b64url(x) { return Buffer.from(x).toString('base64url'); }

export function signJwt(payload, expSeconds = 60 * 60 * 24 * 7) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { iat: now, exp: now + expSeconds, ...payload };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

export function verifyJwt(token) {
  try {
    const [h, p, s] = token.split('.');
    const expected = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
    if (s !== expected) return null;
    const obj = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (obj.exp && Math.floor(Date.now() / 1000) > obj.exp) return null;
    return obj;
  } catch { return null; }
}

export function setAuthCookie(res, jwt) {
  res.cookie(COOKIE, jwt, { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 1000*60*60*24*7 });
}
export function clearAuthCookie(res) { res.clearCookie(COOKIE, { path: '/' }); }

export function getUserFromReq(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  return verifyJwt(token);
}
