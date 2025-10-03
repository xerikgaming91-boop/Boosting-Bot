import { prisma } from "../../prismaClient.js";
import { buildRaidMessage } from "./raidEmbed.js";
import { getSignupComponents } from "./raidSignup.js";
import { createRaidChannel } from "./raidChannel.js";
import { ensureBotReady } from "../bot.js";

const ENV = process.env;

function groupSignups(rows = []) {
  const pick = (f) => rows.filter(f).map(x =>
    x.char?.name
      ? `${x.char.name}${x.char.realm ? ` (${x.char.realm})` : ""}${x.saved ? " ✅" : ""}`
      : (x.displayName || "—")
  );

  const isType = (t) => (x) => String(x.type).toUpperCase() === t;
  const isRoster = (x) => String(x.status || "").toUpperCase() === "PICKED";

  return {
    roster: {
      tanks: pick((x) => isRoster(x) && isType("TANK")(x)),
      heals: pick((x) => isRoster(x) && isType("HEAL")(x)),
      dps:   pick((x) => isRoster(x) && isType("DPS")(x)),
      loot:  pick((x) => isRoster(x) && isType("LOOTBUDDY")(x)),
    },
    signups: {
      tanks: pick((x) => !isRoster(x) && isType("TANK")(x)),
      heals: pick((x) => !isRoster(x) && isType("HEAL")(x)),
      dps:   pick((x) => !isRoster(x) && isType("DPS")(x)),
      loot:  pick((x) => !isRoster(x) && isType("LOOTBUDDY")(x)),
    },
  };
}

/** Lädt Raid + Signups aus der DB. */
async function fetchRaidFull(raidId) {
  const raid = await prisma.raid.findUnique({ where: { id: Number(raidId) } });
  if (!raid) throw new Error("raid_not_found");

  // leadName: aus User oder als Fallback die gespeicherte ID
  let leadName = null;
  try {
    const user = await prisma.user.findUnique({
      where: { discordId: String(raid.lead || "") },
      select: { displayName: true, username: true },
    });
    leadName = user?.displayName || user?.username || null;
  } catch {}
  const raidShape = { ...raid, leadName: leadName || raid.lead || null };

  const signups = await prisma.signup.findMany({
    where: { raidId: Number(raidId) },
    include: { char: true, user: true, raid: true },
    orderBy: { createdAt: "asc" },
  });

  return { raid: raidShape, signups, groups: groupSignups(signups) };
}

/** Erst-Announcement: Channel erstellen (falls nötig) + Nachricht posten. */
export async function announceRaid({ raidId }) {
  if (!raidId) throw new Error("announceRaid: raidId missing");
  const client = await ensureBotReady();

  const { raid, groups } = await fetchRaidFull(raidId);

  let channelId = raid.channelId;
  let messageId = raid.messageId;

  if (!channelId) {
    const ch = await createRaidChannel(client, raid);
    channelId = ch.id;
    await prisma.raid.update({ where: { id: raid.id }, data: { channelId } });
  }

  const ch = await client.channels.fetch(channelId);
  const payload = buildRaidMessage(raid, groups);
  const components = getSignupComponents(raid.id);

  let msg;
  if (messageId) {
    msg = await ch.messages.fetch(messageId).catch(() => null);
    if (msg) await msg.edit({ ...payload, components });
  }
  if (!msg) {
    msg = await ch.send({ ...payload, components });
    messageId = msg.id;
    await prisma.raid.update({ where: { id: raid.id }, data: { messageId } });
  }

  return { channelId, messageId };
}

/** Embed nach Änderungen (Signups etc.) aktualisieren. */
export async function refreshRaidMessage(raidId) {
  const client = await ensureBotReady();
  const { raid, groups } = await fetchRaidFull(raidId);
  if (!raid.channelId || !raid.messageId) return false;

  const ch = await client.channels.fetch(raid.channelId).catch(() => null);
  if (!ch) return false;

  const msg = await ch.messages.fetch(raid.messageId).catch(() => null);
  if (!msg) return false;

  const payload = buildRaidMessage(raid, groups);
  const components = getSignupComponents(raid.id);
  await msg.edit({ ...payload, components });
  return true;
}
