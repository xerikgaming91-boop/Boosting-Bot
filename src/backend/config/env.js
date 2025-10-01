import { config as dotenv } from "dotenv";
import path from "path";

export function loadEnv() {
  // .env aus dem Projekt-Root laden (nur einmal)
  if (!process.env.__ENV_LOADED) {
    const rootDotenv = path.resolve(process.cwd(), ".env");
    dotenv({ path: rootDotenv });
    process.env.__ENV_LOADED = "1";
    console.log("[ENV] candidates:");
    console.log("  - " + rootDotenv);
    console.log("[ENV] loaded from:", rootDotenv);
  }

  const req = (name, hint = "") => {
    const v = process.env[name];
    if (!v) throw new Error(`[ENV] Missing required variable: ${name}${hint ? `\n${hint}` : ""}`);
    return v;
  };
  const opt = (name, d = "") => process.env[name] || d;

  // Wichtig: konsistente Namen
  // DISCORD_GUILD_ID -> in Code als GUILD_ID verwenden
  const FRONTEND_URL = opt("FRONTEND_URL", "http://localhost:5173");
  const BACKEND_URL = opt("BACKEND_URL", "http://localhost:4000");

  return {
    FRONTEND_URL,
    BACKEND_URL,
    OAUTH_REDIRECT_URI: opt("OAUTH_REDIRECT_URI", "http://localhost:4000/api/auth/callback"),

    DATABASE_URL: req("DATABASE_URL", 'Beispiel: DATABASE_URL="file:./dev.db"'),

    DISCORD_CLIENT_ID: req("DISCORD_CLIENT_ID"),
    DISCORD_CLIENT_SECRET: req("DISCORD_CLIENT_SECRET"),

    DISCORD_BOT_TOKEN: req("DISCORD_BOT_TOKEN", "Bot Token aus dem Dev Portal kopieren."),
    GUILD_ID: req("DISCORD_GUILD_ID", "Gilden-ID (Snowflake) aus Discord"),
    RAIDLEAD_ROLE_ID: req("RAIDLEAD_ROLE_ID", "Rollen-ID der Raidleads"),
    RAID_CATEGORY_ID: opt("DISCORD_RAID_CATEGORY_ID", ""),

    JWT_SECRET: req("JWT_SECRET"),
    JWT_COOKIE_NAME: opt("JWT_COOKIE_NAME", "auth")
  };
}

export default { loadEnv };
