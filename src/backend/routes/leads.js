// src/backend/routes/leads.js
import express from "express";

const ENV = process.env;

// Guild/Bot (Aliase)
const GUILD_ID  = ENV.DISCORD_GUILD_ID || ENV.GUILD_ID || "";
const BOT_TOKEN = ENV.DISCORD_TOKEN    || ENV.BOT_TOKEN || "";

// Rollen
const RAIDLEAD_ROLE_ID = ENV.RAIDLEAD_ROLE_ID || ENV.DISCORD_ROLE_RAIDLEAD_ID || ENV.DISCORD_ROLE_RAIDLEAD || "";
const ADMIN_ROLE_ID    = ENV.DISCORD_ROLE_ADMIN_ID || ENV.ADMIN_ROLE_ID || "";

const NODE_ENV = ENV.NODE_ENV || "development";
const IS_PROD  = NODE_ENV === "production";

const router = express.Router();

/* ---------- utils ---------- */
function ts() {
  const d = new Date();
  return d.toLocaleTimeString("de-DE", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}
function dbg(...args) {
  if (ENV.DEBUG_AUTH === "true" || !IS_PROD) {
    console.log("[LEADS-DBG " + ts() + "]", ...args);
  }
}
function avatarUrlFor(user) {
  if (user?.avatar) {
    const fmt = String(user.avatar).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${fmt}?size=128`;
  }
  const disc = Number(user?.discriminator || 0) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${disc}.png`;
}
function displayNameFor(member) {
  const u = member?.user || {};
  return member?.nick || u.global_name || u.username || u.id || "Unknown";
}
function hasRole(member, roleId) {
  const roles = Array.isArray(member?.roles) ? member.roles : [];
  return !!(roleId && roles.includes(roleId));
}
function isAdmin(member)     { return hasRole(member, ADMIN_ROLE_ID); }
function isRaidlead(member)  { return hasRole(member, RAIDLEAD_ROLE_ID); }

/* ---------- Owner-ID (Cache) ---------- */
let OWNER_ID = null;
async function fetchGuildOwnerIdViaBot() {
  if (!GUILD_ID || !BOT_TOKEN) return null;
  try {
    const r = await fetch(`https://discord.com/api/guilds/${GUILD_ID}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (!r.ok) {
      dbg("owner fetch failed:", r.status, await r.text().catch(()=> ""));
      return null;
    }
    const g = await r.json();
    OWNER_ID = g?.owner_id || null;
    return OWNER_ID;
  } catch (e) {
    dbg("owner fetch error:", String(e?.message || e));
    return null;
  }
}
function isOwner(member) {
  return !!(OWNER_ID && member?.user?.id && String(member.user.id) === String(OWNER_ID));
}

/* ---------- Discord REST: Members (paginiert) ---------- */
async function fetchGuildMembersAll() {
  if (!GUILD_ID || !BOT_TOKEN) {
    const miss = [!GUILD_ID ? "GUILD_ID/DISCORD_GUILD_ID" : null, !BOT_TOKEN ? "BOT_TOKEN/DISCORD_TOKEN" : null]
      .filter(Boolean).join(", ");
    throw new Error(`Missing env: ${miss}`);
  }

  const members = [];
  let after = "0";
  let page = 0;

  while (true) {
    const url = new URL(`https://discord.com/api/guilds/${GUILD_ID}/members`);
    url.searchParams.set("limit", "1000");
    if (after !== "0") url.searchParams.set("after", after);

    const res = await fetch(url, { headers: { Authorization: `Bot ${BOT_TOKEN}` } });

    if (res.status === 429) {
      const payload = await res.json().catch(() => ({}));
      const wait = Math.ceil((payload.retry_after || 1) * 1000);
      dbg("rate limited; sleeping", wait, "ms");
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (res.status === 403) {
      const txt = await res.text().catch(() => "");
      throw new Error(`403 forbidden – aktiviere im Dev-Portal "Server Members Intent". Payload: ${txt}`);
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`members_fetch_failed: ${res.status} ${txt}`);
    }

    const chunk = await res.json();
    if (!Array.isArray(chunk) || chunk.length === 0) break;

    members.push(...chunk);
    after = chunk[chunk.length - 1]?.user?.id || "0";
    page++;
    if (page > 25) break; // Safety
  }

  dbg(`fetched ${members.length} guild members (${page} page[s])`);
  return members;
}

/* ---------- Routes ---------- */
/**
 * Deine server.js mountet den Router unter "/api/leads".
 * Also hier auf "/" antworten.
 */
router.get("/", async (_req, res) => {
  try {
    // Owner laden/cachen
    if (!OWNER_ID) await fetchGuildOwnerIdViaBot();

    const all = await fetchGuildMembersAll();

    const leads = all
      .filter((m) => {
        if (!m?.user) return false;
        if (m.user.bot) return false; // Bots i. d. R. nicht anzeigen (kannst du bei Bedarf erlauben)
        // Owner ist automatisch "Admin" ⇒ qualifiziert
        if (isOwner(m)) return true;
        // Ansonsten Admin oder Raidlead
        return isAdmin(m) || isRaidlead(m);
      })
      .map((m) => ({
        id: m.user.id,
        displayName: displayNameFor(m),
        username: m.user.username,
        roles: Array.isArray(m.roles) ? m.roles : [],
        isOwner: isOwner(m),
        isAdmin: isOwner(m) || isAdmin(m), // Owner >= Admin
        isRaidlead: isOwner(m) || isAdmin(m) || isRaidlead(m), // Admin/Owner >= RL
        avatarUrl: avatarUrlFor(m.user),
      }))
      // Deduplizieren
      .reduce((acc, u) => {
        if (!acc.some((x) => x.id === u.id)) acc.push(u);
        return acc;
      }, [])
      // Sortierung: Owner > Admin > RL, danach alphabetisch
      .sort((a, b) => {
        const ra = a.isOwner ? 3 : a.isAdmin ? 2 : a.isRaidlead ? 1 : 0;
        const rb = b.isOwner ? 3 : b.isAdmin ? 2 : b.isRaidlead ? 1 : 0;
        if (ra !== rb) return rb - ra;
        return a.displayName.localeCompare(b.displayName, "de");
      });

    dbg(`leads -> ${leads.length} users (owner/admin first)`);
    res.json({ ok: true, leads });
  } catch (e) {
    dbg("error:", String(e?.message || e));
    res.status(500).json({ ok: false, error: "LEADS_FETCH_FAILED", message: e?.message || "Unknown error" });
  }
});

export default router;
