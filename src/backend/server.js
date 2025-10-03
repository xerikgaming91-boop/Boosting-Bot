// src/backend/server.js
import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";

// Discord & DB
import { ensureBotReady, discordStatus } from "./discord/bot.js";
import { prisma } from "./prismaClient.js";

// API-Router
import authRouter from "./routes/auth.js";
import raidsRouter from "./routes/raids.js";
import leadsRouter from "./routes/leads.js";
import charsRouter from "./routes/chars.js";
import presetsRouter from "./routes/presets.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 4000);

// CORS, Parser, Logging
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

/* --------- API: Cache komplett aus! (sonst 304 → stale) --------- */
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});

/* ---------------- API ---------------- */
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, now: new Date().toISOString() })
);
app.get("/api/discord/status", (_req, res) => res.json(discordStatus()));

app.use("/api/auth", authRouter);
app.use("/api/raids", raidsRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/chars", charsRouter);
app.use("/api/presets", presetsRouter);

// Immer JSON für unbekannte API-Routen
app.use("/api", (req, res) => {
  res.status(404).json({ ok: false, error: "NOT_FOUND", path: req.originalUrl });
});

/* ----------- Frontend (Vite/SPA) ----------- */
const isProd = process.env.NODE_ENV === "production";
const frontendRoot = path.resolve(__dirname, "../frontend");

if (!isProd) {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root: frontendRoot,
    server: { middlewareMode: true },
    appType: "custom",
  });
  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    if (req.originalUrl.startsWith("/api/")) return next();
    try {
      const url = req.originalUrl;
      const indexHtmlPath = path.join(frontendRoot, "index.html");
      let html = await fs.readFile(indexHtmlPath, "utf-8");
      html = await vite.transformIndexHtml(url, html);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (err) {
      vite.ssrFixStacktrace?.(err);
      next(err);
    }
  });
} else {
  const distDir = path.resolve(frontendRoot, "dist");
  app.use(express.static(distDir));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
}

/* ------------- Start Server ------------- */
app.listen(PORT, async () => {
  console.log(
    "[BACKEND] [ENV] summary:",
    JSON.stringify(
      {
        FRONTEND_URL: process.env.FRONTEND_URL || `http://localhost:${PORT}`,
        BACKEND_URL: process.env.BACKEND_URL || `http://localhost:${PORT}`,
        OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI,
        GUILD_ID: process.env.DISCORD_GUILD_ID || process.env.GUILD_ID,
        RAIDLEAD_ROLE_ID:
          process.env.RAIDLEAD_ROLE_ID ||
          process.env.DISCORD_ROLE_RAIDLEAD_ID ||
          process.env.DISCORD_ROLE_RAIDLEAD,
        BOT_TOKEN_SET: !!(process.env.DISCORD_TOKEN || process.env.BOT_TOKEN),
        MODE: isProd ? "production" : "development",
      },
      null,
      2
    )
  );
  console.log(`[BACKEND] Server listening on http://localhost:${PORT}`);

  try { await prisma.$queryRaw`SELECT 1;`; } catch {}

  try { await ensureBotReady(); } catch (e) {
    console.error("[BACKEND] Discord login failed:", e?.message || e);
  }
});
