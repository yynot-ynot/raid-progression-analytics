/**
 * Create the app-owned summary shape for an FFLogs report.
 *
 * @param {object} report
 * @returns {object}
 */
export function createRaidReportSummary(report = {}) {
  return {
    code: report.code,
    title: report.title ?? null,
    startTime: report.startTime ?? null,
    endTime: report.endTime ?? null,
    visibility: report.visibility ?? "unknown",
    revision: report.revision ?? null,
    segments: report.segments ?? null,
    exportedSegments: report.exportedSegments ?? null,
    archiveStatus: report.archiveStatus ?? null,
    region: report.region ?? null,
    zone: report.zone ?? null,
    owner: report.owner ?? null,
    guild: report.guild ?? null,
    guildTag: report.guildTag ?? null,
  };
}
