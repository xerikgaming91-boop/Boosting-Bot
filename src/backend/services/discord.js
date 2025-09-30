// src/backend/services/discord.js
import { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } from 'discord.js';
import { env } from '../config/env.js';

// Support sowohl DISCORD_* als auch kurze Aliase:
const BOT_TOKEN = env.DISCORD_BOT_TOKEN || env.BOT_TOKEN;
const GUILD_ID = env.DISCORD_GUILD_ID || env.GUILD_ID;
const RAIDLEAD_ROLE_ID = env.RAIDLEAD_ROLE_ID || env.RAIDLEAD_ROLE;
const RAID_CATEGORY_ID = env.DISCORD_RAID_CATEGORY_ID || env.RAID_CATEGORY_ID;

let clientPromise = null;
let cachedGuildId = null;
let cachedMembersAt = 0;

// ---------- Client / Guild ----------

async function getClient() {
  if (clientPromise) return clientPromise;

  if (!BOT_TOKEN) {
    throw new Error('[Discord] DISCORD_BOT_TOKEN fehlt (ENV).');
  }
  if (!GUILD_ID) {
    throw new Error('[Discord] GUILD_ID fehlt (ENV).');
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ],
  });

  clientPromise = new Promise((resolve, reject) => {
    client.once('ready', () => {
      console.log(`[Discord] Client ready als ${client.user?.tag}`);
      resolve(client);
    });
    client.login(BOT_TOKEN).catch(reject);
  });

  return clientPromise;
}

async function getGuild() {
  const c = await getClient();
  cachedGuildId = GUILD_ID;
  const guild = await c.guilds.fetch(cachedGuildId);
  return guild;
}

// ---------- Member Cache ----------

async function fetchMembers(guild) {
  const now = Date.now();
  // 60s Cache-Fenster
  if (now - cachedMembersAt < 60_000 && guild.members?.cache?.size > 0) {
    return guild.members.cache;
  }
  const col = await guild.members.fetch();
  cachedMembersAt = now;
  return col;
}

// ---------- Helpers ----------

function hasRaidleadRole(member) {
  const wantedRoleId = (RAIDLEAD_ROLE_ID || '').trim();
  const wantedName = 'raidlead';

  if (wantedRoleId) {
    return member.roles.cache.has(wantedRoleId);
  }
  // Fallback per Name
  return member.roles.cache.some((r) => (r?.name || '').toLowerCase() === wantedName);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function weekdayAbbr(date) {
  // Drei-Buchstaben-Englisch (Mon/Tue/Wed/...)
  const abbr = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return abbr[date.getDay()];
}

function diffSlug(difficulty) {
  const d = (difficulty || '').toLowerCase();
  // Erwartet: "nhc", "hc", "m"
  if (d === 'normal') return 'nhc';
  if (d === 'heroic') return 'hc';
  if (d === 'mythic') return 'm';
  return d || 'nhc';
}

function lootSlug(lootType) {
  const l = (lootType || '').toLowerCase();
  // erwartet: saved/unsaved/vip
  if (l === 'saved') return 'saved';
  if (l === 'unsaved') return 'unsaved';
  if (l === 'vip') return 'vip';
  return 'vip';
}

function slugifyName(name) {
  return (name || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')        // spaces -> hyphen
    .replace(/[^a-z0-9\-]/g, '') // nur a-z0-9-
    .replace(/\-+/g, '-')        // mehrfaches - zu einem
    .slice(0, 30) || 'lead';
}

// ---------- Public: Leads ----------

export async function listRaidleads() {
  const guild = await getGuild();
  const members = await fetchMembers(guild);

  const leads = [];
  members.forEach((m) => {
    if (m.user?.bot) return;
    if (hasRaidleadRole(m)) {
      leads.push({
        id: m.user.id,
        username: m.user.username,
        displayName: m.displayName || m.user.username,
        avatar: m.user.avatar || null,
      });
    }
  });

  leads.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return leads;
}

export async function getDiscordStatus() {
  try {
    const c = await getClient();
    const ready = !!c.user;
    const size = c.guilds?.cache?.get(GUILD_ID)?.members?.cache?.size || 0;
    return { ready, guildId: GUILD_ID, cachedMembers: size };
  } catch (e) {
    return { ready: false, guildId: null, cachedMembers: 0, error: String(e?.message || e) };
  }
}

// ---------- Public: Channel anlegen ----------

/**
 * Erstellt einen Textkanal für einen Raid unter der (optionalen) Kategorie RAID_CATEGORY_ID.
 * Namensformat: Wed-1800-nhc-vip-syntax
 * @param {Object} opts
 * @param {Date|number|string} opts.date       - Datum/Uhrzeit (JS Date oder parsebar)
 * @param {string} opts.difficulty             - "Normal" | "Heroic" | "Mythic"
 * @param {string} opts.lootType               - "Saved" | "Unsaved" | "VIP"
 * @param {string} [opts.leadUserId]           - Discord User ID des Leads (optional für Permissions)
 * @param {string} [opts.leadDisplayName]      - Anzeigename zur Verwendung im Slug
 * @returns {Promise<{id:string, name:string}>}
 */
export async function createRaidTextChannel(opts) {
  const guild = await getGuild();

  const dateObj = opts?.date instanceof Date ? opts.date : new Date(opts?.date);
  const day = weekdayAbbr(dateObj);
  const hh = pad2(dateObj.getHours());
  const mm = pad2(dateObj.getMinutes());

  const diff = diffSlug(opts?.difficulty);
  const loot = lootSlug(opts?.lootType);
  const leadSlug = slugifyName(opts?.leadDisplayName);

  const name = `${day}-${hh}${mm}-${diff}-${loot}-${leadSlug}`;

  const chanOpts = {
    name,
    type: ChannelType.GuildText,
    reason: `Raid Channel für ${name}`,
  };

  if (RAID_CATEGORY_ID) {
    chanOpts.parent = RAID_CATEGORY_ID;
  }

  // Versuche Permission Overwrites für Lead (falls angegeben)
  if (opts?.leadUserId) {
    chanOpts.permissionOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.SendMessages],
      },
      {
        id: opts.leadUserId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
    ];
  }

  const channel = await guild.channels.create(chanOpts);
  return { id: channel.id, name: channel.name };
}
