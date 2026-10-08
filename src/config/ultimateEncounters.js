/**
 * Supported Dawntrail Ultimate identities and their historical FFLogs fight
 * encounter variants. `encounterId` is the current-Dawntrail boss ID; raw
 * report-fight encounter IDs are resolved through
 * `findUltimateVariantByEncounterId`.
 *
 * This registry recognizes report data only. It must not be used as the source
 * of chart colors, phases, or other presentation behavior.
 */
export const ULTIMATE_ENCOUNTERS = [
  { slug: "ucob", displayName: "The Unending Coil of Bahamut", encounterId: 1073, variants: [[1039, "Stormblood"], [1047, "Shadowbringers"], [1060, "Endwalker"], [1073, "Dawntrail"]] },
  { slug: "uwu", displayName: "The Weapon's Refrain", encounterId: 1074, variants: [[1042, "Stormblood"], [1048, "Shadowbringers"], [1061, "Endwalker"], [1074, "Dawntrail"]] },
  { slug: "tea", displayName: "The Epic of Alexander", encounterId: 1075, variants: [[1050, "Shadowbringers"], [1062, "Endwalker"], [1075, "Dawntrail"]] },
  { slug: "dsr", displayName: "Dragonsong's Reprise", encounterId: 1076, variants: [[1065, "Endwalker"], [1076, "Dawntrail"]] },
  { slug: "top", displayName: "The Omega Protocol", encounterId: 1077, variants: [[1068, "Endwalker"], [1077, "Dawntrail"]] },
  { slug: "fru", displayName: "Futures Rewritten", encounterId: 1079, variants: [[1079, "Dawntrail"]] },
  { slug: "dm", displayName: "Dancing Mad", encounterId: 1085, variants: [[1085, "Dawntrail"]] },
];

/** Shared report-zone names that require fight-detail encounter inspection. */
export const SHARED_ULTIMATE_ZONE_NAMES = new Set(
  ["Ultimates (Legacy)"].map((zoneName) => normalizeZoneName(zoneName)),
);

const VARIANTS_BY_ID = new Map(
  ULTIMATE_ENCOUNTERS.flatMap((ultimate) =>
    ultimate.variants.map(([encounterId, expansion]) => [
      encounterId,
      { ...ultimate, encounterId, canonicalEncounterId: ultimate.encounterId, expansion },
    ]),
  ),
);

const ENCOUNTERS_BY_ZONE_NAME = new Map(
  ULTIMATE_ENCOUNTERS.map((encounter) => [normalizeZoneName(encounter.displayName), encounter]),
);

/** Find a supported Ultimate by FFLogs fight encounter ID. */
export function findUltimateVariantByEncounterId(encounterId) {
  return VARIANTS_BY_ID.get(Number(encounterId)) || null;
}

/**
 * Backward-compatible canonical lookup. New classification code should use
 * `findUltimateVariantByEncounterId` so historical variants stay distinct.
 */
export function findUltimateByEncounterId(encounterId) {
  const variant = findUltimateVariantByEncounterId(encounterId);
  return variant && ULTIMATE_ENCOUNTERS.find((ultimate) => ultimate.slug === variant.slug);
}

/**
 * Return the specific Ultimate nominated by an exact FFLogs report-zone name.
 * Shared and unknown zone names return no direct candidate and must be
 * inspected through report details.
 */
export function findUltimateByZoneName(zoneName) {
  return ENCOUNTERS_BY_ZONE_NAME.get(normalizeZoneName(zoneName)) || null;
}

/** Return whether a report-zone name represents a known shared Ultimate bucket. */
export function isSharedUltimateZoneName(zoneName) {
  return SHARED_ULTIMATE_ZONE_NAMES.has(normalizeZoneName(zoneName));
}

/**
 * Keep only fights that match a supported Ultimate encounter.
 *
 * @param {object[]} fights
 * @param {number|string} encounterId
 * @returns {object[]}
 */
export function filterFightsForUltimate(fights = [], encounterId) {
  const targetEncounterId = Number(encounterId);
  return (fights || []).filter((fight) => Number(fight?.encounterId) === targetEncounterId);
}

/** Normalize FFLogs zone names for exact, case-insensitive registry lookup. */
function normalizeZoneName(zoneName) {
  return String(zoneName || "").trim().toLocaleLowerCase();
}
