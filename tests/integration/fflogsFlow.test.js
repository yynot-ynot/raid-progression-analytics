import assert from "node:assert/strict";
import test from "node:test";
import {
  completeLogin,
  OAUTH_STATE_KEY,
  PKCE_VERIFIER_KEY,
} from "../../src/fflogs/auth/fflogsAuth.js";
import { TokenStore } from "../../src/fflogs/auth/tokenStore.js";
import { queryFflogs } from "../../src/fflogs/api/fflogsClient.js";
import { CURRENT_USER_QUERY } from "../../src/fflogs/api/queries/currentUser.js";
import { GUILD_BY_ID_QUERY } from "../../src/fflogs/api/queries/guildLookup.js";
import { RAID_TEAM_REPORTS_QUERY } from "../../src/fflogs/api/queries/reportList.js";
import { REPORT_FIGHTS_QUERY } from "../../src/fflogs/api/queries/reportFights.js";
import { loadCurrentUser } from "../../src/fflogs/static-data/currentUserLoader.js";
import {
  buildReportListVariables,
  loadAllReports,
  loadGuildById,
  loadRaidTeamData,
  loadReportFights,
} from "../../src/fflogs/static-data/raidTeamLoader.js";
import { createFetchMock, createJsonResponse, createMemoryStorage } from "../unit/testHelpers.js";

const reportStart = Date.UTC(2024, 10, 27, 4, 0, 0);

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

function sampleGuildPayload() {
  return {
    guildData: {
      guild: {
        id: 112977,
        name: "Progression Static",
        type: "1",
        description: "A static",
        server: {
          id: 73,
          name: "Gilgamesh",
          slug: "gilgamesh",
          region: { id: 1, name: "North America", compactName: "NA" },
        },
        tags: [{ id: 9001, name: "FRU" }],
        statics: [],
        parentGuild: null,
      },
    },
  };
}

function sampleReportPage({ hasMorePages, page }) {
  return {
    reportData: {
      reports: {
        data: [
          {
            code: page === 1 ? "REPORT1" : "REPORT2",
            title: `Report ${page}`,
            startTime: reportStart,
            endTime: reportStart + 1_000_000,
            visibility: "private",
            revision: 1,
            segments: 1,
            exportedSegments: 1,
            archiveStatus: null,
            region: { id: 1, name: "North America", compactName: "NA" },
            zone: { id: 62, name: "Futures Rewritten" },
            owner: { id: 77, name: "Uploader" },
            guild: { id: 112977, name: "Progression Static" },
            guildTag: { id: 9001, name: "FRU" },
          },
        ],
        total: 2,
        per_page: 1,
        current_page: page,
        last_page: 2,
        has_more_pages: hasMorePages,
      },
    },
  };
}

function sampleReportDetailPayload(code) {
  return {
    reportData: {
      report: {
        code,
        title: code,
        startTime: reportStart,
        endTime: reportStart + 500_000,
        visibility: "private",
        revision: 1,
        segments: 1,
        exportedSegments: 1,
        archiveStatus: null,
        region: { id: 1, name: "North America", compactName: "NA" },
        zone: { id: 62, name: "Futures Rewritten" },
        owner: { id: 77, name: "Uploader" },
        guild: { id: 112977, name: "Progression Static" },
        guildTag: { id: 9001, name: "FRU" },
        fights: [
          {
            id: code === "REPORT1" ? 1 : 2,
            name: "Futures Rewritten",
            encounterID: 1079,
            originalEncounterID: 1079,
            difficulty: 100,
            kill: false,
            startTime: 0,
            endTime: 180_000,
            combatTime: 180_000,
            bossPercentage: 70,
            fightPercentage: 30,
            lastPhase: 1,
            lastPhaseAsAbsoluteIndex: 1,
            lastPhaseIsIntermission: false,
            phaseTransitions: [{ id: 1, startTime: 0 }],
            friendlyPlayers: [10],
            standardComposition: { tanks: 2, healers: 2, dps: 4 },
          },
        ],
        masterData: {
          actors: [{ id: 10, name: "Alice", server: "Gilgamesh", type: "Player", subType: "Paladin" }],
        },
        phases: [
          {
            encounterID: 1079,
            separatesWipes: true,
            phases: [{ id: 1, name: "P1", isIntermission: false }],
          },
        ],
      },
    },
  };
}

test("full PKCE callback exchanges code, stores token, and validates current user", async () => {
  const storage = createMemoryStorage({
    [PKCE_VERIFIER_KEY]: "verifier",
    [OAUTH_STATE_KEY]: "state",
  });
  const tokenStore = new TokenStore({ storage, now: () => 1_000 });
  const fetchImpl = createFetchMock([
    createJsonResponse({ payload: { access_token: "token", expires_in: 3600 } }),
    createJsonResponse({
      payload: { data: { userData: { currentUser: { id: 1, name: "Uploader" } } } },
    }),
  ]);

  await completeLogin({
    storage,
    tokenStore,
    fetchImpl,
    locationLike: { origin: "http://localhost:8080", pathname: "/", search: "?code=code&state=state" },
  });

  const currentUser = await loadCurrentUser({
    queryFflogs: (request) => queryFflogs({ ...request, tokenStore, fetchImpl }),
  });

  assert.equal(currentUser.name, "Uploader");
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(JSON.parse(fetchImpl.calls[1].options.body).query, CURRENT_USER_QUERY);
});

test("buildReportListVariables gives guildTagID precedence over guild filters", () => {
  const variables = buildReportListVariables({
    guildId: 112977,
    guildName: "Should Not Use",
    guildServerSlug: "gilgamesh",
    guildServerRegion: "NA",
    guildTagId: 9001,
    zoneId: 62,
  });

  assert.equal(variables.guildTagId, 9001);
  assert.equal("guildId" in variables, false);
  assert.equal("guildName" in variables, false);
  assert.equal(variables.zoneId, 62);
});

test("buildReportListVariables supports personal log report scope", () => {
  const variables = buildReportListVariables({
    sourceType: "user",
    userId: 467755,
    guildId: 112977,
    guildTagId: 9001,
  });

  assert.equal(variables.userId, 467755);
  assert.equal("guildId" in variables, false);
  assert.equal("guildTagId" in variables, false);
});

test("loadGuildById resolves configured guild 112977", async () => {
  const queryFflogs = createQueryStub([
    {
      match: "GuildById",
      response: ({ variables }) => {
        assert.equal(variables.guildId, 112977);
        return sampleGuildPayload();
      },
    },
  ]);

  const guild = await loadGuildById({
    guildId: 112977,
    guildUrl: "https://www.fflogs.com/guild/id/112977",
    queryFflogs,
  });

  assert.equal(guild.guildId, 112977);
  assert.equal(guild.tags[0].id, 9001);
  assert.equal(queryFflogs.calls[0].query, GUILD_BY_ID_QUERY);
});

test("loadAllReports retrieves pages until has_more_pages is false", async () => {
  const queryFflogs = createQueryStub([
    {
      match: "RaidTeamReports",
      response: ({ variables }) => sampleReportPage({ page: variables.page, hasMorePages: variables.page === 1 }),
    },
  ]);

  const { reports, pagesFetched } = await loadAllReports({
    config: { guildId: 112977, guildTagId: 9001 },
    limit: 1,
    queryFflogs,
  });

  assert.equal(reports.length, 2);
  assert.equal(pagesFetched, 2);
  assert.equal(queryFflogs.calls[0].query, RAID_TEAM_REPORTS_QUERY);
  assert.equal(queryFflogs.calls[0].variables.guildTagId, 9001);
});

test("loadReportFights fetches fights, players, phases, and normalized pulls", async () => {
  const queryFflogs = createQueryStub([
    {
      match: "ReportFights",
      response: ({ variables }) => sampleReportDetailPayload(variables.code),
    },
  ]);

  const detail = await loadReportFights({
    code: "REPORT1",
    config: { encounterId: 1079, difficulty: 100, killType: "Encounters" },
    queryFflogs,
  });

  assert.equal(queryFflogs.calls[0].query, REPORT_FIGHTS_QUERY);
  assert.equal(queryFflogs.calls[0].variables.code, "REPORT1");
  assert.equal(detail.players[0].name, "Alice");
  assert.equal(detail.phases[0].name, "P1");
  assert.equal(detail.pulls[0].reportCode, "REPORT1");
  assert.equal(detail.pulls[0].endingPhaseName, "P1");
});

test("loadRaidTeamData returns a complete mocked raid-team data bundle", async () => {
  const queryFflogs = createQueryStub([
    { match: "GuildById", response: () => sampleGuildPayload() },
    {
      match: "RaidTeamReports",
      response: ({ variables }) => sampleReportPage({ page: variables.page, hasMorePages: variables.page === 1 }),
    },
    {
      match: "ReportFights",
      response: ({ variables }) => sampleReportDetailPayload(variables.code),
    },
  ]);

  const bundle = await loadRaidTeamData({
    config: {
      guildId: 112977,
      guildUrl: "https://www.fflogs.com/guild/id/112977",
      guildTagId: 9001,
      encounterId: 1079,
      difficulty: 100,
      killType: "Encounters",
    },
    currentUser: { id: 1, name: "Uploader" },
    reportLimit: 1,
    queryFflogs,
  });

  assert.equal(bundle.team.guildId, 112977);
  assert.equal(bundle.reports.length, 2);
  assert.equal(bundle.reportDetails.length, 2);
  assert.equal(bundle.players.length, 1);
  assert.equal(bundle.phases.length, 1);
  assert.equal(bundle.fights.length, 2);
  assert.equal(bundle.pulls.length, 2);
  assert.equal(bundle.currentUser.name, "Uploader");
});

test("loadRaidTeamData surfaces report-list GraphQL failure", async () => {
  const queryFflogs = createQueryStub([
    { match: "GuildById", response: () => sampleGuildPayload() },
    {
      match: "RaidTeamReports",
      response: () => {
        throw new Error("GraphQL report list failed");
      },
    },
  ]);

  await assert.rejects(
    () => loadRaidTeamData({ config: { guildId: 112977 }, queryFflogs }),
    /GraphQL report list failed/,
  );
});
