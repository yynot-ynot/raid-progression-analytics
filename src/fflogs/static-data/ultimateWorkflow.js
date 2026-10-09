import {
  findUltimateVariantByEncounterId,
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
 * Load report summaries and expose FFLogs zones as navigable scopes.
 *
 * This deliberately does not request report detail. Summary zone metadata is
 * sufficient to organize source history, but only report detail can confirm a
 * fight. `loadZoneDetails` performs that second, user-initiated step.
 */
export async function discoverAvailableUltimates({
  config,
  queryFflogs,
  reportLimit = 100,
  onUpdate = null,
} = {}) {
  const zoneRecords = new Map();
  let reports = [];
  let pagination = null;
  let pagesFetched = 0;

  const emit = async (progress) => onUpdate?.({
    reports: sortReportsByStartTime(reports),
    zones: serializeZones(zoneRecords),
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
      addReportsToZones(zoneRecords, page.reports);
      await emit({ stage: "report-pages", ...page });
    },
  });

  reports = sortReportsByStartTime(loaded.reports);
  pagination = loaded.pagination;
  pagesFetched = loaded.pagesFetched;
  addReportsToZones(zoneRecords, reports);

  return {
    reports,
    zones: serializeZones(zoneRecords),
    pagination,
    pagesFetched,
  };
}

/**
 * Load and classify report details for one user-opened FFLogs zone only.
 *
 * Details are full, unfiltered report responses so a cached response can
 * confirm every fight in its zone. `detailsByCode` is source-owned cache shared
 * by all opened zones; a report code is requested at most once.
 */
export async function loadZoneDetails({
  zone,
  config,
  queryFflogs,
  detailConcurrency = 3,
  detailsByCode = new Map(),
  onUpdate = null,
} = {}) {
  if (!zone?.key || !Array.isArray(zone.reports)) throw new Error("An FFLogs zone is required");
  const loader = createZoneDetailLoader({
    zone,
    config,
    queryFflogs,
    detailConcurrency,
    detailsByCode,
    onUpdate,
  });
  loader.enqueue(zone.reports);
  loader.close();
  return loader.done;
}

/**
 * Create a streaming, bounded detail queue for one user-opened zone.
 *
 * Summary pages arrive oldest-to-newest. Call `enqueue` as they arrive, then
 * `close` once source pagination completes. This permits source pagination and
 * selected-zone detail loading to progress independently without exceeding the
 * zone's request limit.
 */
export function createZoneDetailLoader({
  zone,
  config,
  queryFflogs,
  detailConcurrency = 3,
  detailsByCode = new Map(),
  onUpdate = null,
} = {}) {
  if (!zone?.key) throw new Error("An FFLogs zone is required");
  const reportsByCode = new Map();
  const queue = [];
  const resolved = new Map();
  const failuresByCode = new Map();
  const limit = Math.max(1, Number(detailConcurrency) || 3);
  let nextStart = 0;
  let nextCommit = 0;
  let committed = 0;
  let active = 0;
  let closed = false;
  let complete = false;
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });

  const currentZone = () => ({
    key: zone.key,
    zoneId: zone.zoneId ?? null,
    zoneName: zone.zoneName || "Unknown zone",
    reports: [...reportsByCode.values()],
  });
  const emit = async () => {
    const current = buildZoneView(currentZone(), detailsByCode, failuresByCode, complete);
    await onUpdate?.({
      zone: current,
      progress: {
        stage: "zone-details",
        current: committed,
        total: queue.length,
        complete,
      },
    });
    return current;
  };
  const finishIfPossible = async () => {
    if (!closed || complete || active || nextCommit !== queue.length) return;
    complete = true;
    const result = await emit();
    resolveDone(result);
  };
  const commitAvailable = async () => {
    while (resolved.has(nextCommit)) {
      const result = resolved.get(nextCommit);
      resolved.delete(nextCommit++);
      committed += 1;
      if (result.error || !result.detail) failuresByCode.set(result.report.code, result.error || new Error("No detail response"));
      else detailsByCode.set(result.report.code, result.detail);
      await emit();
    }
  };
  const start = (index) => {
    const report = queue[index];
    active += 1;
    Promise.resolve()
      .then(() => detailsByCode.get(report.code) || loadReportFights({
        code: report.code,
        config: { ...config, encounterId: null },
        queryFflogs,
      }))
      .then((detail) => ({ report, detail, error: null }))
      .catch((error) => ({ report, detail: null, error }))
      .then(async (result) => {
        active -= 1;
        resolved.set(index, result);
        await commitAvailable();
        pump();
        await finishIfPossible();
      });
  };
  const pump = () => {
    while (active < limit && nextStart < queue.length) start(nextStart++);
  };

  return {
    done,
    /** Add newly released summaries from this zone without duplicating codes. */
    enqueue(reports = []) {
      for (const report of sortReportsByStartTime(reports)) {
        if (reportsByCode.has(report.code)) continue;
        reportsByCode.set(report.code, report);
        queue.push(report);
      }
      pump();
      void emit();
    },
    /** Tell the queue that source pagination cannot add more reports. */
    close() {
      closed = true;
      void finishIfPossible();
    },
  };
}

/**
 * Build one selected raw encounter's bundle from already-loaded zone details.
 * Selection itself cannot perform an FFLogs request.
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
 * results commit in chronological source order for deterministic graph input.
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

/** Return the stable, source-local key for one FFLogs summary zone. */
export function zoneKeyForReport(report) {
  return `${zoneIdForReport(report) ?? "unknown"}:${zoneNameForReport(report)}`;
}

function addReportsToZones(zoneRecords, reports) {
  for (const report of reports) {
    const key = zoneKeyForReport(report);
    if (!zoneRecords.has(key)) {
      zoneRecords.set(key, {
        key,
        zoneId: zoneIdForReport(report),
        zoneName: zoneNameForReport(report),
        reportsByCode: new Map(),
      });
    }
    zoneRecords.get(key).reportsByCode.set(report.code, report);
  }
}

function serializeZones(zoneRecords) {
  return [...zoneRecords.values()].map((zone) => buildZoneView({
    key: zone.key,
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    reports: [...zone.reportsByCode.values()],
  }));
}

function buildZoneView(zone, detailsByCode = new Map(), failuresByCode = new Map(), complete = false) {
  const reports = sortReportsByStartTime(zone.reports || []);
  const fightsByEncounter = new Map();
  const reportDetails = [];
  for (const report of reports) {
    const detail = detailsByCode.get(report.code);
    if (!detail) continue;
    reportDetails.push(detail);
    for (const fight of detail.fights || []) {
      const ultimate = findUltimateVariantByEncounterId(fight.encounterId);
      if (!ultimate) continue;
      const key = String(ultimate.encounterId);
      if (!fightsByEncounter.has(key)) {
        fightsByEncounter.set(key, {
          ultimate,
          reportsByCode: new Map(),
          detailsByCode: new Map(),
        });
      }
      const group = fightsByEncounter.get(key);
      group.reportsByCode.set(report.code, report);
      group.detailsByCode.set(report.code, filterReportDetailForUltimate(detail, ultimate.encounterId));
    }
  }

  return {
    key: zone.key,
    zoneId: zone.zoneId ?? null,
    zoneName: zone.zoneName || "Unknown zone",
    reports,
    reportCount: reports.length,
    detailsLoaded: reportDetails.length,
    failedReportCount: failuresByCode.size,
    complete,
    reportDetails,
    fights: [...fightsByEncounter.values()].map((group) => {
      const groupReports = sortReportsByStartTime([...group.reportsByCode.values()]);
      return {
        ultimate: withVariantLabel(group.ultimate),
        reports: groupReports,
        candidateReports: groupReports,
        reportDetails: groupReports.map((report) => group.detailsByCode.get(report.code)).filter(Boolean),
        reportCount: groupReports.length,
        source: { kind: "report-zone", zoneId: zone.zoneId ?? null, zoneName: zone.zoneName || "Unknown zone" },
      };
    }),
  };
}

function withVariantLabel(ultimate) {
  return {
    ...ultimate,
    displayName: ultimate.expansion === "Dawntrail"
      ? ultimate.displayName
      : `${ultimate.displayName} (${ultimate.expansion})`,
  };
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

/** Read zone metadata from the app-owned summary shape without trusting it as fight identity. */
function zoneIdForReport(report) {
  return report?.zoneId ?? report?.zone?.id ?? null;
}

/** Read a displayable FFLogs zone name, retaining missing metadata as unknown. */
function zoneNameForReport(report) {
  return String(report?.zoneName ?? report?.zone?.name ?? "Unknown zone").trim() || "Unknown zone";
}

function parseDateBoundary(value, boundary) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) throw new Error("Custom date range requires YYYY-MM-DD dates");
  const suffix = boundary === "start" ? "T00:00:00.000" : "T23:59:59.999";
  const timestamp = new Date(`${value}${suffix}`).getTime();
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid custom date: ${value}`);
  return timestamp;
}
