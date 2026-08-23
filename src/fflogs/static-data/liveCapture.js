import { RAID_TEAM_CONFIG } from "../../config/raidTeamConfig.js";
import { FFLOGS_CONFIG } from "../../config/fflogsConfig.js";
import { CURRENT_USER_QUERY } from "../api/queries/currentUser.js?v=20260815-live-capture-v2";
import { GUILD_BY_ID_QUERY } from "../api/queries/guildLookup.js?v=20260815-live-capture-v2";
import { RAID_TEAM_REPORTS_QUERY } from "../api/queries/reportList.js?v=20260815-live-capture-v2";
import { REPORT_FIGHTS_QUERY } from "../api/queries/reportFights.js?v=20260815-live-capture-v2";
import {
  mapCurrentUser,
  mapGuild,
  mapReportDetail,
  mapReportPagination,
} from "./fflogsMappers.js?v=20260815-live-capture-v2";
import { buildReportListVariables } from "./raidTeamLoader.js?v=20260815-live-capture-v2";

/**
 * Execute a raw FFLogs GraphQL query and return the unmodified JSON payload.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function rawFflogsQuery({
  query,
  variables = {},
  accessToken,
  endpoint = FFLOGS_CONFIG.userGraphqlUrl,
  fetchImpl = globalThis.fetch,
}) {
  if (!accessToken) {
    throw new Error("FFLOGS_ACCESS_TOKEN is required for live FFLogs capture");
  }

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`FFLogs live request failed with HTTP ${response.status}`);
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("FFLogs live request returned a non-object payload");
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const messages = payload.errors
      .map((error) => error?.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(`FFLogs live GraphQL error: ${messages || "unknown GraphQL error"}`);
  }

  return payload;
}

/**
 * Build a capture object from raw FFLogs responses and mapped summaries.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function captureFflogsLiveData({
  accessToken,
  config = RAID_TEAM_CONFIG,
  reportLimit = 1,
  includeReportDetail = true,
  fetchImpl = globalThis.fetch,
  capturedAt = new Date().toISOString(),
} = {}) {
  const currentUserRaw = await rawFflogsQuery({
    query: CURRENT_USER_QUERY,
    accessToken,
    fetchImpl,
  });

  const guildRaw = await rawFflogsQuery({
    query: GUILD_BY_ID_QUERY,
    variables: { guildId: config.guildId },
    accessToken,
    fetchImpl,
  });

  const reportListVariables = buildReportListVariables(config, {
    page: 1,
    limit: reportLimit,
  });
  const reportPageRaw = await rawFflogsQuery({
    query: RAID_TEAM_REPORTS_QUERY,
    variables: reportListVariables,
    accessToken,
    fetchImpl,
  });

  const mappedReportPage = mapReportPagination(reportPageRaw.data?.reportData?.reports);
  const firstReportCode = mappedReportPage.reports[0]?.code || null;
  const reportDetailRaw =
    includeReportDetail && firstReportCode
      ? await rawFflogsQuery({
          query: REPORT_FIGHTS_QUERY,
          variables: {
            code: firstReportCode,
            allowUnlisted: false,
            encounterId: config.encounterId ?? null,
            difficulty: config.difficulty ?? null,
            killType: config.killType ?? "Encounters",
          },
          accessToken,
          fetchImpl,
        })
      : null;

  return {
    capturedAt,
    config: {
      guildId: config.guildId,
      guildUrl: config.guildUrl,
      guildTagId: config.guildTagId,
      zoneId: config.zoneId,
      gameZoneId: config.gameZoneId,
      encounterId: config.encounterId,
      difficulty: config.difficulty,
      killType: config.killType,
      reportLimit,
      includeReportDetail,
    },
    raw: {
      currentUser: currentUserRaw,
      guild: guildRaw,
      reportPage: reportPageRaw,
      reportDetail: reportDetailRaw,
    },
    mapped: {
      currentUser: mapCurrentUser(currentUserRaw.data),
      guild: mapGuild(guildRaw.data?.guildData?.guild, { guildUrl: config.guildUrl }),
      reportPage: mappedReportPage,
      reportDetail: reportDetailRaw?.data?.reportData?.report
        ? mapReportDetail(reportDetailRaw.data.reportData.report)
        : null,
    },
  };
}
