import {
  buildMeetingTimeRowsFromPulls,
  buildPhaseTimeRowsFromPulls,
  buildPullCountRowsFromPulls,
  parseDurationToSeconds,
} from "../sankey/sankeyData.js";

/**
 * Build reference-compatible bar data for time spent by phase per raid day.
 *
 * @param {object[]} pulls
 * @returns {object}
 */
export function buildTimeBarFromPulls(pulls = []) {
  return buildBarChartData(buildPhaseTimeRowsFromPulls(pulls), {
    metricType: "Time",
    title: "Total Time by Phase",
    yLabel: "Total Time (hours)",
  });
}

/**
 * Build reference-compatible bar data for pull counts by phase per raid day.
 *
 * @param {object[]} pulls
 * @returns {object}
 */
export function buildPullBarFromPulls(pulls = []) {
  return buildBarChartData(buildPullCountRowsFromPulls(pulls), {
    metricType: "Pulls",
    title: "Pull Count by Phase",
    yLabel: "Pull Count",
  });
}

/**
 * Build reference-compatible bar data with derived meeting/break/DC time.
 *
 * @param {object[]} pulls
 * @returns {object}
 */
export function buildMeetingTimeBarFromPulls(pulls = []) {
  return buildBarChartData(buildMeetingTimeRowsFromPulls(pulls), {
    metricType: "Time",
    title: "Total Time by Phase",
    yLabel: "Total Time (hours)",
  });
}

/**
 * Convert date rows into a complete daily stacked-bar model.
 *
 * The reference bar chart fills missing calendar dates between the first and
 * last raid day with zero-height bars, so this model does the same before the
 * browser renderer draws anything.
 *
 * @param {object[]} rows
 * @param {{metricType: "Time"|"Pulls", title: string, yLabel: string}} options
 * @returns {{metricType: string, title: string, yLabel: string, series: string[], rows: object[]}}
 */
export function buildBarChartData(rows = [], options) {
  const metricType = options?.metricType || "Time";
  const sourceRows = rows
    .filter((row) => row?.Date)
    .slice()
    .sort((left, right) => parseDateKey(left.Date) - parseDateKey(right.Date));

  if (sourceRows.length === 0) {
    return {
      metricType,
      title: options?.title || "",
      yLabel: options?.yLabel || "",
      series: [],
      rows: [],
    };
  }

  const series = deriveSeries(sourceRows);
  const rowsByDate = new Map(sourceRows.map((row) => [row.Date, normalizeRow(row, series, metricType)]));
  const completeRows = enumerateDateKeys(sourceRows[0].Date, sourceRows.at(-1).Date).map((date) => {
    const row = rowsByDate.get(date) || emptyRow(date, series);
    return {
      ...row,
      DisplayDate: formatDisplayDate(date),
      Total: series.reduce((total, key) => total + Number(row[key] || 0), 0),
    };
  });

  return {
    metricType,
    title: options?.title || "",
    yLabel: options?.yLabel || "",
    series,
    rows: completeRows,
  };
}

/**
 * Keep phase order stable while forcing Meeting to the top of the stack.
 *
 * @param {object[]} rows
 * @returns {string[]}
 */
function deriveSeries(rows) {
  const keys = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key !== "Date" && !keys.includes(key)) keys.push(key);
    }
  }

  return [...keys.filter((key) => key !== "Meeting"), ...keys.filter((key) => key === "Meeting")];
}

/**
 * Normalize one source row to hours for time charts or numbers for pull charts.
 *
 * @param {object} row
 * @param {string[]} series
 * @param {"Time"|"Pulls"} metricType
 * @returns {object}
 */
function normalizeRow(row, series, metricType) {
  const normalized = { Date: row.Date };
  for (const key of series) {
    const value = row[key] ?? 0;
    normalized[key] =
      metricType === "Time" ? parseDurationToSeconds(value) / 3600 : Number(value || 0);
  }
  return normalized;
}

/**
 * Build a zero-value row for a missing calendar date.
 *
 * @param {string} date
 * @param {string[]} series
 * @returns {object}
 */
function emptyRow(date, series) {
  return {
    Date: date,
    ...Object.fromEntries(series.map((key) => [key, 0])),
  };
}

/**
 * Enumerate YYYY/MM/DD date keys inclusively.
 *
 * @param {string} startDate
 * @param {string} endDate
 * @returns {string[]}
 */
function enumerateDateKeys(startDate, endDate) {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const dates = [];

  for (let timestamp = start; timestamp <= end; timestamp += 24 * 60 * 60 * 1000) {
    dates.push(formatDateKey(new Date(timestamp)));
  }

  return dates;
}

/**
 * Parse YYYY/MM/DD as a stable UTC day timestamp.
 *
 * @param {string} value
 * @returns {number}
 */
function parseDateKey(value) {
  const [year, month, day] = String(value || "")
    .split("/")
    .map(Number);
  return Date.UTC(year || 0, (month || 1) - 1, day || 1);
}

/**
 * Format a Date as YYYY/MM/DD.
 *
 * @param {Date} date
 * @returns {string}
 */
function formatDateKey(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("/");
}

/**
 * Format a source date for compact x-axis display.
 *
 * @param {string} value
 * @returns {string}
 */
function formatDisplayDate(value) {
  const date = new Date(parseDateKey(value));
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}
