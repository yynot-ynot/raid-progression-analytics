import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ULTIMATE_ENCOUNTERS } from "../../src/config/ultimateEncounters.js";
import {
  buildWorkflowDateRange,
  buildWorkflowSourceConfig,
  discoverAvailableUltimates,
  filterReportDetailForUltimate,
  loadReportDetailsWithConcurrency,
  loadUltimateRaidData,
} from "../../src/fflogs/static-data/ultimateWorkflow.js";

const reportStart = Date.UTC(2026, 0, 10, 4, 0, 0);
const topZone53Fixture = JSON.parse(
  readFileSync(new URL("../fixtures/fflogs/the-beam-top-zone-53.json", import.meta.url), "utf8"),
);

// Query stubs make the workflow tests cover source parsing, report discovery,
// ambiguous Ultimate confirmation, and data loading without requiring live OAuth.
function createQueryStub(handlers) {
  const calls = [];
  const stub = async ({ query, variables = {} }) => {
    calls.push({ query, variables });
    const handler = handlers.find((candidate) => query.includes(candidate.match));
    if (!handler) throw new Error(`Unhandled query: ${query}`);
    return handler.response({ query, variables, callIndex: calls.length - 1 });
  };
  stub.calls = calls;
  return stub;
}

function reportPagePayload(reports) {
  return {
    reportData: {
      reports: {
        data: reports,
        total: reports.length,
        per_page: reports.length || 1,
        current_page: 1,
        last_page: 1,
        has_more_pages: false,
      },
    },
  };
}

function reportSummary({ code, zoneId, zoneName = null, title = code, startTime = reportStart }) {
  return {
    code,
    title,
    startTime,
    endTime: startTime + 600_000,
    visibility: "private",
    zone: { id: zoneId, name: zoneName ?? title },
  };
}

function reportDetailPayload({ code, encounterIds, fights = null, startTime = reportStart }) {
  const mappedFights =
    fights ||
    encounterIds.map((encounterID, index) => ({
      id: index + 1,
      name: `Encounter ${encounterID}`,
      encounterID,
      originalEncounterID: encounterID,
      difficulty: 100,
      kill: false,
      startTime: index * 200_000,
      endTime: index * 200_000 + 180_000,
      bossPercentage: 50,
      fightPercentage: 50,
      lastPhase: 1,
      phaseTransitions: [{ id: 1, startTime: 0 }],
      friendlyPlayers: [10],
    }));

  return {
    reportData: {
      report: {
        code,
        title: code,
        startTime,
        endTime: startTime + 600_000,
        visibility: "private",
        fights: mappedFights,
        masterData: {
          actors: [{ id: 10, name: "Player", server: "Cactuar", type: "Player", subType: "Paladin" }],
        },
        phases: [...new Set(mappedFights.map((fight) => fight.encounterID))].map((encounterID) => ({
          encounterID,
          phases: [{ id: 1, name: "P1", isIntermission: false }],
        })),
      },
    },
  };
}

/** Create a compact mapped FFLogs fight fixture for progression-set tests. */
function fightFixture({ encounterID = 1077, kill = false }) {
  return {
    id: 1,
    name: `Encounter ${encounterID}`,
    encounterID,
    originalEncounterID: encounterID,
    difficulty: 100,
    kill,
    startTime: 0,
    endTime: 180_000,
    bossPercentage: kill ? 0.01 : 50,
    fightPercentage: kill ? 0.01 : 50,
    lastPhase: 1,
    phaseTransitions: [{ id: 1, startTime: 0 }],
    friendlyPlayers: [10],
  };
}

test("buildWorkflowSourceConfig parses source URL and preset date range", () => {
  const now = Date.UTC(2026, 7, 20);
  const config = buildWorkflowSourceConfig({
    sourceUrl: "https://www.fflogs.com/guild/reports-list/112977",
    timeFrame: { preset: "past-6-months" },
    nowMs: now,
  });

  assert.equal(config.sourceType, "static");
  assert.equal(config.guildId, 112977);
  assert.equal(config.startTime, now - 183 * 24 * 60 * 60 * 1000);
  assert.equal(config.endTime, now);
});

test("buildWorkflowSourceConfig defaults to all available FFLogs history", () => {
  const config = buildWorkflowSourceConfig({
    sourceUrl: "https://www.fflogs.com/guild/reports-list/112977",
  });

  assert.equal(config.startTime, null);
  assert.equal(config.endTime, null);
});

test("buildWorkflowDateRange supports custom date boundaries", () => {
  const range = buildWorkflowDateRange({
    preset: "custom",
    startDate: "2026-01-01",
    endDate: "2026-01-02",
  });

  assert.ok(range.startTime < range.endTime);
  assert.throws(
    () => buildWorkflowDateRange({ preset: "custom", startDate: "2026-01-02", endDate: "2026-01-01" }),
    /start must be before end/,
  );
});

test("discoverAvailableUltimates classifies every report from fight IDs, not zones", async () => {
  const reports = [
    reportSummary({ code: "LEGACY", zoneId: 59, zoneName: "Ultimates (Legacy)", title: "Legacy Ultimate Zone" }),
    reportSummary({ code: "FRU", zoneId: 65, title: "Futures Rewritten" }),
  ];
  const queryFflogs = createQueryStub([
    { match: "RaidTeamReports", response: () => reportPagePayload(reports) },
    {
      match: "ReportFights",
      response: ({ variables }) =>
        reportDetailPayload({ code: variables.code, encounterIds: [1074] }),
    },
  ]);

  const discovery = await discoverAvailableUltimates({
    config: { guildId: 112977 },
    queryFflogs,
  });

  assert.deepEqual(
    discovery.ultimates.map((group) => group.ultimate.slug),
    ["uwu"],
  );
  assert.equal(discovery.ultimates[0].confirmed, true);
  assert.equal(discovery.ultimates[0].exactConfirmationRequired, true);
  assert.equal(discovery.ultimates[0].reportCount, 2);
  assert.equal(discovery.pagination.lastPage, 1);
  assert.equal(discovery.pagesFetched, 1);
});

test("discoverAvailableUltimates keeps separate legacy Ultimate encounters", async () => {
  const reports = [
    reportSummary({ code: "TOP_REPORT", zoneId: 59, zoneName: "Ultimates (Legacy)", title: "The Omega Protocol" }),
    reportSummary({ code: "UWU_REPORT", zoneId: 59, zoneName: "Ultimates (Legacy)", title: "The Weapon's Refrain" }),
  ];
  const queryFflogs = createQueryStub([
    { match: "RaidTeamReports", response: () => reportPagePayload(reports) },
    {
      match: "ReportFights",
      response: ({ variables }) => {
        const encounterIdsByCode = {
          TOP_REPORT: [1077],
          UWU_REPORT: [1074],
        };
        return reportDetailPayload({
          code: variables.code,
          encounterIds: encounterIdsByCode[variables.code],
        });
      },
    },
  ]);

  const discovery = await discoverAvailableUltimates({
    config: { guildId: 112977 },
    queryFflogs,
  });

  assert.deepEqual(
    discovery.ultimates.map((group) => [group.ultimate.slug, group.reports.map((report) => report.code)]),
    [
      ["uwu", ["UWU_REPORT"]],
      ["top", ["TOP_REPORT"]],
    ],
  );
  assert.equal(discovery.ultimates.some((group) => group.ultimate.slug === "legacy"), false);
});

test("discoverAvailableUltimates combines zones only when their raw encounter ID is the same", async () => {
  const reports = [
    reportSummary({
      code: "DIRECT_TOP",
      zoneId: 53,
      zoneName: "The Omega Protocol",
      title: "Untrusted report title",
      startTime: Date.UTC(2023, 0, 25),
    }),
    reportSummary({
      code: "SHARED_LEGACY_TOP",
      zoneId: 59,
      zoneName: "Ultimates (Legacy)",
      title: "Untrusted report title",
      startTime: Date.UTC(2024, 7, 22),
    }),
  ];
  const queryFflogs = createQueryStub([
    { match: "RaidTeamReports", response: () => reportPagePayload(reports) },
    {
      match: "ReportFights",
      response: ({ variables }) => reportDetailPayload({ code: variables.code, encounterIds: [1077] }),
    },
  ]);

  const discovery = await discoverAvailableUltimates({ config: { guildId: 112977 }, queryFflogs });
  const topGroups = discovery.ultimates.filter((group) => group.ultimate.slug === "top");

  assert.equal(topGroups.length, 1);
  assert.deepEqual(topGroups[0].reports.map((report) => report.code), ["DIRECT_TOP", "SHARED_LEGACY_TOP"]);
});

test("discoverAvailableUltimates confirms legacy reports beyond the old newest-first cap", async () => {
  const reports = Array.from({ length: 101 }, (_, index) =>
    reportSummary({
      code: `TOP_${index + 1}`,
      zoneId: 59,
      zoneName: "Ultimates (Legacy)",
      title: "The Omega Protocol",
      startTime: reportStart + index * 1_000,
    }),
  );
  const queryFflogs = createQueryStub([
    { match: "RaidTeamReports", response: () => reportPagePayload(reports) },
    {
      match: "ReportFights",
      response: ({ variables }) => reportDetailPayload({ code: variables.code, encounterIds: [1077] }),
    },
  ]);

  const discovery = await discoverAvailableUltimates({
    config: { guildId: 112977 },
    queryFflogs,
  });
  const top = discovery.ultimates.find((group) => group.ultimate.slug === "top");
  const confirmedCodes = queryFflogs.calls
    .filter((call) => call.query.includes("ReportFights"))
    .map((call) => call.variables.code);

  assert.equal(top.reportCount, 101);
  assert.equal(confirmedCodes.length, 101);
  assert.equal(confirmedCodes.at(-1), "TOP_101");
});

test("discoverAvailableUltimates retains and inspects an unknown zone instead of discarding it", async () => {
  const reports = [
    reportSummary({
      code: "UNKNOWN_ZONE_TOP",
      zoneId: 999,
      zoneName: "An unknown FFLogs zone",
      title: "Untrusted report title",
      startTime: Date.UTC(2023, 3, 26),
    }),
  ];
  const queryFflogs = createQueryStub([
    { match: "RaidTeamReports", response: () => reportPagePayload(reports) },
    {
      match: "ReportFights",
      response: ({ variables }) => reportDetailPayload({ code: variables.code, encounterIds: [1077] }),
    },
  ]);

  const discovery = await discoverAvailableUltimates({
    config: { guildId: 112977 },
    queryFflogs,
  });
  const top = discovery.ultimates.find((group) => group.ultimate.slug === "top");

  assert.deepEqual(top.reports.map((report) => report.code), ["UNKNOWN_ZONE_TOP"]);
  assert.equal(top.confirmed, true);
  assert.equal(
    queryFflogs.calls.filter((call) => call.query.includes("ReportFights")).length,
    1,
  );
});

test("discoverAvailableUltimates retains unsupported unknown zones for diagnostics", async () => {
  const reports = [
    reportSummary({
      code: "UNKNOWN_NON_ULTIMATE",
      zoneId: 12345,
      zoneName: "A future FFLogs zone",
      title: "Untrusted report title",
    }),
  ];
  const queryFflogs = createQueryStub([
    { match: "RaidTeamReports", response: () => reportPagePayload(reports) },
    {
      match: "ReportFights",
      response: ({ variables }) => reportDetailPayload({ code: variables.code, encounterIds: [9999] }),
    },
  ]);

  const discovery = await discoverAvailableUltimates({ config: { guildId: 112977 }, queryFflogs });

  assert.deepEqual(discovery.ultimates, []);
  assert.deepEqual(discovery.unclassifiedReports.map((report) => report.code), ["UNKNOWN_NON_ULTIMATE"]);
});

test("discoverAvailableUltimates emits empty choices until fight details establish identity", async () => {
  const reports = [
    reportSummary({ code: "DIRECT_FRU", zoneId: 65, zoneName: "Futures Rewritten" }),
    reportSummary({ code: "UNKNOWN_TOP", zoneId: 999, zoneName: "A future zone" }),
  ];
  const updates = [];
  const queryFflogs = createQueryStub([
    { match: "RaidTeamReports", response: () => reportPagePayload(reports) },
    {
      match: "ReportFights",
      response: ({ variables }) => reportDetailPayload({ code: variables.code, encounterIds: [1077] }),
    },
  ]);

  await discoverAvailableUltimates({
    config: { guildId: 112977 },
    queryFflogs,
    onUpdate: (update) => {
      updates.push({
        stage: update.progress.stage,
        slugs: update.ultimates.map((group) => group.ultimate.slug),
      });
    },
  });

  assert.deepEqual(updates, [
    { stage: "report-pages", slugs: [] },
    { stage: "report-details", slugs: ["top"] },
    { stage: "report-details", slugs: ["top"] },
  ]);
});

// This fixture is an excerpt from the user's saved live discovery capture. It
// guards against silently dropping historical TOP reports when their summary
// zone differs from the statistics-zone configuration.
test("discoverAvailableUltimates retains every captured historical TOP report", async () => {
  const reports = topZone53Fixture.reports.map((report) =>
    reportSummary({
      code: report.code,
      zoneId: report.zoneId,
      zoneName: report.zoneName,
      title: "Untrusted report title",
      startTime: Date.parse(report.startDate),
    }),
  );
  const queryFflogs = createQueryStub([
    { match: "RaidTeamReports", response: () => reportPagePayload(reports) },
    {
      match: "ReportFights",
      response: ({ variables }) => reportDetailPayload({ code: variables.code, encounterIds: [1077] }),
    },
  ]);

  const discovery = await discoverAvailableUltimates({ config: { guildId: 112977 }, queryFflogs });
  const top = discovery.ultimates.find((group) => group.ultimate.slug === "top");
  const expectedCodes = topZone53Fixture.reports
    .slice()
    .sort((left, right) => Date.parse(left.startDate) - Date.parse(right.startDate))
    .map((report) => report.code);

  assert.equal(top?.reportCount, topZone53Fixture.reportCount);
  assert.deepEqual(top?.reports.map((report) => report.code), expectedCodes);
});

test("discoverAvailableUltimates keeps later reports in one raw-encounter cache", async () => {
  const reports = [
    reportSummary({ code: "OLD_PROG", zoneId: 59, zoneName: "Ultimates (Legacy)", startTime: Date.UTC(2023, 2, 1) }),
    reportSummary({ code: "OLD_CLEAR", zoneId: 59, zoneName: "Ultimates (Legacy)", startTime: Date.UTC(2023, 3, 26) }),
    reportSummary({ code: "OLD_RECLEAR", zoneId: 59, zoneName: "Ultimates (Legacy)", startTime: Date.UTC(2023, 4, 1) }),
    reportSummary({ code: "NEW_PROG", zoneId: 59, zoneName: "Ultimates (Legacy)", startTime: Date.UTC(2026, 0, 10) }),
  ];
  const fightsByCode = {
    OLD_PROG: [fightFixture({ kill: false })],
    OLD_CLEAR: [fightFixture({ kill: true })],
    OLD_RECLEAR: [fightFixture({ kill: true })],
    NEW_PROG: [fightFixture({ kill: false })],
  };
  const queryFflogs = createQueryStub([
    { match: "RaidTeamReports", response: () => reportPagePayload(reports) },
    {
      match: "ReportFights",
      response: ({ variables }) =>
        reportDetailPayload({ code: variables.code, encounterIds: [1077], fights: fightsByCode[variables.code] }),
    },
  ]);

  const discovery = await discoverAvailableUltimates({ config: { guildId: 112977 }, queryFflogs });
  const topGroups = discovery.ultimates.filter((group) => group.ultimate.slug === "top");

  assert.equal(topGroups.length, 1);
  assert.deepEqual(topGroups[0].reports.map((report) => report.code), [
    "OLD_PROG", "OLD_CLEAR", "OLD_RECLEAR", "NEW_PROG",
  ]);
});

test("selected data uses the cached raw encounter detail and ends at its first clear", async () => {
  const ultimate = ULTIMATE_ENCOUNTERS.find((candidate) => candidate.slug === "dm");
  const reports = [
    reportSummary({ code: "AFTER_CLEAR", zoneId: 76, startTime: reportStart + 2_000_000 }),
    reportSummary({ code: "BEFORE_CLEAR", zoneId: 76, startTime: reportStart }),
    reportSummary({ code: "CLEAR_REPORT", zoneId: 76, startTime: reportStart + 1_000_000 }),
  ];
  const fight = ({ id, kill, startTime }) => ({
    id,
    name: "Dancing Mad",
    encounterID: 1085,
    originalEncounterID: 1085,
    difficulty: 100,
    kill,
    startTime,
    endTime: startTime + 180_000,
    bossPercentage: kill ? 0.01 : 32,
    fightPercentage: kill ? 0.01 : 68,
    lastPhase: 1,
    phaseTransitions: [{ id: 1, startTime: 0 }],
    friendlyPlayers: [10],
  });
  const queryFflogs = createQueryStub([
    { match: "RaidTeamReports", response: () => reportPagePayload(reports) },
    {
      match: "ReportFights",
      response: ({ variables }) => reportDetailPayload({
        code: variables.code,
        startTime: reports.find((report) => report.code === variables.code).startTime,
        fights: variables.code === "BEFORE_CLEAR"
          ? [fight({ id: 1, kill: false, startTime: 0 })]
          : variables.code === "CLEAR_REPORT"
            ? [fight({ id: 1, kill: false, startTime: 0 }), fight({ id: 2, kill: true, startTime: 200_000 }), fight({ id: 3, kill: false, startTime: 400_000 })]
            : [fight({ id: 1, kill: false, startTime: 0 })],
      }),
    },
  ]);
  const discovery = await discoverAvailableUltimates({ config: { guildId: 112977 }, queryFflogs });
  const group = discovery.ultimates.find((candidate) => candidate.ultimate.encounterId === 1085);
  const callsBeforeSelection = queryFflogs.calls.length;
  const bundle = await loadUltimateRaidData({
    ultimate: group.ultimate,
    candidateReports: group.reports,
    reportDetails: group.reportDetails,
  });

  assert.equal(queryFflogs.calls.length, callsBeforeSelection);
  assert.deepEqual(bundle.reports.map((report) => report.code), ["BEFORE_CLEAR", "CLEAR_REPORT"]);
  assert.deepEqual(
    bundle.pulls.map((pull) => ({ reportCode: pull.reportCode, fightId: pull.fightId, kill: pull.kill })),
    [
      { reportCode: "BEFORE_CLEAR", fightId: 1, kill: false },
      { reportCode: "CLEAR_REPORT", fightId: 1, kill: false },
      { reportCode: "CLEAR_REPORT", fightId: 2, kill: true },
    ],
  );
  assert.equal(bundle.fights.some((fightRow) => fightRow.reportCode === "CLEAR_REPORT" && fightRow.id === 3), false);
});

test("filterReportDetailForUltimate drops nonmatching encounter data", () => {
  const detail = {
    phases: [{ encounterId: 1073 }, { encounterId: 1074 }],
    fights: [{ encounterId: 1073 }, { encounterId: 1074 }],
    pulls: [{ encounterId: 1073 }, { encounterId: 1074 }],
  };

  assert.deepEqual(filterReportDetailForUltimate(detail, 1074), {
    phases: [{ encounterId: 1074 }],
    fights: [{ encounterId: 1074 }],
    pulls: [{ encounterId: 1074 }],
  });
});

// The captured source mixes Endwalker and Dawntrail TOP. This protects the
// reported regression: both IDs must survive as distinct selectable datasets,
// regardless of identical titles or zones.
test("discovery separates historical Ultimate variants by raw encounter ID", async () => {
  const reports = [
    reportSummary({ code: "EW_TOP", zoneId: 59, zoneName: "Ultimates (Legacy)", title: "The Omega Protocol", startTime: reportStart }),
    reportSummary({ code: "DT_TOP", zoneId: 53, zoneName: "The Omega Protocol", title: "The Omega Protocol", startTime: reportStart + 1 }),
  ];
  const queryFflogs = createQueryStub([
    { match: "RaidTeamReports", response: () => reportPagePayload(reports) },
    {
      match: "ReportFights",
      response: ({ variables }) => reportDetailPayload({
        code: variables.code,
        encounterIds: [variables.code === "EW_TOP" ? 1068 : 1077],
      }),
    },
  ]);

  const discovery = await discoverAvailableUltimates({ config: { guildId: 112977 }, queryFflogs });
  assert.deepEqual(
    discovery.ultimates.map((group) => [group.ultimate.encounterId, group.ultimate.displayName]),
    [[1068, "The Omega Protocol (Endwalker)"], [1077, "The Omega Protocol"]],
  );
});

test("detail workers are capped at three and commit reports chronologically", async () => {
  const reports = [0, 1, 2, 3, 4].map((index) => reportSummary({
    code: `R${index}`,
    zoneId: 1,
    startTime: reportStart + index,
  }));
  let active = 0;
  let peak = 0;
  const committed = [];
  await loadReportDetailsWithConcurrency({
    reports,
    concurrency: 3,
    loadDetail: async (report) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, Number(report.code.slice(1)) % 2 ? 2 : 0));
      active -= 1;
      return { report, fights: [], pulls: [] };
    },
    onCommitted: ({ report }) => committed.push(report.code),
  });
  assert.equal(peak, 3);
  assert.deepEqual(committed, ["R0", "R1", "R2", "R3", "R4"]);
});
