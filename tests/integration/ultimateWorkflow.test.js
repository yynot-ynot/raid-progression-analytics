import assert from "node:assert/strict";
import test from "node:test";
import { ULTIMATE_ENCOUNTERS } from "../../src/config/ultimateEncounters.js";
import {
  buildWorkflowDateRange,
  buildWorkflowSourceConfig,
  discoverAvailableUltimates,
  filterReportDetailForUltimate,
  loadUltimateRaidData,
} from "../../src/fflogs/static-data/ultimateWorkflow.js";

const reportStart = Date.UTC(2026, 0, 10, 4, 0, 0);

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

function reportSummary({ code, zoneId, title = code, startTime = reportStart }) {
  return {
    code,
    title,
    startTime,
    endTime: startTime + 600_000,
    visibility: "private",
    zone: { id: zoneId, name: title },
  };
}

function reportDetailPayload({ code, encounterIds, fights = null }) {
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
        startTime: reportStart,
        endTime: reportStart + 600_000,
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

test("discoverAvailableUltimates confirms exact encounters for shared legacy zone", async () => {
  const reports = [
    reportSummary({ code: "LEGACY", zoneId: 59, title: "Legacy Ultimate Zone" }),
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
    ["uwu", "fru"],
  );
  assert.equal(discovery.ultimates[0].confirmed, true);
  assert.equal(discovery.ultimates[0].exactConfirmationRequired, true);
  assert.equal(discovery.ultimates[1].exactConfirmationRequired, false);
});

test("loadUltimateRaidData filters detailed fights and pulls to the selected Ultimate", async () => {
  const ultimate = ULTIMATE_ENCOUNTERS.find((candidate) => candidate.slug === "uwu");
  const queryFflogs = createQueryStub([
    {
      match: "ReportFights",
      response: ({ variables }) => {
        assert.equal(variables.encounterId, 1074);
        return reportDetailPayload({ code: variables.code, encounterIds: [1073, 1074] });
      },
    },
  ]);

  const bundle = await loadUltimateRaidData({
    config: { guildId: 112977 },
    ultimate,
    candidateReports: [reportSummary({ code: "LEGACY", zoneId: 59 })],
    queryFflogs,
  });

  assert.equal(bundle.reports.length, 1);
  assert.deepEqual(bundle.fights.map((fight) => fight.encounterId), [1074]);
  assert.deepEqual(bundle.pulls.map((pull) => pull.encounterId), [1074]);
  assert.deepEqual(bundle.phases.map((phase) => phase.encounterId), [1074]);
});

test("loadUltimateRaidData stops opening report details after the first clear", async () => {
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
    {
      match: "ReportFights",
      response: ({ variables }) => {
        if (variables.code === "AFTER_CLEAR") {
          throw new Error("Report after first clear should not be loaded");
        }
        if (variables.code === "BEFORE_CLEAR") {
          return reportDetailPayload({
            code: variables.code,
            fights: [fight({ id: 1, kill: false, startTime: 0 })],
          });
        }
        return reportDetailPayload({
          code: variables.code,
          fights: [
            fight({ id: 1, kill: false, startTime: 0 }),
            fight({ id: 2, kill: true, startTime: 200_000 }),
            fight({ id: 3, kill: false, startTime: 400_000 }),
          ],
        });
      },
    },
  ]);

  const bundle = await loadUltimateRaidData({
    config: { guildId: 112977 },
    ultimate,
    candidateReports: reports,
    queryFflogs,
  });

  const openedCodes = queryFflogs.calls
    .filter((call) => call.query.includes("ReportFights"))
    .map((call) => call.variables.code);
  assert.deepEqual(openedCodes, ["BEFORE_CLEAR", "CLEAR_REPORT"]);
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
