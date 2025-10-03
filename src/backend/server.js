// src/backend/server.js
import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENV = process.env;
const IS_PROD = (ENV.MODE || ENV.NODE_ENV) === "production";
const PORT = Number(ENV.PORT || 4000);

// --- __dirname / project paths (ESM-safe) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const FRONTEND_ROOT = path.resolve(PROJECT_ROOT, "src/frontend");
const DIST_DIR = path.resolve(PROJECT_ROOT, "dist");
const INDEX_FILE = IS_PROD
  ? path.join(DIST_DIR, "index.html")
  : path.join(FRONTEND_ROOT, "index.html");

// --- Helper logging ---
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
    RAIDLEAD_ROLE_ID:
      ENV.RAIDLEAD_ROLE_ID ||
      ENV.DISCORD_ROLE_RAIDLEAD_ID ||
      ENV.DISCORD_ROLE_RAIDLEAD ||
      "",
    BOT_TOKEN_SET: !!ENV.DISCORD_TOKEN,
    MODE: ENV.MODE || ENV.NODE_ENV || "development"
  };
  log("ENV", "summary:", JSON.stringify(summary, null, 2));
}

// --- Express app ---
const app = express();
app.use(express.json());
app.use(cookieParser());

// --- Routes dynamic mount (Windows-safe using file://) ---
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

// --- Mount API routes (best-effort; won't crash if a file is broken) ---
await mountRoute("/api/auth", "./routes/auth.js");
await mountRoute("/api/raids", "./routes/raids.js");
await mountRoute("/api/presets", "./routes/presets.js");
await mountRoute("/api/chars", "./routes/chars.js");
await mountRoute("/api/leads", "./routes/leads.js");
await mountRoute("/api/users", "./routes/users.js");
await mountRoute("/api/cycles", "./routes/cycles.js");

// --- Discord Bot (best-effort) ---
(async () => {
  try {
    const botUrl = pathToFileURL(path.resolve(__dirname, "./discord/bot.js")).href;
    await import(botUrl);
    log("BOT", "discord bot loaded");
  } catch (err) {
    log("BOT", `failed to load discord bot: ${err.message}`);
  }
})();

// --- Frontend dev/prod serving ---
if (IS_PROD) {
  // Serve built assets
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
  // Development: Vite Middleware (fixes the text/jsx problem)
  const viteConfigFile = path.resolve(PROJECT_ROOT, "vite.config.js");
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    configFile: viteConfigFile,
    server: { middlewareMode: true }
  });

  // Vite handles /main.jsx, assets, HMR, etc.
  app.use(vite.middlewares);

  // SPA fallback with Vite HTML transform
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

// --- Health check ---
app.get("/api/health", (req, res) => {
  res.json({ ok: true, mode: IS_PROD ? "production" : "development" });
});

// --- Start server ---
app.listen(PORT, () => {
  logEnvSummary();
  log("SERVER", `listening on http://localhost:${PORT}`);
});
