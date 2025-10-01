import {
  ChannelType, PermissionFlagsBits,
} from 'discord.js';
import { ensureBotReady } from './index.js';

function slug(s, max = 100) {
  return String(s || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, max);
}
function dayAbbr(d) {
  return ['sun','mon','tue','wed','thu','fri','sat'][d.getDay()];
}
function diffSlug(x) {
  const s = String(x || '').toLowerCase();
  if (s.startsWith('myth')) return 'my';
  if (s.startsWith('hero')) return 'hc';
  if (s.startsWith('norm')) return 'nm';
  return slug(s);
}
function lootSlug(x) {
  return String(x || '').toLowerCase().replace(/\s+/g, '-');
}

export async function resolveLeadDisplaySlug(cli, guildId, userId) {
  const guild = await cli.guilds.fetch(guildId);
  try {
    const m = await guild.members.fetch(userId);
    if (m?.displayName) return slug(m.displayName);
  } catch {}
  try {
    const u = await cli.users.fetch(userId);
    if (u?.username) return slug(u.username);
  } catch {}
  return slug(String(userId));
}

export async function buildChannelName(raid, leadSlug) {
  const d = new Date(raid.date);
  const day = isNaN(d) ? 'day' : dayAbbr(d);
  const hh = String(isNaN(d) ? 0 : d.getHours()).padStart(2, '0');
  const mm = String(isNaN(d) ? 0 : d.getMinutes()).padStart(2, '0');
  const diff = diffSlug(raid.difficulty);
  const loot = lootSlug(raid.lootType);
  return `${day}-${hh}${mm}-${diff}-${loot}-${leadSlug}`.slice(0, 95);
}

async function ensurePermissions(guild) {
  const me = guild.members.me || await guild.members.fetch(guild.client.user.id);
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error('Bot-Rolle fehlt "Manage Channels".');
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

export async function getOrCreateRaidChannel(raid) {
  const cli = await ensureBotReady();
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new Error('DISCORD_GUILD_ID fehlt in .env');

  const guild = await cli.guilds.fetch(guildId);
  await ensurePermissions(guild);

  const leadSlug = await resolveLeadDisplaySlug(cli, guildId, raid.lead);
  const name = await buildChannelName(raid, leadSlug);
  const parent = await resolveParentCategory(guild);

  console.log(`🧱 create/check channel: ${name}`);

  await guild.channels.fetch();
  const existing = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name);
  if (existing) {
    console.log(`ℹ️ existiert bereits: #${existing.name} (${existing.id})`);
    return existing;
  }

  const created = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent,
    reason: `Raid: ${raid.title}`,
  });
  console.log(`✅ Channel erstellt: #${created.name} (${created.id})`);
  return created;
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
  return ch.id;
}

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

export async function deleteRaidChannel(raid) {
  if (raid.channelId) {
    const ok = await deleteChannelById(raid.channelId);
    if (ok) return true;
  }
  try {
    const cli = await ensureBotReady();
    const guildId = process.env.DISCORD_GUILD_ID;
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
  } catch (e) {
    console.warn('⚠️ deleteRaidChannel fallback error:', e?.message || e);
  }
  return false;
}
