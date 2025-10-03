// src/backend/discord/modules/raidEmbed.js
import { EmbedBuilder } from "discord.js";

/**
 * Baut drei Embeds:
 *  1) Header (Titel, Datum, Lead)
 *  2) Roster (status = PICKED)
 *  3) Signups (status = SIGNUPED)
 *
 * Erwartet ein Raid-Objekt inkl. signups[{ type, saved, note, class, user, char }]
 */
export function buildRaidEmbeds(raid) {
  const date = new Date(raid.date);
  const fDate =
    date.toLocaleDateString("de-DE") +
    ", " +
    date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  const lead =
    /^[0-9]{16,20}$/.test(String(raid.lead || ""))
      ? `<@${raid.lead}>`
      : raid.lead || "-";

  // Helfer zum Gruppieren
  const byRole = (rows) => ({
    TANK: rows.filter((s) => s.type === "TANK"),
    HEAL: rows.filter((s) => s.type === "HEAL"),
    DPS: rows.filter((s) => s.type === "DPS"),
    LOOTBUDDY: rows.filter((s) => s.type === "LOOTBUDDY"),
  });

  const picked = byRole((raid.signups || []).filter((s) => s.status === "PICKED"));
  const queued = byRole((raid.signups || []).filter((s) => s.status === "SIGNUPED"));

  const fmt = (s) => {
    const char = s.char;
    const user = s.user;
    const who =
      (char?.name && char?.realm ? `${char.name}-${char.realm}` : null) ||
      user?.displayName ||
      user?.username ||
      user?.discordId ||
      "—";
    const cls = s.class ? ` (${s.class})` : "";
    const sv = s.saved ? " [S]" : "";
    return `• ${who}${cls}${sv}${s.note ? ` — ${s.note}` : ""}`;
  };
  const block = (arr) => (arr.length ? arr.map(fmt).join("\n") : "—");

  const color = raid.difficulty?.toLowerCase() === "mythic" ? 0x8b5cf6 : 0x0ea5e9;

  // 1) Header
  const head = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${raid.title || "Raid"} — ${raid.difficulty || ""} (${raid.lootType || ""})`)
    .addFields(
      { name: "Lead", value: String(lead), inline: false },
      { name: "Datum", value: fDate, inline: false }
    )
    .setFooter({ text: `Raid #${raid.id}` });

  // 2) Roster (picked)
  const roster = new EmbedBuilder()
    .setColor(color)
    .setTitle("Roster")
    .addFields(
      { name: "🛡️ Tanks", value: block(picked.TANK), inline: true },
      { name: "✨ Heals", value: block(picked.HEAL), inline: true },
      { name: "⚔️ DPS", value: block(picked.DPS), inline: true },
      { name: "💰 Lootbuddies", value: block(picked.LOOTBUDDY), inline: false }
    )
    .setFooter({ text: `RID:${raid.id}` });

  // 3) Signups (queued)
  const signups = new EmbedBuilder()
    .setColor(color)
    .setTitle("Signups")
    .addFields(
      { name: "🛡️ Tanks", value: block(queued.TANK), inline: true },
      { name: "✨ Heals", value: block(queued.HEAL), inline: true },
      { name: "⚔️ DPS", value: block(queued.DPS), inline: true },
      { name: "💰 Lootbuddies", value: block(queued.LOOTBUDDY), inline: false }
    )
    .setFooter({ text: `RID:${raid.id}` });

  return [head, roster, signups];
}

/** Backwards-compatible Export für deinen bestehenden Import */
export const buildRaidMessage = buildRaidEmbeds;
