import { parseDurationToSeconds } from "../../charts/sankey/sankeyData.js";

/**
 * Convert old pull-data CSV rows into normalized pull-like rows.
 *
 * This is for development fixtures only. The production app should feed Sankey
 * charts from normalized FFLogs pull rows directly.
 *
 * @param {object[]} rows
 * @returns {object[]}
 */
export function pullCsvRowsToNormalizedPulls(rows = []) {
  return rows.map((row, index) => {
    const durationMs = parseDurationToSeconds(row["Pull Duration"]) * 1000;
    return {
      reportCode: "csv-fixture",
      reportTitle: "CSV Fixture",
      raidDate: row.Date,
      pullNumber: Number(row["Pull Number"] || index + 1),
      fightId: index + 1,
      encounterId: null,
      pullStartTimestamp: parseDateTime(row.Date, row["Pull Start Time"]),
      pullStartDisplayTime: row["Pull Start Time"],
      pullDurationMs: durationMs,
      bossHpPercentage: row["Boss HP Percentage"] === "" ? null : Number(row["Boss HP Percentage"]),
      kill: Number(row["Boss HP Percentage"]) === 0,
      endingPhaseId: null,
      endingPhaseName: row.Phase || null,
      phaseTransitions: [],
      participatingPlayerIds: [],
    };
  });
}

/**
 * Parse old CSV date and HH:MM time into a UTC timestamp for stable sorting.
 *
 * @param {string} date
 * @param {string} time
 * @returns {number}
 */
function parseDateTime(date, time) {
  const [year, month, day] = String(date || "")
    .split("/")
    .map(Number);
  const [hour, minute] = String(time || "00:00")
    .split(":")
    .map(Number);

  return Date.UTC(year || 0, (month || 1) - 1, day || 1, hour || 0, minute || 0);
}
