import {
  findUltimateByEncounterId,
  findUltimatesByZoneId,
  ULTIMATE_ENCOUNTERS,
} from "../../config/ultimateEncounters.js";
import {
  loadAllReports,
  loadReportDetailsUntilFirstClear,
  loadReportFights,
  mergeRaidTeamData,
} from "./raidTeamLoader.js";
import {
  buildDateRangePreset,
  buildReportSourceConfig,
  parseFflogsSourceUrl,
} from "./sourceScope.js";

/**
 * Build the report-discovery config from user-facing page inputs.
 *
 * @param {object} params
 * @returns {object}
 */
export function buildWorkflowSourceConfig({
  sourceUrl,
  timeFrame = { preset: "past-6-months" },
  nowMs = Date.now(),
} = {}) {
  const sourceScope = parseFflogsSourceUrl(sourceUrl);
  const range = buildWorkflowDateRange(timeFrame, nowMs);
  return buildReportSourceConfig(sourceScope, range);
}

/**
 * Convert page time-frame selection into FFLogs millisecond timestamps.
 *
 * @param {{preset?: string, startDate?: string, endDate?: string}} timeFrame
 * @param {number} nowMs
 * @returns {{startTime: number, endTime: number}}
 */
export function buildWorkflowDateRange(timeFrame = { preset: "past-6-months" }, nowMs = Date.now()) {
  if (timeFrame.preset && timeFrame.preset !== "custom") {
    return buildDateRangePreset(timeFrame.preset, nowMs);
  }

  const startTime = parseDateBoundary(timeFrame.startDate, "start");
  const endTime = parseDateBoundary(timeFrame.endDate, "end");
  if (startTime >= endTime) {
    throw new Error("Custom date range start must be before end");
  }

  return { startTime, endTime };
}

/**
 * Discover which supported Ultimates are available for a source and time range.
 *
 * Report summaries are enough for single-Ultimate zones. Legacy zone 59 is
 * shared, so those report candidates are opened and confirmed by fight
 * encounter ID before they are shown as exact Ultimate matches.
 *
 * @param {object} params
 * @returns {Promise<{reports: object[], ultimates: object[]}>}
 */
export async function discoverAvailableUltimates({
  config,
  queryFflogs,
  reportLimit = 100,
  maxReportPages = 100,
  maxDetailReports = 100,
} = {}) {
  const { reports } = await loadAllReports({
    config,
    limit: reportLimit,
    maxPages: maxReportPages,
    queryFflogs,
  });
  const groups = createEmptyUltimateGroups();
  const ambiguousReports = [];

  for (const report of reports) {
    const candidates = findUltimatesByZoneId(report?.zone?.id);
    if (candidates.length === 1) {
      addReportToGroup(groups, candidates[0], report, { confirmed: true });
    } else if (candidates.length > 1) {
      ambiguousReports.push(report);
      for (const candidate of candidates) {
        addReportToGroup(groups, candidate, report, { confirmed: false });
      }
    }
  }

  for (const report of ambiguousReports.slice(0, maxDetailReports)) {
    const detail = await loadReportFights({
      code: report.code,
      config: { ...config, encounterId: null },
      queryFflogs,
    });
    for (const ultimate of getUltimatesFromDetail(detail)) {
      addReportToGroup(groups, ultimate, report, { confirmed: true, detail });
    }
  }

  return {
    reports,
    ultimates: serializeUltimateGroups(groups),
  };
}

/**
 * Load normalized pull data for one selected Ultimate.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function loadUltimateRaidData({
  config,
  ultimate,
  candidateReports = null,
  currentUser = null,
  team = null,
  queryFflogs,
  reportLimit = 100,
  maxReportPages = 100,
} = {}) {
  if (!ultimate?.encounterId) {
    throw new Error("A supported Ultimate encounter is required");
  }

  const reports =
    candidateReports ||
    (
      await loadAllReports({
        config: { ...config, zoneId: ultimate.zoneId },
        limit: reportLimit,
        maxPages: maxReportPages,
        queryFflogs,
      })
    ).reports;

  const loaded = await loadReportDetailsUntilFirstClear({
    reports,
    loadReportDetail: async (report) => {
      const detail = await loadReportFights({
        code: report.code,
        config: { ...config, zoneId: ultimate.zoneId, encounterId: ultimate.encounterId },
        queryFflogs,
      });
      return filterReportDetailForUltimate(detail, ultimate.encounterId);
    },
    shouldKeepDetail: (detail) => Boolean(detail?.fights?.length),
  });

  return mergeRaidTeamData({
    currentUser,
    team,
    reports: loaded.reports,
    reportDetails: loaded.reportDetails,
  });
}

/**
 * Keep detail rows for only the selected Ultimate encounter.
 *
 * @param {object|null} detail
 * @param {number|string} encounterId
 * @returns {object|null}
 */
export function filterReportDetailForUltimate(detail, encounterId) {
  const targetEncounterId = Number(encounterId);
  if (!detail) return null;

  return {
    ...detail,
    phases: (detail.phases || []).filter((phase) => Number(phase.encounterId) === targetEncounterId),
    fights: (detail.fights || []).filter((fight) => Number(fight.encounterId) === targetEncounterId),
    pulls: (detail.pulls || []).filter((pull) => Number(pull.encounterId) === targetEncounterId),
  };
}

/**
 * Parse custom date input as a local day boundary.
 *
 * @param {string|undefined} value
 * @param {"start"|"end"} boundary
 * @returns {number}
 */
function parseDateBoundary(value, boundary) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    throw new Error("Custom date range requires YYYY-MM-DD dates");
  }

  const suffix = boundary === "start" ? "T00:00:00.000" : "T23:59:59.999";
  const timestamp = new Date(`${value}${suffix}`).getTime();
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid custom date: ${value}`);
  }
  return timestamp;
}

/**
 * Create mutable discovery buckets keyed by Ultimate slug.
 *
 * @returns {Map<string, object>}
 */
function createEmptyUltimateGroups() {
  return new Map(
    ULTIMATE_ENCOUNTERS.map((ultimate) => [
      ultimate.slug,
      {
        ultimate,
        candidateReportsByCode: new Map(),
        confirmedReportsByCode: new Map(),
        detailsByCode: new Map(),
      },
    ]),
  );
}

/**
 * Add a report to one Ultimate discovery bucket.
 *
 * @param {Map<string, object>} groups
 * @param {object} ultimate
 * @param {object} report
 * @param {{confirmed?: boolean, detail?: object|null}} options
 */
function addReportToGroup(groups, ultimate, report, { confirmed = false, detail = null } = {}) {
  const group = groups.get(ultimate.slug);
  if (!group || !report?.code) return;

  group.candidateReportsByCode.set(report.code, report);
  if (confirmed) {
    group.confirmedReportsByCode.set(report.code, report);
    if (detail) group.detailsByCode.set(report.code, filterReportDetailForUltimate(detail, ultimate.encounterId));
  }
}

/**
 * Return supported Ultimates seen in a mapped report detail.
 *
 * @param {object|null} detail
 * @returns {object[]}
 */
function getUltimatesFromDetail(detail) {
  const seen = new Map();
  for (const fight of detail?.fights || []) {
    const ultimate = findUltimateByEncounterId(fight.encounterId);
    if (ultimate) seen.set(ultimate.slug, ultimate);
  }
  return [...seen.values()];
}

/**
 * Convert mutable discovery buckets into stable page-facing summaries.
 *
 * @param {Map<string, object>} groups
 * @returns {object[]}
 */
function serializeUltimateGroups(groups) {
  return [...groups.values()]
    .filter((group) => group.candidateReportsByCode.size > 0)
    .map((group) => {
      const candidateReports = [...group.candidateReportsByCode.values()];
      const confirmedReports = [...group.confirmedReportsByCode.values()];
      const exactConfirmationRequired = findUltimatesByZoneId(group.ultimate.zoneId).length > 1;
      const reports = exactConfirmationRequired ? confirmedReports : candidateReports;

      return {
        ultimate: group.ultimate,
        reports,
        candidateReports,
        confirmedReports,
        reportDetails: [...group.detailsByCode.values()].filter(Boolean),
        reportCount: reports.length,
        candidateReportCount: candidateReports.length,
        confirmed: !exactConfirmationRequired || confirmedReports.length > 0,
        exactConfirmationRequired,
        firstReportStartTime: getBoundary(reports, "startTime", Math.min),
        lastReportStartTime: getBoundary(reports, "startTime", Math.max),
      };
    })
    .filter((group) => group.reportCount > 0);
}

/**
 * Compute a numeric boundary for a report collection.
 *
 * @param {object[]} reports
 * @param {string} key
 * @param {Function} reducer
 * @returns {number|null}
 */
function getBoundary(reports, key, reducer) {
  const values = reports
    .map((report) => Number(report?.[key]))
    .filter((value) => Number.isFinite(value));
  return values.length ? reducer(...values) : null;
}
