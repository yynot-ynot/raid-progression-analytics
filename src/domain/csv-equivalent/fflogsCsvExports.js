/**
 * CSV headers matching the old parser's consolidated pull-data output.
 */
export const PULL_DATA_HEADERS = [
  "Date",
  "Boss HP Percentage",
  "Phase",
  "Pull Duration",
  "Pull Number",
  "Pull Start Time",
];

/**
 * Build all development CSV exports from a loaded Ultimate data bundle.
 *
 * @param {object} bundle
 * @returns {{pullData: string, phaseTimes: string, meetingTimes: string, reports: string, players: string, phases: string}}
 */
export function buildFflogsCsvExports(bundle = {}) {
  return {
    pullData: buildPullDataCsv(bundle.pulls || []),
    phaseTimes: buildPhaseTimesCsv(bundle.pulls || [], bundle.phases || []),
    meetingTimes: buildMeetingTimesCsv(bundle.pulls || [], bundle.phases || []),
    reports: buildReportsCsv(bundle.reports || []),
    players: buildPlayersCsv(bundle.players || []),
    phases: buildPhasesCsv(bundle.phases || []),
  };
}

/**
 * Build the CSV-equivalent pull data used by the old graph pipeline.
 *
 * @param {object[]} pulls
 * @returns {string}
 */
export function buildPullDataCsv(pulls = []) {
  const rows = sortPulls(pulls).map((pull) => ({
    Date: pull.raidDate,
    "Boss HP Percentage": formatNullable(pull.bossHpPercentage),
    Phase: pull.endingPhaseName ?? "",
    "Pull Duration": formatDuration(pull.pullDurationMs),
    "Pull Number": pull.pullNumber,
    "Pull Start Time": pull.pullStartDisplayTime,
  }));

  return toCsv(PULL_DATA_HEADERS, rows);
}

/**
 * Build the phase-time CSV equivalent by summing pull durations by end phase.
 *
 * This preserves the old parser semantics: a pull contributes its full duration
 * to the phase where that pull ended, not to a timeline segment split by phase.
 *
 * @param {object[]} pulls
 * @param {object[]} phases
 * @returns {string}
 */
export function buildPhaseTimesCsv(pulls = [], phases = []) {
  const { phaseNames, totalsByDate } = buildPhaseTimeTotals(pulls, phases);

  const rows = [...totalsByDate.entries()]
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([date, totals]) => {
      const row = { Date: date };
      for (const phase of phaseNames) {
        row[phase] = formatDuration(totals[phase] || 0);
      }
      return row;
    });

  return toCsv(["Date", ...phaseNames], rows);
}

/**
 * Build the meeting-time CSV equivalent used by the reference meeting charts.
 *
 * Meeting time is the full raid-day span minus summed pull durations.
 *
 * @param {object[]} pulls
 * @param {object[]} phases
 * @returns {string}
 */
export function buildMeetingTimesCsv(pulls = [], phases = []) {
  const { phaseNames, totalsByDate } = buildPhaseTimeTotals(pulls, phases);
  const raidDurationsByDate = calculateRaidDurationMsByDate(pulls);

  const rows = [...totalsByDate.entries()]
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([date, totals]) => {
      const phaseTotal = phaseNames.reduce((total, phase) => total + Number(totals[phase] || 0), 0);
      const raidDuration = raidDurationsByDate.get(date) ?? phaseTotal;
      const row = {
        Date: date,
        Meeting: formatDuration(Math.max(0, raidDuration - phaseTotal)),
      };
      for (const phase of phaseNames) {
        row[phase] = formatDuration(totals[phase] || 0);
      }
      return row;
    });

  return toCsv(["Date", "Meeting", ...phaseNames], rows);
}

/**
 * Build phase-duration totals by date.
 *
 * @param {object[]} pulls
 * @param {object[]} phases
 * @returns {{phaseNames: string[], totalsByDate: Map<string, object>}}
 */
function buildPhaseTimeTotals(pulls = [], phases = []) {
  const phaseNames = derivePhaseColumns(pulls, phases);
  const totalsByDate = new Map();

  for (const pull of pulls) {
    if (!pull?.raidDate) continue;
    const phase = pull.endingPhaseName || "Unknown";
    if (!phaseNames.includes(phase)) phaseNames.push(phase);
    if (!totalsByDate.has(pull.raidDate)) {
      totalsByDate.set(pull.raidDate, Object.fromEntries(phaseNames.map((name) => [name, 0])));
    }
    const row = totalsByDate.get(pull.raidDate);
    row[phase] = (row[phase] || 0) + Number(pull.pullDurationMs || 0);
  }

  return { phaseNames, totalsByDate };
}

/**
 * Build a report-summary debug CSV.
 *
 * @param {object[]} reports
 * @returns {string}
 */
export function buildReportsCsv(reports = []) {
  const headers = [
    "Code",
    "Title",
    "Start Time",
    "End Time",
    "Visibility",
    "Zone ID",
    "Zone Name",
    "Owner",
  ];
  const rows = reports.map((report) => ({
    Code: report.code,
    Title: report.title,
    "Start Time": report.startTime,
    "End Time": report.endTime,
    Visibility: report.visibility,
    "Zone ID": report.zone?.id,
    "Zone Name": report.zone?.name,
    Owner: report.owner?.name,
  }));

  return toCsv(headers, rows);
}

/**
 * Build a player debug CSV.
 *
 * @param {object[]} players
 * @returns {string}
 */
export function buildPlayersCsv(players = []) {
  const headers = ["ID", "Name", "Server", "Type", "Job", "Jobs"];
  const rows = players.map((player) => ({
    ID: player.id,
    Name: player.name,
    Server: player.server,
    Type: player.type,
    Job: player.job,
    Jobs: (player.jobs || []).join(";"),
  }));

  return toCsv(headers, rows);
}

/**
 * Build a phase metadata debug CSV.
 *
 * @param {object[]} phases
 * @returns {string}
 */
export function buildPhasesCsv(phases = []) {
  const headers = ["Encounter ID", "Phase ID", "Name", "Intermission"];
  const rows = phases.map((phase) => ({
    "Encounter ID": phase.encounterId,
    "Phase ID": phase.id,
    Name: phase.name,
    Intermission: phase.isIntermission,
  }));

  return toCsv(headers, rows);
}

/**
 * Convert headers and row objects into RFC-compatible CSV text.
 *
 * @param {string[]} headers
 * @param {object[]} rows
 * @returns {string}
 */
export function toCsv(headers, rows) {
  const lines = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * Escape one scalar for CSV.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeCsvValue(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Sort pulls the way the old CSV pipeline expects: date, then start timestamp.
 *
 * @param {object[]} pulls
 * @returns {object[]}
 */
function sortPulls(pulls) {
  return pulls
    .slice()
    .sort((left, right) => {
      const dateCompare = String(left.raidDate || "").localeCompare(String(right.raidDate || ""));
      if (dateCompare) return dateCompare;
      return Number(left.pullStartTimestamp || 0) - Number(right.pullStartTimestamp || 0);
    });
}

/**
 * Calculate full raid-day spans in milliseconds.
 *
 * @param {object[]} pulls
 * @returns {Map<string, number>}
 */
function calculateRaidDurationMsByDate(pulls = []) {
  const spansByDate = new Map();

  for (const pull of pulls || []) {
    if (!pull?.raidDate) continue;
    const start = Number(pull.pullStartTimestamp || 0);
    const end = start + Number(pull.pullDurationMs || 0);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    const span = spansByDate.get(pull.raidDate) || { firstStart: start, latestEnd: end };
    span.firstStart = Math.min(span.firstStart, start);
    span.latestEnd = Math.max(span.latestEnd, end);
    spansByDate.set(pull.raidDate, span);
  }

  return new Map(
    [...spansByDate.entries()].map(([date, span]) => [
      date,
      Math.max(0, span.latestEnd - span.firstStart),
    ]),
  );
}

/**
 * Derive stable phase columns from phase metadata, falling back to observed pulls.
 *
 * @param {object[]} pulls
 * @param {object[]} phases
 * @returns {string[]}
 */
function derivePhaseColumns(pulls, phases) {
  const names = phases
    .slice()
    .sort((left, right) => Number(left.id || 0) - Number(right.id || 0))
    .map((phase) => phase.name)
    .filter(Boolean);

  if (names.length > 0) return [...new Set(names)];

  return [...new Set(pulls.map((pull) => pull.endingPhaseName).filter(Boolean))].sort();
}

/**
 * Format milliseconds as the old CSV duration string, e.g. `43:22` or `1:08:29`.
 *
 * @param {number|null|undefined} durationMs
 * @returns {string}
 */
export function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.round(Number(durationMs || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Convert nullish values to empty strings while preserving numeric zero.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function formatNullable(value) {
  return value == null ? "" : value;
}
