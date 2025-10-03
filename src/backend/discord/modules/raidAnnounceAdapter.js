// src/backend/discord/modules/raidAnnounceAdapter.js
import { ensureBotReady } from "../bot.js";
import { prisma } from "../../prismaClient.js";
import { buildRaidMessage } from "./raidEmbed.js";
import { getSignupComponents } from "./raidSignup.js";

const ENV = process.env;
const GUILD_ID = ENV.DISCORD_GUILD_ID || ENV.GUILD_ID || "";
const RAID_CATEGORY_ID =
  ENV.DISCORD_RAID_CATEGORY_ID || ENV.RAID_CATEGORY_ID || "";

// kleines Timestamp-Logging
const ts = () => {
  const d = new Date();
  return (
    d.toLocaleTimeString("de-DE", { hour12: false }) +
    "." +
    String(d.getMilliseconds()).padStart(3, "0")
  );
};
const dbg = (...a) => console.log("[ANNOUNCE-DBG " + ts() + "]", ...a);
const perr = (...a) => console.log("[ANNOUNCE-ERR " + ts() + "]", ...a);

/** Hilfsfunktion: Raid inkl. Signups aus DB holen */
async function loadRaidFull(raidId) {
  const id = Number(raidId);
  if (!Number.isFinite(id)) throw new Error("invalid_raid_id");
  const raid = await prisma.raid.findUnique({
    where: { id },
    include: {
      signups: {
        include: {
          char: true,
          user: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!raid) throw new Error("raid_not_found");
  return raid;
}

/** Kanal-Namensschema: "di-1430-mythic-vip-####" o.ä. */
function makeChannelName(raid) {
  try {
    const dt = new Date(raid.date);
    const wd = dt
      .toLocaleDateString("de-DE", { weekday: "short" })
      .replace(".", "")
      .toLowerCase(); // mo, di, mi...
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    const diff = String(raid.difficulty || "").toLowerCase(); // heroic/mythic/...
    const loot = String(raid.lootType || "").toLowerCase(); // vip/community/...
    return `${wd}-${hh}${mm}-${diff}-${loot}-${raid.id}`;
  } catch {
    return `raid-${raid.id}`;
  }
}

/** Neuen Kanal + Embed-Message anlegen, IDs in DB speichern */
async function postInitialMessage(client, raid) {
  if (!GUILD_ID) throw new Error("missing_guild_id");

  const guild = await client.guilds.fetch(GUILD_ID);

  // Kanal erzeugen (falls noch nicht vorhanden)
  let channel = null;
  if (raid.channelId) {
    try {
      channel = await guild.channels.fetch(raid.channelId);
    } catch {
      channel = null;
    }
  }
  if (!channel) {
    channel = await guild.channels.create({
      name: makeChannelName(raid),
      parent: RAID_CATEGORY_ID || null,
      type: 0, // GuildText
      reason: `Raid #${raid.id}`,
    });
  }

  // Embeds + Buttons
  const embeds = buildRaidMessage(raid);
  const components = getSignupComponents(raid.id);

  const msg = await channel.send({ embeds, components });

  // IDs in DB ablegen
  await prisma.raid.update({
    where: { id: raid.id },
    data: {
      channelId: channel.id,
      messageId: msg.id,
    },
  });

  return { channelId: channel.id, messageId: msg.id };
}

/** Öffentliche API: neuen Raid announcen (wird von /raids create genutzt) */
export async function announceRaid(input) {
  // input kann raidId (number) ODER ein frisch erstelltes Raid-Objekt sein
  const raidId =
    typeof input === "number"
      ? input
      : input?.raidId ?? input?.id ?? undefined;

  dbg("announceRaid() in", { raidId, optsIn: input });

  const client = await ensureBotReady();

  // Raid laden (immer fresh aus DB, damit wir Referenzen sauber haben)
  const raid = await loadRaidFull(raidId);

  // Falls es schon eine gespeicherte Nachricht gibt, einfach updaten
  if (raid.channelId && raid.messageId) {
    await refreshRaidMessage(raid.id);
    return { ok: true, updated: true, raidId: raid.id };
  }

  // Sonst initial posten
  await postInitialMessage(client, raid);
  return { ok: true, created: true, raidId: raid.id };
}

/** Öffentliche API: bestehendes Embed + Buttons aktualisieren */
export async function refreshRaidMessage(raidId) {
  const client = await ensureBotReady();
  const raid = await loadRaidFull(raidId);

  // wenn es noch keinen Post gab: initial posten
  if (!raid.channelId || !raid.messageId) {
    dbg("refreshRaidMessage: no message yet -> post initial");
    await postInitialMessage(client, raid);
    return true;
  }

  // Nachricht editieren
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(raid.channelId);
    const message = await channel.messages.fetch(raid.messageId);

    const embeds = buildRaidMessage(raid);
    const components = getSignupComponents(raid.id);

    await message.edit({ embeds, components });
    dbg("refreshRaidMessage: edited", { raidId: raid.id });
    return true;
  } catch (e) {
    perr("refreshRaidMessage: edit failed -> try re-post", e?.message || e);
    // Fallback: neu posten und DB updaten
    const posted = await postInitialMessage(client, raid);
    dbg("refreshRaidMessage: reposted", posted);
    return true;
  }
}
