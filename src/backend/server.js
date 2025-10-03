// src/backend/server.js
import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * MODE/ENV
 */
const ENV = process.env;
const IS_PROD = (ENV.MODE || ENV.NODE_ENV) === "production";
const PORT = Number(ENV.PORT || 4000);

// Rollen aus .env
const ROLE_ADMIN_ID = ENV.DISCORD_ROLE_ADMIN_ID || ENV.ADMIN_ROLE_ID || null;
const ROLE_RAIDLEAD_ID = ENV.RAIDLEAD_ROLE_ID || null;
const OWNER_USER_ID = ENV.OWNER_USER_ID || null;

/**
 * Pfade (ESM-safe)
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const FRONTEND_ROOT = path.resolve(PROJECT_ROOT, "src/frontend");
const DIST_DIR = path.resolve(PROJECT_ROOT, "dist");
const INDEX_FILE = IS_PROD
  ? path.join(DIST_DIR, "index.html")
  : path.join(FRONTEND_ROOT, "index.html");

/**
 * Logging helpers
 */
function ts() {
  return new Date().toTimeString().split(" ")[0];
}
function log(kind, msg, ...rest) {
  console.log(`[BACKEND ${ts()}] [${kind}] ${msg}`, ...rest);
}
function logEnvSummary() {
  const summary = {
    FRONTEND_URL: ENV.FRONTEND_URL || `http://localhost:${PORT}`,
    BACKEND_URL: ENV.BACKEND_URL || `http://localhost:${PORT}`,
    OAUTH_REDIRECT_URI:
      ENV.OAUTH_REDIRECT_URI || `http://localhost:${PORT}/api/auth/callback`,
    GUILD_ID: ENV.DISCORD_GUILD_ID || ENV.GUILD_ID || "",
    RAIDLEAD_ROLE_ID: ROLE_RAIDLEAD_ID || "",
    ADMIN_ROLE_ID: ROLE_ADMIN_ID || "",
    BOT_TOKEN_SET: !!ENV.DISCORD_TOKEN,
    MODE: ENV.MODE || ENV.NODE_ENV || "development"
  };
  log("ENV", "summary:", JSON.stringify(summary, null, 2));
}

/**
 * Express app
 */
const app = express();
app.use(express.json());
app.use(cookieParser());

/**
 * Utility: User/Rollen prüfen
 * Erwartet, dass req.user gesetzt ist (dein Auth-Middleware).
 * Fällt weich zurück, falls noch nicht vorhanden (macht dann nichts).
 */
function hasRoleId(user, roleId) {
  if (!user || !roleId) return false;
  const roles = user.roles || user.discord_roles || [];
  return Array.isArray(roles) && roles.includes(roleId);
}
function isOwnerOrAdmin(user) {
  return Boolean(
    user &&
      (
        user.isOwner ||
        user.isAdmin ||
        hasRoleId(user, ROLE_ADMIN_ID) ||
        (OWNER_USER_ID && user.id === OWNER_USER_ID)
      )
  );
}

/**
 * SECURITY MIDDLEWARE:
 * Erzwingt beim Erstellen eines Raids die Raidlead-Regel:
 * - Nur Owner/Admin dürfen leadId frei setzen.
 * - Raidlead-Rolle (oder darunter): lead = Ersteller selbst.
 *
 * Hinweise:
 * - Wir lassen alle anderen /api/raids-Requests unangetastet.
 * - Wir setzen mehrere potenzielle Feldnamen, damit das bestehende
 *   Route-Handling (egal ob leadId / leadUserId / raidlead_id) korrekt greift.
 */
function enforceRaidLeadOnCreate(req, _res, next) {
  try {
    // Nur POST auf /api/raids (Create)
    if (req.method !== "POST") return next();

    // Falls Auth noch nicht lief, nichts kaputt machen:
    const me = req.user || null;
    if (!me) return next();

    // Admin darf lead aus dem Body setzen, sonst überschreiben wir auf den Ersteller
    const admin = isOwnerOrAdmin(me);

    const incomingLead =
      req.body?.leadId ||
      req.body?.leadUserId ||
      req.body?.raidleadId ||
      req.body?.raidlead_id ||
      null;

    const chosenLead = admin && incomingLead ? String(incomingLead) : String(me.id);

    // Setze mehrere Feldnamen, maximale Kompatibilität zur bestehenden Route:
    req.body = req.body || {};
    req.body.leadId = chosenLead;
    req.body.leadUserId = chosenLead;
    req.body.raidleadId = chosenLead;
    req.body.raidlead_id = chosenLead;

    // Optional: für Debug
    if (!admin && incomingLead && incomingLead !== me.id) {
      log(
        "SEC",
        `Non-admin tried to set lead (${incomingLead}) -> enforced to self (${me.id})`
      );
    }
    next();
  } catch (e) {
    // Sicherheitshalber weiterreichen statt hart blockieren
    log("SEC", `enforceRaidLeadOnCreate error: ${e.message}`);
    next();
  }
}

/**
 * Routen dynamisch mounten (Windows-safe via file://)
 */
async function mountRoute(mountPath, relativeFile) {
  try {
    const absFile = path.resolve(__dirname, relativeFile);
    const moduleUrl = pathToFileURL(absFile).href;
    const mod = await import(moduleUrl);
    const router = mod.default || mod.router || mod;
    if (!router) throw new Error("module has no default export (router)");
    app.use(mountPath, router);
    log("ROUTE", `mounted ${mountPath} -> ${relativeFile}`);
  } catch (err) {
    log("ROUTE", `failed to mount ${mountPath} from ${relativeFile}: ${err.message}`);
  }
}

/**
 * Reihenfolge beachten:
 * 1) Security-Middleware für /api/raids (muss VOR dem eigentlichen Router laufen)
 * 2) Dann Router mounten
 */
app.use("/api/raids", enforceRaidLeadOnCreate);
await mountRoute("/api/auth", "./routes/auth.js");
await mountRoute("/api/raids", "./routes/raids.js");
await mountRoute("/api/presets", "./routes/presets.js");
await mountRoute("/api/chars", "./routes/chars.js");
await mountRoute("/api/leads", "./routes/leads.js");
await mountRoute("/api/users", "./routes/users.js");
await mountRoute("/api/cycles", "./routes/cycles.js");

/**
 * Discord Bot (best-effort)
 */
(async () => {
  try {
    const botUrl = pathToFileURL(path.resolve(__dirname, "./discord/bot.js")).href;
    await import(botUrl);
    log("BOT", "discord bot loaded");
  } catch (err) {
    log("BOT", `failed to load discord bot: ${err.message}`);
  }
})();

/**
 * Frontend dev/prod
 */
if (IS_PROD) {
  // dist ausliefern
  app.use(express.static(DIST_DIR, { index: false }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    fs.readFile(INDEX_FILE, "utf-8", (err, html) => {
      if (err) return next(err);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
    });
  });
} else {
  // Vite-Middleware in Dev (fix für text/jsx & HMR)
  const viteConfigFile = path.resolve(PROJECT_ROOT, "vite.config.js");
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    configFile: viteConfigFile,
    server: { middlewareMode: true }
  });

  app.use(vite.middlewares);

  // SPA Fallback mit HTML-Transform
  app.use(async (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    try {
      let template = fs.readFileSync(INDEX_FILE, "utf-8");
      template = await vite.transformIndexHtml(req.originalUrl, template);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).end(template);
    } catch (e) {
      vite.ssrFixStacktrace?.(e);
      next(e);
    }
  });
}

/**
 * Health
 */
app.get("/api/health", (req, res) => {
  res.json({ ok: true, mode: IS_PROD ? "production" : "development" });
});

/**
 * Start
 */
app.listen(PORT, () => {
  logEnvSummary();
  log("SERVER", `listening on http://localhost:${PORT}`);
});
