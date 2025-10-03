// src/backend/discord/modules/raidChannel.js
import { ensureBotReady } from "../bot.js";
import { formatRaidChannelName as fmtName } from "./nameFormat.js";

const ENV = process.env;
const GUILD_ID = ENV.DISCORD_GUILD_ID || ENV.GUILD_ID || "";
const RAID_CATEGORY_ID =
  ENV.DISCORD_RAID_CATEGORY_ID || ENV.RAID_CATEGORY_ID || "";

/**
 * Baut den Channel-Namen nach Vorgabe:
 *   sat-2315-hc-vip-syntax
 *  (tag-uhrzeit-schwierigkeit-loottype-raidleadername)
 *
 * Erwartet ein Raid-Objekt mit mindestens:
 *  - date (ISO oder YYYY-MM-DD), optional time "HH:mm"
 *  - difficulty ("Normal" | "Heroic" | "Mythic" | …)
 *  - lootType ("VIP" | "Saved" | "Unsaved" | …)
 *  - leadName oder lead (Anzeigename)
 */
export function formatRaidChannelName(raid) {
  return fmtName(raid || {});
}

/**
 * Erstellt einen Text-Channel in der Raid-Kategorie.
 * nameOrRaid kann ein fertiger Name (string) oder ein Raid-Objekt sein.
 * Gibt den erstellten Channel zurück.
 */
export async function createRaidChannel(nameOrRaid) {
  const client = await ensureBotReady();
  if (!GUILD_ID) throw new Error("missing_guild_id");

  const guild = await client.guilds.fetch(GUILD_ID);

  // Namen bestimmen
  const channelName =
    typeof nameOrRaid === "string" && nameOrRaid.trim()
      ? nameOrRaid.trim()
      : formatRaidChannelName(nameOrRaid || {});

  // prüfen, ob bereits vorhanden
  const all = await guild.channels.fetch();
  const existing = all.find(
    (c) => c?.type === 0 /* GuildText */ && c.name === channelName
  );
  if (existing) return existing;

  // neu anlegen
  const channel = await guild.channels.create({
    name: channelName,
    parent: RAID_CATEGORY_ID || null,
    type: 0, // GuildText
    reason:
      (typeof nameOrRaid === "object" && nameOrRaid?.id
        ? `Raid #${nameOrRaid.id}`
        : "Raid channel"),
  });

  return channel;
}

/**
 * Bequemer Wrapper: nimmt entweder einen vorgegebenen channelName
 * oder baut ihn aus raid. Liefert immer { channelId, channelName, channel }.
 */
export async function createOrGetRaidChannel({ raid, channelName } = {}) {
  const client = await ensureBotReady();
  if (!GUILD_ID) throw new Error("missing_guild_id");

  const guild = await client.guilds.fetch(GUILD_ID);

  const finalName =
    (typeof channelName === "string" && channelName.trim()) ||
    formatRaidChannelName(raid || {});

  // wiederverwenden, falls vorhanden
  const all = await guild.channels.fetch();
  let channel = all.find(
    (c) => c?.type === 0 /* GuildText */ && c.name === finalName
  );

  if (!channel) {
    channel = await guild.channels.create({
      name: finalName,
      parent: RAID_CATEGORY_ID || null,
      type: 0, // GuildText
      reason: raid?.title ? `Raid: ${raid.title}` : "Raid channel",
    });
  }

  return { channelId: channel?.id || null, channelName: finalName, channel };
}

/**
 * Optional: Channel zu einem Raid auf das gewünschte Schema umbenennen.
 * Praktisch, wenn sich z.B. Zeit, Diff, Loot oder Lead ändert.
 */
export async function renameRaidChannel(channelId, raid) {
  const client = await ensureBotReady();
  if (!GUILD_ID) throw new Error("missing_guild_id");
  if (!channelId) throw new Error("missing_channel_id");

  const guild = await client.guilds.fetch(GUILD_ID);
  const channel = await guild.channels.fetch(String(channelId));
  if (!channel) throw new Error("channel_not_found");

  const newName = formatRaidChannelName(raid || {});
  if (channel.name !== newName) {
    await channel.setName(newName, `Rename to raid scheme for #${raid?.id ?? "?"}`);
  }
  return { channelId: channel.id, channelName: newName };
}

export default {
  formatRaidChannelName,
  createRaidChannel,
  createOrGetRaidChannel,
  renameRaidChannel,
};
