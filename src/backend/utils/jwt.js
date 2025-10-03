// src/backend/utils/jwt.js
import jwt from "jsonwebtoken";
import { dbgAuth, isDebugAuth } from "./debug.js";

const {
  JWT_Secret = "dev_secret_change_me",
  JWT_COOKIE_NAME = "auth",
  NODE_ENV = "development",
} = process.env;

const isProd = NODE_ENV === "production";

export function setUserToken(res, payload) {
  const token = jwt.sign(payload, JWT_Secret, { expiresIn: "30d" });
  const cookieOpts = {
    httpOnly: true,
    secure: isProd,  // in dev=false
    sameSite: "lax", // wichtig für OAuth-Redirect
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
  res.cookie(JWT_COOKIE_NAME, token, cookieOpts);

  if (isDebugAuth()) {
    // Set-Cookie wird erst nach send()/redirect() in den Header geschrieben,
    // res.getHeaders() sieht es in Express schon jetzt.
    const setCookie = res.getHeaders()["set-cookie"];
    dbgAuth("setUserToken(): cookie gesetzt", {
      name: JWT_COOKIE_NAME,
      options: cookieOpts,
      "res.set-cookie": setCookie,
      payloadPreview: {
        id: payload?.id,
        username: payload?.username,
        displayName: payload?.displayName,
        isRaidlead: payload?.isRaidlead,
      },
    });
  }
}

export function clearUserToken(res) {
  const cookieOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };
  res.cookie(JWT_COOKIE_NAME, "", cookieOpts);
  dbgAuth("clearUserToken(): cookie gelöscht", { name: JWT_COOKIE_NAME, options: cookieOpts });
}

export async function getUserFromReq(req) {
  try {
    const token = req.cookies?.[JWT_COOKIE_NAME];
    if (!token) {
      dbgAuth("getUserFromReq(): KEIN Cookie gefunden");
      return null;
    }
    const data = jwt.verify(token, JWT_Secret);
    dbgAuth("getUserFromReq(): token ok → user", {
      id: data?.id,
      username: data?.username,
      displayName: data?.displayName,
      isRaidlead: data?.isRaidlead,
    });
    return data || null;
  } catch (e) {
    dbgAuth("getUserFromReq(): verify error", e?.message || String(e));
    return null;
  }
}
