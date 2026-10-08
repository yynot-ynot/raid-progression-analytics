import {
  findUltimateVariantByEncounterId,
  ULTIMATE_ENCOUNTERS,
} from "../../config/ultimateEncounters.js";
import {
  loadAllReports,
  loadReportFights,
  mergeRaidTeamData,
  sortReportsByStartTime,
} from "./raidTeamLoader.js";
import {
  buildDateRangePreset,
  buildReportSourceConfig,
  parseFflogsSourceUrl,
} from "./sourceScope.js";

/** Build the report-discovery config from page inputs. */
export function buildWorkflowSourceConfig({ sourceUrl, timeFrame = { preset: "all-history" }, nowMs = Date.now() } = {}) {
  return buildReportSourceConfig(parseFflogsSourceUrl(sourceUrl), buildWorkflowDateRange(timeFrame, nowMs));
}

/** Convert a page time-frame selection into FFLogs timestamps. */
export function buildWorkflowDateRange(timeFrame = { preset: "all-history" }, nowMs = Date.now()) {
  if (timeFrame.preset === "all-history") return { startTime: null, endTime: null };
  if (timeFrame.preset && timeFrame.preset !== "custom") return buildDateRangePreset(timeFrame.preset, nowMs);
  const startTime = parseDateBoundary(timeFrame.startDate, "start");
  const endTime = parseDateBoundary(timeFrame.endDate, "end");
  if (startTime >= endTime) throw new Error("Custom date range start must be before end");
  return { startTime, endTime };
}

/**
 * Discover selectable Ultimate variants from unfiltered report-fight details.
 * Zone and title data remain provenance only: a raw `fights[].encounterID` is
 * the sole identity used to group a progression dataset.
 */
export async function discoverAvailableUltimates({
  config,
  queryFflogs,
  reportLimit = 100,
  detailConcurrency = 3,
  onUpdate = null,
} = {}) {
  const groups = new Map();
  const unclassifiedReports = [];
  const failedReports = [];
  const detailsByCode = new Map();
  let reports = [];
  let pagination = null;
  let pagesFetched = 0;

  const emit = async (progress) => onUpdate?.({
    reports,
    unclassifiedReports: [...unclassifiedReports],
    ultimates: serializeGroups(groups),
    pagination,
    pagesFetched,
    progress,
  });

  const loaded = await loadAllReports({
    config,
    limit: reportLimit,
    queryFflogs,
    onPage: async (page) => {
      reports.push(...page.reports);
      pagesFetched = page.pagesFetched;
      await emit({ stage: "report-pages", ...page });
    },
  });
  reports = sortReportsByStartTime(loaded.reports);
  pagination = loaded.pagination;
  pagesFetched = loaded.pagesFetched;

  await loadReportDetailsWithConcurrency({
    reports,
    concurrency: detailConcurrency,
    loadDetail: (report) =>
      loadReportFights({
        code: report.code,
        config: { ...config, encounterId: null },
        queryFflogs,
      }),
    onCommitted: async ({ report, detail, error, current, total }) => {
      if (error || !detail) {
        failedReports.push(report);
        unclassifiedReports.push(report);
      } else {
        detailsByCode.set(report.code, detail);
        const variants = recognizedVariants(detail);
        if (!variants.length) unclassifiedReports.push(report);
        for (const ultimate of variants) addReportToGroup(groups, ultimate, report, detail);
      }
      await emit({
        stage: "report-details",
        current,
        total,
        reportsFetched: reports.length,
        pagesFetched,
        failedReportCount: failedReports.length,
      });
    },
  });

  return {
    reports,
    unclassifiedReports,
    failedReports,
    reportDetails: [...detailsByCode.values()],
    ultimates: serializeGroups(groups),
    pagination,
    pagesFetched,
  };
}

/**
 * Build one selected raw encounter's bundle from the discovery cache. Selection
 * never sends a second, encounter-filtered report-detail request.
 */
export async function loadUltimateRaidData({
  ultimate,
  candidateReports = [],
  reportDetails = [],
  currentUser = null,
  team = null,
} = {}) {
  if (!ultimate?.encounterId) throw new Error("A supported Ultimate encounter is required");
  const reportByCode = new Map(candidateReports.map((report) => [report.code, report]));
  const selectedDetails = reportDetails
    .map((detail) => filterReportDetailForUltimate(detail, ultimate.encounterId))
    .filter((detail) => detail?.pulls?.length)
    .sort((left, right) => Number(left.report?.startTime) - Number(right.report?.startTime));
  const cutoff = firstClearCutoff(selectedDetails);
  const reportDetailsThroughClear = selectedDetails
    .map((detail) => trimDetailToCutoff(detail, cutoff))
    .filter(Boolean);
  const reportsThroughClear = reportDetailsThroughClear
    .map((detail) => reportByCode.get(detail.report?.code) || detail.report)
    .filter(Boolean);
  return mergeRaidTeamData({
    currentUser,
    team,
    reports: reportsThroughClear,
    reportDetails: reportDetailsThroughClear,
  });
}

/** Keep one mapped detail's fights, phases, and pulls for a raw encounter ID. */
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
 * Run a bounded detail worker pool. Requests may finish out of order, but
 * results commit in chronological source order so progressive UI updates are
 * deterministic and first-clear logic remains correct.
 */
export async function loadReportDetailsWithConcurrency({
  reports = [],
  concurrency = 3,
  loadDetail,
  onCommitted = null,
} = {}) {
  const ordered = sortReportsByStartTime(reports);
  if (!ordered.length) return;
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 3, ordered.length));
  const pending = new Map();
  const resolved = new Map();
  let nextRequest = 0;
  let nextCommit = 0;
  let committed = 0;

  const start = (index) => {
    const report = ordered[index];
    const request = Promise.resolve()
      .then(() => loadDetail(report))
      .then((detail) => ({ index, report, detail, error: null }))
      .catch((error) => ({ index, report, detail: null, error }));
    pending.set(index, request);
  };
  while (nextRequest < workerCount) start(nextRequest++);

  while (pending.size) {
    const result = await Promise.race(pending.values());
    pending.delete(result.index);
    resolved.set(result.index, result);
    if (nextRequest < ordered.length) start(nextRequest++);
    while (resolved.has(nextCommit)) {
      const item = resolved.get(nextCommit);
      resolved.delete(nextCommit++);
      committed += 1;
      await onCommitted?.({ ...item, current: committed, total: ordered.length });
    }
  }
}

function recognizedVariants(detail) {
  const variants = new Map();
  for (const fight of detail?.fights || []) {
    const variant = findUltimateVariantByEncounterId(fight.encounterId);
    if (variant) variants.set(variant.encounterId, variant);
  }
  return [...variants.values()];
}

function addReportToGroup(groups, ultimate, report, detail) {
  const key = String(ultimate.encounterId);
  if (!groups.has(key)) groups.set(key, { ultimate, reportsByCode: new Map(), detailsByCode: new Map() });
  const group = groups.get(key);
  group.reportsByCode.set(report.code, report);
  group.detailsByCode.set(report.code, filterReportDetailForUltimate(detail, ultimate.encounterId));
}

function serializeGroups(groups) {
  return [...groups.values()]
    .map((group) => {
      const reports = sortReportsByStartTime([...group.reportsByCode.values()]);
      return {
        ultimate: {
          ...group.ultimate,
          displayName: group.ultimate.expansion === "Dawntrail"
            ? group.ultimate.displayName
            : `${group.ultimate.displayName} (${group.ultimate.expansion})`,
        },
        reports,
        candidateReports: reports,
        confirmedReports: reports,
        reportDetails: reports.map((report) => group.detailsByCode.get(report.code)).filter(Boolean),
        reportCount: reports.length,
        candidateReportCount: reports.length,
        confirmed: true,
        exactConfirmationRequired: true,
        source: { kind: "report-fight", zoneId: null, zoneName: null },
        firstReportStartTime: reports[0]?.startTime ?? null,
        lastReportStartTime: reports.at(-1)?.startTime ?? null,
      };
    })
    .sort((left, right) => {
      const canonicalOrder = ULTIMATE_ENCOUNTERS.findIndex((entry) => entry.slug === left.ultimate.slug)
        - ULTIMATE_ENCOUNTERS.findIndex((entry) => entry.slug === right.ultimate.slug);
      return canonicalOrder || Number(left.ultimate.encounterId) - Number(right.ultimate.encounterId);
    });
}

function firstClearCutoff(details) {
  const clears = details.flatMap((detail) => detail.pulls || []).filter((pull) => pull.kill === true);
  return clears.reduce((earliest, pull) => {
    if (!earliest) return pull;
    return pullEnd(pull) < pullEnd(earliest) ? pull : earliest;
  }, null);
}

function trimDetailToCutoff(detail, cutoff) {
  if (!cutoff) return detail;
  const pulls = (detail.pulls || []).filter((pull) =>
    pullEnd(pull) < pullEnd(cutoff)
      || (pull.reportCode === cutoff.reportCode && Number(pull.fightId) === Number(cutoff.fightId)),
  );
  if (!pulls.length) return null;
  const fightIds = new Set(pulls.map((pull) => Number(pull.fightId)));
  return { ...detail, fights: (detail.fights || []).filter((fight) => fightIds.has(Number(fight.id))), pulls };
}

function pullEnd(pull) {
  return Number(pull.pullStartTimestamp) + Number(pull.pullDurationMs || 0);
}

function parseDateBoundary(value, boundary) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) throw new Error("Custom date range requires YYYY-MM-DD dates");
  const suffix = boundary === "start" ? "T00:00:00.000" : "T23:59:59.999";
  const timestamp = new Date(`${value}${suffix}`).getTime();
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid custom date: ${value}`);
  return timestamp;
}
