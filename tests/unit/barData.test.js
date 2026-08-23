import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBarChartData,
  buildMeetingTimeBarFromPulls,
  buildPullBarFromPulls,
  buildTimeBarFromPulls,
} from "../../src/charts/bar/barData.js";

// These tests protect the reference bar-chart behavior separately from SVG
// rendering: daily zero-fill, hour conversion, pull counts, and meeting stack
// ordering are all data concerns that should not depend on the browser.

test("buildBarChartData fills missing dates with zero rows", () => {
  const chart = buildBarChartData(
    [
      { Date: "2026/06/01", P1: 2 },
      { Date: "2026/06/03", P1: 4 },
    ],
    { metricType: "Pulls", title: "Pull Count by Phase", yLabel: "Pull Count" },
  );

  assert.deepEqual(
    chart.rows.map((row) => ({ Date: row.Date, DisplayDate: row.DisplayDate, P1: row.P1, Total: row.Total })),
    [
      { Date: "2026/06/01", DisplayDate: "6/1", P1: 2, Total: 2 },
      { Date: "2026/06/02", DisplayDate: "6/2", P1: 0, Total: 0 },
      { Date: "2026/06/03", DisplayDate: "6/3", P1: 4, Total: 4 },
    ],
  );
});

test("buildTimeBarFromPulls converts pull durations to hours by phase and date", () => {
  const chart = buildTimeBarFromPulls([
    { raidDate: "2026/06/01", endingPhaseName: "P1", pullDurationMs: 1_800_000 },
    { raidDate: "2026/06/01", endingPhaseName: "P2", pullDurationMs: 900_000 },
  ]);

  assert.equal(chart.metricType, "Time");
  assert.equal(chart.yLabel, "Total Time (hours)");
  assert.deepEqual(chart.series, ["P1", "P2"]);
  assert.equal(chart.rows[0].P1, 0.5);
  assert.equal(chart.rows[0].P2, 0.25);
  assert.equal(chart.rows[0].Total, 0.75);
});

test("buildPullBarFromPulls counts pulls by phase and date", () => {
  const chart = buildPullBarFromPulls([
    { raidDate: "2026/06/01", endingPhaseName: "P1", pullDurationMs: 60_000 },
    { raidDate: "2026/06/01", endingPhaseName: "P1", pullDurationMs: 60_000 },
    { raidDate: "2026/06/01", endingPhaseName: "P2", pullDurationMs: 60_000 },
  ]);

  assert.equal(chart.metricType, "Pulls");
  assert.deepEqual(chart.rows[0], {
    Date: "2026/06/01",
    P1: 2,
    P2: 1,
    DisplayDate: "6/1",
    Total: 3,
  });
});

test("buildMeetingTimeBarFromPulls stacks Meeting after phase series", () => {
  const chart = buildMeetingTimeBarFromPulls([
    {
      raidDate: "2026/06/01",
      endingPhaseName: "P1",
      pullStartTimestamp: Date.UTC(2026, 5, 1, 20, 0),
      pullDurationMs: 60_000,
    },
    {
      raidDate: "2026/06/01",
      endingPhaseName: "P2",
      pullStartTimestamp: Date.UTC(2026, 5, 1, 20, 3),
      pullDurationMs: 60_000,
    },
  ]);

  assert.deepEqual(chart.series, ["P1", "P2", "Meeting"]);
  assert.equal(chart.rows[0].P1, 1 / 60);
  assert.equal(chart.rows[0].P2, 1 / 60);
  assert.equal(chart.rows[0].Meeting, 2 / 60);
  assert.equal(chart.rows[0].Total, 4 / 60);
});
