import assert from "node:assert/strict";
import test from "node:test";
import {
  captureFflogsLiveData,
  rawFflogsQuery,
} from "../../src/fflogs/static-data/liveCapture.js";
import { createFetchMock, createJsonResponse } from "../unit/testHelpers.js";

const reportStart = Date.UTC(2024, 10, 27, 4, 0, 0);

test("rawFflogsQuery returns unmodified JSON payload and sends bearer token", async () => {
  const fetchImpl = createFetchMock([
    createJsonResponse({ payload: { data: { ok: true } } }),
  ]);

  const payload = await rawFflogsQuery({
    query: "query Test { ok }",
    variables: { value: 1 },
    accessToken: "token",
    fetchImpl,
  });

  assert.deepEqual(payload, { data: { ok: true } });
  assert.equal(fetchImpl.calls[0].options.headers.Authorization, "Bearer token");
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].options.body), {
    query: "query Test { ok }",
    variables: { value: 1 },
  });
});

test("rawFflogsQuery rejects missing access token", async () => {
  await assert.rejects(
    () => rawFflogsQuery({ query: "query Test { ok }", fetchImpl: async () => {} }),
    /FFLOGS_ACCESS_TOKEN/,
  );
});

test("rawFflogsQuery rejects GraphQL errors instead of mapping empty data", async () => {
  const fetchImpl = createFetchMock([
    createJsonResponse({
      payload: { errors: [{ message: "Field must have a sub selection." }] },
    }),
  ]);

  await assert.rejects(
    () =>
      rawFflogsQuery({
        query: "query Broken { bad }",
        accessToken: "token",
        fetchImpl,
      }),
    /FFLogs live GraphQL error: Field must have a sub selection/,
  );
});

test("captureFflogsLiveData captures raw payloads and mapped summaries", async () => {
  const fetchImpl = createFetchMock([
    createJsonResponse({
      payload: { data: { userData: { currentUser: { id: 1, name: "Uploader" } } } },
    }),
    createJsonResponse({
      payload: {
        data: {
          guildData: {
            guild: {
              id: 112977,
              name: "Progression Static",
              type: "1",
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
        },
      },
    }),
    createJsonResponse({
      payload: {
        data: {
          reportData: {
            reports: {
              data: [
                {
                  code: "REPORT1",
                  title: "Report 1",
                  startTime: reportStart,
                  endTime: reportStart + 1,
                  visibility: "private",
                },
              ],
              total: 1,
              per_page: 1,
              current_page: 1,
              last_page: 1,
              has_more_pages: false,
            },
          },
        },
      },
    }),
    createJsonResponse({
      payload: {
        data: {
          reportData: {
            report: {
              code: "REPORT1",
              title: "Report 1",
              startTime: reportStart,
              endTime: reportStart + 180_000,
              owner: { id: 77, name: "Uploader" },
              fights: [
                {
                  id: 1,
                  encounterID: 1079,
                  kill: false,
                  startTime: 0,
                  endTime: 180_000,
                  bossPercentage: 70,
                  phaseTransitions: [{ id: 1, startTime: 0 }],
                  friendlyPlayers: [10],
                },
              ],
              masterData: {
                actors: [
                  { id: 10, name: "Alice", server: "Gilgamesh", type: "Player", subType: "Paladin" },
                ],
              },
              phases: [
                {
                  encounterID: 1079,
                  phases: [{ id: 1, name: "P1", isIntermission: false }],
                },
              ],
            },
          },
        },
      },
    }),
  ]);

  const capture = await captureFflogsLiveData({
    accessToken: "token",
    reportCode: "kzJ2jmRPdHv6rDGV",
    fetchImpl,
    capturedAt: "2026-08-14T00:00:00.000Z",
  });

  const reportDetailRequest = JSON.parse(fetchImpl.calls[3].options.body);
  assert.equal(reportDetailRequest.variables.code, "kzJ2jmRPdHv6rDGV");
  assert.equal(capture.config.reportCode, "kzJ2jmRPdHv6rDGV");
  assert.equal(capture.raw.guild.data.guildData.guild.id, 112977);
  assert.equal(capture.mapped.currentUser.name, "Uploader");
  assert.equal(capture.mapped.guild.guildId, 112977);
  assert.equal(capture.mapped.reportPage.reports[0].code, "REPORT1");
  assert.equal(capture.mapped.reportDetail.pulls[0].endingPhaseName, "P1");
});
