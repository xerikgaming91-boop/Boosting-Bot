// Welche Rollen eine Klasse spielen darf
export const ROLE = { TANK: "TANK", HEAL: "HEAL", DPS: "DPS" };

/** Map<WoWClass, Set<Role>> */
const MATRIX = new Map([
  ["Druid",     new Set([ROLE.TANK, ROLE.HEAL, ROLE.DPS])],
  ["Paladin",   new Set([ROLE.TANK, ROLE.HEAL, ROLE.DPS])],
  ["Warrior",   new Set([ROLE.TANK, ROLE.DPS])],
  ["Death Knight", new Set([ROLE.TANK, ROLE.DPS])],
  ["Demon Hunter", new Set([ROLE.TANK, ROLE.DPS])],
  ["Monk",      new Set([ROLE.TANK, ROLE.HEAL, ROLE.DPS])],
  ["Priest",    new Set([ROLE.HEAL, ROLE.DPS])],
  ["Shaman",    new Set([ROLE.HEAL, ROLE.DPS])],
  ["Evoker",    new Set([ROLE.HEAL, ROLE.DPS])],
  ["Mage",      new Set([ROLE.DPS])],
  ["Warlock",   new Set([ROLE.DPS])],
  ["Hunter",    new Set([ROLE.DPS])],
  ["Rogue",     new Set([ROLE.DPS])],
]);

export function isRoleAllowedForClass(wowClass, role) {
  const set = MATRIX.get(wowClass || "");
  return !!(set && set.has(role));
}
