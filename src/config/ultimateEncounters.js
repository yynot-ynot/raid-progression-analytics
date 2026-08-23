/**
 * Curated FFLogs Ultimate encounter registry.
 *
 * FFLogs report summaries can be grouped by zone, while detailed report fights
 * are filtered by encounter ID. The legacy Ultimates share zone 59; newer
 * Ultimates use their own zones.
 */
export const ULTIMATE_ENCOUNTERS = [
  {
    slug: "ucob",
    displayName: "The Unending Coil of Bahamut",
    zoneId: 59,
    encounterId: 1073,
    statisticsUrl: "https://www.fflogs.com/zone/statistics/59?boss=1073",
  },
  {
    slug: "uwu",
    displayName: "The Weapon's Refrain",
    zoneId: 59,
    encounterId: 1074,
    statisticsUrl: "https://www.fflogs.com/zone/statistics/59?boss=1074",
  },
  {
    slug: "tea",
    displayName: "The Epic of Alexander",
    zoneId: 59,
    encounterId: 1075,
    statisticsUrl: "https://www.fflogs.com/zone/statistics/59?boss=1075",
  },
  {
    slug: "dsr",
    displayName: "Dragonsong's Reprise",
    zoneId: 59,
    encounterId: 1076,
    statisticsUrl: "https://www.fflogs.com/zone/statistics/59?boss=1076",
  },
  {
    slug: "top",
    displayName: "The Omega Protocol",
    zoneId: 59,
    encounterId: 1077,
    statisticsUrl: "https://www.fflogs.com/zone/statistics/59?boss=1077",
  },
  {
    slug: "fru",
    displayName: "Futures Rewritten",
    zoneId: 65,
    encounterId: 1079,
    statisticsUrl: "https://www.fflogs.com/zone/rankings/65?boss=1079",
  },
  {
    slug: "dm",
    displayName: "Dancing Mad",
    zoneId: 76,
    encounterId: 1085,
    statisticsUrl: "https://www.fflogs.com/zone/statistics/76?boss=1085",
  },
];

const ENCOUNTERS_BY_ID = new Map(
  ULTIMATE_ENCOUNTERS.map((encounter) => [encounter.encounterId, encounter]),
);

const ENCOUNTERS_BY_ZONE_ID = ULTIMATE_ENCOUNTERS.reduce((byZone, encounter) => {
  const encounters = byZone.get(encounter.zoneId) || [];
  encounters.push(encounter);
  byZone.set(encounter.zoneId, encounters);
  return byZone;
}, new Map());

/**
 * Find a supported Ultimate by FFLogs encounter ID.
 *
 * @param {number|string|null|undefined} encounterId
 * @returns {object|null}
 */
export function findUltimateByEncounterId(encounterId) {
  return ENCOUNTERS_BY_ID.get(Number(encounterId)) || null;
}

/**
 * Return all supported Ultimates in a FFLogs zone.
 *
 * @param {number|string|null|undefined} zoneId
 * @returns {object[]}
 */
export function findUltimatesByZoneId(zoneId) {
  return ENCOUNTERS_BY_ZONE_ID.get(Number(zoneId)) || [];
}

/**
 * Group report summaries by supported Ultimate zones.
 *
 * Legacy Ultimate reports in zone 59 can contain multiple Ultimate encounters,
 * so those reports are candidates for each legacy Ultimate until report-detail
 * fight data narrows the exact encounter.
 *
 * @param {object[]} reports
 * @returns {object[]}
 */
export function groupReportsByAvailableUltimates(reports = []) {
  const groupsBySlug = new Map();

  for (const report of reports || []) {
    for (const ultimate of findUltimatesByZoneId(report?.zone?.id)) {
      if (!groupsBySlug.has(ultimate.slug)) {
        groupsBySlug.set(ultimate.slug, { ultimate, reports: [] });
      }
      groupsBySlug.get(ultimate.slug).reports.push(report);
    }
  }

  return ULTIMATE_ENCOUNTERS
    .filter((ultimate) => groupsBySlug.has(ultimate.slug))
    .map((ultimate) => groupsBySlug.get(ultimate.slug));
}

/**
 * Keep only fights that match a supported Ultimate encounter.
 *
 * @param {object[]} fights
 * @param {number|string} encounterId
 * @returns {object[]}
 */
export function filterFightsForUltimate(fights = [], encounterId) {
  const ultimate = findUltimateByEncounterId(encounterId);
  if (!ultimate) return [];
  return (fights || []).filter((fight) => Number(fight?.encounterId) === ultimate.encounterId);
}
