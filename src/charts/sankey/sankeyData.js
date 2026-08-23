/**
 * Build Sankey model data from phase-time or pull-count rows.
 *
 * The progression math mirrors the reference parser:
 * - identify the first date where each phase appears
 * - bucket each raid day into the active progression window
 * - flow each progression bucket into the phases attempted during that window
 */

/**
 * Convert normalized pull rows directly into a time-based Sankey model.
 *
 * @param {object[]} pulls
 * @returns {object}
 */
export function buildTimeSankeyFromPulls(pulls = []) {
  return buildSankeyData(buildPhaseTimeRowsFromPulls(pulls), "Time");
}

/**
 * Convert normalized pull rows into a meeting-aware time Sankey model.
 *
 * Meeting time is the raid-day span minus summed pull durations for that day.
 * This matches the reference repo's "Meetings, Breaks and DCs" Sankey path.
 *
 * @param {object[]} pulls
 * @returns {object}
 */
export function buildTimeWithMeetingSankeyFromPulls(pulls = []) {
  return buildSankeyData(buildMeetingTimeRowsFromPulls(pulls), "Time");
}

/**
 * Convert normalized pull rows directly into a pull-count Sankey model.
 *
 * @param {object[]} pulls
 * @returns {object}
 */
export function buildPullSankeyFromPulls(pulls = []) {
  return buildSankeyData(buildPullCountRowsFromPulls(pulls), "Pulls");
}

/**
 * Build phase-time rows from normalized pulls.
 *
 * @param {object[]} pulls
 * @returns {object[]}
 */
export function buildPhaseTimeRowsFromPulls(pulls = []) {
  return aggregatePullsByDateAndPhase(pulls, (pull) => Number(pull.pullDurationMs || 0) / 1000);
}

/**
 * Build phase-time rows with an additional Meeting column.
 *
 * The Meeting value is not sourced from FFLogs directly. It is derived as the
 * elapsed raid-day span, from first pull start to latest pull end, minus actual
 * pull time. That preserves the reference repo's treatment of breaks, meeting
 * discussion, reconnects, and other non-pull time as one Sankey destination.
 *
 * @param {object[]} pulls
 * @returns {object[]}
 */
export function buildMeetingTimeRowsFromPulls(pulls = []) {
  const phaseRows = buildPhaseTimeRowsFromPulls(pulls);
  const raidDurationsByDate = calculateRaidDurationsByDate(pulls);

  return phaseRows.map((row) => {
    const phaseTotal = Object.entries(row)
      .filter(([key]) => key !== "Date")
      .reduce((total, [, value]) => total + Number(value || 0), 0);
    const raidDuration = raidDurationsByDate.get(row.Date) || phaseTotal;
    const meetingTime = Math.max(0, raidDuration - phaseTotal);

    return {
      Date: row.Date,
      Meeting: meetingTime,
      ...row,
    };
  });
}

/**
 * Build pull-count rows from normalized pulls.
 *
 * @param {object[]} pulls
 * @returns {object[]}
 */
export function buildPullCountRowsFromPulls(pulls = []) {
  return aggregatePullsByDateAndPhase(pulls, () => 1);
}

/**
 * Calculate raid-day span as first pull start through latest pull end.
 *
 * This intentionally measures wall-clock raid duration rather than sum of pull
 * duration so meeting-aware charts can derive non-pull time from the difference.
 *
 * @param {object[]} pulls
 * @returns {Map<string, number>}
 */
export function calculateRaidDurationsByDate(pulls = []) {
  const spansByDate = new Map();

  for (const pull of pulls || []) {
    if (!pull?.raidDate) continue;
    const start = Number(pull.pullStartTimestamp || 0);
    const end = start + Number(pull.pullDurationMs || 0);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    const span = spansByDate.get(pull.raidDate) || {
      firstStart: start,
      latestEnd: end,
    };
    span.firstStart = Math.min(span.firstStart, start);
    span.latestEnd = Math.max(span.latestEnd, end);
    spansByDate.set(pull.raidDate, span);
  }

  return new Map(
    [...spansByDate.entries()].map(([date, span]) => [
      date,
      Math.max(0, Math.round((span.latestEnd - span.firstStart) / 1000)),
    ]),
  );
}

/**
 * Build Sankey nodes and links from rows.
 *
 * @param {object[]} rows
 * @param {"Time"|"Pulls"} metricType
 * @returns {{metricType: string, phases: string[], progressionData: object[], phaseTotals: object, nodes: object[], links: object[]}}
 */
export function buildSankeyData(rows = [], metricType = "Time") {
  assertMetricType(metricType);
  if (rows.length === 0) {
    return { metricType, phases: [], progressionData: [], phaseTotals: {}, nodes: [], links: [] };
  }

  const sanitizedRows = sanitizeRows(rows, metricType);
  const phases = getPhaseColumns(sanitizedRows);
  const includeMeetings = metricType === "Time" && "Meeting" in sanitizedRows[0];
  const progressionData = calculateProgression(sanitizedRows, phases, includeMeetings);
  const phaseTotals = preparePhaseTotals(phases, progressionData, includeMeetings);
  const nodes = prepareSankeyNodes(phaseTotals, progressionData, metricType);
  const links = prepareSankeyLinks(phases, progressionData, metricType, includeMeetings);

  return { metricType, phases, progressionData, phaseTotals, nodes, links };
}

/**
 * Convert pull rows into date rows keyed by phase names.
 *
 * @param {object[]} pulls
 * @param {(pull: object) => number} valueForPull
 * @returns {object[]}
 */
function aggregatePullsByDateAndPhase(pulls, valueForPull) {
  const phaseNames = [...new Set(pulls.map((pull) => pull.endingPhaseName).filter(Boolean))];
  const rowsByDate = new Map();

  for (const pull of pulls) {
    if (!pull?.raidDate || !pull?.endingPhaseName) continue;
    if (!rowsByDate.has(pull.raidDate)) {
      rowsByDate.set(pull.raidDate, { Date: pull.raidDate });
    }
    const row = rowsByDate.get(pull.raidDate);
    row[pull.endingPhaseName] = Number(row[pull.endingPhaseName] || 0) + valueForPull(pull);
  }

  return [...rowsByDate.values()]
    .sort((left, right) => parseDateKey(left.Date) - parseDateKey(right.Date))
    .map((row) => {
      for (const phase of phaseNames) {
        row[phase] = Math.round(Number(row[phase] || 0));
      }
      return row;
    });
}

/**
 * Normalize row values to numeric seconds or pull counts.
 *
 * @param {object[]} rows
 * @param {"Time"|"Pulls"} metricType
 * @returns {object[]}
 */
function sanitizeRows(rows, metricType) {
  return rows
    .map((row) => {
      const sanitized = { Date: row.Date };
      for (const [key, value] of Object.entries(row)) {
        if (key === "Date") continue;
        sanitized[key] = metricType === "Time" ? parseDurationToSeconds(value) : parseNumeric(value);
      }
      return sanitized;
    })
    .sort((left, right) => parseDateKey(left.Date) - parseDateKey(right.Date));
}

/**
 * Determine phase columns in their source order.
 *
 * @param {object[]} rows
 * @returns {string[]}
 */
function getPhaseColumns(rows) {
  return Object.keys(rows[0] || {}).filter((key) => key !== "Date" && key !== "Meeting");
}

/**
 * Calculate phase progression breakdowns.
 *
 * @param {object[]} rows
 * @param {string[]} phases
 * @param {boolean} includeMeetings
 * @returns {object[]}
 */
function calculateProgression(rows, phases, includeMeetings) {
  const phaseStartDates = new Map(
    phases.map((phase) => {
      const firstRow = rows.find((row) => Number(row[phase] || 0) > 0);
      return [phase, firstRow ? parseDateKey(firstRow.Date) : null];
    }),
  );
  const results = [];

  phases.forEach((phase, index) => {
    const currentStart = phaseStartDates.get(phase);
    const nextStart = index + 1 < phases.length ? phaseStartDates.get(phases[index + 1]) : null;
    if (currentStart == null) return;

    const phaseRows = rows.filter((row) => {
      const rowDate = parseDateKey(row.Date);
      return rowDate >= currentStart && (nextStart == null || rowDate < nextStart);
    });
    const breakdown = Object.fromEntries(phases.map((candidate) => [candidate, 0]));

    for (const row of phaseRows) {
      for (const candidate of phases) {
        breakdown[candidate] += Number(row[candidate] || 0);
      }
      if (includeMeetings) {
        breakdown.Meeting = Number(breakdown.Meeting || 0) + Number(row.Meeting || 0);
      }
    }

    results.push({ name: `${phase} Progression`, breakdown });
  });

  return results;
}

/**
 * Prepare cumulative phase totals from progression rows.
 *
 * @param {string[]} phases
 * @param {object[]} progressionData
 * @param {boolean} includeMeetings
 * @returns {object}
 */
function preparePhaseTotals(phases, progressionData, includeMeetings) {
  const phaseTotals = Object.fromEntries(phases.map((phase) => [phase, 0]));
  if (includeMeetings) phaseTotals.Meeting = 0;

  progressionData.forEach((phaseData, index) => {
    for (const phase of phases.slice(0, index + 1)) {
      phaseTotals[phase] += Number(phaseData.breakdown[phase] || 0);
    }
    if (includeMeetings) {
      phaseTotals.Meeting += Number(phaseData.breakdown.Meeting || 0);
    }
  });

  return phaseTotals;
}

/**
 * Build Sankey node objects with reference-compatible labels.
 *
 * @param {object} phaseTotals
 * @param {object[]} progressionData
 * @param {"Time"|"Pulls"} metricType
 * @returns {object[]}
 */
function prepareSankeyNodes(phaseTotals, progressionData, metricType) {
  const totalProgressionValue = progressionData.reduce(
    (total, phaseData) => total + sumValues(phaseData.breakdown),
    0,
  );
  const totalPhaseValue = sumValues(phaseTotals);
  const totalValue = sumValues(phaseTotals);

  return [
    { id: `Total ${metricType}`, value: totalValue, label: formatLabel(totalValue, metricType) },
    ...progressionData.map((phaseData) => {
      const value = sumValues(phaseData.breakdown);
      return {
        id: phaseData.name,
        value,
        label: formatLabel(value, metricType, totalProgressionValue),
      };
    }),
    ...Object.entries(phaseTotals).map(([phase, value]) => ({
      id: phase === "Meeting" ? "Meetings, Breaks and DCs" : `${phase} Total`,
      value,
      label: formatLabel(value, metricType, totalPhaseValue),
    })),
  ];
}

/**
 * Build Sankey links with zero-value links removed.
 *
 * @param {string[]} phases
 * @param {object[]} progressionData
 * @param {"Time"|"Pulls"} metricType
 * @param {boolean} includeMeetings
 * @returns {object[]}
 */
function prepareSankeyLinks(phases, progressionData, metricType, includeMeetings) {
  const links = [];

  for (const phaseData of progressionData) {
    links.push({
      source: `Total ${metricType}`,
      target: phaseData.name,
      value: sumValues(phaseData.breakdown),
    });
  }

  phases.forEach((phase, index) => {
    const phaseData = progressionData[index];
    if (!phaseData) return;

    for (const earlierPhase of phases.slice(0, index + 1)) {
      links.push({
        source: `${phase} Progression`,
        target: `${earlierPhase} Total`,
        value: Number(phaseData.breakdown[earlierPhase] || 0),
      });
    }

    if (includeMeetings && Number(phaseData.breakdown.Meeting || 0) > 0) {
      links.push({
        source: `${phase} Progression`,
        target: "Meetings, Breaks and DCs",
        value: Number(phaseData.breakdown.Meeting || 0),
      });
    }
  });

  return links.filter((link) => link.value > 0);
}

/**
 * Parse old CSV duration strings into seconds.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function parseDurationToSeconds(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Math.round(value);

  const text = String(value).trim();
  if (text === "0") return 0;
  const parts = text.split(":").map((part) => Number(part.trim()));
  if (parts.some((part) => !Number.isFinite(part))) return 0;

  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(parts[0] || 0);
}

/**
 * Parse pull count CSV values.
 *
 * @param {unknown} value
 * @returns {number}
 */
function parseNumeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Parse YYYY/MM/DD or YYYY-MM-DD as a stable UTC day.
 *
 * @param {string} value
 * @returns {number}
 */
function parseDateKey(value) {
  const [year, month, day] = String(value || "")
    .replaceAll("-", "/")
    .split("/")
    .map(Number);
  return Date.UTC(year || 0, (month || 1) - 1, day || 1);
}

/**
 * Sum object values.
 *
 * @param {object} values
 * @returns {number}
 */
function sumValues(values) {
  return Object.values(values).reduce((total, value) => total + Number(value || 0), 0);
}

/**
 * Format a Sankey node label.
 *
 * @param {number} value
 * @param {"Time"|"Pulls"} metricType
 * @param {number|null} total
 * @returns {string}
 */
function formatLabel(value, metricType, total = null) {
  const percentage = total && total > 0 ? ` - ${((value / total) * 100).toFixed(1)}%` : "";

  if (metricType === "Time") {
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    return `${hours} hr ${String(minutes).padStart(2, "0")} min${percentage}`;
  }

  return `${value} pulls${percentage}`;
}

/**
 * Validate the selected metric.
 *
 * @param {string} metricType
 */
function assertMetricType(metricType) {
  if (!["Time", "Pulls"].includes(metricType)) {
    throw new Error("metricType must be either Time or Pulls");
  }
}
