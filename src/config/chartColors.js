/**
 * Encounter-specific chart configuration.
 *
 * This mirrors the reference repo's `config/raid_config.json` shape: each raid
 * owns its phase count and color map, and graph code resolves a color map from
 * the selected raid instead of relying on one global P1/P2/P3 palette.
 */

export const MEETING_SANKEY_NODE = "Meetings, Breaks and DCs";
export const MEETING_BAR_SERIES = "Meeting";

export const SYNTHETIC_CHART_COLORS = {
  "Total Time": "#d1d5db",
  "Total Pulls": "#d1d5db",
  [MEETING_SANKEY_NODE]: "#d3d3d3",
  [MEETING_BAR_SERIES]: "#ffffff",
};

export const FALLBACK_RAID_CHART_CONFIG = {
  slug: "fallback",
  displayName: "Fallback Ultimate",
  aliases: [],
  encounterId: null,
  phases: ["P1", "P2", "P3", "P4", "P5", "P6", "P7"],
  colors: {
    P1: "#708090",
    P2: "#4b0082",
    P3: "#ffd700",
    P4: "#2f4f4f",
    P5: "#c0c0c0",
    P6: "#7e6bae",
    P7: "#afeeee",
    [MEETING_SANKEY_NODE]: "#d3d3d3",
  },
};

export const RAID_CHART_CONFIG = {
  fru: {
    slug: "fru",
    displayName: "Futures Rewritten",
    aliases: ["Futures Rewritten (Ultimate)"],
    encounterId: 1079,
    phases: ["P1", "P2", "P3", "P4", "P5"],
    colors: {
      P1: "#a0522d",
      P2: "#b0e0e6",
      P3: "#9370db",
      P4: "#4682b4",
      P5: "#ffd700",
      [MEETING_SANKEY_NODE]: "#d3d3d3",
    },
  },
  dm: {
    slug: "dm",
    displayName: "Dancing Mad",
    aliases: ["Dancing Mad (Ultimate)", "UMAD"],
    encounterId: 1085,
    phases: ["P1", "P2", "P3", "P4", "P5"],
    colors: {
      // User-selected image-matched blue-gray for P1, replacing the reference repo's #8b0000.
      P1: "#334052",
      P2: "#e6c34a",
      P3: "#1f5fd1",
      P4: "#98207a",
      P5: "#9f241d",
      [MEETING_SANKEY_NODE]: "#d3d3d3",
    },
  },
  top: {
    slug: "top",
    displayName: "The Omega Protocol",
    aliases: ["The Omega Protocol (Ultimate)", "TOP"],
    encounterId: 1077,
    phases: ["P1", "P2", "P3", "P4", "P5", "P6"],
    colors: {
      P1: "#708090",
      P2: "#003366",
      P3: "#7e6bae",
      P4: "#0078d7",
      P5: "#b5a642",
      P6: "#ffd700",
      [MEETING_SANKEY_NODE]: "#d3d3d3",
    },
  },
  dsr: {
    slug: "dsr",
    displayName: "Dragonsong's Reprise",
    aliases: ["Dragonsong's Reprise (Ultimate)", "Dragonsong Reprise", "DSR"],
    encounterId: 1076,
    phases: ["P1", "P2", "P3", "P4", "Intermission", "P5", "P6", "P7"],
    colors: {
      P1: "#d9a066",
      P2: "#76a5af",
      P3: "#5c4033",
      P4: "#708090",
      Intermission: "#b87333",
      P5: "#696969",
      P6: "#2f4f6f",
      P7: "#afeeee",
      [MEETING_SANKEY_NODE]: "#d3d3d3",
    },
  },
  ucob: {
    slug: "ucob",
    displayName: "The Unending Coil of Bahamut",
    aliases: ["The Unending Coil of Bahamut (Ultimate)", "UCoB"],
    encounterId: 1073,
    phases: ["P1", "P2", "P3", "P4", "P5"],
    colors: {
      P1: "#006400",
      P2: "#d46a6a",
      P3: "#005f8d",
      P4: "#b5651d",
      P5: "#ffd700",
      [MEETING_SANKEY_NODE]: "#d3d3d3",
    },
  },
  uwu: {
    slug: "uwu",
    displayName: "The Weapon's Refrain",
    aliases: ["The Weapon's Refrain (Ultimate)", "UWU"],
    encounterId: 1074,
    phases: ["P1", "P2", "P3", "P4", "P5"],
    colors: FALLBACK_RAID_CHART_CONFIG.colors,
  },
  tea: {
    slug: "tea",
    displayName: "The Epic of Alexander",
    aliases: ["The Epic of Alexander (Ultimate)", "TEA"],
    encounterId: 1075,
    phases: ["P1", "P2", "P3", "P4", "P5"],
    colors: FALLBACK_RAID_CHART_CONFIG.colors,
  },
};

/**
 * Resolve a raid chart config from an Ultimate object, slug, encounter ID, or name.
 *
 * @param {object|string|number|null|undefined} raidRef
 * @returns {object}
 */
export function resolveRaidChartConfig(raidRef) {
  if (raidRef == null || raidRef === "") return FALLBACK_RAID_CHART_CONFIG;

  if (typeof raidRef === "number") {
    return findByEncounterId(raidRef) || FALLBACK_RAID_CHART_CONFIG;
  }

  if (typeof raidRef === "string") {
    return findBySlug(raidRef) || findByName(raidRef) || FALLBACK_RAID_CHART_CONFIG;
  }

  return (
    findBySlug(raidRef.slug) ||
    findByEncounterId(raidRef.encounterId) ||
    findByName(raidRef.displayName || raidRef.name) ||
    FALLBACK_RAID_CHART_CONFIG
  );
}

/**
 * Return the renderer-ready color map for a selected raid.
 *
 * Full phase names such as `P1: Kefka` are resolved by renderer fallback logic
 * through their phase prefix, so configs store stable phase keys like `P1`.
 *
 * @param {object|string|number|null|undefined} raidRef
 * @returns {object}
 */
export function getChartColorsForRaid(raidRef) {
  const config = resolveRaidChartConfig(raidRef);
  return {
    ...SYNTHETIC_CHART_COLORS,
    ...config.colors,
  };
}

/**
 * Return ordered graph phase keys for a selected raid.
 *
 * @param {object|string|number|null|undefined} raidRef
 * @returns {string[]}
 */
export function getChartPhasesForRaid(raidRef) {
  return [...resolveRaidChartConfig(raidRef).phases];
}

/**
 * Match by stable application slug.
 *
 * @param {string|undefined} slug
 * @returns {object|null}
 */
function findBySlug(slug) {
  return RAID_CHART_CONFIG[normalizeKey(slug)] || null;
}

/**
 * Match by FFLogs encounter ID.
 *
 * @param {number|string|null|undefined} encounterId
 * @returns {object|null}
 */
function findByEncounterId(encounterId) {
  const numericId = Number(encounterId);
  if (!Number.isFinite(numericId)) return null;
  return Object.values(RAID_CHART_CONFIG).find((config) => config.encounterId === numericId) || null;
}

/**
 * Match by display name or alias using the reference repo's partial-name behavior.
 *
 * @param {string|undefined} name
 * @returns {object|null}
 */
function findByName(name) {
  const normalizedName = normalizeName(name);
  if (!normalizedName) return null;

  return (
    Object.values(RAID_CHART_CONFIG).find((config) => {
      const candidates = [config.displayName, ...(config.aliases || [])].map(normalizeName);
      return candidates.some(
        (candidate) => candidate && (normalizedName.includes(candidate) || candidate.includes(normalizedName)),
      );
    }) || null
  );
}

/**
 * Normalize slug-like keys.
 *
 * @param {string|undefined} value
 * @returns {string}
 */
function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/**
 * Normalize user-facing raid names for matching.
 *
 * @param {string|undefined} value
 * @returns {string}
 */
function normalizeName(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/[^a-z0-9 ]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
