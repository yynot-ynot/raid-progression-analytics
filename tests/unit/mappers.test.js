import assert from "node:assert/strict";
import test from "node:test";
import {
  createPhaseLookup,
  formatPullStartTime,
  formatRaidDate,
  getEndingPhaseId,
  mapCurrentUser,
  mapGuild,
  mapPhases,
  mapPlayerActors,
  mapReportDetail,
  mapReportPagination,
  normalizePullRows,
} from "../../src/fflogs/static-data/fflogsMappers.js";

const reportStart = Date.UTC(2024, 10, 27, 4, 0, 0);

function sampleReport() {
  return {
    code: "ABC123",
    title: "FRU Prog",
    startTime: reportStart,
    endTime: reportStart + 900_000,
    visibility: "private",
    revision: 2,
    segments: 1,
    exportedSegments: 1,
    archiveStatus: null,
    fights: [
      {
        id: 2,
        name: "Futures Rewritten",
        encounterID: 1079,
        originalEncounterID: 1079,
        difficulty: 100,
        kill: false,
        startTime: 300_000,
        endTime: 500_000,
        combatTime: 200_000,
        bossPercentage: 55.5,
        fightPercentage: 44.5,
        lastPhase: 2,
        lastPhaseAsAbsoluteIndex: 2,
        lastPhaseIsIntermission: false,
        phaseTransitions: [{ id: 1, startTime: 0 }, { id: 2, startTime: 120_000 }],
        friendlyPlayers: [10, 11],
        standardComposition: { tanks: 2 },
      },
      {
        id: 1,
        name: "Futures Rewritten",
        encounterID: 1079,
        kill: false,
        startTime: 0,
        endTime: 180_000,
        bossPercentage: 80,
        phaseTransitions: [{ id: 1, startTime: 0 }],
        friendlyPlayers: [10],
      },
    ],
    masterData: {
      actors: [
        { id: 10, name: "Alice", server: "Gilgamesh", type: "Player", subType: "Paladin" },
        { id: 11, name: "Bob", server: "Gilgamesh", type: "Player", subType: "WhiteMage" },
      ],
    },
    phases: [
      {
        encounterID: 1079,
        separatesWipes: true,
        phases: [
          { id: 1, name: "P1", isIntermission: false },
          { id: 2, name: "P2", isIntermission: false },
        ],
      },
    ],
  };
}

test("mapCurrentUser returns compact current user model", () => {
  assert.deepEqual(
    mapCurrentUser({ userData: { currentUser: { id: 1, name: "Uploader" } } }),
    { id: 1, name: "Uploader" },
  );
});

test("mapGuild maps FFLogs guild, tags, statics, server, and region", () => {
  const mapped = mapGuild(
    {
      id: 112977,
      name: "Static Name",
      type: "1",
      server: {
        id: 73,
        name: "Gilgamesh",
        slug: "gilgamesh",
        region: { id: 1, name: "North America", compactName: "NA" },
      },
      tags: [{ id: 5, name: "FRU" }],
      statics: [{ id: 6, name: "Reclear", type: "1" }],
      parentGuild: { id: 1, name: "FC" },
    },
    { guildUrl: "https://www.fflogs.com/guild/id/112977" },
  );

  assert.equal(mapped.guildId, 112977);
  assert.equal(mapped.guildName, "Static Name");
  assert.equal(mapped.guildType, "1");
  assert.equal(mapped.guildUrl, "https://www.fflogs.com/guild/id/112977");
  assert.deepEqual(mapped.tags, [{ id: 5, name: "FRU" }]);
  assert.deepEqual(mapped.statics, [{ id: 6, name: "Reclear", type: "1" }]);
  assert.equal(mapped.region.compactName, "NA");
});

test("mapReportPagination maps reports and pagination metadata", () => {
  const mapped = mapReportPagination({
    data: [{ code: "A", title: "One", visibility: "public" }],
    total: 1,
    per_page: 100,
    current_page: 1,
    last_page: 1,
    has_more_pages: false,
  });

  assert.equal(mapped.reports[0].code, "A");
  assert.equal(mapped.total, 1);
  assert.equal(mapped.hasMorePages, false);
});

test("mapPlayerActors deduplicates and maps player actors", () => {
  const players = mapPlayerActors([
    { id: 1, name: "Alice", server: "Gilgamesh", type: "Player", subType: "Paladin" },
    { id: 1, name: "Alice", server: "Gilgamesh", type: "Player", subType: "Paladin" },
  ]);

  assert.equal(players.length, 1);
  assert.deepEqual(players[0].jobs, ["Paladin"]);
});

test("mapPhases builds flat phase summaries", () => {
  const phases = mapPhases(sampleReport().phases);

  assert.deepEqual(phases.map((phase) => phase.name), ["P1", "P2"]);
  assert.equal(phases[0].encounterId, 1079);
});

test("createPhaseLookup prefers encounter-specific phase", () => {
  const lookup = createPhaseLookup([
    { encounterId: 1, id: 2, name: "Other P2" },
    { encounterId: 1079, id: 2, name: "FRU P2" },
  ]);

  assert.equal(lookup.get(1079, 2).name, "FRU P2");
});

test("getEndingPhaseId uses lastPhase, transition fallback, then absolute index", () => {
  assert.equal(getEndingPhaseId({ lastPhase: 3, phaseTransitions: [{ id: 1 }] }), 3);
  assert.equal(getEndingPhaseId({ phaseTransitions: [{ id: 1 }, { id: 2 }] }), 2);
  assert.equal(getEndingPhaseId({ lastPhaseAsAbsoluteIndex: 4 }), 4);
  assert.equal(getEndingPhaseId({}), null);
});

test("formatRaidDate and formatPullStartTime are timezone-aware", () => {
  const timestamp = Date.UTC(2024, 10, 27, 4, 30, 0);

  assert.equal(formatRaidDate(timestamp, "America/Los_Angeles"), "2024/11/26");
  assert.equal(formatPullStartTime(timestamp, "America/Los_Angeles"), "20:30");
});

test("normalizePullRows sorts fights and maps phase names", () => {
  const report = sampleReport();
  const detail = mapReportDetail(report);

  assert.equal(detail.pulls.length, 2);
  assert.equal(detail.pulls[0].fightId, 1);
  assert.equal(detail.pulls[0].pullNumber, 1);
  assert.equal(detail.pulls[0].endingPhaseName, "P1");
  assert.equal(detail.pulls[1].endingPhaseName, "P2");
  assert.equal(detail.pulls[1].pullDurationMs, 200_000);
  assert.deepEqual(detail.players.map((player) => player.name), ["Alice", "Bob"]);
});

test("normalizePullRows falls back to fightPercentage when bossPercentage is absent", () => {
  const pulls = normalizePullRows({
    report: { code: "R", title: "T", startTime: reportStart },
    phases: [],
    fights: [
      {
        id: 1,
        startTime: 0,
        endTime: 1_000,
        fightPercentage: 12.3,
        phaseTransitions: [],
        friendlyPlayers: [],
      },
    ],
  });

  assert.equal(pulls[0].bossHpPercentage, 12.3);
});
