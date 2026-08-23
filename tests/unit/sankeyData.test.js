import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPullCountRowsFromPulls,
  buildPullSankeyFromPulls,
  buildMeetingTimeRowsFromPulls,
  buildSankeyData,
  buildTimeSankeyFromPulls,
  buildTimeWithMeetingSankeyFromPulls,
  calculateRaidDurationsByDate,
  parseDurationToSeconds,
} from "../../src/charts/sankey/sankeyData.js";
import { pullCsvRowsToNormalizedPulls } from "../../src/ingestion/csv/pullCsvRows.js";

// Mirrors the reference repo's pull-progression fixture so the new browser app
// remains parity-checked against the historical Sankey progression math.
const referenceRows = [
  { Date: "2024/11/26", P1: "71", P2: "0", P3: "0", P4: "0", P5: "0" },
  { Date: "2024/11/27", P1: "44", P2: "9", P3: "0", P4: "0", P5: "0" },
  { Date: "2024/11/29", P1: "51", P2: "14", P3: "0", P4: "0", P5: "0" },
  { Date: "2024/11/30", P1: "34", P2: "34", P3: "0", P4: "0", P5: "0" },
  { Date: "2024/12/03", P1: "23", P2: "20", P3: "0", P4: "0", P5: "0" },
  { Date: "2024/12/04", P1: "8", P2: "21", P3: "0", P4: "0", P5: "0" },
  { Date: "2024/12/05", P1: "10", P2: "14", P3: "4", P4: "0", P5: "0" },
  { Date: "2024/12/07", P1: "13", P2: "18", P3: "13", P4: "0", P5: "0" },
  { Date: "2024/12/09", P1: "4", P2: "11", P3: "5", P4: "0", P5: "0" },
  { Date: "2024/12/10", P1: "3", P2: "6", P3: "10", P4: "0", P5: "0" },
  { Date: "2024/12/12", P1: "1", P2: "7", P3: "10", P4: "0", P5: "0" },
  { Date: "2024/12/14", P1: "5", P2: "8", P3: "17", P4: "0", P5: "0" },
  { Date: "2024/12/17", P1: "3", P2: "4", P3: "9", P4: "2", P5: "0" },
  { Date: "2024/12/18", P1: "2", P2: "3", P3: "5", P4: "4", P5: "0" },
  { Date: "2024/12/19", P1: "2", P2: "5", P3: "6", P4: "5", P5: "0" },
  { Date: "2024/12/20", P1: "1", P2: "4", P3: "0", P4: "14", P5: "0" },
  { Date: "2024/12/21", P1: "5", P2: "4", P3: "5", P4: "6", P5: "0" },
  { Date: "2024/12/22", P1: "6", P2: "4", P3: "5", P4: "4", P5: "0" },
  { Date: "2024/12/28", P1: "3", P2: "5", P3: "6", P4: "5", P5: "0" },
  { Date: "2024/12/30", P1: "3", P2: "4", P3: "6", P4: "7", P5: "0" },
  { Date: "2025/01/01", P1: "6", P2: "3", P3: "4", P4: "8", P5: "1" },
  { Date: "2025/01/03", P1: "1", P2: "6", P3: "3", P4: "3", P5: "2" },
  { Date: "2025/01/05", P1: "3", P2: "3", P3: "2", P4: "9", P5: "2" },
  { Date: "2025/01/06", P1: "0", P2: "3", P3: "3", P4: "4", P5: "2" },
  { Date: "2025/01/07", P1: "1", P2: "4", P3: "0", P4: "5", P5: "3" },
  { Date: "2025/01/08", P1: "1", P2: "6", P3: "0", P4: "1", P5: "3" },
  { Date: "2025/01/09", P1: "0", P2: "1", P3: "0", P4: "3", P5: "5" },
  { Date: "2025/01/10", P1: "1", P2: "1", P3: "1", P4: "0", P5: "2" },
];

test("buildSankeyData matches reference pull progression nodes", () => {
  const sankey = buildSankeyData(referenceRows, "Pulls");

  // This guards the core reference behavior: each progression bucket starts on
  // the first date where that phase appears, and total links preserve that split.
  assert.deepEqual(
    sankey.nodes.slice(0, 6),
    [
      { id: "Total Pulls", value: 741, label: "741 pulls" },
      { id: "P1 Progression", value: 71, label: "71 pulls - 9.6%" },
      { id: "P2 Progression", value: 258, label: "258 pulls - 34.8%" },
      { id: "P3 Progression", value: 159, label: "159 pulls - 21.5%" },
      { id: "P4 Progression", value: 147, label: "147 pulls - 19.8%" },
      { id: "P5 Progression", value: 106, label: "106 pulls - 14.3%" },
    ],
  );
  assert.deepEqual(sankey.links.slice(0, 5), [
    { source: "Total Pulls", target: "P1 Progression", value: 71 },
    { source: "Total Pulls", target: "P2 Progression", value: 258 },
    { source: "Total Pulls", target: "P3 Progression", value: 159 },
    { source: "Total Pulls", target: "P4 Progression", value: 147 },
    { source: "Total Pulls", target: "P5 Progression", value: 106 },
  ]);
});

test("buildPullCountRowsFromPulls aggregates direct normalized pulls", () => {
  const rows = buildPullCountRowsFromPulls([
    { raidDate: "2026/06/02", endingPhaseName: "P1", pullDurationMs: 10_000 },
    { raidDate: "2026/06/02", endingPhaseName: "P1", pullDurationMs: 20_000 },
    { raidDate: "2026/06/02", endingPhaseName: "P2", pullDurationMs: 30_000 },
  ]);

  assert.deepEqual(rows, [{ Date: "2026/06/02", P1: 2, P2: 1 }]);
});

test("buildTimeSankeyFromPulls and buildPullSankeyFromPulls return graph models", () => {
  const pulls = [
    { raidDate: "2026/06/02", endingPhaseName: "P1", pullDurationMs: 10_000 },
    { raidDate: "2026/06/03", endingPhaseName: "P2", pullDurationMs: 20_000 },
  ];

  assert.equal(buildTimeSankeyFromPulls(pulls).metricType, "Time");
  assert.equal(buildPullSankeyFromPulls(pulls).metricType, "Pulls");
});

test("buildMeetingTimeRowsFromPulls adds meeting time from raid-day span", () => {
  // Two one-minute pulls across a four-minute raid span should leave two minutes
  // of meeting/break/DC time for the extra Sankey path.
  const pulls = [
    {
      raidDate: "2026/06/02",
      endingPhaseName: "P1",
      pullStartTimestamp: Date.UTC(2026, 5, 2, 20, 0),
      pullDurationMs: 60_000,
    },
    {
      raidDate: "2026/06/02",
      endingPhaseName: "P2",
      pullStartTimestamp: Date.UTC(2026, 5, 2, 20, 3),
      pullDurationMs: 60_000,
    },
  ];

  assert.deepEqual(buildMeetingTimeRowsFromPulls(pulls), [
    { Date: "2026/06/02", Meeting: 120, P1: 60, P2: 60 },
  ]);
  assert.deepEqual([...calculateRaidDurationsByDate(pulls)], [["2026/06/02", 240]]);
});

test("buildTimeWithMeetingSankeyFromPulls includes meeting node and link", () => {
  // Same-day phase transitions can still route the derived non-pull time into
  // the meeting node even when an earlier phase progression window is empty.
  const sankey = buildTimeWithMeetingSankeyFromPulls([
    {
      raidDate: "2026/06/02",
      endingPhaseName: "P1",
      pullStartTimestamp: Date.UTC(2026, 5, 2, 20, 0),
      pullDurationMs: 60_000,
    },
    {
      raidDate: "2026/06/02",
      endingPhaseName: "P2",
      pullStartTimestamp: Date.UTC(2026, 5, 2, 20, 3),
      pullDurationMs: 60_000,
    },
  ]);

  assert.ok(sankey.nodes.some((node) => node.id === "Meetings, Breaks and DCs"));
  assert.ok(sankey.links.some((link) => link.target === "Meetings, Breaks and DCs"));
});

test("pullCsvRowsToNormalizedPulls converts development fixture rows", () => {
  const pulls = pullCsvRowsToNormalizedPulls([
    {
      Date: "2026/06/02",
      "Boss HP Percentage": "66.29",
      Phase: "P1: Kefka",
      "Pull Duration": "2:02",
      "Pull Number": "1",
      "Pull Start Time": "20:51",
    },
  ]);

  assert.equal(pulls[0].endingPhaseName, "P1: Kefka");
  assert.equal(pulls[0].pullDurationMs, 122_000);
  assert.equal(pulls[0].bossHpPercentage, 66.29);
});

test("parseDurationToSeconds supports m:ss and h:mm:ss", () => {
  assert.equal(parseDurationToSeconds("2:02"), 122);
  assert.equal(parseDurationToSeconds("1:02:05"), 3725);
});
