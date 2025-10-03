import { EmbedBuilder } from "discord.js";

/**
 * Baut das Embed + Text aus Raid- & Signup-Daten.
 * Erwartet:
 *  - raid: { id,title,difficulty,lootType,date,leadName }
 *  - groups: { roster:{tanks,heals,dps,loot}, signups:{tanks,heals,dps,loot} } (Arrays von Strings)
 */
export function buildRaidMessage(raid, groups) {
  const dateStr = raid?.date
    ? new Date(raid.date).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })
    : "tbd";

  const fmt = (arr) => (arr?.length ? arr.join(", ") : "—");

  const embed = new EmbedBuilder()
    .setTitle(`${raid.title} — ${raid.difficulty} (${raid.lootType})`)
    .setDescription("Anmeldungen über Website / Buttons")
    .addFields(
      { name: "Datum", value: dateStr, inline: true },
      { name: "Raid Leader", value: raid.leadName || "—", inline: true },
      { name: "Loot Type", value: raid.lootType || "—", inline: true },
    )
    .addFields(
      { name: "Roster (Tanks)", value: fmt(groups.roster.tanks), inline: true },
      { name: "Roster (Heals)", value: fmt(groups.roster.heals), inline: true },
      { name: "Roster (DPS)",   value: fmt(groups.roster.dps),   inline: true },
    )
    .addFields(
      { name: "Roster (Lootbuddies)", value: fmt(groups.roster.loot), inline: false },
    )
    .addFields(
      { name: "Signups (Tanks)", value: fmt(groups.signups.tanks), inline: true },
      { name: "Signups (Heals)", value: fmt(groups.signups.heals), inline: true },
      { name: "Signups (DPS)",   value: fmt(groups.signups.dps),   inline: true },
    )
    .addFields(
      { name: "Signups (Lootbuddies)", value: fmt(groups.signups.loot), inline: false },
      { name: "Raid", value: `#${raid.id}`, inline: true },
    )
    .setFooter({ text: raid.channelId ? `RID:${raid.id}` : `Raid #${raid.id}` });

  return { embeds: [embed] };
}
