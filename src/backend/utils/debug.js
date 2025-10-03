// src/backend/utils/debug.js
const { DEBUG_AUTH } = process.env;

export const isDebugAuth = () =>
  DEBUG_AUTH === "1" || DEBUG_AUTH === "true" || DEBUG_AUTH === "yes";

export function dbgAuth(...args) {
  if (!isDebugAuth()) return;
  const ts = new Date().toISOString().split("T")[1].replace("Z", "");
  console.log(`[AUTH-DBG ${ts}]`, ...args);
}

export function mask(str, keep = 4) {
  if (!str || typeof str !== "string") return str;
  if (str.length <= keep * 2) return "*".repeat(str.length);
  const start = str.slice(0, keep);
  const end = str.slice(-keep);
  return `${start}${"*".repeat(str.length - keep * 2)}${end}`;
}

export function pickHeaders(headers) {
  const h = {};
  const keys = ["host", "origin", "referer", "cookie", "authorization", "user-agent"];
  for (const k of keys) {
    if (headers?.[k]) h[k] = headers[k];
  }
  return h;
}
