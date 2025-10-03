// src/backend/discord/modules/raidAnnounceAdapter.js
import { ensureBotReady } from "../bot.js";
import { prisma } from "../../prismaClient.js";
import * as NameFmt from "./nameFormat.js";
import * as RaidEmbed from "./raidEmbed.js";
import { getSignupComponents } from "./raidSignup.js";
import { ChannelType } from "discord.js";

const ENV = process.env;
const GUILD_ID = ENV.DISCORD_GUILD_ID || ENV.GUILD_ID || "";
const RAID_CATEGORY_ID = ENV.DISCORD_RAID_CATEGORY_ID || ENV.RAID_CATEGORY_ID || "";

const IS_DEV = (ENV.MODE || ENV.NODE_ENV) !== "production";
const ts = () => {
  const d = new Date();
  return d.toLocaleTimeString("de-DE", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
};
const dbg  = (...a) => { if (IS_DEV) console.log("[RAID-ADAPTER " + ts() + "]", ...a); };
const perr = (...a) => console.warn("[RAID-ADAPTER " + ts() + " ERR]", ...a);

/* ===== Helpers ===== */
const looksLikeId = (s) => typeof s === "string" && /^[0-9]{16,20}$/.test(s);

async function fetchRaidFull(id) {
  if (!Number.isFinite(Number(id))) return null;
  try {
    const raid = await prisma.raid.findUnique({
      where: { id: Number(id) },
      include: {
        signups: {
          include: {
            user: true,
            char: true,
          },
          orderBy: [{ createdAt: "asc" }],
        },
      },
    });
    return raid || null;
  } catch (e) {
    perr("fetchRaidFull failed:", e?.message || e);
    return null;
  }
}

/* ===== Channelname-Format ===== */
function fallbackFormatChannelName(raid) {
  const two = (n) => String(n).padStart(2, "0");
  const slug = (s) =>
    String(s || "")
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ")
      .trim().replace(/\s+/g, "-");

  const dt = raid?.date ? new Date(raid.date) : new Date();
  const dows = ["sun","mon","tue","wed","thu","fri","sat"];
  const dow = dows[dt.getDay()];
  const hhmm = raid?.time && /^\d{2}:\d{2}$/.test(raid.time)
    ? raid.time.replace(":", "")
    : two(dt.getHours()) + two(dt.getMinutes());

  const diffMap = { normal: "nm", heroic: "hc", mythic: "my" };
  const diffRaw = String(raid?.difficulty || "").toLowerCase();
  const diff = diffMap[diffRaw] || slug(diffRaw);

  const loot = slug(raid?.lootType || raid?.loot || "");
  const lead = slug(raid?.leadName || raid?.lead || raid?.leadDisplay || raid?.leadUser || "") || "tbd";

  return `${dow}-${hhmm}-${diff}-${loot}-${lead}`;
}

function formatChannelName(raid) {
  if (typeof NameFmt.formatRaidChannelName === "function") {
    return NameFmt.formatRaidChannelName(raid);
  }
  return fallbackFormatChannelName(raid);
}

/* Lead-Anzeigename sicherstellen (für Kanalnamen) */
async function resolveLeadDisplay(raid) {
  if (raid?.leadName && String(raid.leadName).trim()) return String(raid.leadName).trim();
  if (raid?.lead && !looksLikeId(raid.lead) && String(raid.lead).trim()) return String(raid.lead).trim();

  const tryId =
    (raid?.leadId && looksLikeId(String(raid.leadId)) && String(raid.leadId)) ||
    (raid?.lead && looksLikeId(String(raid.lead)) && String(raid.lead)) ||
    null;

  if (tryId) {
    try {
      const u = await prisma.user.findUnique({
        where: { discordId: String(tryId) },
        select: { displayName: true, username: true },
      });
      if (u && (u.displayName || u.username)) return u.displayName || u.username;
    } catch {}
  }

  if (tryId && GUILD_ID) {
    try {
      const client = await ensureBotReady();
      const m = await client.guilds.fetch(GUILD_ID).then(g => g.members.fetch(String(tryId)));
      const disp = m?.nickname || m?.user?.globalName || m?.user?.username;
      if (disp) return disp;
    } catch {}
  }
  return undefined;
}

/* ===== Channel holen/erstellen (nur in announce) ===== */
async function getOrCreateChannel(guild, channelName, reason) {
  const all = await guild.channels.fetch();

  let channel = all.find((c) => c?.type === ChannelType.GuildText && c.name === channelName);
  if (channel) return channel;

  let parent = null;
  if (RAID_CATEGORY_ID) {
    try {
      const cat = await guild.channels.fetch(RAID_CATEGORY_ID);
      if (cat?.type === ChannelType.GuildCategory) parent = cat;
    } catch {}
  } else {
    const found = all.find((c) => c?.type === ChannelType.GuildCategory && /raid/i.test(c.name || ""));
    if (found) parent = found;
  }

  channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: parent ?? undefined,
    reason: reason || "Raid channel",
  });
  return channel;
}

/* ===== Embeds/Components ===== */
function buildEmbeds(raid) {
  if (typeof RaidEmbed.buildRaidMessage === "function") return RaidEmbed.buildRaidMessage(raid);
  if (typeof RaidEmbed.buildRaidEmbeds === "function") return RaidEmbed.buildRaidEmbeds(raid);
  return [];
}
function basicTextForRaid(raid = {}) {
  const title = raid?.title ? `**${raid.title}**` : "Neuer Raid";
  const when = raid?.date ? new Date(raid.date) : null;
  const whenStr = when && !isNaN(when) ? when.toLocaleString() : (raid?.time ? `um ${raid.time}` : "Zeit folgt");
  const diff = raid?.difficulty || "-";
  const loot = raid?.lootType || raid?.loot || "-";
  const lead = raid?.leadName || raid?.lead || "-";
  return [title, `**Lead:** ${lead}`, `**Datum:** ${whenStr}`, `**Diff:** ${diff}`, `**Loot:** ${loot}`].join("\n");
}

/* ===== Erstpost ===== */
async function postInitialMessage(client, raid) {
  const ensuredLead = await resolveLeadDisplay(raid);
  const raidForName = ensuredLead ? { ...raid, leadName: ensuredLead } : raid;

  const guild = await client.guilds.fetch(GUILD_ID);
  const channelName = formatChannelName(raidForName);
  const channel = await getOrCreateChannel(guild, channelName, raid?.title ? `Raid: ${raid.title}` : "Raid channel");

  const embeds = buildEmbeds(raid);
  const components = getSignupComponents(raid.id);

  let msg;
  try {
    if (embeds && embeds.length) {
      msg = await channel.send({ embeds, components });
    } else {
      msg = await channel.send({ content: basicTextForRaid(raid), components });
    }
  } catch (e) {
    perr("postInitialMessage: send failed", e?.message || e);
  }

  return {
    channelId: channel?.id || null,
    messageId: msg?.id || null,
    channelName,
  };
}

/* ===== Public API ===== */

/** Erstellt/holt Channel + postet Start-Embed und speichert IDs in der DB. */
export async function announceRaid(raid) {
  try {
    const client = await ensureBotReady();
    const posted = await postInitialMessage(client, raid);

    if ((posted.channelId || posted.messageId) && raid?.id != null) {
      try {
        await prisma.raid.update({
          where: { id: raid.id },
          data: { channelId: posted.channelId, messageId: posted.messageId },
        });
      } catch {}
    }

    dbg("announceRaid: done", posted);
    return posted;
  } catch (e) {
    perr("announceRaid failed", e?.message || e);
    return { channelId: null, messageId: null, channelName: null };
  }
}

/**
 * Aktualisiert die bestehende Embed-Nachricht eines Raids.
 * Akzeptiert:
 *  - ein komplettes Raid-Objekt ODER
 *  - nur die Raid-ID (number/string)
 *
 * WICHTIG: KEIN Neuanlegen von Channel/Message. Keine Reposts.
 */
export async function refreshRaidMessage(raidOrId) {
  try {
    let r = null;

    if (typeof raidOrId === "number" || typeof raidOrId === "string") {
      r = await fetchRaidFull(raidOrId);
    } else if (raidOrId && typeof raidOrId === "object") {
      r = { ...raidOrId };
      // falls keine Details: aus DB nachladen
      if (r?.id != null && (!r.signups || !Array.isArray(r.signups))) {
        const db = await fetchRaidFull(r.id);
        if (db) r = { ...db, ...r };
      }
    }

    if (!r || r.id == null) {
      dbg("refreshRaidMessage: no raid id → skip", { raidId: r?.id });
      return false;
    }

    // wenn IDs fehlen, aus DB nehmen
    if (!r.channelId || !r.messageId) {
      const db = await fetchRaidFull(r.id);
      if (db) r = { ...db, ...r };
    }

    if (!r.channelId || !r.messageId) {
      dbg("refreshRaidMessage: missing target IDs → skip (no create)", { raidId: r.id, channelId: r.channelId, messageId: r.messageId });
      return false;
    }

    const client = await ensureBotReady();
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(String(r.channelId)).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      dbg("refreshRaidMessage: channel not found/type mismatch → skip (no create)", { raidId: r.id, channelId: r.channelId });
      return false;
    }

    const msg = await channel.messages.fetch(String(r.messageId)).catch(() => null);
    if (!msg) {
      dbg("refreshRaidMessage: message not found → skip (no create)", { raidId: r.id, messageId: r.messageId });
      return false;
    }

    const embeds = buildEmbeds(r);
    const components = getSignupComponents(r.id);

    if (embeds && embeds.length) {
      await msg.edit({ embeds, components });
    } else {
      await msg.edit({ content: basicTextForRaid(r), components });
    }

    dbg("refreshRaidMessage: edited", { raidId: r.id });
    return true;
  } catch (e) {
    perr("refreshRaidMessage failed → NO-OP", e?.message || e);
    return false;
  }
}

export default { announceRaid, refreshRaidMessage };
