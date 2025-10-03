import { ChannelType, PermissionFlagsBits } from "discord.js";

const ENV = process.env;
const GUILD_ID = ENV.DISCORD_GUILD_ID || ENV.GUILD_ID || "";
const CATEGORY_ID = ENV.RAID_CATEGORY_ID || ENV.DISCORD_RAID_CATEGORY_ID || "";

/** Erstellt (oder findet) die Kategorie für Raids. */
export async function ensureRaidCategory(guild) {
  if (!CATEGORY_ID) return null;
  try {
    const cat = await guild.channels.fetch(CATEGORY_ID).catch(() => null);
    return cat || null;
  } catch { return null; }
}

/** Simplen, bereinigten Channel-Namen generieren */
function toChannelName(raid) {
  const base = `${raid.title} ${raid.difficulty}`.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return base.slice(0, 90);
}

/** Channel anlegen (oder vorhandenen zurückgeben, wenn id gesetzt) */
export async function createRaidChannel(client, raid) {
  const guild = await client.guilds.fetch(GUILD_ID);
  if (!guild) throw new Error("Guild not found");

  const name = toChannelName(raid);
  const parent = await ensureRaidCategory(guild);

  const ch = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parent?.id,
    permissionOverwrites: [
      // Default: sichtbar für alle (ggf. später feiner)
      { id: guild.roles.everyone, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    ],
  });

  return ch;
}
