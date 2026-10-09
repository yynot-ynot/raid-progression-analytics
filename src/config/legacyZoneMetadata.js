/**
 * Verified FFLogs Legacy-zone provenance used only to make a zone picker label
 * intelligible. This is deliberately separate from encounter identity: a zone
 * ID neither confirms a fight nor affects loading, retention, or clear logic.
 */
const LEGACY_ZONE_EXPANSIONS = new Map([
  [30, "Shadowbringers"],
  [43, "Endwalker"],
  [59, "Dawntrail"],
]);

/**
 * Resolve the expansion represented by a verified FFLogs Legacy-zone ID.
 *
 * An unknown ID remains unlabeled instead of being guessed. Callers must use
 * detailed fight encounter IDs for all progression decisions.
 *
 * @param {number|string|null|undefined} zoneId
 * @returns {string|null}
 */
export function findLegacyZoneExpansion(zoneId) {
  return LEGACY_ZONE_EXPANSIONS.get(Number(zoneId)) || null;
}
