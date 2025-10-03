// src/backend/discord/modules/nameFormat.js

/** Downcase + ASCII + only [a-z0-9] */
function slugify(s) {
  if (!s) return "tbd";
  return String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // diakritika
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

function two(n) {
  return String(n).padStart(2, "0");
}

/**
 * Baut einen Channelnamen nach Vorgabe:
 *  sat-2315-hc-vip-syntax
 *   ^   ^^^^ ^^ ^^^ ^^^^^^
 *  tag  zeit diff loot lead
 *
 * Erwartete Felder (best effort):
 *  - raid.date (ISO oder YYYY-MM-DD oder Date)
 *  - raid.time ("HH:mm" optional, wenn date kein Zeitanteil hat)
 *  - raid.difficulty ("Normal" | "Heroic" | "Mythic" | …)
 *  - raid.lootType (z.B. "VIP")
 *  - raid.leadName oder raid.lead (AnzeigeName)
 */
export function formatRaidChannelName(raid = {}) {
  // --- Datum/Zeit normalisieren
  let dt = null;

  if (raid.date instanceof Date && !isNaN(raid.date)) {
    dt = raid.date;
  } else if (typeof raid.date === "string" && raid.date) {
    // Wenn 'date' ein ISO mit Zeit ist -> direkt nehmen
    const maybeIso = new Date(raid.date);
    if (!isNaN(maybeIso)) {
      dt = maybeIso;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(raid.date)) {
      // YYYY-MM-DD + evtl. time-Feld
      const t = typeof raid.time === "string" && /^\d{2}:\d{2}$/.test(raid.time) ? raid.time : "00:00";
      const d = new Date(`${raid.date}T${t}:00`);
      if (!isNaN(d)) dt = d;
    }
  }

  if (!dt) {
    // fallback: jetzt
    dt = new Date();
  }

  // Wochentag (engl. 3-letter)
  const dows = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const dow = dows[dt.getDay()];

  // Uhrzeit HHmm
  let hhmm = "0000";
  if (raid.time && /^\d{2}:\d{2}$/.test(raid.time)) {
    const [hh, mm] = raid.time.split(":");
    hhmm = `${hh}${mm}`;
  } else {
    hhmm = `${two(dt.getHours())}${two(dt.getMinutes())}`;
  }

  // Difficulty → Kürzel
  const diffRaw = String(raid.difficulty || "").toLowerCase();
  const diffMap = {
    normal: "nm",
    heroic: "hc",
    mythic: "my",
  };
  const diff = diffMap[diffRaw] || slugify(diffRaw);

  // Loot → lowercase slug
  const loot = slugify(raid.lootType || raid.loot || "tbd");

  // Leadname → lowercase slug
  const leadSrc = raid.leadName || raid.lead || raid.leadDisplay || raid.leadUser || "";
  const lead = slugify(leadSrc) || "tbd";

  return `${dow}-${hhmm}-${diff}-${loot}-${lead}`;
}
