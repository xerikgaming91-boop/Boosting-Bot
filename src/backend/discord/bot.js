// ESM
import 'dotenv/config';
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
} from 'discord.js';

/* ──────────────────────────────
   Client & Login
   ────────────────────────────── */
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // nötig für member.displayName (Nickname)
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.GuildMember, Partials.Channel, Partials.User, Partials.Message],
});

client.on('ready', () => {
  console.log(`✅ Discord ready: ${client.user?.tag} (${client.user?.id})`);
});
client.on('error', (e) => console.error('❌ [discord] error:', e?.message || e));
client.on('warn',  (m) => console.warn('⚠️ [discord] warn:', m));

let loginPromise = null;
export async function ensureBotReady() {
  if (client.readyAt) return client;
  if (!loginPromise) {
    const token = process.env.DISCORD_TOKEN;
    if (!token) throw new Error('❌ DISCORD_TOKEN fehlt in .env');
    console.log('🤖 Discord-Bot: login()…');
    loginPromise = client.login(token);
  }
  await loginPromise;
  return client;
}

/* ──────────────────────────────
   Hilfsfunktionen
   ────────────────────────────── */
function slugifyForChannel(name, max = 100) {
  if (!name) return 'unknown';
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
}

export async function resolveLeadDisplaySlug(cli, guildId, userId) {
  const guild = await cli.guilds.fetch(guildId);
  try {
    const m = await guild.members.fetch(userId);
    if (m?.displayName) return slugifyForChannel(m.displayName);
  } catch (_) { /* Member evtl. nicht auf dem Server */ }
  try {
    const u = await cli.users.fetch(userId);
    if (u?.username) return slugifyForChannel(u.username);
  } catch (_) {}
  return slugifyForChannel(String(userId));
}

function dayAbbr(d) {
  return ['sun','mon','tue','wed','thu','fri','sat'][d.getDay()];
}
function difficultySlug(diff) {
  const s = String(diff || '').toLowerCase();
  if (s.startsWith('myth')) return 'my';
  if (s.startsWith('hero')) return 'hc';
  if (s.startsWith('norm')) return 'nm';
  return slugifyForChannel(s);
}
function lootSlug(loot) {
  return String(loot || '').toLowerCase().replace(/\s+/g, '-');
}

export async function buildChannelName(raid, leadSlug) {
  const d = new Date(raid.date);
  const day = isNaN(d) ? 'day' : dayAbbr(d);
  const hh = String(isNaN(d) ? 0 : d.getHours()).padStart(2, '0');
  const mm = String(isNaN(d) ? 0 : d.getMinutes()).padStart(2, '0');
  const time = `${hh}${mm}`;
  const diff = difficultySlug(raid.difficulty);
  const loot = lootSlug(raid.lootType);
  // Beispiel: wed-2000-hc-vip-rikuger
  return `${day}-${time}-${diff}-${loot}-${leadSlug}`.slice(0, 95);
}

async function ensurePermissions(guild) {
  const me = guild.members.me || await guild.members.fetch(guild.client.user.id);
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error('❌ Bot-Rolle fehlt "Manage Channels" auf dem Server.');
  }
}

async function resolveParentCategory(guild) {
  const parentId = process.env.DISCORD_RAID_CATEGORY_ID;
  if (!parentId) return undefined;
  try {
    const ch = await guild.channels.fetch(parentId);
    if (!ch || ch.type !== ChannelType.GuildCategory) {
      console.warn('⚠️ DISCORD_RAID_CATEGORY_ID ist keine Kategorie – parent ignoriert.');
      return undefined;
    }
    return ch.id;
  } catch {
    console.warn('⚠️ DISCORD_RAID_CATEGORY_ID nicht gefunden – parent ignoriert.');
    return undefined;
  }
}

/* ──────────────────────────────
   Channel erstellen / löschen / announcen
   ────────────────────────────── */
export async function getOrCreateRaidChannel(raid) {
  const cli = await ensureBotReady();
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new Error('❌ DISCORD_GUILD_ID fehlt in .env');

  const guild = await cli.guilds.fetch(guildId);
  await ensurePermissions(guild);

  const leadSlug = await resolveLeadDisplaySlug(cli, guildId, raid.lead);
  const name = await buildChannelName(raid, leadSlug);
  const parent = await resolveParentCategory(guild);

  console.log(`🧱 create/check channel: ${name}`);

  await guild.channels.fetch(); // Cache
  const existing = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name);
  if (existing) {
    console.log(`ℹ️ existiert bereits: #${existing.name} (${existing.id})`);
    return existing;
  }

  try {
    const created = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent,
      reason: `Raid: ${raid.title}`,
    });
    console.log(`✅ Channel erstellt: #${created.name} (${created.id})`);
    return created;
  } catch (err) {
    console.error('❌ Channel-Erstellung fehlgeschlagen:', err?.message || err);
    throw err;
  }
}

export async function postRaidAnnouncement(raid) {
  const ch = await getOrCreateRaidChannel(raid);
  const when = new Date(raid.date);
  const dt = isNaN(when) ? '-' : when.toLocaleString();

  const content =
    `**${raid.title}**\n` +
    `• Difficulty: ${raid.difficulty}${raid.difficulty === 'Mythic' && raid.bosses ? ` (${raid.bosses}/8)` : ''}\n` +
    `• Loot: ${raid.lootType}\n` +
    `• Datum: ${dt}\n` +
    (raid.lead ? `• Lead: <@${raid.lead}>` : '');

  await ch.send({ content });
  return ch.id; // wichtig für DB: speichern!
}

/** Löscht Channel direkt via ID */
export async function deleteChannelById(channelId) {
  const cli = await ensureBotReady();
  if (!channelId) return false;
  try {
    const ch = await cli.channels.fetch(channelId);
    if (!ch) return false;
    await ch.delete('Raid gelöscht');
    console.log(`🗑️ Channel gelöscht: ${channelId}`);
    return true;
  } catch (e) {
    console.warn('⚠️ Channel-Löschung per ID fehlgeschlagen:', e?.message || e);
    return false;
  }
}

/** Versucht den Channel eines Raids zu löschen (per ID, sonst Name-Fallback) */
export async function deleteRaidChannel(raid) {
  // 1) ID bevorzugt
  if (raid.channelId) {
    const ok = await deleteChannelById(raid.channelId);
    if (ok) return true;
  }

  // 2) Fallback: per Name versuchen (kann scheitern, wenn Displayname sich geändert hat)
  const cli = await ensureBotReady();
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return false;

  try {
    const guild = await cli.guilds.fetch(guildId);
    await guild.channels.fetch();

    const leadSlug = await resolveLeadDisplaySlug(cli, guildId, raid.lead);
    const name = await buildChannelName(raid, leadSlug);

    const match = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name);
    if (match) {
      await match.delete('Raid gelöscht (Fallback)');
      console.log(`🗑️ Channel gelöscht (fallback name): #${match.name} (${match.id})`);
      return true;
    }
    console.warn('⚠️ Kein passender Channel zum Löschen gefunden (fallback).');
    return false;
  } catch (e) {
    console.warn('⚠️ deleteRaidChannel fallback error:', e?.message || e);
    return false;
  }
}

/* ──────────────────────────────
   Status-Helper (für /api/discord/status)
   ────────────────────────────── */
export function discordStatus() {
  return {
    ready: !!client.readyAt,
    user: client.user ? { id: client.user.id, tag: client.user.tag } : null,
    guilds: [...client.guilds.cache.keys()],
    guildIdExpected: process.env.DISCORD_GUILD_ID || null,
    categoryId: process.env.DISCORD_RAID_CATEGORY_ID || null,
  };
}
