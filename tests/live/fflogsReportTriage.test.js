import assert from "node:assert/strict";
import test from "node:test";
import { ULTIMATE_ENCOUNTERS } from "../../src/config/ultimateEncounters.js";
import { REPORT_FIGHTS_QUERY } from "../../src/fflogs/api/queries/reportFights.js";
import { mapReportDetail, mapReportSummary } from "../../src/fflogs/static-data/fflogsMappers.js";
import { rawFflogsQuery } from "../../src/fflogs/static-data/liveCapture.js";
import { loadAllReports } from "../../src/fflogs/static-data/raidTeamLoader.js";
import { loadUltimateRaidData } from "../../src/fflogs/static-data/ultimateWorkflow.js";

const FFLOGS_TOKEN_URL = "https://www.fflogs.com/oauth/token";
const FFLOGS_CLIENT_GRAPHQL_URL = "https://www.fflogs.com/api/v2/client";
const DEFAULT_REPORT_CODE = "kzJ2jmRPdHv6rDGV";
const TOP_ENCOUNTER_ID = 1077;
const STATIC_ID = 112977;

/**
 * Exchange local confidential-client credentials for a short-lived FFLogs
 * application access token. This helper is test-only and must never be
 * imported by browser-delivered code.
 *
 * @param {{clientId: string, clientSecret: string, fetchImpl?: typeof fetch}} params
 * @returns {Promise<string>}
 */
export async function getClientCredentialsAccessToken({
  clientId,
  clientSecret,
  fetchImpl = globalThis.fetch,
}) {
  if (!clientId || !clientSecret) {
    throw new Error("FFLOGS_CLIENT_ID and FFLOGS_CLIENT_SECRET are required for this live test");
  }

  const response = await fetchImpl(FFLOGS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.access_token) {
    throw new Error(`FFLogs client-credentials token request failed with HTTP ${response.status}`);
  }

  return payload.access_token;
}

/** Build a client-endpoint query function compatible with app data loaders. */
function createClientQuery(accessToken) {
  return ({ query, variables }) =>
    rawFflogsQuery({
      query,
      variables,
      accessToken,
      endpoint: FFLOGS_CLIENT_GRAPHQL_URL,
    }).then((payload) => payload.data);
}

/**
 * Exercise the live report response through the same mapper that supplies CSV
 * exports and charts. This exposes the first boundary where a nonzero raw
 * fight count becomes zero mapped pulls.
 */
test("live FFLogs TOP report maps selected fights into normalized pulls", async () => {
  const accessToken = await getClientCredentialsAccessToken({
    clientId: process.env.FFLOGS_CLIENT_ID,
    clientSecret: process.env.FFLOGS_CLIENT_SECRET,
  });
  const code = process.env.FFLOGS_REPORT_CODE || DEFAULT_REPORT_CODE;
  const queryFflogs = createClientQuery(accessToken);
  const rawPayload = await rawFflogsQuery({
    query: REPORT_FIGHTS_QUERY,
    variables: {
      code,
      allowUnlisted: false,
      encounterId: null,
      difficulty: null,
      killType: "Encounters",
    },
    accessToken,
    endpoint: FFLOGS_CLIENT_GRAPHQL_URL,
  });
  const rawReport = rawPayload.data?.reportData?.report;
  const mappedDetail = mapReportDetail(rawReport);
  const rawTopFights = (rawReport?.fights || []).filter(
    (fight) => Number(fight.encounterID) === TOP_ENCOUNTER_ID,
  );
  const mappedTopFights = (mappedDetail?.fights || []).filter(
    (fight) => Number(fight.encounterId) === TOP_ENCOUNTER_ID,
  );
  const mappedTopPulls = (mappedDetail?.pulls || []).filter(
    (pull) => Number(pull.encounterId) === TOP_ENCOUNTER_ID,
  );

  console.info("[FFLogs live triage]", {
    reportCode: code,
    rawFightCount: rawReport?.fights?.length || 0,
    rawTopFightCount: rawTopFights.length,
    mappedFightCount: mappedDetail?.fights?.length || 0,
    mappedTopFightCount: mappedTopFights.length,
    mappedPullCount: mappedDetail?.pulls?.length || 0,
    mappedTopPullCount: mappedTopPulls.length,
    rawEncounterIds: [...new Set((rawReport?.fights || []).map((fight) => fight.encounterID))],
  });

  assert.ok(rawReport, "FFLogs must return the requested report");
  assert.ok(rawTopFights.length > 0, "The selected report must contain TOP fights");
  assert.equal(mappedTopFights.length, rawTopFights.length);
  assert.equal(mappedTopPulls.length, mappedTopFights.length);
  assert.ok(mappedTopPulls.length > 0, "TOP fights must become normalized pulls");

  // Repeat the same report through the selected-Ultimate loader, which applies
  // the encounter filter and creates the bundle consumed by exports/charts.
  const top = ULTIMATE_ENCOUNTERS.find((ultimate) => ultimate.slug === "top");
  const bundle = await loadUltimateRaidData({
    config: {},
    ultimate: top,
    candidateReports: [mapReportSummary(rawReport)],
    queryFflogs,
  });

  console.info("[FFLogs selected-Ultimate triage]", {
    selectedEncounterId: top.encounterId,
    bundleFightCount: bundle.fights.length,
    bundlePullCount: bundle.pulls.length,
  });
  assert.equal(bundle.pulls.length, mappedTopPulls.length);
});

/**
 * Reproduce the Static's direct-TOP selection path used by the browser UI.
 * A nonzero result proves that the report group reaching export/chart code is
 * valid; a zero result identifies the report detail whose mapping is empty.
 */
test("live Static TOP selection produces exportable normalized pulls", async () => {
  const accessToken = await getClientCredentialsAccessToken({
    clientId: process.env.FFLOGS_CLIENT_ID,
    clientSecret: process.env.FFLOGS_CLIENT_SECRET,
  });
  const queryFflogs = createClientQuery(accessToken);
  const { reports } = await loadAllReports({
    config: { guildId: STATIC_ID },
    queryFflogs,
  });
  const topCandidates = reports.filter((report) => report.zone?.name === "The Omega Protocol");
  const top = ULTIMATE_ENCOUNTERS.find((ultimate) => ultimate.slug === "top");
  const sampleCandidate = topCandidates[0];
  const sampleRawPayload = sampleCandidate
    ? await rawFflogsQuery({
        query: REPORT_FIGHTS_QUERY,
        variables: {
          code: sampleCandidate.code,
          allowUnlisted: false,
          encounterId: null,
          difficulty: null,
          killType: "Encounters",
        },
        accessToken,
        endpoint: FFLOGS_CLIENT_GRAPHQL_URL,
      })
    : null;
  const sampleRawReport = sampleRawPayload?.data?.reportData?.report;
  const reportPullCounts = [];
  const detailDiagnostics = [];
  const bundle = await loadUltimateRaidData({
    config: { guildId: STATIC_ID },
    ultimate: top,
    candidateReports: topCandidates,
    queryFflogs: async ({ query, variables }) => {
      const data = await queryFflogs({ query, variables });
      if (query.includes("query ReportFights")) {
        const fights = data?.reportData?.report?.fights || [];
        detailDiagnostics.push({
          code: variables.code,
          returnedFightCount: fights.length,
          returnedEncounterIds: [...new Set(fights.map((fight) => fight.encounterID))],
        });
      }
      return data;
    },
    onReportProgress: ({ current, report }) => {
      reportPullCounts.push({ current, code: report.code });
    },
  });

  console.info("[FFLogs Static TOP triage]", {
    candidateReportCount: topCandidates.length,
    reportsOpened: reportPullCounts.length,
    bundlePullCount: bundle.pulls.length,
    firstOpenedReports: reportPullCounts.slice(0, 3),
    sampleCandidate: sampleCandidate
      ? {
          code: sampleCandidate.code,
          title: sampleCandidate.title,
          summaryZone: sampleCandidate.zone,
          detailZone: sampleRawReport?.zone,
          rawEncounterIdsWithoutFilter: [...new Set((sampleRawReport?.fights || []).map((fight) => fight.encounterID))],
        }
      : null,
    reportsWithReturnedFights: detailDiagnostics.filter((detail) => detail.returnedFightCount > 0).length,
    firstDetailDiagnostics: detailDiagnostics.slice(0, 3),
  });
  assert.ok(topCandidates.length > 0, "The Static must expose direct TOP report candidates");
  assert.ok(bundle.pulls.length > 0, "Direct TOP candidates must produce normalized pulls");
});
