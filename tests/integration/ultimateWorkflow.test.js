import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorkflowDateRange,
  buildWorkflowSourceConfig,
  createZoneDetailLoader,
  discoverAvailableUltimates,
  filterReportDetailForUltimate,
  loadUltimateRaidData,
  loadZoneDetails,
} from "../../src/fflogs/static-data/ultimateWorkflow.js";

const reportStart = Date.UTC(2026, 0, 10, 4, 0, 0);

/** Build a query stub and retain calls so tests assert request boundaries. */
function createQueryStub(handlers) {
  const calls = [];
  const stub = async ({ query, variables = {} }) => {
    calls.push({ query, variables });
    const handler = handlers.find((candidate) => query.includes(candidate.match));
    if (!handler) throw new Error(`Unhandled query: ${query}`);
    return handler.response({ query, variables });
  };
  stub.calls = calls;
  return stub;
}

function reportPagePayload(reports) {
  return { reportData: { reports: {
    data: reports, total: reports.length, per_page: reports.length || 1,
    current_page: 1, last_page: 1, has_more_pages: false,
  } } };
}

function reportSummary({ code, zoneId, zoneName, startTime = reportStart }) {
  return { code, title: code, startTime, endTime: startTime + 600_000, visibility: "private", zone: { id: zoneId, name: zoneName } };
}

function reportDetailPayload({ code, encounterIds, fights = null, startTime = reportStart }) {
  const mappedFights = fights || encounterIds.map((encounterID, index) => ({
    id: index + 1, name: `Encounter ${encounterID}`, encounterID, originalEncounterID: encounterID,
    difficulty: 100, kill: false, startTime: index * 200_000, endTime: index * 200_000 + 180_000,
    bossPercentage: 50, fightPercentage: 50, lastPhase: 1,
    phaseTransitions: [{ id: 1, startTime: 0 }], friendlyPlayers: [10],
  }));
  return { reportData: { report: {
    code, title: code, startTime, endTime: startTime + 600_000, visibility: "private",
    fights: mappedFights,
    masterData: { actors: [{ id: 10, name: "Player", server: "Cactuar", type: "Player", subType: "Paladin" }] },
    phases: [...new Set(mappedFights.map((fight) => fight.encounterID))].map((encounterID) => ({
      encounterID, phases: [{ id: 1, name: "P1", isIntermission: false }],
    })),
  } } };
}

test("buildWorkflowSourceConfig parses source URL and default history range", () => {
  const config = buildWorkflowSourceConfig({ sourceUrl: "https://www.fflogs.com/guild/reports-list/112977" });
  assert.equal(config.guildId, 112977);
  assert.deepEqual(buildWorkflowDateRange(), { startTime: null, endTime: null });
});

test("summary discovery groups zones without sending any report-detail request", async () => {
  const reports = [
    reportSummary({ code: "EW_TOP", zoneId: 53, zoneName: "The Omega Protocol" }),
    reportSummary({ code: "DT_LEGACY", zoneId: 59, zoneName: "Ultimates (Legacy)", startTime: reportStart + 1 }),
    reportSummary({ code: "UNKNOWN", zoneId: 999, zoneName: "Future content", startTime: reportStart + 2 }),
  ];
  const queryFflogs = createQueryStub([{ match: "RaidTeamReports", response: () => reportPagePayload(reports) }]);

  const discovery = await discoverAvailableUltimates({ config: { guildId: 112977 }, queryFflogs });

  assert.deepEqual(discovery.zones.map((zone) => [zone.zoneId, zone.zoneName, zone.reportCount]), [
    [53, "The Omega Protocol", 1], [59, "Ultimates (Legacy)", 1], [999, "Future content", 1],
  ]);
  assert.equal(queryFflogs.calls.some((call) => call.query.includes("ReportFights")), false);
});

test("opening one direct zone requests only its reports and confirms its detailed fight", async () => {
  const reports = [
    reportSummary({ code: "EW_TOP", zoneId: 53, zoneName: "The Omega Protocol" }),
    reportSummary({ code: "DT_LEGACY", zoneId: 59, zoneName: "Ultimates (Legacy)", startTime: reportStart + 1 }),
  ];
  const queryFflogs = createQueryStub([
    { match: "RaidTeamReports", response: () => reportPagePayload(reports) },
    { match: "ReportFights", response: ({ variables }) => reportDetailPayload({ code: variables.code, encounterIds: [1068] }) },
  ]);
  const discovery = await discoverAvailableUltimates({ config: { guildId: 112977 }, queryFflogs });
  const result = await loadZoneDetails({ zone: discovery.zones[0], config: { guildId: 112977 }, queryFflogs });

  assert.deepEqual(queryFflogs.calls.filter((call) => call.query.includes("ReportFights")).map((call) => call.variables.code), ["EW_TOP"]);
  assert.deepEqual(result.fights.map((group) => [group.ultimate.encounterId, group.ultimate.displayName]), [
    [1068, "The Omega Protocol (Endwalker)"],
  ]);
});

test("a Legacy zone splits detail-confirmed fights and never exposes its label as a fight", async () => {
  const reports = [
    reportSummary({ code: "DT_TOP", zoneId: 59, zoneName: "Ultimates (Legacy)" }),
    reportSummary({ code: "DT_DSR", zoneId: 59, zoneName: "Ultimates (Legacy)", startTime: reportStart + 1 }),
  ];
  const queryFflogs = createQueryStub([
    { match: "RaidTeamReports", response: () => reportPagePayload(reports) },
    { match: "ReportFights", response: ({ variables }) => reportDetailPayload({
      code: variables.code,
      encounterIds: variables.code === "DT_TOP" ? [1077] : [1076],
    }) },
  ]);
  const discovery = await discoverAvailableUltimates({ config: { guildId: 112977 }, queryFflogs });
  const result = await loadZoneDetails({ zone: discovery.zones[0], config: { guildId: 112977 }, queryFflogs });

  assert.deepEqual(result.fights.map((group) => group.ultimate.slug), ["top", "dsr"]);
  assert.deepEqual(result.fights.map((group) => group.ultimate.expansion), ["Dawntrail", "Dawntrail"]);
  assert.equal(result.fights.some((group) => group.ultimate.displayName === "Ultimates (Legacy)"), false);
});

// Historical variants carry their expansion in the normalized detail label.
// The picker must use this one source of display text rather than append a
// second expansion suffix for Legacy scopes.
test("a historical Legacy variant has one expansion-qualified display name", async () => {
  const reports = [reportSummary({ code: "EW_TEA", zoneId: 43, zoneName: "Ultimates (Legacy)" })];
  const queryFflogs = createQueryStub([
    { match: "RaidTeamReports", response: () => reportPagePayload(reports) },
    { match: "ReportFights", response: ({ variables }) => reportDetailPayload({ code: variables.code, encounterIds: [1062] }) },
  ]);

  const discovery = await discoverAvailableUltimates({ config: { guildId: 112977 }, queryFflogs });
  const result = await loadZoneDetails({ zone: discovery.zones[0], config: { guildId: 112977 }, queryFflogs });

  assert.equal(result.fights[0].ultimate.displayName, "The Epic of Alexander (Endwalker)");
  assert.equal(result.fights[0].ultimate.displayName.includes("(Endwalker) (Endwalker)"), false);
});

test("Endwalker TOP and Dawntrail Legacy TOP remain separate zone-scoped results", async () => {
  const reports = [
    reportSummary({ code: "EW_TOP", zoneId: 53, zoneName: "The Omega Protocol" }),
    reportSummary({ code: "DT_TOP", zoneId: 59, zoneName: "Ultimates (Legacy)", startTime: reportStart + 1 }),
  ];
  const queryFflogs = createQueryStub([
    { match: "RaidTeamReports", response: () => reportPagePayload(reports) },
    { match: "ReportFights", response: ({ variables }) => reportDetailPayload({
      code: variables.code, encounterIds: [variables.code === "EW_TOP" ? 1068 : 1077],
    }) },
  ]);
  const discovery = await discoverAvailableUltimates({ config: {}, queryFflogs });
  const cache = new Map();
  const [endwalker, dawntrailLegacy] = await Promise.all(discovery.zones.map((zone) => loadZoneDetails({ zone, config: {}, queryFflogs, detailsByCode: cache })));

  assert.equal(endwalker.fights[0].ultimate.encounterId, 1068);
  assert.equal(dawntrailLegacy.fights[0].ultimate.encounterId, 1077);
  assert.notEqual(endwalker.key, dawntrailLegacy.key);
});

test("streaming zone loader caps requests at three and accepts later summary reports", async () => {
  const reports = [0, 1, 2, 3, 4].map((index) => reportSummary({
    code: `R${index}`, zoneId: 76, zoneName: "Dancing Mad", startTime: reportStart + index,
  }));
  let active = 0;
  let peak = 0;
  const queryFflogs = async ({ variables }) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, variables.code === "R0" ? 5 : 0));
    active -= 1;
    return reportDetailPayload({ code: variables.code, encounterIds: [1085] });
  };
  const progress = [];
  const loader = createZoneDetailLoader({
    zone: { key: "76:Dancing Mad", zoneId: 76, zoneName: "Dancing Mad", reports: [] },
    config: {}, queryFflogs, detailConcurrency: 3,
    onUpdate: ({ progress: update }) => progress.push(update),
  });

  loader.enqueue(reports.slice(0, 3));
  loader.enqueue(reports.slice(3));
  loader.close();
  const result = await loader.done;

  assert.equal(peak, 3);
  assert.equal(result.detailsLoaded, 5);
  assert.equal(progress.at(-1).complete, true);
});

test("cached zone detail is reused and a selected fight stops graph input at its first clear", async () => {
  const reports = [
    reportSummary({ code: "PROG", zoneId: 76, zoneName: "Dancing Mad" }),
    reportSummary({ code: "CLEAR", zoneId: 76, zoneName: "Dancing Mad", startTime: reportStart + 1_000_000 }),
    reportSummary({ code: "RECLEAR", zoneId: 76, zoneName: "Dancing Mad", startTime: reportStart + 2_000_000 }),
  ];
  const fight = ({ id, kill, startTime }) => ({
    id, name: "Dancing Mad", encounterID: 1085, originalEncounterID: 1085, difficulty: 100, kill,
    startTime, endTime: startTime + 180_000, bossPercentage: kill ? 0 : 50, fightPercentage: kill ? 0 : 50,
    lastPhase: 1, phaseTransitions: [{ id: 1, startTime: 0 }], friendlyPlayers: [10],
  });
  const queryFflogs = createQueryStub([{
    match: "ReportFights",
    response: ({ variables }) => reportDetailPayload({
      code: variables.code, startTime: reports.find((report) => report.code === variables.code).startTime,
      fights: variables.code === "PROG" ? [fight({ id: 1, kill: false, startTime: 0 })]
        : variables.code === "CLEAR" ? [fight({ id: 1, kill: true, startTime: 0 })]
          : [fight({ id: 1, kill: false, startTime: 0 })],
    }),
  }]);
  const zone = { key: "76:Dancing Mad", zoneId: 76, zoneName: "Dancing Mad", reports };
  const cache = new Map();
  const first = await loadZoneDetails({ zone, config: {}, queryFflogs, detailsByCode: cache });
  const callsAfterFirstLoad = queryFflogs.calls.length;
  const second = await loadZoneDetails({ zone, config: {}, queryFflogs, detailsByCode: cache });
  const group = second.fights[0];
  const bundle = await loadUltimateRaidData({ ultimate: group.ultimate, candidateReports: group.reports, reportDetails: group.reportDetails });

  assert.equal(first.detailsLoaded, 3);
  assert.equal(queryFflogs.calls.length, callsAfterFirstLoad);
  assert.deepEqual(bundle.reports.map((report) => report.code), ["PROG", "CLEAR"]);
  assert.deepEqual(bundle.pulls.map((pull) => pull.reportCode), ["PROG", "CLEAR"]);
});

test("filterReportDetailForUltimate retains only an exact raw encounter ID", () => {
  const detail = { phases: [{ encounterId: 1073 }, { encounterId: 1074 }], fights: [{ encounterId: 1073 }, { encounterId: 1074 }], pulls: [{ encounterId: 1073 }, { encounterId: 1074 }] };
  assert.deepEqual(filterReportDetailForUltimate(detail, 1074), {
    phases: [{ encounterId: 1074 }], fights: [{ encounterId: 1074 }], pulls: [{ encounterId: 1074 }],
  });
});
