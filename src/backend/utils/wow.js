// src/backend/utils/wow.js
// Einfache Hilfen rund um WoW-Klassen/Rollen

export const CLASS_ALLOWED_ROLES = {
  "Death Knight": ["Tank", "DPS"],
  "Demon Hunter": ["Tank", "DPS"],
  Druid: ["Tank", "Healer", "DPS"],
  Evoker: ["Healer", "DPS"],
  Hunter: ["DPS"],
  Mage: ["DPS"],
  Monk: ["Tank", "Healer", "DPS"],
  Paladin: ["Tank", "Healer", "DPS"],
  Priest: ["Healer", "DPS"],
  Rogue: ["DPS"],
  Shaman: ["Healer", "DPS"],
  Warlock: ["DPS"],
  Warrior: ["Tank", "DPS"],
};

/** Klasse aus beliebigen Varianten normalisieren (z.B. lower/upper, lokalisierte Quellen vermeiden) */
export function normalizeClassName(input) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  const map = {
    "death knight": "Death Knight",
    "dk": "Death Knight",
    "demon hunter": "Demon Hunter",
    "dh": "Demon Hunter",
    "druid": "Druid",
    "evoker": "Evoker",
    "hunter": "Hunter",
    "mage": "Mage",
    "monk": "Monk",
    "paladin": "Paladin",
    "priest": "Priest",
    "rogue": "Rogue",
    "shaman": "Shaman",
    "warlock": "Warlock",
    "warrior": "Warrior",
  };
  // exact hit
  for (const k of Object.keys(map)) {
    if (s === k) return map[k];
  }
  // fuzzy contains (z.B. "Highmountain Tauren Warrior")
  for (const k of Object.keys(map)) {
    if (s.includes(k)) return map[k];
  }
  // Fallback: erstes Wort kapitalisieren
  return input;
}

/** Erlaubte Rollen für Klasse zurückgeben */
export function allowedRolesForClass(className) {
  const norm = normalizeClassName(className);
  return CLASS_ALLOWED_ROLES[norm] || ["DPS"]; // super-fallback
}

/** Validierung */
export function isRoleAllowedForClass(className, role) {
  return allowedRolesForClass(className).includes(role);
}
