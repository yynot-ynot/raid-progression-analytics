import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFflogsCsvExports,
  buildMeetingTimesCsv,
  buildPhaseTimesCsv,
  buildPullDataCsv,
  formatDuration,
  toCsv,
} from "../../src/domain/csv-equivalent/fflogsCsvExports.js";

// This fixture intentionally covers out-of-order pulls, multiple raid days,
// zero boss HP for a kill, and h:mm:ss formatting for old-parser-compatible CSVs.
const pulls = [
  {
    reportCode: "R2",
    reportTitle: "Dancing Mad",
    raidDate: "2026/08/18",
    pullNumber: 2,
    fightId: 12,
    encounterId: 1085,
    pullStartTimestamp: 2_000,
    pullStartDisplayTime: "20:04",
    pullDurationMs: 185_000,
    bossHpPercentage: 60,
    kill: false,
    endingPhaseId: 2,
    endingPhaseName: "P2",
  },
  {
    reportCode: "R1",
    reportTitle: "Dancing Mad",
    raidDate: "2026/08/18",
    pullNumber: 1,
    fightId: 11,
    encounterId: 1085,
    pullStartTimestamp: 1_000,
    pullStartDisplayTime: "20:00",
    pullDurationMs: 44_000,
    bossHpPercentage: 57,
    kill: false,
    endingPhaseId: 1,
    endingPhaseName: "P1",
  },
  {
    reportCode: "R3",
    reportTitle: "Dancing Mad",
    raidDate: "2026/08/19",
    pullNumber: 1,
    fightId: 21,
    encounterId: 1085,
    pullStartTimestamp: 3_000,
    pullStartDisplayTime: "21:00",
    pullDurationMs: 3_725_000,
    bossHpPercentage: 0,
    kill: true,
    endingPhaseId: 5,
    endingPhaseName: "P5",
  },
];

test("buildPullDataCsv exports old-parser pull data columns in sorted order", () => {
  assert.equal(
    buildPullDataCsv(pulls),
    [
      "Date,Boss HP Percentage,Phase,Pull Duration,Pull Number,Pull Start Time",
      "2026/08/18,57,P1,0:44,1,20:00",
      "2026/08/18,60,P2,3:05,2,20:04",
      "2026/08/19,0,P5,1:02:05,1,21:00",
      "",
    ].join("\n"),
  );
});

test("buildPhaseTimesCsv sums pull durations by date and ending phase", () => {
  assert.equal(
    buildPhaseTimesCsv(pulls, [
      { id: 1, name: "P1" },
      { id: 2, name: "P2" },
      { id: 5, name: "P5" },
    ]),
    [
      "Date,P1,P2,P5",
      "2026/08/18,0:44,3:05,0:00",
      "2026/08/19,0:00,0:00,1:02:05",
      "",
    ].join("\n"),
  );
});

test("buildMeetingTimesCsv adds reference-style meeting time from raid-day span", () => {
  // Meeting CSV should match the reference chart input: wall-clock day span minus
  // summed pull time, with the derived value placed before phase columns.
  assert.equal(
    buildMeetingTimesCsv(
      [
        {
          raidDate: "2026/08/18",
          endingPhaseName: "P1",
          pullStartTimestamp: 1_000,
          pullDurationMs: 60_000,
        },
        {
          raidDate: "2026/08/18",
          endingPhaseName: "P2",
          pullStartTimestamp: 181_000,
          pullDurationMs: 60_000,
        },
      ],
      [
        { id: 1, name: "P1" },
        { id: 2, name: "P2" },
      ],
    ),
    ["Date,Meeting,P1,P2", "2026/08/18,2:00,1:00,1:00", ""].join("\n"),
  );
});

test("buildFflogsCsvExports includes pull, phase, and debug CSVs", () => {
  const exports = buildFflogsCsvExports({
    pulls,
    phases: [{ encounterId: 1085, id: 1, name: "P1", isIntermission: false }],
    reports: [{ code: "R1", title: "Dancing Mad", zone: { id: 76, name: "Dancing Mad" } }],
    players: [{ id: 1, name: "Player", server: "Cactuar", type: "Player", job: "Paladin", jobs: ["Paladin"] }],
  });

  assert.ok(exports.pullData.startsWith("Date,Boss HP Percentage,Phase"));
  assert.ok(exports.phaseTimes.startsWith("Date,P1"));
  assert.ok(exports.meetingTimes.startsWith("Date,Meeting,P1"));
  assert.ok(exports.reports.startsWith("Code,Title"));
  assert.ok(exports.players.startsWith("ID,Name"));
  assert.ok(exports.phases.startsWith("Encounter ID,Phase ID"));
});

test("toCsv quotes commas, quotes, and line breaks", () => {
  assert.equal(
    toCsv(["Name", "Note"], [{ Name: 'A "quoted" value', Note: "line\nbreak, comma" }]),
    'Name,Note\n"A ""quoted"" value","line\nbreak, comma"\n',
  );
});

test("formatDuration handles minute and hour durations", () => {
  assert.equal(formatDuration(185_000), "3:05");
  assert.equal(formatDuration(3_725_000), "1:02:05");
});
